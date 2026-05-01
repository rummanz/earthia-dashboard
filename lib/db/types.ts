// DB row types — server-only.

export interface TaskRow {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigned_agent_id: string | null
  created_by_agent_id: string | null
  workspace_id: string | null
  business_id: string | null
  due_date: string | null
  workflow_template_id: string | null
  created_at: string
  updated_at: string
  // Content-pipeline columns (added via ALTER TABLE migrations)
  content_type: string | null
  dimensions: string | null
  platforms: string | null
  template_id: string | null
  prompt_body: string | null
  review_score: number | null
  reviewer_notes: string | null
  schedule_kind: string | null
  schedule_at: string | null
  schedule_meta: string | null
  published_to: string | null
  next_run_at: string | null
  media_url: string | null
  thumbnail_url: string | null
  published_at: string | null
  failed_stage: string | null
}

export interface AgentRow {
  id: string
  name: string
  model: string | null
  status: string
  source: string
  gateway_agent_id: string | null
  workspace_id: string | null
  session_key_prefix: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface OpenclawSessionRow {
  id: string
  openclaw_session_id: string
  agent_id: string | null
  task_id: string | null
  session_type: string
  status: string
  channel: string | null
  started_at: string | null
  ended_at: string | null
}

export interface EventRow {
  id: string
  type: string
  message: string
  agent_id: string | null
  task_id: string | null
  metadata: string | null
  created_at: string
}

export interface TaskActivityRow {
  id: string
  task_id: string
  agent_id: string | null
  activity_type: string
  message: string
  metadata: string | null
  created_at: string
}

export interface TaskDeliverableRow {
  id: string
  task_id: string
  deliverable_type: string
  title: string
  path: string | null
  description: string | null
  created_at: string
}

export interface TaskLogRow {
  id: string
  task_id: string
  step: string
  direction: string // 'request' | 'response' | 'info' | 'error'
  payload: string
  http_status: number | null
  duration_ms: number | null
  created_at: string
}

export interface PromptTemplateRow {
  id: string
  name: string
  body: string
  content_types: string // JSON array
  tone_hints: string | null
  negative_prompt: string | null
  variables: string // JSON array
  usage_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskStatus =
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'generating'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'testing'
  | 'review'
  | 'done'
  | 'failed'
  | 'cancelled'

export type ScheduleKind = 'now' | 'once' | 'hourly' | 'daily' | 'weekly'

export interface TaskInsert {
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  assigned_agent_id?: string | null
  created_by_agent_id?: string | null
  workspace_id?: string | null
  business_id?: string | null
  due_date?: string | null
  workflow_template_id?: string | null
  // Content-pipeline fields
  content_type?: string | null
  dimensions?: { width: number; height: number; ratio?: string } | null
  platforms?: string[] | null
  template_id?: string | null
  prompt_body?: string | null
  review_score?: number | null
  reviewer_notes?: string | null
  schedule_kind?: ScheduleKind | null
  schedule_at?: string | null
  schedule_meta?: Record<string, unknown> | null
  published_to?: Record<string, string | null> | null
  next_run_at?: string | null
  media_url?: string | null
  thumbnail_url?: string | null
  published_at?: string | null
  failed_stage?: string | null
}
