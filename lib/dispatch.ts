// Server-only: dispatch a task to the Coordinator gateway agent.
// Used by both the scheduler tick and the explicit POST /api/tasks/:id/dispatch route.
import { randomUUID } from 'crypto'
import {
  createActivity,
  createEvent,
  createOpenclawSession,
  createTaskLog,
  getOpenclawSessionForAgent,
  getTask,
  listAgents,
  setAgentStatus,
  updateTask,
} from '@/lib/db/repo'
import type { AgentRow, TaskRow } from '@/lib/db/types'
import { ensureGateway } from '@/lib/openclaw/client'
import { broadcast } from '@/lib/sse/broadcast'
import { ensureGatewayAgentsImported } from '@/lib/agents-import'

const COORDINATOR_GATEWAY_ID = 'coordinator'
const DEFAULT_REVIEW_THRESHOLD = 7

const globalAny = globalThis as unknown as {
  __ocSchedulerInflight?: Set<string>
  __ocDispatchTimers?: Map<string, NodeJS.Timeout>
}

function inflight(): Set<string> {
  if (!globalAny.__ocSchedulerInflight) {
    globalAny.__ocSchedulerInflight = new Set()
  }
  return globalAny.__ocSchedulerInflight
}

function timers(): Map<string, NodeJS.Timeout> {
  if (!globalAny.__ocDispatchTimers) {
    globalAny.__ocDispatchTimers = new Map()
  }
  return globalAny.__ocDispatchTimers
}

const TIMEOUT_MS = 15 * 60 * 1000

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

interface DimensionsParsed {
  width?: number
  height?: number
  ratio?: string
}

function parseDimensions(t: TaskRow): DimensionsParsed | null {
  return safeJson<DimensionsParsed>(t.dimensions)
}

function parsePlatforms(t: TaskRow): string[] {
  const arr = safeJson<unknown[]>(t.platforms)
  if (!Array.isArray(arr)) return []
  return arr.filter((x): x is string => typeof x === 'string')
}

function findCoordinatorAgent(): AgentRow | null {
  const all = listAgents()
  return all.find((a) => a.gateway_agent_id === COORDINATOR_GATEWAY_ID) ?? null
}

function buildSpec(args: {
  task: TaskRow
  reviewThreshold: number
}): string {
  const t = args.task
  const dims = parseDimensions(t)
  const platforms = parsePlatforms(t)
  const dimStr = dims?.width && dims?.height
    ? `${dims.width}x${dims.height}${dims.ratio ? ` (${dims.ratio})` : ''}`
    : '(none)'
  const platformsStr =
    platforms.length > 0 ? `[${platforms.join(', ')}]` : '[]'
  const templateStr = t.template_id ? t.template_id : 'custom'
  const promptBody = (t.prompt_body ?? '').trim() || '(empty)'

  return [
    `[Mission Control] Task ${t.id}`,
    ``,
    `content_type: ${t.content_type ?? 'unspecified'}`,
    `dimensions: ${dimStr}`,
    `platforms: ${platformsStr}`,
    `template: ${templateStr}`,
    `prompt_body:`,
    `  ${promptBody.split('\n').join('\n  ')}`,
    `review_threshold: ${args.reviewThreshold}`,
    ``,
    `Run the full pipeline as documented in your system prompt. When complete, POST to:`,
    `  http://localhost:3000/api/webhooks/agent-completion`,
    `with body:`,
    `  {`,
    `    "task_id": "${t.id}",`,
    `    "summary": "TASK_COMPLETE: <short summary>",`,
    `    "review_score": <int 1-9>,`,
    `    "review_notes": "<text>",`,
    `    "published_to": { "<platform>": "<post_url|null>" },`,
    `    "media_paths": ["<absolute path or url>"]`,
    `  }`,
    ``,
    `On failure, POST the same endpoint with status="failed" and a "reason" string.`,
  ].join('\n')
}

export interface DispatchResult {
  ok: boolean
  task_id: string
  agent_id?: string
  session_id?: string
  error?: string
}

