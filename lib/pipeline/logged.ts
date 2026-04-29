// Server-only: HTTP helper that records every request/response into task_logs.
import { createTaskLog } from '@/lib/db/repo'
import type { TaskLogRow } from '@/lib/db/types'

export interface LoggedFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | null
  // For logging purposes only — the *intent* of the body. Pass a plain object
  // for JSON, or 'multipart' / 'binary' to leave the payload opaque.
  loggedBody?: unknown
}

export interface LoggedFetchResult {
  status: number
  ok: boolean
  text: string
  json: unknown
  durationMs: number
}

function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    if (/^authorization$/i.test(k) || /^x-api-key$/i.test(k)) {
      out[k] = '***'
    } else {
      out[k] = v
    }
  }
  return out
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export async function loggedFetch(
  taskId: string,
  step: string,
  url: string,
  init: LoggedFetchInit = {}
): Promise<LoggedFetchResult> {
  const headers = init.headers ?? {}
  const startedAt = Date.now()

  createTaskLog({
    task_id: taskId,
    step,
    direction: 'request',
    payload: {
      url,
      method: init.method ?? 'GET',
      headers: redactHeaders(headers),
      body: init.loggedBody ?? null,
    },
  })

  let res: Response
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    createTaskLog({
      task_id: taskId,
      step,
      direction: 'error',
      payload: { url, error: msg },
      duration_ms: Date.now() - startedAt,
    })
    throw err
  }

  const text = await res.text()
  const json = tryJson(text)
  const durationMs = Date.now() - startedAt

  createTaskLog({
    task_id: taskId,
    step,
    direction: 'response',
    payload: { url, status: res.status, body: json },
    http_status: res.status,
    duration_ms: durationMs,
  })

  return {
    status: res.status,
    ok: res.ok,
    text,
    json,
    durationMs,
  }
}

export function logInfo(
  taskId: string,
  step: string,
  payload: unknown
): TaskLogRow {
  return createTaskLog({
    task_id: taskId,
    step,
    direction: 'info',
    payload,
  })
}

export function logError(
  taskId: string,
  step: string,
  payload: unknown
): TaskLogRow {
  return createTaskLog({
    task_id: taskId,
    step,
    direction: 'error',
    payload,
  })
}
