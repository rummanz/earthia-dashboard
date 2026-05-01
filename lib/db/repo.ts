// Server-only DB repositories.
import { randomUUID } from 'crypto'
import { getDb, nowIso } from './index'
import type {
  AgentRow,
  EventRow,
  OpenclawSessionRow,
  PromptTemplateRow,
  ScheduleKind,
  TaskActivityRow,
  TaskDeliverableRow,
  TaskInsert,
  TaskLogRow,
  TaskPriority,
  TaskRow,
  TaskStatus,
} from './types'

const MAX_LOG_PAYLOAD_BYTES = 64 * 1024

// ---------------- tasks ----------------

export interface TaskQuery {
  status?: string[]
  business_id?: string
  workspace_id?: string
  assigned_agent_id?: string
}

export function listTasks(filter: TaskQuery = {}): TaskRow[] {
  const db = getDb()
  const where: string[] = []
  const params: Record<string, unknown> = {}
  if (filter.status && filter.status.length) {
    const placeholders = filter.status.map((_, i) => `:status_${i}`)
    where.push(`status IN (${placeholders.join(',')})`)
    filter.status.forEach((s, i) => {
      params[`status_${i}`] = s
    })
  }
  if (filter.business_id) {
    where.push('business_id = :business_id')
    params.business_id = filter.business_id
  }
  if (filter.workspace_id) {
    where.push('workspace_id = :workspace_id')
    params.workspace_id = filter.workspace_id
  }
  if (filter.assigned_agent_id) {
    where.push('assigned_agent_id = :assigned_agent_id')
    params.assigned_agent_id = filter.assigned_agent_id
  }
  const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY datetime(created_at) DESC`
  return db.prepare(sql).all(params) as TaskRow[]
}

export function getTask(id: string): TaskRow | null {
  return (
    (getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined) ??
    null
  )
}

function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

export function createTask(input: TaskInsert): TaskRow {
  const db = getDb()
  const id = randomUUID()
  const now = nowIso()
  const row: TaskRow = {
    id,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? 'queued',
    priority: input.priority ?? 'normal',
    assigned_agent_id: input.assigned_agent_id ?? null,
    created_by_agent_id: input.created_by_agent_id ?? null,
    workspace_id: input.workspace_id ?? null,
    business_id: input.business_id ?? null,
    due_date: input.due_date ?? null,
    workflow_template_id: input.workflow_template_id ?? null,
    created_at: now,
    updated_at: now,
    content_type: input.content_type ?? null,
    dimensions: jsonOrNull(input.dimensions),
    platforms: jsonOrNull(input.platforms),
    template_id: input.template_id ?? null,
    prompt_body: input.prompt_body ?? null,
    review_score: input.review_score ?? null,
    reviewer_notes: input.reviewer_notes ?? null,
    schedule_kind: input.schedule_kind ?? null,
    schedule_at: input.schedule_at ?? null,
    schedule_meta: jsonOrNull(input.schedule_meta),
    published_to: jsonOrNull(input.published_to),
    next_run_at: input.next_run_at ?? null,
    media_url: input.media_url ?? null,
    thumbnail_url: input.thumbnail_url ?? null,
    published_at: input.published_at ?? null,
    failed_stage: input.failed_stage ?? null,
  }
  db.prepare(
    `INSERT INTO tasks (
       id, title, description, status, priority, assigned_agent_id, created_by_agent_id,
       workspace_id, business_id, due_date, workflow_template_id, created_at, updated_at,
       content_type, dimensions, platforms, template_id, prompt_body, review_score, reviewer_notes,
       schedule_kind, schedule_at, schedule_meta, published_to, next_run_at,
       media_url, thumbnail_url, published_at, failed_stage
     ) VALUES (
       @id, @title, @description, @status, @priority, @assigned_agent_id, @created_by_agent_id,
       @workspace_id, @business_id, @due_date, @workflow_template_id, @created_at, @updated_at,
       @content_type, @dimensions, @platforms, @template_id, @prompt_body, @review_score, @reviewer_notes,
       @schedule_kind, @schedule_at, @schedule_meta, @published_to, @next_run_at,
       @media_url, @thumbnail_url, @published_at, @failed_stage
     )`
  ).run(row)
  return row
}

export interface TaskPatch {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assigned_agent_id?: string | null
  workflow_template_id?: string | null
  due_date?: string | null
  business_id?: string | null
  workspace_id?: string | null
  content_type?: string | null
  dimensions?: string | { width: number; height: number; ratio?: string } | null
  platforms?: string | string[] | null
  template_id?: string | null
  prompt_body?: string | null
  review_score?: number | null
  reviewer_notes?: string | null
  schedule_kind?: ScheduleKind | null
  schedule_at?: string | null
  schedule_meta?: string | Record<string, unknown> | null
  published_to?: string | Record<string, string | null> | null
  next_run_at?: string | null
  media_url?: string | null
  thumbnail_url?: string | null
  published_at?: string | null
  failed_stage?: string | null
}

const JSON_PATCH_FIELDS: ReadonlySet<keyof TaskPatch> = new Set<keyof TaskPatch>([
  'dimensions',
  'platforms',
  'schedule_meta',
  'published_to',
])

export function updateTask(id: string, patch: TaskPatch): TaskRow | null {
  const db = getDb()
  const existing = getTask(id)
  if (!existing) return null
  const merged: Record<string, unknown> = { ...existing }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (JSON_PATCH_FIELDS.has(k as keyof TaskPatch)) {
      merged[k] = jsonOrNull(v)
    } else {
      merged[k] = v
    }
  }
  merged.updated_at = nowIso()
  const next = merged as unknown as TaskRow
  db.prepare(
    `UPDATE tasks SET
       title=@title, description=@description, status=@status, priority=@priority,
       assigned_agent_id=@assigned_agent_id, workspace_id=@workspace_id, business_id=@business_id,
       due_date=@due_date, workflow_template_id=@workflow_template_id, updated_at=@updated_at,
       content_type=@content_type, dimensions=@dimensions, platforms=@platforms,
       template_id=@template_id, prompt_body=@prompt_body, review_score=@review_score,
       reviewer_notes=@reviewer_notes, schedule_kind=@schedule_kind, schedule_at=@schedule_at,
       schedule_meta=@schedule_meta, published_to=@published_to, next_run_at=@next_run_at,
       media_url=@media_url, thumbnail_url=@thumbnail_url, published_at=@published_at,
       failed_stage=@failed_stage
     WHERE id=@id`
  ).run(next)
  return next
}

export function deleteTask(id: string): boolean {
  const db = getDb()
  const tx = db.transaction((tid: string) => {
    db.prepare('DELETE FROM task_activities WHERE task_id = ?').run(tid)
    db.prepare('DELETE FROM task_deliverables WHERE task_id = ?').run(tid)
    db.prepare('DELETE FROM task_roles WHERE task_id = ?').run(tid)
    db.prepare('DELETE FROM task_logs WHERE task_id = ?').run(tid)
    db.prepare('DELETE FROM openclaw_sessions WHERE task_id = ?').run(tid)
    const r = db.prepare('DELETE FROM tasks WHERE id = ?').run(tid)
    return r.changes > 0
  })
  return tx(id)
}

// ---------------- task_logs ----------------

export interface TaskLogInsert {
  task_id: string
  step: string
  direction: 'request' | 'response' | 'info' | 'error'
  payload: unknown
  http_status?: number | null
  duration_ms?: number | null
}

function truncatePayload(raw: unknown): string {
  let s: string
  if (typeof raw === 'string') s = raw
  else {
    try {
      s = JSON.stringify(raw, null, 2)
    } catch {
      s = String(raw)
    }
  }
  if (Buffer.byteLength(s, 'utf8') <= MAX_LOG_PAYLOAD_BYTES) return s
  // Slice on bytes by re-encoding.
  const buf = Buffer.from(s, 'utf8').subarray(0, MAX_LOG_PAYLOAD_BYTES)
  return buf.toString('utf8') + '\u2026[truncated]'
}

export function createTaskLog(input: TaskLogInsert): TaskLogRow {
  const row: TaskLogRow = {
    id: randomUUID(),
    task_id: input.task_id,
    step: input.step,
    direction: input.direction,
    payload: truncatePayload(input.payload),
    http_status: input.http_status ?? null,
    duration_ms: input.duration_ms ?? null,
    created_at: nowIso(),
  }
  getDb()
    .prepare(
      `INSERT INTO task_logs (id, task_id, step, direction, payload, http_status, duration_ms, created_at)
       VALUES (@id, @task_id, @step, @direction, @payload, @http_status, @duration_ms, @created_at)`
    )
    .run(row)
  return row
}

export function listTaskLogs(
  task_id: string,
  opts: { since?: string; limit?: number } = {}
): TaskLogRow[] {
  const db = getDb()
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000))
  if (opts.since) {
    return db
      .prepare(
        `SELECT * FROM task_logs WHERE task_id = ? AND datetime(created_at) > datetime(?)
         ORDER BY datetime(created_at) ASC LIMIT ?`
      )
      .all(task_id, opts.since, limit) as TaskLogRow[]
  }
  return db
    .prepare(
      `SELECT * FROM task_logs WHERE task_id = ?
       ORDER BY datetime(created_at) ASC LIMIT ?`
    )
    .all(task_id, limit) as TaskLogRow[]
}

export function listDueTasks(limit = 5): TaskRow[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT * FROM tasks
       WHERE status = 'queued' AND next_run_at IS NOT NULL AND datetime(next_run_at) <= datetime('now')
       ORDER BY datetime(next_run_at) ASC
       LIMIT ?`
    )
    .all(limit) as TaskRow[]
}

