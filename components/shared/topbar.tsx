'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useContentStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const AGENT_LABELS: Record<string, string> = {
  coordinator: 'Coordinator',
  'prompt-engineer': 'Prompt Engineer',
  'content-creator': 'Content Creator',
  reviewer: 'Reviewer',
  publisher: 'Publisher',
}
const AGENT_ORDER = ['coordinator', 'prompt-engineer', 'content-creator', 'reviewer', 'publisher']

export function TopBar() {
  const { data: status } = useQuery({
    queryKey: ['agent-status'],
    queryFn: () => api.agentStatus(),
    refetchInterval: 5000,
  })

  const items = useContentStore((s) => s.items)
  const pendingReview = items.filter((i) => i.status === 'reviewing').length
  const queued = items.filter((i) => i.status === 'queued').length

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
          {AGENT_ORDER.map((id) => {
            const s = status?.[id]?.status ?? 'idle'
            const colorClass =
              s === 'running'
                ? 'bg-[var(--warning)] animate-pulse-dot'
                : s === 'error'
                  ? 'bg-[var(--danger)]'
                  : 'bg-[var(--muted)]'
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <span
                    className={cn('h-2.5 w-2.5 rounded-full inline-block', colorClass)}
                    aria-label={`${AGENT_LABELS[id]}: ${s}`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {AGENT_LABELS[id]}: <span className="font-mono uppercase">{s}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    </header>
  )
}
