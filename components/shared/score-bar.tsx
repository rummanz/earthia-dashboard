import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScoreBarProps {
  score?: number | null
  inProgress?: boolean
  threshold?: number
}

export function ScoreBar({ score, inProgress, threshold = 7 }: ScoreBarProps) {
  if (score === null || score === undefined) {
    if (inProgress) {
      return <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" />
    }
    return <span className="text-[var(--muted)] font-mono text-sm">—</span>
  }

  const passing = score >= threshold
  const fillColor = passing ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 9 }).map((_, i) => {
          const filled = i < score
          return (
            <div
              key={i}
              className={cn(
                'h-3 w-1.5 rounded-sm',
                filled ? fillColor : 'bg-[var(--border)]'
              )}
            />
          )
        })}
      </div>
      <span className="font-mono text-xs text-[var(--muted)] tabular-nums">{score}/9</span>
    </div>
  )
}
