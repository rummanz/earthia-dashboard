import { NextRequest, NextResponse } from 'next/server'
import { createEvent, listEvents } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10)
  const since = url.searchParams.get('since') ?? undefined
  return NextResponse.json(listEvents({ limit, since }))
}

export async function POST(req: NextRequest) {
  let body: {
    type?: string
    message?: string
    agent_id?: string
    task_id?: string
    metadata?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.type || !body.message) {
    return NextResponse.json(
      { error: 'type and message required' },
      { status: 400 }
    )
  }
  const row = createEvent({
    type: body.type,
    message: body.message,
    agent_id: body.agent_id ?? null,
    task_id: body.task_id ?? null,
    metadata: body.metadata,
  })
  return NextResponse.json(row, { status: 201 })
}
