// Server-only upload-post.com publisher.
// Handles photos, videos, and text. Records every request/response via loggedFetch.

import { readFile } from 'fs/promises'
import { basename } from 'path'
import { loggedFetch } from '@/lib/pipeline/logged'

const BASE = 'https://api.upload-post.com/api'

function getApiKey(): string {
  const k = process.env.UPLOAD_POST_API_KEY
  if (!k) throw new Error('UPLOAD_POST_API_KEY not configured')
  return k
}

function getProfile(): string {
  return process.env.UPLOAD_POST_PROFILE || 'insta_business'
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Apikey ${getApiKey()}`,
    ...extra,
  }
}

// Map our internal platform IDs → upload-post platform names.
// Tolerate aliases like 'twitter' which the dashboard uses.
const PLATFORM_MAP: Record<string, string> = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  twitter: 'x',
  x: 'x',
  linkedin: 'linkedin',
  facebook: 'facebook',
  pinterest: 'pinterest',
  threads: 'threads',
  bluesky: 'bluesky',
  reddit: 'reddit',
}

function mapPlatform(id: string): string {
  return PLATFORM_MAP[id] ?? id
}

export interface PublishResult {
  ok: boolean
  url?: string
  error?: string
  requestId?: string
}

export type PublishMap = Record<string, PublishResult>

interface UploadPostResponse {
  success?: boolean
  request_id?: string
  job_id?: string
  results?: Record<string, unknown>
  // Some responses use an array
  upload_status?: unknown
  // Errors
  error?: string
  detail?: string
  message?: string
}

function extractPostUrl(platformResult: unknown): string | undefined {
  if (!platformResult || typeof platformResult !== 'object') return undefined
  const r = platformResult as Record<string, unknown>
  const candidates = [
    r.post_url,
    r.shared_url,
    r.permalink,
    r.url,
    r.share_url,
    r.video_url,
    r.tweet_url,
    r.media_url,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c
  }
  // Some platforms nest details
  if (r.data && typeof r.data === 'object') {
    const nested = extractPostUrl(r.data)
    if (nested) return nested
  }
  if (r.response && typeof r.response === 'object') {
    const nested = extractPostUrl(r.response)
    if (nested) return nested
  }
  return undefined
}

function extractRequestId(platformResult: unknown): string | undefined {
  if (!platformResult || typeof platformResult !== 'object') return undefined
  const r = platformResult as Record<string, unknown>
  for (const k of ['request_id', 'job_id', 'task_id']) {
    const v = r[k]
    if (typeof v === 'string' && v) return v
  }
  return undefined
}

function isAsyncMarker(platformResult: unknown): boolean {
  if (!platformResult || typeof platformResult !== 'object') return false
  const r = platformResult as Record<string, unknown>
  const status = String(r.status ?? r.state ?? '').toLowerCase()
  return (
    status === 'pending' ||
    status === 'processing' ||
    status === 'queued' ||
    status === 'in_progress' ||
    !!extractRequestId(r)
  )
}

function platformError(platformResult: unknown): string | undefined {
  if (!platformResult || typeof platformResult !== 'object') return undefined
  const r = platformResult as Record<string, unknown>
  for (const k of ['error', 'message', 'detail']) {
    const v = r[k]
    if (typeof v === 'string' && v) return v
  }
  if (r.success === false) return 'upload failed'
  return undefined
}

async function pollStatus(
  taskId: string,
  requestId: string,
  maxWaitMs = 60_000,
  intervalMs = 5000
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs))
    const res = await loggedFetch(
      taskId,
      'upload-post.status',
      `${BASE}/uploadposts/status?request_id=${encodeURIComponent(requestId)}`,
      { method: 'GET', headers: authHeaders() }
    )
    if (res.json && typeof res.json === 'object') {
      const obj = res.json as Record<string, unknown>
      const status = String(obj.status ?? obj.state ?? '').toLowerCase()
      const url = extractPostUrl(obj)
      if (url) return { ok: true, url }
      if (status === 'success' || status === 'completed' || status === 'done') {
        return { ok: true, url }
      }
      if (status === 'failed' || status === 'error') {
        return {
          ok: false,
          error:
            typeof obj.error === 'string'
              ? obj.error
              : typeof obj.message === 'string'
                ? obj.message
                : 'upload failed',
        }
      }
    }
  }
  return { ok: false, error: 'status poll timed out' }
}

function parseResults(
  platformIds: string[],
  json: unknown
): Map<string, unknown> {
  const out = new Map<string, unknown>()
  if (!json || typeof json !== 'object') return out
  const env = json as UploadPostResponse
  // results keyed by platform name
  if (env.results && typeof env.results === 'object') {
    const r = env.results as Record<string, unknown>
    for (const id of platformIds) {
      const mapped = mapPlatform(id)
      if (r[mapped] !== undefined) out.set(id, r[mapped])
      else if (r[id] !== undefined) out.set(id, r[id])
    }
  }
  // Some endpoints inline the platforms at top level
  for (const id of platformIds) {
    if (out.has(id)) continue
    const env2 = json as Record<string, unknown>
    const mapped = mapPlatform(id)
    if (env2[mapped] !== undefined) out.set(id, env2[mapped])
  }
  return out
}

export interface PublishPhotosOpts {
  taskId: string
  files: string[]
  platforms: string[]
  title: string
  description?: string
}

export async function publishPhotos(
  opts: PublishPhotosOpts
): Promise<PublishMap> {
  const fd = new FormData()
  fd.append('user', getProfile())
  for (const p of opts.platforms) fd.append('platform[]', mapPlatform(p))
  fd.append('title', opts.title)
  if (opts.description) fd.append('description', opts.description)
  for (const file of opts.files) {
    const buf = await readFile(file)
    const blob = new Blob([buf], { type: 'image/png' })
    fd.append('photos[]', blob, basename(file))
  }
  return doMultipartPublish(opts.taskId, opts.platforms, '/upload_photos', fd)
}

export interface PublishVideoOpts {
  taskId: string
  file: string
  platforms: string[]
  title: string
  description?: string
}

export async function publishVideo(
  opts: PublishVideoOpts
): Promise<PublishMap> {
  const fd = new FormData()
  fd.append('user', getProfile())
  for (const p of opts.platforms) fd.append('platform[]', mapPlatform(p))
  fd.append('title', opts.title)
  if (opts.description) fd.append('description', opts.description)
  const buf = await readFile(opts.file)
  const blob = new Blob([buf], { type: 'video/mp4' })
  fd.append('video', blob, basename(opts.file))
  return doMultipartPublish(opts.taskId, opts.platforms, '/upload_videos', fd)
}

export interface PublishTextOpts {
  taskId: string
  platforms: string[]
  title: string
}

export async function publishText(
  opts: PublishTextOpts
): Promise<PublishMap> {
  const body = {
    user: getProfile(),
    platform: opts.platforms.map(mapPlatform),
    title: opts.title,
  }
  const res = await loggedFetch(
    opts.taskId,
    'upload-post.upload_text',
    `${BASE}/upload_text`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      loggedBody: body,
    }
  )
  return finalizeResults(opts.taskId, opts.platforms, res.json)
}

async function doMultipartPublish(
  taskId: string,
  platforms: string[],
  path: string,
  fd: FormData
): Promise<PublishMap> {
  // Log a sanitized description of the multipart body.
  const fileNames: string[] = []
  const keys: string[] = []
  fd.forEach((v, k) => {
    keys.push(k)
    if (typeof v !== 'string') {
      fileNames.push(`${k}=<file:${(v as Blob).size}b>`)
    }
  })
  const res = await loggedFetch(
    taskId,
    `upload-post${path}`.replace('/upload-post', 'upload-post'),
    `${BASE}${path}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: fd as unknown as BodyInit,
      loggedBody: {
        multipart: true,
        platforms,
        files: fileNames,
        keys,
      },
    }
  )
  return finalizeResults(taskId, platforms, res.json)
}

