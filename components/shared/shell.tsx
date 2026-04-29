'use client'
import { Sidebar } from './sidebar'
import { TopBar } from './topbar'
import { ShortcutHelp } from './shortcut-help'
import { AddContentModal } from '@/components/content/add-content-modal'
import { useGlobalShortcuts } from '@/lib/use-shortcuts'

export function Shell({ children }: { children: React.ReactNode }) {
  useGlobalShortcuts()
  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 overflow-x-auto">{children}</main>
      </div>
      <AddContentModal />
      <ShortcutHelp />
    </div>
  )
}
