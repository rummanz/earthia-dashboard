// Server-only mapping between PromptTemplateRow and the API DTO.
import type { PromptTemplateRow } from './types'

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

function safeJsonArray<T>(s: string | null | undefined, fallback: T[]): T[] {
  if (!s) return fallback
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

export function rowToDTO(row: PromptTemplateRow): PromptTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    contentTypes: safeJsonArray<string>(row.content_types, []),
    toneHints: row.tone_hints,
    negativePrompt: row.negative_prompt,
    variables: safeJsonArray<{ name: string; description?: string }>(
      row.variables,
      []
    ),
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
