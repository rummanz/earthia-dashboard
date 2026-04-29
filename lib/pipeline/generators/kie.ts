// Server-only kie.ai generator (image + video).
// Calls REST endpoints directly; logs everything via loggedFetch.

import { mkdir, writeFile } from 'fs/promises'
import { resolve as resolvePath } from 'path'
import { loggedFetch, logError, logInfo } from '@/lib/pipeline/logged'

const BASE = 'https://api.kie.ai/api/v1'

function getApiKey(): string {
  const k = process.env.KIE_API_KEY
  if (!k) throw new Error('KIE_API_KEY not configured')
  return k
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  }
}

interface KieEnvelope<T> {
  code?: number
  msg?: string
  data?: T
}

interface CreateTaskData {
  taskId: string
}

interface RecordInfoData {
  state?: string
  successFlag?: number
  failMsg?: string
  resultJson?: string | Record<string, unknown>
  response?: unknown
}

function asEnvelope<T>(json: unknown): KieEnvelope<T> {
  if (json && typeof json === 'object') return json as KieEnvelope<T>
  return {}
}

async function pollUntilTerminal(
  taskId: string,
  url: string,
  step: string,
  successPredicate: (data: RecordInfoData) => 'success' | 'failed' | 'pending',
  maxWaitMs: number,
  intervalMs = 5000
): Promise<RecordInfoData> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs))
    const res = await loggedFetch(taskId, step, url, {
      method: 'GET',
      headers: authHeaders(),
    })
    const env = asEnvelope<RecordInfoData>(res.json)
    if (env.code !== 200 || !env.data) {
      // transient error — keep trying
      continue
    }
    const verdict = successPredicate(env.data)
    if (verdict === 'success') return env.data
    if (verdict === 'failed') {
      throw new Error(`kie.ai task failed: ${env.data.failMsg ?? 'unknown'}`)
    }
    // pending → keep polling
  }
  throw new Error(`kie.ai task timed out after ${maxWaitMs}ms`)
}

async function downloadToFile(
  taskId: string,
  step: string,
  url: string,
  outPath: string
): Promise<void> {
  const start = Date.now()
  // We don't run this through loggedFetch because the response body is binary.
  // Log a request marker, then on success a small info marker.
  logInfo(taskId, step, { url, outPath, kind: 'download_start' })
  const res = await fetch(url, {
    headers: { 'User-Agent': 'earthia-dashboard/1.0' },
  })
  if (!res.ok) {
    // Try with auth (some kie.ai CDNs need it).
    const res2 = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'User-Agent': 'earthia-dashboard/1.0',
      },
    })
    if (!res2.ok) {
      logError(taskId, step, {
        url,
        status: res2.status,
        kind: 'download_failed',
      })
      throw new Error(`download failed: ${res2.status}`)
    }
    const buf = Buffer.from(await res2.arrayBuffer())
    await writeFile(outPath, buf)
  } else {
    const buf = Buffer.from(await res.arrayBuffer())
    await writeFile(outPath, buf)
  }
  logInfo(taskId, step, {
    url,
    outPath,
    durationMs: Date.now() - start,
    kind: 'download_done',
  })
}

function parseResultUrls(data: RecordInfoData): string[] {
  const urls: string[] = []
  let result: unknown = data.resultJson
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result)
    } catch {
      result = null
    }
  }
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    const candidates = [r.resultUrls, r.images, r.videoUrls]
    for (const c of candidates) {
      if (Array.isArray(c)) {
        for (const u of c) if (typeof u === 'string') urls.push(u)
      } else if (typeof c === 'string') {
        urls.push(c)
      }
    }
  }
  // Veo wraps in `response` sometimes
  if (urls.length === 0 && data.response) {
    let resp: unknown = data.response
    if (typeof resp === 'string') {
      try {
        resp = JSON.parse(resp)
      } catch {
        resp = null
      }
    }
    if (resp && typeof resp === 'object') {
      const r = resp as Record<string, unknown>
      const candidates = [r.resultUrls, r.videoUrls]
      for (const c of candidates) {
        if (Array.isArray(c)) {
          for (const u of c) if (typeof u === 'string') urls.push(u)
        }
      }
    }
  }
  return urls
}

export interface GenerateImagesOpts {
  taskId: string
  prompt: string
  aspect?: string // '1:1' | '9:16' | '16:9' | etc
  count?: number
  model?: string
  resolution?: string
}

