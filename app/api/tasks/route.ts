import { NextRequest, NextResponse } from 'next/server'
import { createEvent, createTask, listTasks } from '@/lib/db/repo'
import type { ScheduleKind, TaskInsert, TaskPriority } from '@/lib/db/types'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
const VALID_SCHEDULE_KINDS: ScheduleKind[] = [
  'now',
  'once',
  'hourly',
  'daily',
  'weekly',
]

function nowIso(): string {
  return new Date().toISOString()
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isDimensions(
  v: unknown
): v is { width: number; height: number; ratio?: string } {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.width === 'number' && typeof o.height === 'number'
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const filter = {
    status: statusParam ? statusParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    business_id: url.searchParams.get('business_id') ?? undefined,
    workspace_id: url.searchParams.get('workspace_id') ?? undefined,
    assigned_agent_id: url.searchParams.get('assigned_agent_id') ?? undefined,
  }
  return NextResponse.json(listTasks(filter))
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const priority =
    typeof body.priority === 'string' &&
    VALID_PRIORITIES.includes(body.priority as TaskPriority)
      ? (body.priority as TaskPriority)
      : 'normal'

  const scheduleKind =
    typeof body.schedule_kind === 'string' &&
    VALID_SCHEDULE_KINDS.includes(body.schedule_kind as ScheduleKind)
      ? (body.schedule_kind as ScheduleKind)
      : null

  // Determine next_run_at:
  // - now → immediately
  // - once → schedule_at if provided, else now
  // - recurring → schedule_at if provided, else now (first run is immediate-ish)
  let nextRunAt: string | null = null
  const scheduleAt =
    typeof body.schedule_at === 'string' && body.schedule_at
      ? body.schedule_at
      : null
  if (scheduleKind === 'now') {
    nextRunAt = nowIso()
  } else if (scheduleKind === 'once') {
    nextRunAt = scheduleAt ?? nowIso()
  } else if (
    scheduleKind === 'hourly' ||
    scheduleKind === 'daily' ||
    scheduleKind === 'weekly'
  ) {
    nextRunAt = scheduleAt ?? nowIso()
  }
  // explicit override wins
  if (typeof body.next_run_at === 'string' && body.next_run_at) {
    nextRunAt = body.next_run_at
  }

  const dimensions = isDimensions(body.dimensions) ? body.dimensions : null
  const platforms = isStringArray(body.platforms) ? body.platforms : null
  const scheduleMeta =
    body.schedule_meta && typeof body.schedule_meta === 'object'
      ? (body.schedule_meta as Record<string, unknown>)
      : null
  const publishedTo =
    body.published_to && typeof body.published_to === 'object'
      ? (body.published_to as Record<string, string | null>)
      : null

  const insert: TaskInsert = {
    title: body.title,
    description: typeof body.description === 'string' ? body.description : null,
    status: 'queued',
    priority,
    assigned_agent_id:
      typeof body.assigned_agent_id === 'string' ? body.assigned_agent_id : null,
    created_by_agent_id:
      typeof body.created_by_agent_id === 'string'
        ? body.created_by_agent_id
        : null,
    workspace_id:
      typeof body.workspace_id === 'string' ? body.workspace_id : null,
    business_id:
      typeof body.business_id === 'string' ? body.business_id : null,
    due_date: typeof body.due_date === 'string' ? body.due_date : null,
    workflow_template_id:
      typeof body.workflow_template_id === 'string'
        ? body.workflow_template_id
        : null,
    content_type:
      typeof body.content_type === 'string' ? body.content_type : null,
    dimensions,
    platforms,
    template_id:
      typeof body.template_id === 'string' ? body.template_id : null,
    prompt_body:
      typeof body.prompt_body === 'string' ? body.prompt_body : null,
    review_score:
      typeof body.review_score === 'number' ? body.review_score : null,
    reviewer_notes:
      typeof body.reviewer_notes === 'string' ? body.reviewer_notes : null,
    schedule_kind: scheduleKind,
    schedule_at: scheduleAt,
    schedule_meta: scheduleMeta,
    published_to: publishedTo,
    next_run_at: nextRunAt,
    media_url: typeof body.media_url === 'string' ? body.media_url : null,
    thumbnail_url:
      typeof body.thumbnail_url === 'string' ? body.thumbnail_url : null,
    published_at:
      typeof body.published_at === 'string' ? body.published_at : null,
  }

  const task = createTask(insert)
  createEvent({
    type: 'task_created',
    message: `Task created: ${task.title}`,
    task_id: task.id,
    metadata: { priority: task.priority, schedule_kind: task.schedule_kind },
  })
  broadcast({ type: 'task_created', payload: task })
  return NextResponse.json(task, { status: 201 })
}
