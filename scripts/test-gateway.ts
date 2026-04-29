/* eslint-disable @typescript-eslint/no-explicit-any */
// Smoke test script: connects to live OpenClaw Gateway, calls a few methods, prints results.
// Run with: npx tsx scripts/test-gateway.ts
import { GatewayClient } from '../lib/openclaw/client'

async function main() {
  const url = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
  const token =
    process.env.OPENCLAW_GATEWAY_TOKEN ||
    'cb66a75d6f37e6bed0e39b0d2c7cfa3821ff327282c7cfae'
  console.log(`[test-gateway] connecting to ${url}`)
  const client = new GatewayClient({ url, token })
  client.onEvent((evt, payload) => {
    console.log(`[event] ${evt}`, JSON.stringify(payload).slice(0, 200))
  })
  await client.connect()
  console.log('[test-gateway] authenticated ✓')

  for (const method of ['sessions.list', 'agents.list', 'models.list']) {
    try {
      const r = await client.request(method, {}, 10_000)
      const summary =
        Array.isArray(r)
          ? `array(len=${(r as unknown[]).length})`
          : r && typeof r === 'object'
            ? `object(keys=${Object.keys(r as object).join(',')})`
            : String(r)
      console.log(`[${method}] OK → ${summary}`)
      console.log(JSON.stringify(r, null, 2).slice(0, 600))
    } catch (err) {
      console.error(`[${method}] FAIL`, err instanceof Error ? err.message : err)
    }
  }

  client.disconnect()
  console.log('[test-gateway] disconnected ✓')
}

main().catch((err) => {
  console.error('[test-gateway] fatal:', err)
  process.exit(1)
})