export async function generateImages(
  opts: GenerateImagesOpts
): Promise<string[]> {
  const {
    taskId,
    prompt,
    aspect = '1:1',
    count = 1,
    model = 'nano-banana-pro',
    resolution = '1K',
  } = opts

  const outDir = resolvePath(process.cwd(), 'data/media', taskId)
  await mkdir(outDir, { recursive: true })

  const paths: string[] = []
  for (let i = 1; i <= count; i++) {
    const body = {
      model,
      input: {
        prompt,
        resolution,
        aspect_ratio: aspect,
        output_format: 'png',
      },
    }
    const createRes = await loggedFetch(
      taskId,
      'kie.createTask',
      `${BASE}/jobs/createTask`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        loggedBody: body,
      }
    )
    const env = asEnvelope<CreateTaskData>(createRes.json)
    if (env.code !== 200 || !env.data?.taskId) {
      throw new Error(
        `kie.createTask error: ${env.msg ?? 'unknown'} (status ${createRes.status})`
      )
    }
    const kieTaskId = env.data.taskId

    const finalData = await pollUntilTerminal(
      taskId,
      `${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(kieTaskId)}`,
      'kie.poll',
      (d) => {
        const s = String(d.state ?? '').toLowerCase()
        if (s === 'success' || s === 'done') return 'success'
        if (s === 'failed' || s === 'error') return 'failed'
        return 'pending'
      },
      6 * 60 * 1000 // 6 min cap per slide
    )
    const urls = parseResultUrls(finalData)
    if (urls.length === 0) {
      throw new Error('kie.ai succeeded but returned no image URLs')
    }
    const target = resolvePath(outDir, `slide-${i}.png`)
    await downloadToFile(taskId, 'kie.download', urls[0], target)
    paths.push(target)
  }
  return paths
}

export interface GenerateVideoOpts {
  taskId: string
  prompt: string
  aspect?: '9:16' | '16:9' | 'Auto'
  model?: 'veo3' | 'veo3_fast' | 'veo3_lite'
  imageUrls?: string[]
}

export async function generateVideo(
  opts: GenerateVideoOpts
): Promise<string> {
  const {
    taskId,
    prompt,
    aspect = '9:16',
    model = 'veo3_fast',
    imageUrls,
  } = opts
  const outDir = resolvePath(process.cwd(), 'data/media', taskId)
  await mkdir(outDir, { recursive: true })

  const body: Record<string, unknown> = {
    prompt,
    model,
    aspect_ratio: aspect,
    generationType: imageUrls && imageUrls.length > 0
      ? 'FIRST_AND_LAST_FRAMES_2_VIDEO'
      : 'TEXT_2_VIDEO',
  }
  if (imageUrls && imageUrls.length) body.imageUrls = imageUrls

  const createRes = await loggedFetch(
    taskId,
    'kie.veo.generate',
    `${BASE}/veo/generate`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      loggedBody: body,
    }
  )
  const env = asEnvelope<CreateTaskData>(createRes.json)
  if (env.code !== 200 || !env.data?.taskId) {
    throw new Error(
      `kie.veo.generate error: ${env.msg ?? 'unknown'} (status ${createRes.status})`
    )
  }
  const kieTaskId = env.data.taskId

  const finalData = await pollUntilTerminal(
    taskId,
    `${BASE}/veo/record-info?taskId=${encodeURIComponent(kieTaskId)}`,
    'kie.veo.poll',
    (d) => {
      // successFlag: 0 generating, 1 success, 2 failed, 3 gen_failed
      if (d.successFlag === 1) return 'success'
      if (d.successFlag === 2 || d.successFlag === 3) return 'failed'
      const s = String(d.state ?? '').toLowerCase()
      if (s === 'success' || s === 'done' || s === 'completed') return 'success'
      if (s === 'failed' || s === 'error') return 'failed'
      return 'pending'
    },
    8 * 60 * 1000,
    10000
  )
  const urls = parseResultUrls(finalData)
  if (urls.length === 0) {
    throw new Error('kie.veo succeeded but returned no video URLs')
  }
  const target = resolvePath(outDir, 'video.mp4')
  await downloadToFile(taskId, 'kie.veo.download', urls[0], target)
  return target
}

export function aspectFromDimensions(
  dimensions: { width?: number; height?: number; ratio?: string } | null
): string {
  if (!dimensions) return '1:1'
  if (typeof dimensions.ratio === 'string' && dimensions.ratio.includes(':')) {
    return dimensions.ratio
  }
  const w = dimensions.width
  const h = dimensions.height
  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
    if (Math.abs(w - h) < 4) return '1:1'
    if (w > h) return '16:9'
    return '9:16'
  }
  return '1:1'
}
