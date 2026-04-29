import { NextResponse } from 'next/server'
import { ensureGateway } from '@/lib/openclaw/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
  try {
    const client = await ensureGateway(4_000)
    const payload = await client.request<unknown>('sessions.list', {}, 5_000)
    let sessions: unknown[] = []
    let count = 0
    if (Array.isArray(payload)) {
      sessions = payload
      count = payload.length
    } else if (payload && typeof payload === 'object') {
      const obj = payload as { sessions?: unknown[]; count?: number }
      if (Array.isArray(obj.sessions)) {
        sessions = obj.sessions
        count = obj.count ?? obj.sessions.length
      }
    }
    return NextResponse.json({
      connected: true,
      sessions_count: count,
      sessions,
      gateway_url: gatewayUrl,
    })
  } catch (err) {
    return NextResponse.json({
      connected: false,
      sessions_count: 0,
      sessions: [],
      gateway_url: gatewayUrl,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
