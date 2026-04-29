import { NextRequest, NextResponse } from 'next/server'
import { getTask, listTaskLogs } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const t = getTask(params.id)
  if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const url = new URL(req.url)
  const since = url.searchParams.get('since') ?? undefined
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Math.max(1, Math.min(parseInt(limitRaw, 10) || 200, 1000)) : 200
  const logs = listTaskLogs(params.id, { since, limit })
  return NextResponse.json(logs)
}
