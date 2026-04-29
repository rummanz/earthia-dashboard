import { NextResponse } from 'next/server'
import { listAgents } from '@/lib/db/repo'
import { ensureGatewayAgentsImported } from '@/lib/agents-import'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export interface AgentStatusEntry {
  id: string
  name: string
  status: string
  model: string | null
  last_seen_at: string | null
  gateway_agent_id: string | null
}

export async function GET() {
  let agents = listAgents()
  if (agents.length === 0) {
    try {
      agents = await ensureGatewayAgentsImported()
    } catch {
      // best-effort
    }
  }
  // Return a map keyed by id (canonical) plus name (for legacy callers
  // that look up by friendly id like "coordinator").
  const out: Record<string, AgentStatusEntry> = {}
  for (const a of agents) {
    out[a.id] = {
      id: a.id,
      name: a.name,
      status: a.status,
      model: a.model,
      last_seen_at: a.last_seen_at,
      gateway_agent_id: a.gateway_agent_id,
    }
  }
  return NextResponse.json(out)
}
