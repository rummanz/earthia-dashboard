import type { AppSettings } from './types'

// Same-origin Next.js API by default. Override base URL with env if needed.
// MOCK_MODE no longer returns fake content; it just forces empty results so
// the UI renders its empty states without the network even being attempted.
const API_URL = process.env.NEXT_PUBLIC_OPENCLAW_API_URL ?? ''
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

async function tryFetch<T>(path: string, init?: RequestInit, fallback?: T): Promise<T> {
  if (MOCK_MODE) {
    if (fallback === undefined) throw new Error(`No fallback for ${path} in MOCK_MODE`)
    return fallback
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export interface TaskRow {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  assigned_agent_id: string | null
  created_at: string
  updated_at: string
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

export interface PromptTemplateDTO {
  id: string
  name: string
  body: string
  contentTypes: string[]
  toneHints: string | null
  negativePrompt: string | null
  variables: Array<{ name: string; description?: string }>
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentStatusEntry {
  id: string
  name: string
  status: string
  model: string | null
  last_seen_at: string | null
}

export interface TaskLogDTO {
  id: string
  task_id: string
  step: string
  direction: string // 'request' | 'response' | 'info' | 'error'
  payload: string
  http_status: number | null
  duration_ms: number | null
  created_at: string
}

export interface TaskDeliverableDTO {
  id: string
  task_id: string
  deliverable_type: string
  title: string
  path: string | null
  description: string | null
  created_at: string
}

export interface CreateTaskPayload {
  title: string
  description?: string
  priority?: string
  assigned_agent_id?: string | null
  business_id?: string | null
  workspace_id?: string | null
  due_date?: string | null
  content_type?: string
  dimensions?: { width: number; height: number; ratio?: string }
  platforms?: string[]
  template_id?: string
  prompt_body?: string
  schedule_kind?: 'now' | 'once' | 'hourly' | 'daily' | 'weekly'
  schedule_at?: string
  schedule_meta?: Record<string, unknown>
}

export const api = {
  // Tasks
  listTasks: () => tryFetch<TaskRow[]>('/api/tasks', undefined, [] as TaskRow[]),
  createTask: (payload: CreateTaskPayload) =>
    tryFetch<TaskRow>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  patchTask: (id: string, patch: Record<string, unknown>) =>
    tryFetch<TaskRow>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  retryTask: (id: string, stage?: 'generate' | 'review' | 'publish') =>
    tryFetch<{
      success: boolean
      task_id: string
      resumed_stage: 'generate' | 'review' | 'publish'
      message: string
    }>(`/api/tasks/${id}/retry`, {
      method: 'POST',
      body: JSON.stringify(stage ? { stage } : {}),
    }),
  deleteTask: (id: string) =>
    tryFetch<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  getTaskLogs: (id: string, since?: string, limit = 200) => {
    const qs = new URLSearchParams()
    if (since) qs.set('since', since)
    qs.set('limit', String(limit))
    return tryFetch<TaskLogDTO[]>(
      `/api/tasks/${id}/logs?${qs.toString()}`,
      undefined,
      [] as TaskLogDTO[]
    )
  },
  getTaskDeliverables: (id: string) =>
    tryFetch<TaskDeliverableDTO[]>(
      `/api/tasks/${id}/deliverables`,
      undefined,
      [] as TaskDeliverableDTO[]
    ),
  postActivity: (
    taskId: string,
    payload: {
      activity_type: string
      message: string
      metadata?: string
      agent_id?: string
    }
  ) =>
    tryFetch<{ ok: true } | unknown>(`/api/tasks/${taskId}/activities`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Prompt templates
  listPrompts: () =>
    tryFetch<PromptTemplateDTO[]>('/api/prompts', undefined, [] as PromptTemplateDTO[]),
  createPrompt: (
    payload: Omit<PromptTemplateDTO, 'id' | 'usageCount' | 'lastUsedAt' | 'createdAt' | 'updatedAt'>
  ) =>
    tryFetch<PromptTemplateDTO>('/api/prompts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePrompt: (id: string, patch: Partial<PromptTemplateDTO>) =>
    tryFetch<PromptTemplateDTO>(`/api/prompts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deletePrompt: (id: string) =>
    tryFetch<{ ok: boolean }>(`/api/prompts/${id}`, { method: 'DELETE' }),

  // Agents
  agentStatus: () =>
    tryFetch<Record<string, AgentStatusEntry>>(
      '/api/agents/status',
      undefined,
      {} as Record<string, AgentStatusEntry>
    ),

  // Settings (no backend route yet — return whatever the server gives, or empty)
  getSettings: () =>
    tryFetch<AppSettings | null>('/api/settings', undefined, null),
  saveSettings: (s: AppSettings) =>
    tryFetch<AppSettings>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(s),
    }),

  // Models
  listModels: () =>
    tryFetch<{ id: string; label: string }[]>(
      '/api/settings/models',
      undefined,
      [] as { id: string; label: string }[]
    ),
}

export const isMockMode = MOCK_MODE
