'use client'
import { useState } from 'react'
import type { AgentMeta } from '@/lib/agents'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useQuery } from '@tanstack/react-query'
import { useSettingsStore } from '@/lib/store'
import { useRouter } from 'next/navigation'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentRow {
  id: string
  name: string
  model: string | null
  status: string
  gateway_agent_id: string | null
  last_seen_at: string | null
}

async function fetchAgents(): Promise<AgentRow[]> {
  const res = await fetch('/api/agents', { cache: 'no-store' })
  if (!res.ok) return []
  return (await res.json()) as AgentRow[]
}

export function AgentsView({ agents }: { agents: AgentMeta[] }) {
  const [reading, setReading] = useState<AgentMeta | null>(null)
  const router = useRouter()
  const settings = useSettingsStore((s) => s.settings)
  const { data: liveAgents } = useQuery({
    queryKey: ['agents-list'],
    queryFn: fetchAgents,
    refetchInterval: 5000,
  })

  const liveByGatewayId = new Map<string, AgentRow>()
  for (const a of liveAgents ?? []) {
    if (a.gateway_agent_id) liveByGatewayId.set(a.gateway_agent_id, a)
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <p className="text-[var(--muted)]">
          Agent config unavailable. Could not load .md files from /agents.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-xl uppercase tracking-wider">Agents</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Read-only pipeline view. Edit instructions via backend .md files.
        </p>
      </div>

      <div className="space-y-3">
        {agents.map((a, i) => {
          const live = liveByGatewayId.get(a.id)
          const status = live?.status ?? 'missing'
          const model =
            settings.agentModels[a.id] ?? live?.model ?? a.model ?? '—'
          return (
            <div key={a.id} className="space-y-3">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono uppercase tracking-widest text-xs text-[var(--muted)]">
                          ⬡ {a.name}
                        </span>
                        <StatusDot status={status} registered={!!live} />
                      </div>
                      <h3 className="font-semibold text-base mb-1">{a.role}</h3>
                      <p className="text-sm text-[var(--muted)] mb-3">
                        {a.description}
                      </p>

                      {a.capabilities.length > 0 && (
                        <div className="mb-3">
                          <div className="section-label mb-1">Capabilities</div>
                          <ul className="text-xs text-[var(--foreground)]/80 space-y-0.5">
                            {a.capabilities.map((c) => (
                              <li key={c} className="flex items-start gap-2">
                                <span className="text-[var(--muted)]">·</span>
                                <span>{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs font-mono text-[var(--muted)]">
                          Model:
                        </span>
                        <Badge variant="outline">{model}</Badge>
                        <button
                          onClick={() => router.push('/settings')}
                          className="text-xs text-[var(--accent)] hover:underline"
                        >
                          [edit]
                        </button>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReading(a)}
                    >
                      View Instructions
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {i < agents.length - 1 && (
                <div className="flex justify-center text-[var(--muted)]">
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={!!reading} onOpenChange={(v) => !v && setReading(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{reading?.name}</DialogTitle>
          <pre className="font-mono text-xs whitespace-pre-wrap bg-[var(--background)] p-4 rounded-md border border-[var(--border)] max-h-[60vh] overflow-auto text-[var(--foreground)]/90">
            {reading?.content}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusDot({
  status,
  registered,
}: {
  status: string
  registered: boolean
}) {
  const label = !registered ? 'not registered' : status
  const colorClass = !registered
    ? 'bg-[var(--muted)]'
    : status === 'working'
      ? 'bg-[var(--success)] animate-pulse-dot'
      : status === 'idle'
        ? 'bg-[var(--warning)]'
        : status === 'error'
          ? 'bg-[var(--danger)]'
          : 'bg-[var(--muted)]'
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--muted)]">
      <span className={cn('h-2 w-2 rounded-full', colorClass)} />
      {label}
    </span>
  )
}
