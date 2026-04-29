'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--muted)] disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[100px] w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--muted)] disabled:opacity-50 font-mono',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
