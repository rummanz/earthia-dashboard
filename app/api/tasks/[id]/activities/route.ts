import { NextRequest, NextResponse } from 'next/server'
import { createActivity, getTask, listActivities } from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_TYPES = [
  'spawned',
  'updated',
  'completed',
  'file_created',
  'status_changed',
]

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getTask(params.id))
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  return NextResponse.json(listActivities(params.id))
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getTask(params.id))
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  let body: {
    activity_type?: string
    message?: string
    agent_id?: string
    metadata?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.activity_type || !VALID_TYPES.includes(body.activity_type)) {
    return NextResponse.json(
      { error: `activity_type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!body.message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }
  const row = createActivity({
    task_id: params.id,
    agent_id: body.agent_id ?? null,
    activity_type: body.activity_type,
    message: body.message,
    metadata: body.metadata ?? null,
  })
  broadcast({ type: 'activity_logged', payload: row })
  return NextResponse.json(row, { status: 201 })
}