// ---------------- agents ----------------

export function listAgents(): AgentRow[] {
  return getDb().prepare('SELECT * FROM agents ORDER BY name ASC').all() as AgentRow[]
}

export function getAgent(id: string): AgentRow | null {
  return (
    (getDb().prepare('SELECT * FROM agents WHERE id = ?').get(id) as
      | AgentRow
      | undefined) ?? null
  )
}

export function getAgentByGatewayId(gatewayId: string): AgentRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM agents WHERE gateway_agent_id = ?')
      .get(gatewayId) as AgentRow | undefined) ?? null
  )
}

export interface AgentInsert {
  id?: string
  name: string
  model?: string | null
  status?: string
  source?: string
  gateway_agent_id?: string | null
  workspace_id?: string | null
  session_key_prefix?: string | null
}

export function upsertAgent(input: AgentInsert): AgentRow {
  const db = getDb()
  const now = nowIso()
  if (input.gateway_agent_id) {
    const existing = getAgentByGatewayId(input.gateway_agent_id)
    if (existing) {
      const next: AgentRow = {
        ...existing,
        name: input.name ?? existing.name,
        model: input.model ?? existing.model,
        workspace_id: input.workspace_id ?? existing.workspace_id,
        session_key_prefix:
          input.session_key_prefix ?? existing.session_key_prefix,
        updated_at: now,
        last_seen_at: now,
      }
      db.prepare(
        `UPDATE agents SET name=@name, model=@model, workspace_id=@workspace_id,
           session_key_prefix=@session_key_prefix, updated_at=@updated_at, last_seen_at=@last_seen_at
         WHERE id=@id`
      ).run(next)
      return next
    }
  }
  const row: AgentRow = {
    id: input.id ?? randomUUID(),
    name: input.name,
    model: input.model ?? null,
    status: input.status ?? 'idle',
    source: input.source ?? 'local',
    gateway_agent_id: input.gateway_agent_id ?? null,
    workspace_id: input.workspace_id ?? null,
    session_key_prefix: input.session_key_prefix ?? null,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
  }
  db.prepare(
    `INSERT INTO agents (id, name, model, status, source, gateway_agent_id, workspace_id, session_key_prefix, last_seen_at, created_at, updated_at)
     VALUES (@id, @name, @model, @status, @source, @gateway_agent_id, @workspace_id, @session_key_prefix, @last_seen_at, @created_at, @updated_at)`
  ).run(row)
  return row
}

