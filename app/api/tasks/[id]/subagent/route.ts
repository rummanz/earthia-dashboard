import { NextRequest, NextResponse } from 'next/server'
import {
  createOpenclawSession,
  getTask,
  listSubagents,
  upsertAgent,
} from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getTask(params.id))
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  return NextResponse.json(listSubagents(params.id))
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!getTask(params.id))
    return NextResponse.json({ error: 'task not found' }, { status: 404 })
  let body: { openclaw_session_id?: string; agent_name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.openclaw_session_id) {
    return NextResponse.json(
      { error: 'openclaw_session_id required' },
      { status: 400 }
    )
  }
  const allowDynamic = process.env.ALLOW_DYNAMIC_AGENTS !== 'false'
  let agentId: string | null = null
  if (allowDynamic && body.agent_name) {
    const agent = upsertAgent({
      name: body.agent_name,
      gateway_agent_id: `subagent:${body.openclaw_session_id}`,
      source: 'gateway',
      session_key_prefix: 'agent:main:subagent:',
    })
    agentId = agent.id
  }
  const sess = createOpenclawSession({
    openclaw_session_id: body.openclaw_session_id,
    agent_id: agentId,
    task_id: params.id,
    session_type: 'subagent',
    status: 'active',
  })
  broadcast({ type: 'agent_spawned', payload: sess })
  return NextResponse.json(sess, { status: 201 })
}
