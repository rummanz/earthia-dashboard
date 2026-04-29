'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Plus, Cpu, Settings, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/lib/store'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/prompts', label: 'Prompts', icon: FileText },
  { href: '/agents', label: 'Agents', icon: Cpu },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const setAddOpen = useUIStore((s) => s.setAddContentOpen)

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
        {NAV.slice(0, 2).map((item) => {
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

        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm bg-[var(--accent)] text-black hover:bg-[var(--accent)]/90 font-mono uppercase tracking-wider text-xs my-3"
        >
          <Plus className="h-4 w-4" />
          Add Content
        </button>

        {NAV.slice(2).map((item) => {
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
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] font-mono uppercase tracking-wider">
          <Activity className="h-3 w-3 text-[var(--success)]" />
          <span>Pipeline Active</span>
        </div>
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
