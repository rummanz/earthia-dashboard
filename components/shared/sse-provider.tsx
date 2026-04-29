'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()

  useEffect(() => {
    if (typeof window === 'undefined') return
    let es: EventSource | null = null
    let stopped = false

    function open() {
      if (stopped) return
      es = new EventSource('/api/events/stream')
      es.onmessage = (ev) => {
        try {
          const evt = JSON.parse(ev.data) as { type?: string }
          if (!evt.type) return
          if (
            evt.type === 'task_created' ||
            evt.type === 'task_updated' ||
            evt.type === 'task_deleted'
          ) {
            qc.invalidateQueries({ queryKey: ['tasks'] })
          }
          if (evt.type === 'activity_logged') {
            qc.invalidateQueries({ queryKey: ['activities'] })
          }
          if (evt.type === 'deliverable_added') {
            qc.invalidateQueries({ queryKey: ['deliverables'] })
          }
        } catch {
          // ignore
        }
      }
      es.onerror = () => {
        if (es) es.close()
        es = null
        if (!stopped) setTimeout(open, 5_000)
      }
    }
    open()
    return () => {
      stopped = true
      if (es) es.close()
    }
  }, [qc])

  return <>{children}</>
}
