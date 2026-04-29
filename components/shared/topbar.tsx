'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function TopBar() {
  const { data: status } = useQuery({
    queryKey: ['agent-status'],
    queryFn: () => api.agentStatus(),
    refetchInterval: 5000,
  })

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.listTasks(),
    refetchInterval: 15_000,
  })

  const pendingReview =
    tasks?.filter((t) => t.status === 'reviewing').length ?? 0
  const queued = tasks?.filter((t) => t.status === 'queued').length ?? 0

  const agentEntries = status ? Object.values(status) : []

  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-6 text-xs font-mono uppercase tracking-wider text-[var(--muted)]">
        <span>
          <span className="text-[var(--foreground)] tabular-nums">{pendingReview}</span> pending review
        </span>
        <span>
          <span className="text-[var(--foreground)] tabular-nums">{queued}</span> queued
        </span>
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-[var(--muted)] mr-2">
            Agents
          </span>
          {agentEntries.length === 0 ? (
            <span className="text-[10px] font-mono text-[var(--muted)]">
              none
            </span>
          ) : (
            agentEntries.map((a) => {
              const s = a.status
              const colorClass =
                s === 'running' || s === 'working'
                  ? 'bg-[var(--warning)] animate-pulse-dot'
                  : s === 'error'
                    ? 'bg-[var(--danger)]'
                    : 'bg-[var(--muted)]'
              return (
                <Tooltip key={a.id}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn('h-2.5 w-2.5 rounded-full inline-block', colorClass)}
                      aria-label={`${a.name}: ${s}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {a.name}: <span className="font-mono uppercase">{s}</span>
                  </TooltipContent>
                </Tooltip>
              )
            })
          )}
        </div>
      </TooltipProvider>
    </header>
  )
}
