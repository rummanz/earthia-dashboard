// Server-only scheduler for due tasks.
// Singleton per Node process. Idempotent on re-import.
//
// NOTE: The "generation" / "review" pipeline below is a PLACEHOLDER. It
// simulates the lifecycle (queued → generating → reviewing → approved/rejected
// → published) with a fake review score. The user's real content backend is
// out of scope for this commit and will replace `runDispatch`.

import {
  createActivity,
  createEvent,
  listDueTasks,
  updateTask,
} from '@/lib/db/repo'
import type { ScheduleKind, TaskRow } from '@/lib/db/types'
import { broadcast } from '@/lib/sse/broadcast'

interface SchedulerHandle {
  interval: NodeJS.Timeout
  startedAt: number
  tickCount: number
  inFlight: Set<string>
}

const globalAny = globalThis as unknown as { __ocScheduler?: SchedulerHandle }

const TICK_MS = 10_000
const BATCH_SIZE = 5
const GENERATION_DELAY_MS = 4_000
const REVIEW_DELAY_MS = 4_000
const APPROVAL_THRESHOLD = 6 // review_score >= threshold → approved → published

function nowIso(): string {
  return new Date().toISOString()
}

function parseScheduleMeta(t: TaskRow): Record<string, unknown> {
  if (!t.schedule_meta) return {}
  try {
    const parsed = JSON.parse(t.schedule_meta)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
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
    // Find next day-of-week in meta.daysOfWeek (0=Sun..6=Sat). Default tomorrow.
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

// PLACEHOLDER content-pipeline simulator.
// In production this would talk to the user's real generation/review backend.
async function runDispatch(taskId: string): Promise<void> {
  // Stage 1: generating
  const t1 = updateTask(taskId, { status: 'generating' })
  if (!t1) return
  createActivity({
    task_id: taskId,
    activity_type: 'generation_started',
    message: 'Generation started (placeholder pipeline)',
  })
  createEvent({
    type: 'task_generation_started',
    message: 'Generation started',
    task_id: taskId,
  })
  broadcastTask(t1)

  await new Promise((r) => setTimeout(r, GENERATION_DELAY_MS))

  // Stage 2: reviewing
  const t2 = updateTask(taskId, { status: 'reviewing' })
  if (!t2) return
  createActivity({
    task_id: taskId,
    activity_type: 'review_started',
    message: 'Review started (placeholder pipeline)',
  })
  broadcastTask(t2)

  await new Promise((r) => setTimeout(r, REVIEW_DELAY_MS))

  // Stage 3: approve / reject by placeholder review_score
  const reviewScore = 1 + Math.floor(Math.random() * 9)
  const approved = reviewScore >= APPROVAL_THRESHOLD
  const t3 = updateTask(taskId, {
    review_score: reviewScore,
    reviewer_notes: approved
      ? 'Auto-approved by placeholder reviewer'
      : 'Below approval threshold (placeholder reviewer)',
    status: approved ? 'approved' : 'rejected',
  })
  if (!t3) return
  createActivity({
    task_id: taskId,
    activity_type: approved ? 'approved' : 'rejected',
    message: `Placeholder review: score ${reviewScore}/10 → ${approved ? 'approved' : 'rejected'}`,
  })
  broadcastTask(t3)

  // Stage 4: if approved, mark published
  let terminal = t3
  if (approved) {
    const publishedTo: Record<string, string | null> = {}
    if (t3.platforms) {
      try {
        const arr = JSON.parse(t3.platforms)
        if (Array.isArray(arr)) {
          for (const p of arr) {
            if (typeof p === 'string') {
              publishedTo[p] = `https://example.com/posts/${taskId}/${p}`
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    const publishedAt = nowIso()
    const t4 = updateTask(taskId, {
      status: 'published',
      published_to: publishedTo,
      published_at: publishedAt,
    })
    if (t4) {
      terminal = t4
      createActivity({
        task_id: taskId,
        activity_type: 'published',
        message: 'Published (placeholder)',
      })
      createEvent({
        type: 'task_published',
        message: 'Task published',
        task_id: taskId,
      })
      broadcastTask(t4)
    }
  }

  // Stage 5: if recurring, requeue. Otherwise leave terminal.
  const kind = (terminal.schedule_kind ?? null) as ScheduleKind | null
  if (kind === 'hourly' || kind === 'daily' || kind === 'weekly') {
    const nextAt = computeNextRunAt(terminal)
    if (nextAt) {
      const requeued = updateTask(taskId, {
        status: 'queued',
        next_run_at: nextAt,
      })
      if (requeued) {
        createActivity({
          task_id: taskId,
          activity_type: 'requeued',
          message: `Requeued for ${nextAt}`,
        })
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
    // Mark as picked up immediately so the next tick won't re-pick.
    const claimed = updateTask(t.id, {
      status: 'generating',
      next_run_at: null,
    })
    if (claimed) broadcastTask(claimed)

    void runDispatch(t.id)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        const failed = updateTask(t.id, {
          status: 'failed',
          reviewer_notes: `Pipeline error: ${msg}`,
        })
        if (failed) {
          createActivity({
            task_id: t.id,
            activity_type: 'error',
            message: msg,
          })
          createEvent({
            type: 'task_failed',
            message: msg,
            task_id: t.id,
          })
          broadcastTask(failed)
        }
      })
      .finally(() => {
        handle.inFlight.delete(t.id)
      })
  }
}

export function startScheduler(): void {
  if (globalAny.__ocScheduler) return
  const interval = setInterval(() => {
    void tick()
  }, TICK_MS)
  // Don't keep the Node process alive only for the scheduler.
  if (typeof interval.unref === 'function') interval.unref()
  globalAny.__ocScheduler = {
    interval,
    startedAt: Date.now(),
    tickCount: 0,
    inFlight: new Set(),
  }
  // Run a tick immediately so "Now" tasks fire fast.
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
