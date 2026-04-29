// Unit-test-style script: exercises the pipeline state machine with mocked
// fetch + a temporary in-memory-ish SQLite DB, asserting transitions and logs.
//
// Run: npx tsx scripts/test-pipeline.ts

import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

async function main(): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'earthia-pipeline-test-'))
  process.env.MC_DB_PATH = join(tmpDir, 'test.db')
  process.env.KIE_API_KEY = 'test-kie-key'
  process.env.UPLOAD_POST_API_KEY = 'test-upload-key'
  // Make the cwd inside a tmp dir so data/media writes go there.
  process.chdir(tmpDir)

  // ---- Mock global fetch -----------------------------------------------------
  interface MockCall {
    url: string
    method: string
    bodyText: string | null
  }
  const calls: MockCall[] = []

  const KIE_TASK_ID = 'kie-fake-1'
  const KIE_IMAGE_URL = 'https://cdn.kie.test/fake.png'

  // Tiny 1x1 PNG bytes
  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  )

  let kiePollCount = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    let bodyText: string | null = null
    if (init?.body) {
      if (typeof init.body === 'string') bodyText = init.body
      else bodyText = '<binary>'
    }
    calls.push({ url, method: init?.method ?? 'GET', bodyText })

    // kie createTask
    if (url.endsWith('/jobs/createTask')) {
      return new Response(
        JSON.stringify({ code: 200, msg: 'ok', data: { taskId: KIE_TASK_ID } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    if (url.includes('/jobs/recordInfo')) {
      kiePollCount++
      // First poll: pending. Second poll onward: success.
      if (kiePollCount === 1) {
        return new Response(
          JSON.stringify({
            code: 200,
            data: { state: 'processing' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            state: 'success',
            resultJson: JSON.stringify({ resultUrls: [KIE_IMAGE_URL] }),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    // CDN download
    if (url === KIE_IMAGE_URL) {
      return new Response(pngBytes, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }
    // upload-post upload_photos
    if (url.endsWith('/api/upload_photos')) {
      return new Response(
        JSON.stringify({
          success: true,
          results: {
            instagram: { post_url: 'https://www.instagram.com/p/FAKE123' },
            tiktok: { post_url: 'https://www.tiktok.com/@earthia/video/FAKE456' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }

    return new Response('{}', { status: 404 })
  }) as typeof fetch

  // Speed up kie polling so the test runs fast.
  // Override the polling interval by monkey-patching setTimeout used in pollUntilTerminal? Simpler: import and use private __test API.

  // ---- Import after env is set ---------------------------------------------
  const { createTask, listActivities, listTaskLogs, getTask } = await import(
    '../lib/db/repo'
  )
  const { __test } = await import('../lib/scheduler')

  // Create a carousel task with 2 platforms.
  const task = createTask({
    title: 'pipeline test',
    content_type: 'carousel',
    platforms: ['instagram', 'tiktok'],
    prompt_body: 'a red apple, studio lighting',
    dimensions: { width: 1080, height: 1080, ratio: '1:1', slides: 2 } as unknown as {
      width: number
      height: number
      ratio?: string
    },
    schedule_kind: 'now',
    next_run_at: new Date().toISOString(),
  })

  // To make polling fast, monkey-patch setTimeout for promises with >100ms delays.
  // We can't easily; the scheduler uses setTimeout internally with 5000ms in pollUntilTerminal.
  // Patch globalThis.setTimeout to clamp.
  const origSetTimeout = globalThis.setTimeout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).setTimeout = ((cb: () => void, ms: number, ...rest: unknown[]) => {
    const clamped = Math.min(ms, 5)
    return origSetTimeout(cb, clamped, ...rest)
  }) as typeof setTimeout

  console.log('▶︎ running pipeline for task', task.id)
  await __test.runPipeline(task.id)
  ;(globalThis as any).setTimeout = origSetTimeout
  globalThis.fetch = realFetch

  // ---- Assertions ----------------------------------------------------------
  const final = getTask(task.id)
  if (!final) throw new Error('task vanished')
  console.log('  final status   :', final.status)
  console.log('  review_score   :', final.review_score)
  console.log('  published_to   :', final.published_to)
  console.log('  media_url      :', final.media_url)

  const activities = listActivities(task.id)
  console.log(`  activities (${activities.length}):`)
  for (const a of activities) console.log(`    - ${a.activity_type}: ${a.message}`)

  const logs = listTaskLogs(task.id, { limit: 1000 })
  console.log(`  logs (${logs.length}):`)
  for (const l of logs.slice(0, 30)) {
    console.log(
      `    [${l.direction}] ${l.step}${l.http_status ? ' status=' + l.http_status : ''}${l.duration_ms !== null ? ' ' + l.duration_ms + 'ms' : ''}`
    )
  }

  // Check redaction: no log payload should contain the API key.
  for (const l of logs) {
    if (l.payload.includes('test-kie-key') || l.payload.includes('test-upload-key')) {
      throw new Error(`API key leaked in log step=${l.step}`)
    }
  }
  console.log('  ✓ no API keys leaked into log payloads')

  // Required transitions
  const types = new Set(activities.map((a) => a.activity_type))
  for (const required of [
    'generation_started',
    'generation_complete',
    'review_started',
    'approved',
    'published',
  ]) {
    if (!types.has(required)) throw new Error(`missing activity type: ${required}`)
  }
  console.log('  ✓ all required activity types present')

  if (final.status !== 'published') {
    throw new Error(`expected status=published, got ${final.status}`)
  }
  console.log('  ✓ final status = published')

  const publishedTo = JSON.parse(final.published_to ?? '{}')
  if (
    publishedTo.instagram !== 'https://www.instagram.com/p/FAKE123' ||
    publishedTo.tiktok !== 'https://www.tiktok.com/@earthia/video/FAKE456'
  ) {
    throw new Error(
      'published_to URLs missing or wrong: ' + JSON.stringify(publishedTo)
    )
  }
  console.log('  ✓ published_to URLs captured per-platform')

  // At least kie.createTask + kie.poll + upload-post step in logs
  const steps = new Set(logs.map((l) => l.step))
  if (!steps.has('kie.createTask')) throw new Error('missing kie.createTask log')
  if (!steps.has('kie.poll')) throw new Error('missing kie.poll log')
  const hasUpload = Array.from(steps).some((s) => s.includes('upload-post'))
  if (!hasUpload) throw new Error('missing upload-post step in logs')
  console.log('  ✓ kie + upload-post steps logged')

  console.log('\nALL PIPELINE TESTS PASSED ✓')

  await rm(tmpDir, { recursive: true, force: true })
}

main().catch((e) => {
  console.error('TEST FAILED:', e)
  process.exit(1)
})