export function setAgentStatus(id: string, status: string): void {
  getDb()
    .prepare('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, nowIso(), id)
}

// ---------------- openclaw_sessions ----------------

export function listOpenclawSessions(filter: {
  session_type?: string
  status?: string
  task_id?: string
  agent_id?: string
} = {}): OpenclawSessionRow[] {
  const db = getDb()
  const where: string[] = []
  const params: Record<string, unknown> = {}
  for (const k of ['session_type', 'status', 'task_id', 'agent_id'] as const) {
    if (filter[k] !== undefined) {
      where.push(`${k} = :${k}`)
      params[k] = filter[k]
    }
  }
  return db
    .prepare(
      `SELECT * FROM openclaw_sessions ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY datetime(started_at) DESC`
    )
    .all(params) as OpenclawSessionRow[]
}

export function getOpenclawSessionByOcId(
  ocId: string
): OpenclawSessionRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ?')
      .get(ocId) as OpenclawSessionRow | undefined) ?? null
  )
}

export function getOpenclawSessionForAgent(
  agent_id: string
): OpenclawSessionRow | null {
  return (
    (getDb()
      .prepare(
        "SELECT * FROM openclaw_sessions WHERE agent_id = ? AND session_type = 'main' AND status = 'active' ORDER BY datetime(started_at) DESC LIMIT 1"
      )
      .get(agent_id) as OpenclawSessionRow | undefined) ?? null
  )
}

