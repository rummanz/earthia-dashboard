import { NextRequest, NextResponse } from 'next/server'
import { ensureGateway } from '@/lib/openclaw/client'
import { listOpenclawSessions } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const session_type = url.searchParams.get('session_type') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  if (session_type || status) {
    return NextResponse.json(listOpenclawSessions({ session_type, status }))
  }
  try {
    const client = await ensureGateway(4_000)
    const payload = await client.request<unknown>('sessions.list', {}, 5_000)
    return NextResponse.json(payload)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}

export async function POST(req: NextRequest) {
  let body: { channel?: string; peer?: string }
  try {
    body = (await req.json()) as { channel?: string; peer?: string }
  } catch {
    body = {}
  }
  const channel = body.channel || 'mission-control'
  try {
    const client = await ensureGateway(4_000)
    const result = await client.request<unknown>(
      'sessions.create',
      { channel, peer: body.peer },
      10_000
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
