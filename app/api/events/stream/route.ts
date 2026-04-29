import { subscribe, type SSEEvent } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let keepAlive: NodeJS.Timeout | null = null
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: SSEEvent) => {
        if (closed) return
        try {
          const line = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(line))
        } catch {
          // ignore
        }
      }
      // initial hello so clients know the stream is open
      send({ type: 'hello', payload: { ok: true } })
      unsubscribe = subscribe(send)
      keepAlive = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
        } catch {
          // ignore
        }
      }, 30_000)
    },
    cancel() {
      closed = true
      if (unsubscribe) unsubscribe()
      if (keepAlive) clearInterval(keepAlive)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
