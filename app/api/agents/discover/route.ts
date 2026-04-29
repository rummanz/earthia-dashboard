import { NextResponse } from 'next/server'
import { ensureGateway } from '@/lib/openclaw/client'
import { getAgentByGatewayId } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RawAgent {
  id?: string
  name?: string
  workspace?: string
  workspace_id?: string
  model?: string | { primary?: string }
}

export async function GET() {
  try {
    const client = await ensureGateway(4_000)
    const payload = await client.request<unknown>('agents.list', {}, 5_000)
    let raw: RawAgent[] = []
    if (Array.isArray(payload)) raw = payload as RawAgent[]
    else if (
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { agents?: RawAgent[] }).agents)
    ) {
      raw = (payload as { agents: RawAgent[] }).agents
    }
    const agents = raw.map((a) => {
      const gid = a.id ?? ''
      const model =
        typeof a.model === 'string'
          ? a.model
          : a.model && typeof a.model === 'object'
            ? a.model.primary ?? null
            : null
      return {
        gateway_agent_id: gid,
        name: a.name || gid,
        workspace_id: a.workspace_id || a.workspace || null,
        model,
        already_imported: gid ? Boolean(getAgentByGatewayId(gid)) : false,
      }
    })
    return NextResponse.json({ agents })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        agents: [],
      },
      { status: 502 }
    )
  }
}
