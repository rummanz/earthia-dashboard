import { NextRequest, NextResponse } from 'next/server'
import { ensureGateway } from '@/lib/openclaw/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await ensureGateway(4_000)
    const payload = await client.request<unknown>(
      'sessions.history',
      { session_id: params.id },
      10_000
    )
    return NextResponse.json(payload)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
