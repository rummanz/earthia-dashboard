import { NextRequest, NextResponse } from 'next/server'
import { dispatchTask } from '@/lib/dispatch'
import { getTask } from '@/lib/db/repo'
import { inferFailedStage, isRetryStage, type RetryStage } from '@/lib/retry-stage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const task = getTask(params.id)
  if (!task) {
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  }
  if (task.status !== 'failed') {
    return NextResponse.json(
      { error: 'only failed tasks can be retried' },
      { status: 400 }
    )
  }

  let requestedStage: RetryStage | null = null
  try {
    const body = (await req.json()) as { stage?: string }
    if (isRetryStage(body.stage)) requestedStage = body.stage
  } catch {
    // empty body is fine
  }

  const stage = requestedStage ?? inferFailedStage({ task })

  const result = await dispatchTask(params.id, { resumeFromStage: stage })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'retry dispatch failed' },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    task_id: result.task_id,
    resumed_stage: stage,
    message: `Retrying failed stage: ${stage}`,
  })
}
