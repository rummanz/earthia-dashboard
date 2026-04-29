import { NextResponse } from 'next/server'
import { homedir } from 'os'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ensureGateway } from '@/lib/openclaw/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ModelEntry {
  id: string
  provider?: string
  alias?: string
}

const FALLBACK_MODELS = [
  'anthropic/claude-opus-4-7',
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
]

function normalizeModelId(m: ModelEntry): string {
  if (m.provider && m.id) return `${m.provider}/${m.id}`
  return m.id
}

export async function GET() {
  // Try gateway
  try {
    const client = await ensureGateway(4_000)
    const [modelsRes, configRes] = await Promise.all([
      client.request<unknown>('models.list', {}, 5_000),
      client.request<unknown>('config.get', {}, 5_000).catch(() => null),
    ])
    let available: string[] = []
    if (Array.isArray(modelsRes)) {
      available = (modelsRes as ModelEntry[]).map(normalizeModelId)
    } else if (
      modelsRes &&
      typeof modelsRes === 'object' &&
      Array.isArray((modelsRes as { models?: ModelEntry[] }).models)
    ) {
      available = (modelsRes as { models: ModelEntry[] }).models.map(normalizeModelId)
    }
    let defaultModel: string | null = null
    if (configRes && typeof configRes === 'object') {
      const cfg = configRes as Record<string, unknown>
      const candidates = [
        cfg.defaultModel,
        cfg.model,
        (cfg.agents as Record<string, unknown> | undefined)?.default,
        (cfg.runtime as Record<string, unknown> | undefined)?.defaultModel,
      ]
      for (const c of candidates) {
        if (typeof c === 'string') {
          defaultModel = c
          break
        }
      }
    }
    return NextResponse.json({
      defaultModel,
      availableModels: available.length ? available : FALLBACK_MODELS,
      source: 'remote',
    })
  } catch {
    // local fallback
  }
  try {
    const cfgPath = join(homedir(), '.openclaw', 'openclaw.json')
    const raw = readFileSync(cfgPath, 'utf8')
    const cfg = JSON.parse(raw) as Record<string, unknown>
    let defaultModel: string | null = null
    const candidates = [cfg.defaultModel, cfg.model]
    for (const c of candidates) {
      if (typeof c === 'string') {
        defaultModel = c
        break
      }
    }
    let available: string[] = FALLBACK_MODELS
    const modelsCfg = cfg.models
    if (Array.isArray(modelsCfg)) {
      available = (modelsCfg as Array<string | ModelEntry>).map((m) =>
        typeof m === 'string' ? m : normalizeModelId(m)
      )
    }
    return NextResponse.json({
      defaultModel,
      availableModels: available,
      source: 'local',
    })
  } catch {
    return NextResponse.json({
      defaultModel: null,
      availableModels: FALLBACK_MODELS,
      source: 'fallback',
    })
  }
}
