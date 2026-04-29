import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'success' | 'danger' | 'warning' | 'accent'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]',
    outline: 'border border-[var(--border)] text-[var(--muted)]',
    success: 'bg-[var(--success)]/15 border border-[var(--success)]/40 text-[var(--success)]',
    danger: 'bg-[var(--danger)]/15 border border-[var(--danger)]/40 text-[var(--danger)]',
    warning: 'bg-[var(--warning)]/15 border border-[var(--warning)]/40 text-[var(--warning)]',
    accent: 'bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)]',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}
