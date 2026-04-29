import { NextRequest, NextResponse } from 'next/server'
import { createEvent, createTask, listTasks } from '@/lib/db/repo'
import type { TaskInsert, TaskPriority } from '@/lib/db/types'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']

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
  let body: Partial<TaskInsert>
  try {
    body = (await req.json()) as Partial<TaskInsert>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const priority =
    body.priority && VALID_PRIORITIES.includes(body.priority as TaskPriority)
      ? (body.priority as TaskPriority)
      : 'normal'
  const task = createTask({
    title: body.title,
    description: body.description ?? null,
    status: body.status ?? 'queued',
    priority,
    assigned_agent_id: body.assigned_agent_id ?? null,
    created_by_agent_id: body.created_by_agent_id ?? null,
    workspace_id: body.workspace_id ?? null,
    business_id: body.business_id ?? null,
    due_date: body.due_date ?? null,
    workflow_template_id: body.workflow_template_id ?? null,
  })
  createEvent({
    type: 'task_created',
    message: `Task created: ${task.title}`,
    task_id: task.id,
    metadata: { priority: task.priority },
  })
  broadcast({ type: 'task_created', payload: task })
  return NextResponse.json(task, { status: 201 })
}
