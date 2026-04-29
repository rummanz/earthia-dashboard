import { NextRequest, NextResponse } from 'next/server'
import {
  createPromptTemplate,
  listPromptTemplates,
} from '@/lib/db/repo'
import { rowToDTO } from '@/lib/db/prompt-template-mapper'
import { broadcast } from '@/lib/sse/broadcast'

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

export async function GET() {
  const rows = listPromptTemplates()
  return NextResponse.json(rows.map(rowToDTO))
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 })
  }
  if (typeof body.body !== 'string' || !body.body.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }
  const row = createPromptTemplate({
    name: body.name,
    body: body.body,
    content_types: isStringArray(body.contentTypes)
      ? body.contentTypes
      : isStringArray(body.content_types)
        ? body.content_types
        : [],
    tone_hints:
      typeof body.toneHints === 'string'
        ? body.toneHints
        : typeof body.tone_hints === 'string'
          ? body.tone_hints
          : null,
    negative_prompt:
      typeof body.negativePrompt === 'string'
        ? body.negativePrompt
        : typeof body.negative_prompt === 'string'
          ? body.negative_prompt
          : null,
    variables: isVariableArray(body.variables) ? body.variables : [],
  })
  broadcast({ type: 'prompt_template_created', payload: rowToDTO(row) })
  return NextResponse.json(rowToDTO(row), { status: 201 })
}
