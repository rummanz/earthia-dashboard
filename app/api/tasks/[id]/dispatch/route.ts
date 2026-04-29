import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  createActivity,
  createEvent,
  createOpenclawSession,
  getAgent,
  getOpenclawSessionForAgent,
  getTask,
  setAgentStatus,
  updateTask,
} from '@/lib/db/repo'
import { ensureGateway } from '@/lib/openclaw/client'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function buildInstruction(args: {
  taskId: string
  title: string
  description?: string | null
  priority: string
  agentName: string
}): string {
  const parts: string[] = []
  parts.push(`[Mission Control] Task dispatch`)
  parts.push(``)
  parts.push(`Task: ${args.title}`)
  parts.push(`Task ID: ${args.taskId}`)
  parts.push(`Priority: ${args.priority}`)
  parts.push(`Assigned to: ${args.agentName}`)
  if (args.description) {
    parts.push(``)
    parts.push(`Description:`)
    parts.push(args.description)
  }
  parts.push(``)
  parts.push(
    `When complete, reply with a single line beginning with "TASK_COMPLETE:" followed by a one-paragraph summary.`
  )
  return parts.join('\n')
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const task = getTask(params.id)
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  if (!task.assigned_agent_id) {
    return NextResponse.json(
      { error: 'task has no assigned agent' },
      { status: 400 }
    )
  }
  const agent = getAgent(task.assigned_agent_id)
  if (!agent) {
    return NextResponse.json({ error: 'assigned agent not found' }, { status: 400 })
  }

  let client
  try {
    client = await ensureGateway(5_000)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gateway unreachable' },
      { status: 502 }
    )
  }

  // ensure openclaw_sessions row
  let session = getOpenclawSessionForAgent(agent.id)
  if (!session) {
    const ocId =
      agent.gateway_agent_id ||
      `mission-control-${agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`
    session = createOpenclawSession({
      openclaw_session_id: ocId,
      agent_id: agent.id,
      task_id: task.id,
      session_type: 'main',
      channel: 'mission-control',
    })
  }

  const sessionKey = `${agent.session_key_prefix || 'agent:main:'}${session.openclaw_session_id}`
  const message = buildInstruction({
    taskId: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    agentName: agent.name,
  })

  try {
    await client.request(
      'chat.send',
      {
        sessionKey,
        message,
        idempotencyKey: `dispatch-${task.id}-${Date.now()}-${randomUUID()}`,
      },
      15_000
    )
  } catch (err) {
    createEvent({
      type: 'dispatch_failed',
      message: `Dispatch failed: ${err instanceof Error ? err.message : 'unknown'}`,
      task_id: task.id,
      agent_id: agent.id,
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'gateway send failed' },
      { status: 502 }
    )
  }

  if (task.status !== 'in_progress') {
    updateTask(task.id, { status: 'in_progress' })
  }
  setAgentStatus(agent.id, 'working')
  createActivity({
    task_id: task.id,
    agent_id: agent.id,
    activity_type: 'spawned',
    message: `Dispatched to ${agent.name}`,
    metadata: JSON.stringify({ sessionKey }),
  })
  createEvent({
    type: 'task_dispatched',
    message: `Task dispatched to ${agent.name}`,
    task_id: task.id,
    agent_id: agent.id,
  })
  const updated = getTask(task.id)
  if (updated) {
    broadcast({ type: 'task_updated', payload: updated })
  }

  return NextResponse.json({
    success: true,
    task_id: task.id,
    agent_id: agent.id,
    session_id: session.openclaw_session_id,
    message: 'Task dispatched to agent',
  })
}
