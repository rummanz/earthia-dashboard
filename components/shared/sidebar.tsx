'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Cpu, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectionStatus } from './connection-status'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/prompts', label: 'Prompts', icon: FileText },
  { href: '/agents', label: 'Agents', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex w-[220px] flex-col border-r border-[var(--border)] bg-[var(--surface)] h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-[var(--border)]">
        <Link href="/dashboard" className="flex items-center gap-2">
          <ClawIcon className="h-5 w-5 text-[var(--accent)]" />
          <span className="font-mono font-bold tracking-widest text-[var(--accent)] text-sm">
            OPENCLAW
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-[var(--background)] text-[var(--foreground)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--background)]'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-[var(--border)]">
        <ConnectionStatus />
      </div>
    </aside>
  )
}

function ClawIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 18 L8 4 M10 20 L12 6 M16 20 L18 8 M3 14 L20 12" strokeLinecap="round" />
    </svg>
  )
}
