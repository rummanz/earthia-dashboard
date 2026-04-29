'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUIStore } from '@/lib/store'

const SHORTCUTS = [
  { key: 'N', desc: 'Open Add Content modal' },
  { key: 'P', desc: 'Go to Prompts' },
  { key: 'Esc', desc: 'Close current modal' },
  { key: '?', desc: 'Show this cheat sheet' },
]

export function ShortcutHelp() {
  const open = useUIStore((s) => s.shortcutHelpOpen)
  const setOpen = useUIStore((s) => s.setShortcutHelpOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--border)] last:border-0"
            >
              <span className="text-[var(--muted)]">{s.desc}</span>
              <kbd className="font-mono px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--accent)] text-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
