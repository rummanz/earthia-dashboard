import { NextRequest, NextResponse } from 'next/server'
import { listOpenclawSessions } from '@/lib/db/repo'
import { ensureGateway } from '@/lib/openclaw/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessions = listOpenclawSessions({ task_id: params.id })
  if (!sessions.length) {
    return NextResponse.json({ messages: [], session: null })
  }
  // Pick the most recent main session for the task.
  const main = sessions.find((s) => s.session_type === 'main') ?? sessions[0]
  const sessionKey = `agent:main:${main.openclaw_session_id}`
  try {
    const client = await ensureGateway(4_000)
    const result = await client.request<unknown>(
      'chat.history',
      { sessionKey },
      8_000
    )
    return NextResponse.json({
      session: { id: main.id, sessionKey, status: main.status },
      messages: result,
    })
  } catch (err) {
    return NextResponse.json(
      {
        session: { id: main.id, sessionKey, status: main.status },
        messages: [],
        error: err instanceof Error ? err.message : 'gateway error',
      },
      { status: 502 }
    )
  }
}
