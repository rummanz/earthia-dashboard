// Server-only helper: lazily import gateway agents into the local DB.
// Called from GET /api/agents and from the dispatch helper on demand.
import { ensureGateway } from '@/lib/openclaw/client'
import { listAgents, upsertAgent } from '@/lib/db/repo'
import type { AgentRow } from '@/lib/db/types'

interface RawAgent {
  id?: string
  name?: string
  workspace?: string
  workspace_id?: string
  model?: string | { primary?: string }
}

const REIMPORT_MIN_MS = 60_000

// Only import these gateway agent ids — the gateway also exposes a generic
// `main` agent that isn't part of the content pipeline.
const PIPELINE_AGENT_IDS = new Set([
  'coordinator',
  'prompt-engineer',
  'content-creator',
  'reviewer',
  'publisher',
])

const globalAny = globalThis as unknown as {
  __ocAgentsLastImported?: number
  __ocAgentsImporting?: Promise<AgentRow[]> | null
}

function modelOf(a: RawAgent): string | null {
  if (typeof a.model === 'string') return a.model
  if (a.model && typeof a.model === 'object') return a.model.primary ?? null
  return null
}

export async function importGatewayAgents(): Promise<AgentRow[]> {
  const client = await ensureGateway(4_000)
  const payload = await client.request<unknown>('agents.list', {}, 5_000)
  let raw: RawAgent[] = []
  if (Array.isArray(payload)) {
    raw = payload as RawAgent[]
  } else if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { agents?: RawAgent[] }).agents)
  ) {
    raw = (payload as { agents: RawAgent[] }).agents
  }
  const imported: AgentRow[] = []
  for (const a of raw) {
    const gid = a.id
    if (!gid) continue
    if (!PIPELINE_AGENT_IDS.has(gid)) continue
    const row = upsertAgent({
      name: a.name || gid,
      gateway_agent_id: gid,
      model: modelOf(a),
      workspace_id: a.workspace_id || a.workspace || 'default',
      session_key_prefix: 'agent:main:',
      source: 'gateway',
      status: 'idle',
    })
    imported.push(row)
  }
  globalAny.__ocAgentsLastImported = Date.now()
  return imported
}

export async function ensureGatewayAgentsImported(): Promise<AgentRow[]> {
  const existing = listAgents()
  const last = globalAny.__ocAgentsLastImported ?? 0
  const stale = Date.now() - last > REIMPORT_MIN_MS
  if (existing.length > 0 && !stale) return existing

  // Coalesce concurrent calls.
  if (globalAny.__ocAgentsImporting) {
    try {
      return await globalAny.__ocAgentsImporting
    } catch {
      // fall through and try again
    }
  }
  const p = importGatewayAgents().catch((err) => {
    // Don't poison cache for too long if gateway is briefly down.
    globalAny.__ocAgentsLastImported = Date.now() - REIMPORT_MIN_MS + 5_000
    throw err
  }).finally(() => {
    globalAny.__ocAgentsImporting = null
  })
  globalAny.__ocAgentsImporting = p
  try {
    await p
  } catch {
    // Surface whatever we have in the DB even if the gateway call fails.
  }
  return listAgents()
}
