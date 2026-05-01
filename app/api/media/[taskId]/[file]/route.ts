import { readFile } from 'fs/promises'
import { homedir } from 'os'
import {
  basename,
  isAbsolute,
  relative,
  resolve as resolvePath,
} from 'path'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
}

const MISSION_CONTROL_ROOT = resolvePath(
  homedir(),
  '.openclaw',
  'workspace',
  'state',
  'missioncontrol'
)

function isWithinRoot(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function candidatePaths(taskId: string, fileName: string, absolutePath?: string): string[] {
  const out: string[] = []

  const fromDataMedia = resolvePath(process.cwd(), 'data/media', taskId, fileName)
  const fromOpenclaw = resolvePath(MISSION_CONTROL_ROOT, taskId, fileName)
  out.push(fromDataMedia, fromOpenclaw)

  if (absolutePath) {
    const resolved = resolvePath(absolutePath)
    const sameName = basename(resolved) === fileName
    const allowed =
      isWithinRoot(resolved, resolvePath(process.cwd(), 'data/media')) ||
      isWithinRoot(resolved, MISSION_CONTROL_ROOT)
    if (sameName && allowed) {
      out.unshift(resolved)
    }
  }

  return Array.from(new Set(out))
}

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string; file: string } }
) {
  const safeTask = params.taskId.replace(/[^a-zA-Z0-9_\-]/g, '')
  const safeFile = basename(params.file).replace(/[^a-zA-Z0-9_.\-]/g, '')
  if (!safeTask || !safeFile) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }
  const ext = safeFile.split('.').pop()?.toLowerCase() ?? ''
  const ct = ALLOWED_EXT[ext]
  if (!ct) {
    return NextResponse.json({ error: 'unsupported file' }, { status: 400 })
  }
  const absolutePath = req.nextUrl.searchParams.get('path') ?? undefined
  for (const path of candidatePaths(safeTask, safeFile, absolutePath)) {
    try {
      const buf = await readFile(path)
      const body = new Uint8Array(buf)
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } catch {
      // try next candidate path
    }
  }
  return NextResponse.json({ error: 'not found' }, { status: 404 })
}
