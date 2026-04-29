'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from './store'

export function useGlobalShortcuts() {
  const router = useRouter()
  const setAddOpen = useUIStore((s) => s.setAddContentOpen)
  const setHelpOpen = useUIStore((s) => s.setShortcutHelpOpen)
  const addOpen = useUIStore((s) => s.addContentOpen)
  const helpOpen = useUIStore((s) => s.shortcutHelpOpen)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isTyping =
        tag === 'input' || tag === 'textarea' || target?.isContentEditable
      if (e.key === 'Escape') {
        if (addOpen) setAddOpen(false)
        if (helpOpen) setHelpOpen(false)
        return
      }
      if (isTyping) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setAddOpen(true)
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        router.push('/prompts')
      } else if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, setAddOpen, setHelpOpen, addOpen, helpOpen])
}
