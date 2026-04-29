import type {
  AppSettings,
  ContentItem,
  PromptTemplate,
  AgentStatus,
} from './types'
import { MOCK_CONTENT, MOCK_SETTINGS, MOCK_TEMPLATES } from './mock-data'

// Default to same-origin Next.js API (proxies to OpenClaw Gateway). Override via env.
const API_URL = process.env.NEXT_PUBLIC_OPENCLAW_API_URL ?? ''
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

async function tryFetch<T>(path: string, init?: RequestInit, fallback?: T): Promise<T> {
  if (MOCK_MODE) {
    if (fallback === undefined) throw new Error(`No mock fallback for ${path}`)
    return fallback
  }
  try {
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
  } catch (err) {
    if (fallback !== undefined) return fallback
    throw err
  }
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
}

export const api = {
  // Content
  listContent: () => tryFetch<ContentItem[]>('/api/content', undefined, MOCK_CONTENT),
  getContent: (id: string) =>
    tryFetch<ContentItem | undefined>(
      `/api/content/${id}`,
      undefined,
      MOCK_CONTENT.find((c) => c.id === id)
    ),
  createContent: (item: Partial<ContentItem>) =>
    tryFetch<ContentItem>(
      '/api/content',
      { method: 'POST', body: JSON.stringify(item) },
      { ...item, id: `c_${Date.now()}` } as ContentItem
    ),
  deleteContent: (id: string) =>
    tryFetch<{ ok: true }>(
      `/api/content/${id}`,
      { method: 'DELETE' },
      { ok: true }
    ),

  // Templates
  listTemplates: () => tryFetch<PromptTemplate[]>('/api/templates', undefined, MOCK_TEMPLATES),
  createTemplate: (tpl: Partial<PromptTemplate>) =>
    tryFetch<PromptTemplate>(
      '/api/templates',
      { method: 'POST', body: JSON.stringify(tpl) },
      { ...tpl, id: `tpl_${Date.now()}` } as PromptTemplate
    ),
  updateTemplate: (id: string, tpl: Partial<PromptTemplate>) =>
    tryFetch<PromptTemplate>(
      `/api/templates/${id}`,
      { method: 'PUT', body: JSON.stringify(tpl) },
      { ...tpl, id } as PromptTemplate
    ),
  deleteTemplate: (id: string) =>
    tryFetch<{ ok: true }>(
      `/api/templates/${id}`,
      { method: 'DELETE' },
      { ok: true }
    ),

  // Agents status
  agentStatus: () =>
    tryFetch<Record<string, { status: AgentStatus; lastRun?: string; currentJob?: string }>>(
      '/api/agents/status',
      undefined,
      {
        coordinator: { status: 'idle', lastRun: new Date().toISOString() },
        'prompt-engineer': { status: 'running', currentJob: 'c003' },
        'content-creator': { status: 'running', currentJob: 'c003' },
        reviewer: { status: 'idle', lastRun: new Date().toISOString() },
        publisher: { status: 'idle', lastRun: new Date(Date.now() - 5 * 60_000).toISOString() },
      }
    ),

  // Settings
  getSettings: () => tryFetch<AppSettings>('/api/settings', undefined, MOCK_SETTINGS),
  saveSettings: (s: AppSettings) =>
    tryFetch<AppSettings>('/api/settings', { method: 'POST', body: JSON.stringify(s) }, s),

  // Models
  listModels: () =>
    tryFetch<{ id: string; label: string }[]>(
      '/api/settings/models',
      undefined,
      []
    ),

  // Tasks (Mission Control persistence)
  listTasks: () => tryFetch<TaskRow[]>('/api/tasks', undefined, []),
  createTask: (payload: {
    title: string
    description?: string
    priority?: string
    assigned_agent_id?: string | null
    business_id?: string | null
    workspace_id?: string | null
    due_date?: string | null
  }) =>
    tryFetch<TaskRow>(
      '/api/tasks',
      { method: 'POST', body: JSON.stringify(payload) },
      { id: `t_${Date.now()}`, ...payload, status: 'queued', priority: payload.priority || 'normal', description: payload.description ?? null, assigned_agent_id: payload.assigned_agent_id ?? null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as TaskRow
    ),
  patchTask: (id: string, patch: Record<string, unknown>) =>
    tryFetch<TaskRow>(
      `/api/tasks/${id}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
      { id, ...patch } as unknown as TaskRow
    ),
  deleteTask: (id: string) =>
    tryFetch<{ ok: boolean }>(
      `/api/tasks/${id}`,
      { method: 'DELETE' },
      { ok: true }
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
    tryFetch(
      `/api/tasks/${taskId}/activities`,
      { method: 'POST', body: JSON.stringify(payload) },
      { ok: true }
    ),
}

export const isMockMode = MOCK_MODE