export async function dispatchTask(taskId: string): Promise<DispatchResult> {
  if (inflight().has(taskId)) {
    return { ok: false, task_id: taskId, error: 'already in flight' }
  }
  const task = getTask(taskId)
  if (!task) return { ok: false, task_id: taskId, error: 'task not found' }

  // Make sure agents have been imported at least once so the coordinator exists.
  try {
    await ensureGatewayAgentsImported()
  } catch {
    // best-effort; we'll fail below if coordinator still missing
  }

  let coordinator = findCoordinatorAgent()
  if (!coordinator) {
    const reason = 'Coordinator agent not yet imported — try again in a moment'
    updateTask(taskId, { status: 'failed', reviewer_notes: reason })
    createActivity({
      task_id: taskId,
      activity_type: 'error',
      message: reason,
    })
    createEvent({
      type: 'task_failed',
      message: reason,
      task_id: taskId,
    })
    const after = getTask(taskId)
    if (after) broadcast({ type: 'task_updated', payload: after })
    return { ok: false, task_id: taskId, error: reason }
  }

  inflight().add(taskId)
  const startedAt = Date.now()

  let client
  try {
    client = await ensureGateway(5_000)
  } catch (err) {
    inflight().delete(taskId)
    const msg = err instanceof Error ? err.message : 'gateway unreachable'
    updateTask(taskId, { status: 'failed', reviewer_notes: msg })
    createActivity({
      task_id: taskId,
      activity_type: 'error',
      message: `Gateway unreachable: ${msg}`,
    })
    createTaskLog({
      task_id: taskId,
      step: 'coordinator.dispatch',
      direction: 'error',
      payload: { error: msg },
    })
    const after = getTask(taskId)
    if (after) broadcast({ type: 'task_updated', payload: after })
    return { ok: false, task_id: taskId, error: msg }
  }

  // Reuse or create the openclaw_sessions row for the coordinator.
  let session = getOpenclawSessionForAgent(coordinator.id)
  if (!session) {
    session = createOpenclawSession({
      openclaw_session_id:
        coordinator.gateway_agent_id || `mission-control-${coordinator.id}`,
      agent_id: coordinator.id,
      task_id: taskId,
      session_type: 'main',
      channel: 'mission-control',
    })
  }

  const sessionKey = `${coordinator.session_key_prefix || 'agent:main:'}${session.openclaw_session_id}`

  const reviewThreshold = DEFAULT_REVIEW_THRESHOLD
  const spec = buildSpec({ task, reviewThreshold })

  // Mark task in_progress and assign the coordinator.
  const updated = updateTask(taskId, {
    status: 'in_progress',
    assigned_agent_id: coordinator.id,
    next_run_at: null,
  })

  let sendErr: Error | null = null
  try {
    await client.request(
      'chat.send',
      {
        sessionKey,
        message: spec,
        idempotencyKey: `dispatch-${taskId}-${Date.now()}-${randomUUID()}`,
      },
      15_000
    )
  } catch (err) {
    sendErr = err instanceof Error ? err : new Error(String(err))
  }

  const durationMs = Date.now() - startedAt

  createTaskLog({
    task_id: taskId,
    step: 'coordinator.dispatch',
    direction: sendErr ? 'error' : 'request',
    payload: sendErr
      ? { sessionKey, error: sendErr.message, spec }
      : { sessionKey, spec },
    http_status: sendErr ? 502 : 200,
    duration_ms: durationMs,
  })

  if (sendErr) {
    inflight().delete(taskId)
    coordinator = findCoordinatorAgent() // re-read
    if (coordinator) setAgentStatus(coordinator.id, 'idle')
    updateTask(taskId, { status: 'failed', reviewer_notes: sendErr.message })
    createActivity({
      task_id: taskId,
      activity_type: 'error',
      message: `Dispatch failed: ${sendErr.message}`,
      agent_id: coordinator?.id ?? null,
    })
    const after = getTask(taskId)
    if (after) broadcast({ type: 'task_updated', payload: after })
    return { ok: false, task_id: taskId, error: sendErr.message }
  }

  setAgentStatus(coordinator.id, 'working')
  createActivity({
    task_id: taskId,
    agent_id: coordinator.id,
    activity_type: 'dispatched',
    message: 'Dispatched to Coordinator',
    metadata: JSON.stringify({ sessionKey }),
  })
  createEvent({
    type: 'task_dispatched',
    message: `Task dispatched to ${coordinator.name}`,
    task_id: taskId,
    agent_id: coordinator.id,
  })
  if (updated) broadcast({ type: 'task_updated', payload: updated })
  broadcast({
    type: 'agent_spawned',
    payload: { agent_id: coordinator.id, task_id: taskId },
  })

  // Start a 15-minute timeout. Cleared by the webhook on completion.
  const existingTimer = timers().get(taskId)
  if (existingTimer) clearTimeout(existingTimer)
  const t = setTimeout(() => {
    timers().delete(taskId)
    handleDispatchTimeout(taskId)
  }, TIMEOUT_MS)
  if (typeof t.unref === 'function') t.unref()
  timers().set(taskId, t)

  return {
    ok: true,
    task_id: taskId,
    agent_id: coordinator.id,
    session_id: session.openclaw_session_id,
  }
}

export function clearDispatchTimer(taskId: string): void {
  const t = timers().get(taskId)
  if (t) {
    clearTimeout(t)
    timers().delete(taskId)
  }
  inflight().delete(taskId)
}

function handleDispatchTimeout(taskId: string): void {
  const task = getTask(taskId)
  if (!task) return
  if (
    task.status === 'published' ||
    task.status === 'approved' ||
    task.status === 'failed' ||
    task.status === 'rejected'
  ) {
    inflight().delete(taskId)
    return
  }
  const reason = 'Timeout waiting for Coordinator'
  updateTask(taskId, { status: 'failed', reviewer_notes: reason })
  createActivity({
    task_id: taskId,
    activity_type: 'error',
    message: reason,
  })
  createEvent({
    type: 'task_failed',
    message: reason,
    task_id: taskId,
  })
  // Reset every agent currently marked working — easiest approach for MVP.
  for (const a of listAgents()) {
    if (a.status === 'working') setAgentStatus(a.id, 'idle')
  }
  inflight().delete(taskId)
  const after = getTask(taskId)
  if (after) broadcast({ type: 'task_updated', payload: after })
  broadcast({ type: 'agent_completed', payload: { task_id: taskId } })
}
