import { readFile } from 'fs/promises'
import { resolve as resolvePath, basename } from 'path'
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

export async function GET(
  _req: NextRequest,
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
  const path = resolvePath(process.cwd(), 'data/media', safeTask, safeFile)
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
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
