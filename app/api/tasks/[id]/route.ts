import { rm } from 'fs/promises'
import { resolve as resolvePath } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import {
  createEvent,
  deleteTask,
  getTask,
  updateTask,
} from '@/lib/db/repo'
import { broadcast } from '@/lib/sse/broadcast'
import type { TaskPatch } from '@/lib/db/repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const task = getTask(params.id)
  if (!task) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: Partial<TaskPatch>
  try {
    body = (await req.json()) as Partial<TaskPatch>
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const updated = updateTask(params.id, body as TaskPatch)
  if (!updated) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  createEvent({
    type: 'task_updated',
    message: `Task updated: ${updated.title}`,
    task_id: updated.id,
    metadata: body,
  })
  broadcast({ type: 'task_updated', payload: updated })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = getTask(params.id)
  if (!existing) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  deleteTask(params.id)

  // Best-effort: remove on-disk media for the task.
  const mediaDir = resolvePath(process.cwd(), 'data/media', params.id)
  try {
    await rm(mediaDir, { recursive: true, force: true })
  } catch {
    // ignore
  }

  createEvent({
    type: 'task_deleted',
    message: `Task deleted: ${existing.title}`,
    task_id: existing.id,
  })
  broadcast({ type: 'task_deleted', payload: { id: existing.id } })
  return NextResponse.json({ ok: true })
}