async function finalizeResults(
  taskId: string,
  platforms: string[],
  json: unknown
): Promise<PublishMap> {
  const map: PublishMap = {}
  const parsed = parseResults(platforms, json)

  // If the top-level returned a global error, mark all platforms failed.
  const env = (json && typeof json === 'object' ? (json as Record<string, unknown>) : {}) as UploadPostResponse
  const globalError =
    typeof env.error === 'string'
      ? env.error
      : typeof env.detail === 'string'
        ? env.detail
        : typeof env.message === 'string' && env.success === false
          ? env.message
          : undefined

  for (const id of platforms) {
    const result = parsed.get(id)
    if (!result) {
      // No per-platform info — fall back on global response shape.
      const url = extractPostUrl(json)
      if (url) {
        map[id] = { ok: true, url }
      } else if (globalError) {
        map[id] = { ok: false, error: globalError }
      } else if (env.success === true) {
        map[id] = { ok: true }
      } else {
        map[id] = { ok: false, error: 'no result returned' }
      }
      continue
    }
    const url = extractPostUrl(result)
    if (url) {
      map[id] = { ok: true, url }
      continue
    }
    if (isAsyncMarker(result)) {
      const reqId = extractRequestId(result)
      if (reqId) {
        const polled = await pollStatus(taskId, reqId)
        map[id] = {
          ok: polled.ok,
          url: polled.url,
          error: polled.error,
          requestId: reqId,
        }
        continue
      }
    }
    const err = platformError(result)
    if (err) {
      map[id] = { ok: false, error: err }
      continue
    }
    // Best-effort: if no URL but no error, mark ok.
    map[id] = { ok: true }
  }
  return map
}
