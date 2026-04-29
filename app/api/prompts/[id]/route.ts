import { NextRequest, NextResponse } from 'next/server'
import {
  deletePromptTemplate,
  getPromptTemplate,
  updatePromptTemplate,
} from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'
import { rowToDTO } from '@/lib/db/prompt-template-mapper'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isVariableArray(
  v: unknown
): v is Array<{ name: string; description?: string }> {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        x &&
        typeof x === 'object' &&
        typeof (x as { name?: unknown }).name === 'string'
    )
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const row = getPromptTemplate(params.id)
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(rowToDTO(row))
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const row = updatePromptTemplate(params.id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    body: typeof body.body === 'string' ? body.body : undefined,
    content_types: isStringArray(body.contentTypes)
      ? body.contentTypes
      : isStringArray(body.content_types)
        ? body.content_types
        : undefined,
    tone_hints:
      typeof body.toneHints === 'string'
        ? body.toneHints
        : typeof body.tone_hints === 'string'
          ? body.tone_hints
          : body.toneHints === null || body.tone_hints === null
            ? null
            : undefined,
    negative_prompt:
      typeof body.negativePrompt === 'string'
        ? body.negativePrompt
        : typeof body.negative_prompt === 'string'
          ? body.negative_prompt
          : body.negativePrompt === null || body.negative_prompt === null
            ? null
            : undefined,
    variables: isVariableArray(body.variables) ? body.variables : undefined,
    usage_count:
      typeof body.usageCount === 'number'
        ? body.usageCount
        : typeof body.usage_count === 'number'
          ? body.usage_count
          : undefined,
    last_used_at:
      typeof body.lastUsedAt === 'string'
        ? body.lastUsedAt
        : typeof body.last_used_at === 'string'
          ? body.last_used_at
          : undefined,
  })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  broadcast({ type: 'prompt_template_updated', payload: rowToDTO(row) })
  return NextResponse.json(rowToDTO(row))
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ok = deletePromptTemplate(params.id)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  broadcast({ type: 'prompt_template_deleted', payload: { id: params.id } })
  return NextResponse.json({ ok: true })
}
