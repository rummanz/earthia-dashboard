import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | undefined, fmt: 'short' | 'long' = 'short'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getUTCDate()).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mon = months[d.getUTCMonth()]
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  if (fmt === 'long') {
    return `${day} ${mon} ${d.getUTCFullYear()} · ${hh}:${mm}`
  }
  return `${day} ${mon} · ${hh}:${mm}`
}

export function isFuture(iso: string | undefined): boolean {
  if (!iso) return false
  return new Date(iso).getTime() > Date.now()
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function parseVariables(body: string): string[] {
  const matches = body.match(/\{([a-zA-Z0-9_]+)\}/g) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    const name = m.slice(1, -1)
    if (!seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}
