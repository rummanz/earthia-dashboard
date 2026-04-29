import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  createEvent,
  getOpenclawSessionByOcId,
  getTask,
  listEvents,
  setAgentStatus,
  updateTask,
} from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return true // disabled
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

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get('x-webhook-signature')
  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  let body: {
    task_id?: string
    summary?: string
    session_id?: string
    message?: string
  }
  try {
    body = JSON.parse(raw)
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
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  const summary =
    body.summary ||
    (body.message ? body.message.replace(/^TASK_COMPLETE:\s*/i, '') : 'completed')

  if (!['testing', 'review', 'done'].includes(task.status)) {
    updateTask(task.id, { status: 'testing' })
  }
  if (task.assigned_agent_id) {
    setAgentStatus(task.assigned_agent_id, 'standby')
  }
  createEvent({
    type: 'task_completed',
    message: `Task completed: ${summary}`,
    task_id: task.id,
    agent_id: task.assigned_agent_id ?? null,
    metadata: { summary },
  })
  const updated = getTask(task.id)
  if (updated) broadcast({ type: 'task_updated', payload: updated })
  return NextResponse.json({ ok: true, task: updated })
}
