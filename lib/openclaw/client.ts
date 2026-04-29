// Server-only OpenClaw Gateway WebSocket client.
// Do NOT import this from client components. Server modules only.
import WebSocket, { type RawData } from 'ws'
import { randomUUID } from 'crypto'

export type GatewayEnvelope =
  | {
      type: 'req'
      id: string
      method: string
      params?: Record<string, unknown>
    }
  | {
      type: 'res'
      id: string
      ok: boolean
      payload?: unknown
      error?: { code?: string; message?: string } | string
    }
  | {
      type: 'event'
      event: string
      payload?: unknown
    }
  | Record<string, unknown>

export interface GatewayClientOptions {
  url?: string
  token?: string
  device?: string
  reconnectInitialMs?: number
  reconnectMaxMs?: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
}

type EventHandler = (event: string, payload: unknown) => void

const DEFAULT_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
const DEFAULT_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''
const DEFAULT_DEVICE =
  process.env.OPENCLAW_GATEWAY_DEVICE || 'earthia-dashboard'

export class GatewayClient {
  private url: string
  private token: string
  private device: string
  private reconnectInitialMs: number
  private reconnectMaxMs: number
  private currentBackoff: number
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingRequest>()
  private eventHandlers = new Set<EventHandler>()
  private connectingPromise: Promise<void> | null = null
  private authenticated = false
  private manuallyClosed = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private lastError: string | null = null
  private connectChallengeWaiters: Array<() => void> = []
  private receivedChallenge = false

  constructor(opts: GatewayClientOptions = {}) {
    this.url = opts.url ?? DEFAULT_URL
    this.token = opts.token ?? DEFAULT_TOKEN
    this.device = opts.device ?? DEFAULT_DEVICE
    this.reconnectInitialMs = opts.reconnectInitialMs ?? 10_000
    this.reconnectMaxMs = opts.reconnectMaxMs ?? 60_000
    this.currentBackoff = this.reconnectInitialMs
  }

  isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN
  }

  getLastError(): string | null {
    return this.lastError
  }

  getUrl(): string {
    return this.url
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => {
      this.eventHandlers.delete(handler)
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return
    if (this.connectingPromise) return this.connectingPromise
    this.manuallyClosed = false
    this.connectingPromise = this.doConnect().finally(() => {
      this.connectingPromise = null
    })
    return this.connectingPromise
  }

  private buildUrl(): string {
    if (!this.token) return this.url
    const sep = this.url.includes('?') ? '&' : '?'
    return `${this.url}${sep}token=${encodeURIComponent(this.token)}`
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const fullUrl = this.buildUrl()
      let ws: WebSocket
      try {
        ws = new WebSocket(fullUrl)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        this.lastError = e.message
        reject(e)
        return
      }
      this.ws = ws
      this.receivedChallenge = false

      const finishOk = () => {
        if (settled) return
        settled = true
        this.authenticated = true
        this.currentBackoff = this.reconnectInitialMs
        this.lastError = null
        resolve()
      }

      const finishErr = (err: Error) => {
        if (settled) return
        settled = true
        this.lastError = err.message
        this.authenticated = false
        try {
          ws.close()
        } catch {
          // ignore
        }
        reject(err)
      }

      const handshakeTimer = setTimeout(() => {
        finishErr(new Error('Gateway handshake timed out'))
      }, 15_000)

      ws.on('open', () => {
        // wait for connect.challenge
      })

      ws.on('message', (data) => {
        const msg = this.parseMessage(data)
        if (!msg) return
        // Handle handshake
        if (
          !this.authenticated &&
          msg.type === 'event' &&
          (msg as { event?: string }).event === 'connect.challenge'
        ) {
          this.receivedChallenge = true
          // send connect req per gateway protocol v3
          const id = randomUUID()
          const req: GatewayEnvelope = {
            type: 'req',
            id,
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'gateway-client',
                version: '0.1.0',
                platform: process.platform,
                mode: 'backend',
              },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              caps: [],
              commands: [],
              permissions: {},
              auth: { token: this.token },
              userAgent: `earthia-dashboard/${this.device}`,
            },
          }
          // Register pending so the response resolves auth.
          const pending: PendingRequest = {
            resolve: () => {
              clearTimeout(handshakeTimer)
              finishOk()
            },
            reject: (err: Error) => {
              clearTimeout(handshakeTimer)
              finishErr(err)
            },
            timeout: setTimeout(() => {
              this.pending.delete(id)
              clearTimeout(handshakeTimer)
              finishErr(new Error('connect req timed out'))
            }, 15_000),
          }
          this.pending.set(id, pending)
          this.sendRaw(req)
          return
        }
        this.handleMessage(msg)
      })

      ws.on('error', (err) => {
        const e = err instanceof Error ? err : new Error(String(err))
        this.lastError = e.message
        if (!settled) {
          clearTimeout(handshakeTimer)
          finishErr(e)
        }
      })

      ws.on('close', () => {
        this.authenticated = false
        this.ws = null
        // reject any pending
        const entries = Array.from(this.pending.entries())
        this.pending.clear()
        for (const [, p] of entries) {
          clearTimeout(p.timeout)
          p.reject(new Error('Gateway connection closed'))
        }
        if (!settled) {
          clearTimeout(handshakeTimer)
          finishErr(new Error('Gateway connection closed before handshake'))
        }
        this.scheduleReconnect()
      })
    })
  }

  private parseMessage(data: RawData): GatewayEnvelope | null {
    try {
      const text =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : data instanceof ArrayBuffer
              ? Buffer.from(data).toString('utf8')
              : Array.isArray(data)
                ? Buffer.concat(data.map((d) => Buffer.from(d as Uint8Array))).toString('utf8')
                : String(data)
      return JSON.parse(text) as GatewayEnvelope
    } catch {
      return null
    }
  }

  private handleMessage(msg: GatewayEnvelope) {
    if (msg.type === 'res' && typeof (msg as { id?: string }).id === 'string') {
      const id = (msg as { id: string }).id
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      clearTimeout(pending.timeout)
      const resMsg = msg as {
        type: 'res'
        id: string
        ok: boolean
        payload?: unknown
        error?: { code?: string; message?: string } | string
      }
      if (resMsg.ok) {
        pending.resolve(resMsg.payload)
      } else {
        const err =
          typeof resMsg.error === 'string'
            ? new Error(resMsg.error)
            : new Error(resMsg.error?.message || 'Gateway request failed')
        pending.reject(err)
      }
      return
    }
    if (msg.type === 'event') {
      const evt = (msg as { event?: string }).event
      const payload = (msg as { payload?: unknown }).payload
      if (typeof evt === 'string') {
        const handlers = Array.from(this.eventHandlers)
        for (const h of handlers) {
          try {
            h(evt, payload)
          } catch {
            // ignore handler errors
          }
        }
      }
    }
  }

  private sendRaw(env: GatewayEnvelope): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway socket not open')
    }
    this.ws.send(JSON.stringify(env))
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15_000
  ): Promise<T> {
    if (!this.isConnected()) {
      await this.connect()
    }
    return new Promise<T>((resolve, reject) => {
      const id = randomUUID()
      const env: GatewayEnvelope = { type: 'req', id, method, params }
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Gateway request "${method}" timed out`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timeout,
      })
      try {
        this.sendRaw(env)
      } catch (err) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  disconnect(): void {
    this.manuallyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
    this.authenticated = false
  }

  private scheduleReconnect() {
    if (this.manuallyClosed) return
    if (this.reconnectTimer) return
    const delay = this.currentBackoff
    this.currentBackoff = Math.min(this.currentBackoff * 2, this.reconnectMaxMs)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(() => {
        // failure schedules another via close handler
      })
    }, delay)
  }
}

// Module-level singleton across hot reloads in dev.
const globalAny = globalThis as unknown as { __ocGateway?: GatewayClient }

export function getGatewayClient(): GatewayClient {
  if (!globalAny.__ocGateway) {
    globalAny.__ocGateway = new GatewayClient()
  }
  return globalAny.__ocGateway
}

// Convenience: ensure a connected client (with timeout). Throws if unreachable.
export async function ensureGateway(timeoutMs = 5_000): Promise<GatewayClient> {
  const client = getGatewayClient()
  if (client.isConnected()) return client
  await Promise.race([
    client.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gateway connect timeout')), timeoutMs)
    ),
  ])
  return client
}
