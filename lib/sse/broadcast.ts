// Server-only in-process SSE broadcaster.
export interface SSEEvent {
  type: string
  payload?: unknown
  ts?: number
}

type Handler = (event: SSEEvent) => void

interface BroadcastBus {
  handlers: Set<Handler>
}

const globalAny = globalThis as unknown as { __ocBus?: BroadcastBus }

function getBus(): BroadcastBus {
  if (!globalAny.__ocBus) {
    globalAny.__ocBus = { handlers: new Set() }
  }
  return globalAny.__ocBus
}

export function subscribe(handler: Handler): () => void {
  const bus = getBus()
  bus.handlers.add(handler)
  return () => {
    bus.handlers.delete(handler)
  }
}

export function broadcast(event: SSEEvent): void {
  const bus = getBus()
  const stamped: SSEEvent = { ...event, ts: event.ts ?? Date.now() }
  const handlers = Array.from(bus.handlers)
  for (const h of handlers) {
    try {
      h(stamped)
    } catch {
      // ignore handler errors
    }
  }
}