export interface OpenclawSessionInsert {
  openclaw_session_id: string
  agent_id?: string | null
  task_id?: string | null
  session_type?: 'main' | 'subagent' | 'planning'
  status?: string
  channel?: string | null
}

export function createOpenclawSession(
  input: OpenclawSessionInsert
): OpenclawSessionRow {
  const db = getDb()
  const now = nowIso()
  const row: OpenclawSessionRow = {
    id: randomUUID(),
    openclaw_session_id: input.openclaw_session_id,
    agent_id: input.agent_id ?? null,
    task_id: input.task_id ?? null,
    session_type: input.session_type ?? 'main',
    status: input.status ?? 'active',
    channel: input.channel ?? 'mission-control',
    started_at: now,
    ended_at: null,
  }
  db.prepare(
    `INSERT INTO openclaw_sessions (id, openclaw_session_id, agent_id, task_id, session_type, status, channel, started_at, ended_at)
     VALUES (@id, @openclaw_session_id, @agent_id, @task_id, @session_type, @status, @channel, @started_at, @ended_at)`
  ).run(row)
  return row
}

export function patchOpenclawSession(
  ocId: string,
  patch: { status?: string; ended_at?: string | null }
): OpenclawSessionRow | null {
  const db = getDb()
  const existing = getOpenclawSessionByOcId(ocId)
  if (!existing) return null
  const next: OpenclawSessionRow = {
    ...existing,
    status: patch.status ?? existing.status,
    ended_at:
      patch.ended_at !== undefined ? patch.ended_at : existing.ended_at,
  }
  db.prepare(
    'UPDATE openclaw_sessions SET status=@status, ended_at=@ended_at WHERE id=@id'
  ).run(next)
  return next
}

export function deleteOpenclawSessionByOcId(ocId: string): boolean {
  const r = getDb()
    .prepare('DELETE FROM openclaw_sessions WHERE openclaw_session_id = ?')
    .run(ocId)
  return r.changes > 0
}

// ---------------- events ----------------

export interface EventInsert {
  type: string
  message: string
  agent_id?: string | null
  task_id?: string | null
  metadata?: unknown
}

export function listEvents(opts: { limit?: number; since?: string } = {}): EventRow[] {
  const db = getDb()
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500))
  if (opts.since) {
    return db
      .prepare(
        'SELECT * FROM events WHERE datetime(created_at) > datetime(?) ORDER BY datetime(created_at) DESC LIMIT ?'
      )
      .all(opts.since, limit) as EventRow[]
  }
  return db
    .prepare('SELECT * FROM events ORDER BY datetime(created_at) DESC LIMIT ?')
    .all(limit) as EventRow[]
}

export function createEvent(input: EventInsert): EventRow {
  const db = getDb()
  const row: EventRow = {
    id: randomUUID(),
    type: input.type,
    message: input.message,
    agent_id: input.agent_id ?? null,
    task_id: input.task_id ?? null,
    metadata:
      input.metadata == null
        ? null
        : typeof input.metadata === 'string'
          ? input.metadata
          : JSON.stringify(input.metadata),
    created_at: nowIso(),
  }
  db.prepare(
    `INSERT INTO events (id, type, message, agent_id, task_id, metadata, created_at)
     VALUES (@id, @type, @message, @agent_id, @task_id, @metadata, @created_at)`
  ).run(row)
  return row
}

// ---------------- activities ----------------

export interface ActivityInsert {
  task_id: string
  agent_id?: string | null
  activity_type: string
  message: string
  metadata?: string | null
}

export function listActivities(task_id: string): TaskActivityRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM task_activities WHERE task_id = ? ORDER BY datetime(created_at) ASC'
    )
    .all(task_id) as TaskActivityRow[]
}

