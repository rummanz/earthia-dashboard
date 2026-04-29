import { NextRequest, NextResponse } from 'next/server'
import { createDeliverable, getTask, listDeliverables } from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_TYPES = ['file', 'url', 'artifact']

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getTask(params.id))
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  return NextResponse.json(listDeliverables(params.id))
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getTask(params.id))
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  let body: {
    deliverable_type?: string
    title?: string
    path?: string
    description?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.deliverable_type || !VALID_TYPES.includes(body.deliverable_type)) {
    return NextResponse.json(
      { error: `deliverable_type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!body.title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }
  const row = createDeliverable({
    task_id: params.id,
    deliverable_type: body.deliverable_type,
    title: body.title,
    path: body.path ?? null,
    description: body.description ?? null,
  })
  broadcast({ type: 'deliverable_added', payload: row })
  return NextResponse.json(row, { status: 201 })
}
