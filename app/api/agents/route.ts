import { NextResponse } from 'next/server'
import { ensureGatewayAgentsImported } from '@/lib/agents-import'
import { listAgents } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const agents = await ensureGatewayAgentsImported()
    return NextResponse.json(agents)
  } catch (err) {
    // Fall back to whatever's in the DB so the UI can still render dots
    // (greyed) instead of erroring out.
    const fallback = listAgents()
    return NextResponse.json(fallback, {
      headers: {
        'x-import-error':
          err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      },
    })
  }
}