export function createActivity(input: ActivityInsert): TaskActivityRow {
  const row: TaskActivityRow = {
    id: randomUUID(),
    task_id: input.task_id,
    agent_id: input.agent_id ?? null,
    activity_type: input.activity_type,
    message: input.message,
    metadata: input.metadata ?? null,
    created_at: nowIso(),
  }
  getDb()
    .prepare(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
       VALUES (@id, @task_id, @agent_id, @activity_type, @message, @metadata, @created_at)`
    )
    .run(row)
  return row
}

// ---------------- deliverables ----------------

export interface DeliverableInsert {
  task_id: string
  deliverable_type: string
  title: string
  path?: string | null
  description?: string | null
}

export function listDeliverables(task_id: string): TaskDeliverableRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM task_deliverables WHERE task_id = ? ORDER BY datetime(created_at) ASC'
    )
    .all(task_id) as TaskDeliverableRow[]
}

export function createDeliverable(input: DeliverableInsert): TaskDeliverableRow {
  const row: TaskDeliverableRow = {
    id: randomUUID(),
    task_id: input.task_id,
    deliverable_type: input.deliverable_type,
    title: input.title,
    path: input.path ?? null,
    description: input.description ?? null,
    created_at: nowIso(),
  }
  getDb()
    .prepare(
      `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
       VALUES (@id, @task_id, @deliverable_type, @title, @path, @description, @created_at)`
    )
    .run(row)
  return row
}

// ---------------- subagents helper ----------------

export function listSubagents(task_id: string): OpenclawSessionRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM openclaw_sessions WHERE task_id = ? AND session_type = 'subagent' ORDER BY datetime(started_at) ASC"
    )
    .all(task_id) as OpenclawSessionRow[]
}

// ---------------- prompt_templates ----------------

export interface PromptTemplateInsert {
  name: string
  body: string
  content_types?: string[]
  tone_hints?: string | null
  negative_prompt?: string | null
  variables?: Array<{ name: string; description?: string }>
}

export interface PromptTemplatePatch {
  name?: string
  body?: string
  content_types?: string[]
  tone_hints?: string | null
  negative_prompt?: string | null
  variables?: Array<{ name: string; description?: string }>
  usage_count?: number
  last_used_at?: string | null
}

export function listPromptTemplates(): PromptTemplateRow[] {
  return getDb()
    .prepare('SELECT * FROM prompt_templates ORDER BY datetime(updated_at) DESC')
    .all() as PromptTemplateRow[]
}

export function getPromptTemplate(id: string): PromptTemplateRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM prompt_templates WHERE id = ?')
      .get(id) as PromptTemplateRow | undefined) ?? null
  )
}

export function createPromptTemplate(
  input: PromptTemplateInsert
): PromptTemplateRow {
  const db = getDb()
  const now = nowIso()
  const row: PromptTemplateRow = {
    id: randomUUID(),
    name: input.name,
    body: input.body,
    content_types: JSON.stringify(input.content_types ?? []),
    tone_hints: input.tone_hints ?? null,
    negative_prompt: input.negative_prompt ?? null,
    variables: JSON.stringify(input.variables ?? []),
    usage_count: 0,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  }
  db.prepare(
    `INSERT INTO prompt_templates
       (id, name, body, content_types, tone_hints, negative_prompt, variables, usage_count, last_used_at, created_at, updated_at)
     VALUES
       (@id, @name, @body, @content_types, @tone_hints, @negative_prompt, @variables, @usage_count, @last_used_at, @created_at, @updated_at)`
  ).run(row)
  return row
}

export function updatePromptTemplate(
  id: string,
  patch: PromptTemplatePatch
): PromptTemplateRow | null {
  const db = getDb()
  const existing = getPromptTemplate(id)
  if (!existing) return null
  const next: PromptTemplateRow = {
    ...existing,
    name: patch.name ?? existing.name,
    body: patch.body ?? existing.body,
    content_types:
      patch.content_types !== undefined
        ? JSON.stringify(patch.content_types)
        : existing.content_types,
    tone_hints:
      patch.tone_hints !== undefined ? patch.tone_hints : existing.tone_hints,
    negative_prompt:
      patch.negative_prompt !== undefined
        ? patch.negative_prompt
        : existing.negative_prompt,
    variables:
      patch.variables !== undefined
        ? JSON.stringify(patch.variables)
        : existing.variables,
    usage_count:
      patch.usage_count !== undefined ? patch.usage_count : existing.usage_count,
    last_used_at:
      patch.last_used_at !== undefined
        ? patch.last_used_at
        : existing.last_used_at,
    updated_at: nowIso(),
  }
  db.prepare(
    `UPDATE prompt_templates SET
       name=@name, body=@body, content_types=@content_types, tone_hints=@tone_hints,
       negative_prompt=@negative_prompt, variables=@variables, usage_count=@usage_count,
       last_used_at=@last_used_at, updated_at=@updated_at
     WHERE id=@id`
  ).run(next)
  return next
}

export function deletePromptTemplate(id: string): boolean {
  const r = getDb().prepare('DELETE FROM prompt_templates WHERE id = ?').run(id)
  return r.changes > 0
}
