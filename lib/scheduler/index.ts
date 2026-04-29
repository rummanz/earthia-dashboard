// Server-only scheduler for due tasks.
// Singleton per Node process. Idempotent on re-import.
//
// Real pipeline:
//   queued → generating (kie.ai) → reviewing (auto) → approved
//        → published (upload-post) | failed
// Each transition is broadcast over SSE and recorded as a task_activity.
// Provider HTTP calls are recorded into task_logs via loggedFetch.

import {
  createActivity,
  createEvent,
  createTaskLog,
  getTask,
  listDueTasks,
  updateTask,
} from '@/lib/db/repo'
import type { ScheduleKind, TaskRow } from '@/lib/db/types'
import { broadcast } from '@/lib/sse/broadcast'
import {
  aspectFromDimensions,
  generateImages,
  generateVideo,
} from '@/lib/pipeline/generators/kie'
import {
  publishPhotos,
  publishText,
  publishVideo,
  type PublishMap,
} from '@/lib/pipeline/publishers/upload-post'
import { logError, logInfo } from '@/lib/pipeline/logged'

interface SchedulerHandle {
  interval: NodeJS.Timeout
  startedAt: number
  tickCount: number
  inFlight: Set<string>
}

const globalAny = globalThis as unknown as { __ocScheduler?: SchedulerHandle }

const TICK_MS = 10_000
const BATCH_SIZE = 5
const PIPELINE_TIMEOUT_MS = 8 * 60 * 1000
const DEFAULT_REVIEW_THRESHOLD = 7
const DEFAULT_CAROUSEL_SLIDES = 3

function nowIso(): string {
  return new Date().toISOString()
}

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function parseScheduleMeta(t: TaskRow): Record<string, unknown> {
  return safeJson<Record<string, unknown>>(t.schedule_meta) ?? {}
}

function parseDimensions(
  t: TaskRow
): { width?: number; height?: number; ratio?: string; slides?: number } | null {
  return safeJson(t.dimensions)
}

function parsePlatforms(t: TaskRow): string[] {
  const arr = safeJson<unknown[]>(t.platforms)
  if (!Array.isArray(arr)) return []
  return arr.filter((x): x is string => typeof x === 'string')
}

function computeNextRunAt(t: TaskRow): string | null {
  const kind = (t.schedule_kind ?? null) as ScheduleKind | null
  if (!kind || kind === 'now' || kind === 'once') return null
  const meta = parseScheduleMeta(t)
  const base = new Date()
  if (kind === 'hourly') {
    const interval =
      typeof meta.intervalHours === 'number' && meta.intervalHours > 0
        ? meta.intervalHours
        : 1
    return new Date(base.getTime() + interval * 60 * 60 * 1000).toISOString()
  }
  if (kind === 'daily') {
    const next = new Date(base.getTime() + 24 * 60 * 60 * 1000)
    if (typeof meta.timeOfDay === 'string') {
      const [hh, mm] = meta.timeOfDay.split(':').map((n) => parseInt(n, 10))
      if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
        next.setUTCHours(hh, mm, 0, 0)
      }
    }
    return next.toISOString()
  }
  if (kind === 'weekly') {
    const days = Array.isArray(meta.daysOfWeek)
      ? (meta.daysOfWeek as number[]).filter(
          (n) => typeof n === 'number' && n >= 0 && n <= 6
        )
      : []
    const candidate = new Date(base.getTime())
    for (let i = 1; i <= 14; i++) {
      candidate.setUTCDate(base.getUTCDate() + i)
      if (days.length === 0 || days.includes(candidate.getUTCDay())) {
        if (typeof meta.timeOfDay === 'string') {
          const [hh, mm] = meta.timeOfDay.split(':').map((n) => parseInt(n, 10))
          if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
            candidate.setUTCHours(hh, mm, 0, 0)
          }
        }
        return candidate.toISOString()
      }
    }
    return new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }
  return null
}

function broadcastTask(t: TaskRow): void {
  broadcast({ type: 'task_updated', payload: t })
}

function activity(
  taskId: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  createActivity({
    task_id: taskId,
    activity_type: type,
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
  })
  broadcast({ type: 'activity_logged', payload: { task_id: taskId } })
}

function failTask(
  taskId: string,
  reason: string,
  reviewerNote?: string
): void {
  const t = updateTask(taskId, {
    status: 'failed',
    reviewer_notes: reviewerNote ?? reason,
  })
  if (t) {
    activity(taskId, 'error', reason)
    createEvent({
      type: 'task_failed',
      message: reason,
      task_id: taskId,
    })
    logError(taskId, 'pipeline.fail', { reason })
    broadcastTask(t)
  }
}

