'use client'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface AgentRow {
  id: string
  name: string
  model: string | null
  status: string
  source: string
  gateway_agent_id: string | null
  workspace_id: string | null
  session_key_prefix: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

// Display order + canonical labels for the 5 pipeline agents.
const PIPELINE: Array<{ gatewayId: string; label: string }> = [
  { gatewayId: 'coordinator', label: 'Coordinator' },
  { gatewayId: 'prompt-engineer', label: 'Prompt Engineer' },
  { gatewayId: 'content-creator', label: 'Content Creator' },
  { gatewayId: 'reviewer', label: 'Reviewer' },
  { gatewayId: 'publisher', label: 'Publisher' },
]

async function fetchAgents(): Promise<AgentRow[]> {
  const res = await fetch('/api/agents', { cache: 'no-store' })
  if (!res.ok) return []
  return (await res.json()) as AgentRow[]
}

async function fetchOpenclawStatus(): Promise<{ connected: boolean }> {
  try {
    const res = await fetch('/api/openclaw/status', { cache: 'no-store' })
    if (!res.ok) return { connected: false }
    const j = (await res.json()) as { connected?: boolean }
    return { connected: !!j.connected }
  } catch {
    return { connected: false }
  }
}

export function TopBar() {
  const qc = useQueryClient()

  const { data: agents } = useQuery({
    queryKey: ['agents-list'],
    queryFn: fetchAgents,
    refetchInterval: 5000,
  })

  const { data: gatewayStatus } = useQuery({
    queryKey: ['openclaw-status'],
    queryFn: fetchOpenclawStatus,
    refetchInterval: 10_000,
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.listTasks(),
    refetchInterval: 15_000,
  })

  // Listen on the SSE stream and invalidate on agent_spawned / agent_completed.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/events/stream')
    } catch {
      return
    }
    const onMsg = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { type?: string }
        if (
          data.type === 'agent_spawned' ||
          data.type === 'agent_completed' ||
          data.type === 'task_updated'
        ) {
          qc.invalidateQueries({ queryKey: ['agents-list'] })
        }
      } catch {
        // ignore malformed events
      }
    }
    es.addEventListener('message', onMsg)
    return () => {
      es?.removeEventListener('message', onMsg)
      es?.close()
    }
  }, [qc])

  const pendingReview =
    tasks?.filter((t) => t.status === 'reviewing').length ?? 0
  const queued = tasks?.filter((t) => t.status === 'queued').length ?? 0

  const connected = !!gatewayStatus?.connected
  const byGatewayId = new Map<string, AgentRow>()
  for (const a of agents ?? []) {
    if (a.gateway_agent_id) byGatewayId.set(a.gateway_agent_id, a)
  }

  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-6 text-xs font-mono uppercase tracking-wider text-[var(--muted)]">
        <span>
          <span className="text-[var(--foreground)] tabular-nums">
            {pendingReview}
          </span>{' '}
          pending review
        </span>
        <span>
          <span className="text-[var(--foreground)] tabular-nums">
            {queued}
          </span>{' '}
          queued
        </span>
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-[var(--muted)] mr-2">
            Pipeline
          </span>
          {PIPELINE.map((p) => {
            const agent = byGatewayId.get(p.gatewayId)
            const present = !!agent
            const status = agent?.status ?? 'missing'

            const isWorking =
              connected && present && status === 'working'
            const isIdle = connected && present && status === 'idle'

            const colorClass = !connected || !present
              ? 'bg-[var(--muted)]'
              : isWorking
                ? 'bg-[var(--success)] animate-pulse-dot'
                : isIdle
                  ? 'bg-[var(--warning)]'
                  : status === 'error'
                    ? 'bg-[var(--danger)]'
                    : 'bg-[var(--muted)]'

            const tooltip = !connected
              ? `${p.label} — Disconnected`
              : !present
                ? `${p.label} — Not registered`
                : isWorking
                  ? `${p.label} — working`
                  : `${p.label} — ${status}`

            return (
              <Tooltip key={p.gatewayId}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full inline-block',
                      colorClass
                    )}
                    aria-label={tooltip}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-mono uppercase text-[10px]">
                    {tooltip}
                  </span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    </header>
  )
}
