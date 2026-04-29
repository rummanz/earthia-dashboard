import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  createActivity,
  createDeliverable,
  createEvent,
  createTaskLog,
  getOpenclawSessionByOcId,
  getTask,
  listAgents,
  listEvents,
  listOpenclawSessions,
  patchOpenclawSession,
  setAgentStatus,
  updateTask,
} from '@/lib/db/repo'
import type { ScheduleKind, TaskRow, TaskStatus } from '@/lib/db/types'
import { broadcast } from '@/lib/sse/broadcast'
import { clearDispatchTimer } from '@/lib/dispatch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DEFAULT_REVIEW_THRESHOLD = 7

interface WebhookBody {
  task_id?: string
  session_id?: string
  summary?: string
  message?: string
  status?: string
  reason?: string
  review_score?: number
  review_notes?: string
  published_to?: Record<string, string | null | undefined>
  media_paths?: string[]
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return true
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET() {
  const recent = listEvents({ limit: 25 }).filter(
    (e) => e.type === 'task_completed' || e.type === 'webhook_completion'
  )
  return NextResponse.json({ ok: true, recent })
}

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

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get('x-webhook-signature')
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: WebhookBody
  try {
    body = JSON.parse(raw) as WebhookBody
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  let taskId = body.task_id ?? null
  if (!taskId && body.session_id) {
    const sess = getOpenclawSessionByOcId(body.session_id)
    if (sess?.task_id) taskId = sess.task_id
  }
  if (!taskId) {
    return NextResponse.json(
      { error: 'task_id or session_id required' },
      { status: 400 }
    )
  }
  const task = getTask(taskId)
  if (!task) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  }

  const summary =
    body.summary ||
    (body.message ? body.message.replace(/^TASK_COMPLETE:\s*/i, '') : 'completed')
  const reviewScore =
    typeof body.review_score === 'number' ? body.review_score : null
  const reviewNotes = body.review_notes ?? null
  const publishedToRaw = body.published_to ?? null
  const mediaPaths = Array.isArray(body.media_paths) ? body.media_paths : []
  const failed = body.status === 'failed'
  const threshold = DEFAULT_REVIEW_THRESHOLD

  // Always log the callback.
  createTaskLog({
    task_id: task.id,
    step: 'coordinator.callback',
    direction: 'response',
    payload: body,
    http_status: 200,
  })

  // Determine final status.
  let finalStatus: string
  let finalReviewerNotes: string | null = reviewNotes
  const publishedTo: Record<string, string | null> = {}
  if (publishedToRaw && typeof publishedToRaw === 'object') {
    for (const [k, v] of Object.entries(publishedToRaw)) {
      publishedTo[k] = typeof v === 'string' && v.length > 0 ? v : null
    }
  }
  const anyPublished = Object.values(publishedTo).some(
    (v) => typeof v === 'string' && v.length > 0
  )

  if (failed) {
    finalStatus = 'failed'
    finalReviewerNotes = body.reason ?? reviewNotes ?? 'Coordinator reported failure'
  } else if (reviewScore !== null && reviewScore < threshold) {
    finalStatus = 'rejected'
  } else if (Object.keys(publishedTo).length === 0) {
    // Nothing to publish — finished at approved.
    finalStatus = 'approved'
  } else if (anyPublished) {
    finalStatus = 'published'
  } else {
    finalStatus = 'failed'
    finalReviewerNotes =
      reviewNotes ?? 'All platforms failed during publish — see task_logs'
  }

  updateTask(task.id, {
    status: finalStatus as TaskStatus,
    review_score: reviewScore,
    reviewer_notes: finalReviewerNotes,
    published_to:
      Object.keys(publishedTo).length > 0 ? publishedTo : null,
    published_at: finalStatus === 'published' ? nowIso() : null,
  })

  // Record deliverables.
  for (const p of mediaPaths) {
    if (typeof p !== 'string' || !p) continue
    try {
      createDeliverable({
        task_id: task.id,
        deliverable_type: 'media',
        title: p.split('/').pop() ?? 'media',
        path: p,
      })
    } catch {
      // ignore single-deliverable failure
    }
  }

  // Activity + event.
  createActivity({
    task_id: task.id,
    activity_type: failed ? 'error' : 'completed',
    message: summary,
    metadata: JSON.stringify({
      review_score: reviewScore,
      published_to: publishedTo,
    }),
  })
  createEvent({
    type: failed ? 'task_failed' : 'task_completed',
    message: failed ? `Task failed: ${summary}` : `Task completed: ${summary}`,
    task_id: task.id,
    agent_id: task.assigned_agent_id ?? null,
    metadata: { summary, review_score: reviewScore },
  })

  // Reset working agents tied to this task's session(s).
  const sessions = listOpenclawSessions({ task_id: task.id })
  const sessionAgentIds = new Set(
    sessions.map((s) => s.agent_id).filter((x): x is string => Boolean(x))
  )
  for (const a of listAgents()) {
    if (a.status === 'working') {
      // Reset coordinator/content-creator/reviewer/publisher when working.
      // Either match this task's sessions OR fall back to all-working (MVP).
      if (sessionAgentIds.size === 0 || sessionAgentIds.has(a.id)) {
        setAgentStatus(a.id, 'idle')
      }
    }
  }

  // Close the openclaw_sessions row(s).
  for (const s of sessions) {
    if (s.status === 'active') {
      patchOpenclawSession(s.openclaw_session_id, {
        status: 'completed',
        ended_at: nowIso(),
      })
    }
  }

  // Recurring re-queue.
  const kind = (task.schedule_kind ?? null) as ScheduleKind | null
  if (
    !failed &&
    (kind === 'hourly' || kind === 'daily' || kind === 'weekly')
  ) {
    const nextAt = computeNextRunAt(task)
    if (nextAt) {
      const requeued = updateTask(task.id, {
        status: 'queued',
        next_run_at: nextAt,
      })
      if (requeued) {
        createActivity({
          task_id: task.id,
          activity_type: 'requeued',
          message: `Requeued for ${nextAt}`,
        })
      }
    }
  }

  clearDispatchTimer(task.id)

  const after = getTask(task.id)
  if (after) broadcast({ type: 'task_updated', payload: after })
  broadcast({ type: 'agent_completed', payload: { task_id: task.id } })

  return NextResponse.json({ ok: true, task: after })
}
