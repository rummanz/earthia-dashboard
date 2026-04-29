import { NextRequest, NextResponse } from 'next/server'
import { ensureGateway } from '@/lib/openclaw/client'
import {
  deleteOpenclawSessionByOcId,
  patchOpenclawSession,
} from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await ensureGateway(4_000)
    const payload = await client.request<unknown>('sessions.list', {}, 5_000)
    let sessions: unknown[] = []
    if (Array.isArray(payload)) sessions = payload
    else if (
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { sessions?: unknown[] }).sessions)
    ) {
      sessions = (payload as { sessions: unknown[] }).sessions
    }
    const found = sessions.find((s) => {
      if (!s || typeof s !== 'object') return false
      const o = s as Record<string, unknown>
      return o.id === params.id || o.session_id === params.id || o.key === params.id
    })
    if (!found) {
      return NextResponse.json({ error: 'session not found' }, { status: 404 })
    }
    return NextResponse.json(found)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { content?: string }
  try {
    body = (await req.json()) as { content?: string }
  } catch {
    body = {}
  }
  if (!body.content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  const content = `[Mission Control] ${body.content}`
  try {
    const client = await ensureGateway(4_000)
    const r = await client.request<unknown>(
      'sessions.send',
      { session_id: params.id, content },
      10_000
    )
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { status?: string; ended_at?: string }
  try {
    body = (await req.json()) as { status?: string; ended_at?: string }
  } catch {
    body = {}
  }
  const updated = patchOpenclawSession(params.id, {
    status: body.status,
    ended_at: body.ended_at ?? null,
  })
  if (!updated) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }
  if (body.status === 'completed') {
    broadcast({ type: 'agent_completed', payload: { session: updated } })
  }
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ok = deleteOpenclawSessionByOcId(params.id)
  if (!ok) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }
  broadcast({
    type: 'agent_completed',
    payload: { openclaw_session_id: params.id, deleted: true },
  })
  return NextResponse.json({ ok: true, deleted: true })
}
