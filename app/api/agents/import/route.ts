import { NextRequest, NextResponse } from 'next/server'
import { upsertAgent } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ImportEntry {
  gateway_agent_id: string
  name: string
  model?: string
  workspace_id?: string
  session_key_prefix?: string
}

export async function POST(req: NextRequest) {
  let body: { agents?: ImportEntry[] }
  try {
    body = (await req.json()) as { agents?: ImportEntry[] }
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const list = Array.isArray(body.agents) ? body.agents : []
  if (!list.length) {
    return NextResponse.json({ error: 'agents required' }, { status: 400 })
  }
  const imported = list.map((a) =>
    upsertAgent({
      name: a.name,
      gateway_agent_id: a.gateway_agent_id,
      model: a.model ?? null,
      workspace_id: a.workspace_id ?? 'default',
      session_key_prefix: a.session_key_prefix ?? 'agent:main:',
      source: 'gateway',
    })
  )
  return NextResponse.json({ imported })
}
