import { Badge } from '@/components/ui/badge'
import type { ContentStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<ContentStatus, { variant: 'default' | 'success' | 'danger' | 'warning' | 'accent' | 'outline'; label: string; pulse?: boolean }> = {
  queued: { variant: 'outline', label: 'Queued' },
  generating: { variant: 'warning', label: 'Generating', pulse: true },
  reviewing: { variant: 'default', label: 'Reviewing', pulse: true },
  approved: { variant: 'success', label: 'Approved' },
  rejected: { variant: 'danger', label: 'Rejected' },
  published: { variant: 'accent', label: 'Published' },
  failed: { variant: 'danger', label: 'Failed' },
}

export function StatusBadge({ status }: { status: ContentStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <Badge variant={cfg.variant} className={cn(cfg.pulse && 'animate-pulse-dot')}>
      {cfg.label}
    </Badge>
  )
}