function shouldGenerate(contentType: string | null): boolean {
  if (!contentType) return false
  return ['image', 'carousel', 'video', 'reel'].includes(contentType)
}

function isVideoLike(contentType: string | null): boolean {
  return contentType === 'video' || contentType === 'reel'
}

async function withTimeout<T>(
  taskId: string,
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  const timeoutP = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`pipeline timeout after ${timeoutMs}ms`)),
      timeoutMs
    )
  })
  try {
    const result = await Promise.race([promise, timeoutP])
    return result as T
  } finally {
    if (timer) clearTimeout(timer)
    void taskId
  }
}

async function runPipeline(taskId: string): Promise<void> {
  const t0 = getTask(taskId)
  if (!t0) return
  const platforms = parsePlatforms(t0)
  const dims = parseDimensions(t0)
  const aspect = aspectFromDimensions(dims)
  const slides =
    typeof dims?.slides === 'number' && dims.slides > 0
      ? dims.slides
      : DEFAULT_CAROUSEL_SLIDES
  const promptBody = (t0.prompt_body ?? '').trim()
  const contentType = t0.content_type
  const title = (t0.title || promptBody.slice(0, 200) || 'Earthia Post').slice(
    0,
    200
  )

  // Stage 1 — generation
  let generatedFiles: string[] = []
  let generatedVideo: string | null = null

  if (shouldGenerate(contentType)) {
    if (!process.env.KIE_API_KEY) {
      logError(taskId, 'kie.precheck', { reason: 'KIE_API_KEY not configured' })
      failTask(taskId, 'KIE_API_KEY not configured')
      return
    }
    if (!promptBody) {
      failTask(taskId, 'prompt_body is empty — nothing to generate')
      return
    }

    const t1 = updateTask(taskId, { status: 'generating' })
    if (!t1) return
    activity(taskId, 'generation_started', `Generation started (${contentType})`)
    createEvent({
      type: 'task_generation_started',
      message: 'Generation started',
      task_id: taskId,
    })
    broadcastTask(t1)

    try {
      if (isVideoLike(contentType)) {
        generatedVideo = await generateVideo({
          taskId,
          prompt: promptBody,
          aspect: aspect === '16:9' ? '16:9' : '9:16',
        })
        const url = `/api/media/${taskId}/video.mp4`
        const updated = updateTask(taskId, {
          media_url: url,
          thumbnail_url: url,
        })
        if (updated) broadcastTask(updated)
      } else {
        const count = contentType === 'carousel' ? slides : 1
        generatedFiles = await generateImages({
          taskId,
          prompt: promptBody,
          aspect,
          count,
        })
        const firstUrl =
          generatedFiles.length > 0 ? `/api/media/${taskId}/slide-1.png` : null
        const updated = updateTask(taskId, {
          media_url: firstUrl,
          thumbnail_url: firstUrl,
        })
        if (updated) broadcastTask(updated)
      }
      activity(
        taskId,
        'generation_complete',
        `Generated ${generatedFiles.length || (generatedVideo ? 1 : 0)} asset(s)`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failTask(taskId, `Generation error: ${msg.slice(0, 500)}`)
      return
    }
  } else if (contentType === 'text') {
    logInfo(taskId, 'pipeline.skip_generation', { reason: 'text content' })
  } else {
    logInfo(taskId, 'pipeline.skip_generation', {
      reason: `no media generation for content_type=${contentType ?? 'null'}`,
    })
  }

  // Stage 2 — review (auto-approve placeholder)
  const t2 = updateTask(taskId, { status: 'reviewing' })
  if (t2) {
    activity(taskId, 'review_started', 'Auto-review pending (placeholder)')
    broadcastTask(t2)
  }
  const reviewScore = 9 // MVP: auto-approve everything
  const t3 = updateTask(taskId, {
    review_score: reviewScore,
    reviewer_notes: 'Auto-review passed (placeholder)',
    status: reviewScore >= DEFAULT_REVIEW_THRESHOLD ? 'approved' : 'rejected',
  })
  if (t3) {
    activity(
      taskId,
      reviewScore >= DEFAULT_REVIEW_THRESHOLD ? 'approved' : 'rejected',
      `Auto-review: score ${reviewScore}/10`
    )
    broadcastTask(t3)
  }
  if (!t3 || reviewScore < DEFAULT_REVIEW_THRESHOLD) return

  // Stage 3 — publish
  if (platforms.length === 0) {
    logInfo(taskId, 'pipeline.skip_publish', {
      reason: 'no platforms configured',
    })
    activity(taskId, 'publish_skipped', 'No platforms configured — task ends at approved')
    // Smoke-test scenario: leave status as 'approved'.
    return
  }

  if (!process.env.UPLOAD_POST_API_KEY) {
    logError(taskId, 'upload-post.precheck', {
      reason: 'UPLOAD_POST_API_KEY not configured',
    })
    failTask(taskId, 'UPLOAD_POST_API_KEY not configured')
    return
  }

  let publishMap: PublishMap = {}
  try {
    if (isVideoLike(contentType) && generatedVideo) {
      publishMap = await publishVideo({
        taskId,
        file: generatedVideo,
        platforms,
        title,
      })
    } else if (
      (contentType === 'image' || contentType === 'carousel') &&
      generatedFiles.length > 0
    ) {
      publishMap = await publishPhotos({
        taskId,
        files: generatedFiles,
        platforms,
        title,
      })
    } else {
      // text or unknown → text post
      publishMap = await publishText({
        taskId,
        platforms,
        title,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failTask(taskId, `Publish error: ${msg.slice(0, 500)}`)
    return
  }

  const publishedTo: Record<string, string | null> = {}
  let anyOk = false
  for (const p of platforms) {
    const r = publishMap[p]
    if (r?.ok) {
      anyOk = true
      publishedTo[p] = r.url ?? null
    } else {
      publishedTo[p] = null
      logError(taskId, 'upload-post.platform_failed', {
        platform: p,
        error: r?.error ?? 'unknown',
      })
    }
  }

  const finalStatus = anyOk ? 'published' : 'failed'
  const final = updateTask(taskId, {
    status: finalStatus,
    published_to: publishedTo,
    published_at: anyOk ? nowIso() : null,
    reviewer_notes: anyOk
      ? null
      : 'All platforms failed during publish — see task_logs',
  })
  if (final) {
    activity(
      taskId,
      anyOk ? 'published' : 'publish_failed',
      `Published to ${Object.entries(publishedTo)
        .filter(([, v]) => v !== null)
        .map(([k]) => k)
        .join(', ') || '(none)'}`,
      { publishedTo }
    )
    createEvent({
      type: anyOk ? 'task_published' : 'task_failed',
      message: anyOk ? 'Task published' : 'All platforms failed',
      task_id: taskId,
    })
    broadcastTask(final)
  }
}

async function runDispatch(taskId: string): Promise<void> {
  try {
    await withTimeout(taskId, runPipeline(taskId), PIPELINE_TIMEOUT_MS)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failTask(taskId, msg.slice(0, 500))
    return
  }

  // Recurring re-queue
  const terminal = getTask(taskId)
  if (!terminal) return
  const kind = (terminal.schedule_kind ?? null) as ScheduleKind | null
  if (kind === 'hourly' || kind === 'daily' || kind === 'weekly') {
    const nextAt = computeNextRunAt(terminal)
    if (nextAt) {
      const requeued = updateTask(taskId, {
        status: 'queued',
        next_run_at: nextAt,
      })
      if (requeued) {
        activity(taskId, 'requeued', `Requeued for ${nextAt}`)
        broadcastTask(requeued)
      }
    }
  }
}

async function tick(): Promise<void> {
  const handle = globalAny.__ocScheduler
  if (!handle) return
  handle.tickCount++
  let due: TaskRow[]
  try {
    due = listDueTasks(BATCH_SIZE)
  } catch {
    return
  }
  for (const t of due) {
    if (handle.inFlight.has(t.id)) continue
    handle.inFlight.add(t.id)
    // Atomically claim by clearing next_run_at and flipping to generating.
    const claimed = updateTask(t.id, {
      status: 'generating',
      next_run_at: null,
    })
    if (claimed) {
      broadcastTask(claimed)
      createTaskLog({
        task_id: t.id,
        step: 'pipeline.start',
        direction: 'info',
        payload: { content_type: t.content_type, platforms: t.platforms },
      })
    }

    void runDispatch(t.id).finally(() => {
      handle.inFlight.delete(t.id)
    })
  }
}

export function startScheduler(): void {
  if (globalAny.__ocScheduler) return
  const interval = setInterval(() => {
    void tick()
  }, TICK_MS)
  if (typeof interval.unref === 'function') interval.unref()
  globalAny.__ocScheduler = {
    interval,
    startedAt: Date.now(),
    tickCount: 0,
    inFlight: new Set(),
  }
  setTimeout(() => {
    void tick()
  }, 250)
}

export function getSchedulerStatus(): {
  running: boolean
  startedAt: number | null
  tickCount: number
  inFlight: number
} {
  const h = globalAny.__ocScheduler
  if (!h) return { running: false, startedAt: null, tickCount: 0, inFlight: 0 }
  return {
    running: true,
    startedAt: h.startedAt,
    tickCount: h.tickCount,
    inFlight: h.inFlight.size,
  }
}

// Exported for tests so the pipeline can be exercised without the tick loop.
export const __test = {
  runPipeline,
  runDispatch,
}
