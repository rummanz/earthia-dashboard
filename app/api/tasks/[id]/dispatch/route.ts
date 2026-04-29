import { NextRequest, NextResponse } from 'next/server'
import { getTask } from '@/lib/db/repo'
import { dispatchTask } from '@/lib/dispatch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const task = getTask(params.id)
  if (!task) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  }
  const result = await dispatchTask(params.id)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'dispatch failed' },
      { status: 502 }
    )
  }
  return NextResponse.json({
    success: true,
    task_id: result.task_id,
    agent_id: result.agent_id,
    session_id: result.session_id,
    message: 'Task dispatched to Coordinator',
  })
}
