import { NextRequest, NextResponse } from 'next/server'

export const config = {
  matcher: ['/api/:path*'],
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // non-browser or same-origin (no header)
  const host = req.headers.get('host')
  if (!host) return false
  try {
    const o = new URL(origin)
    return o.host === host
  } catch {
    return false
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Webhooks bypass
  if (pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  // Demo mode: block mutations
  if (
    process.env.DEMO_MODE === 'true' &&
    !SAFE_METHODS.has(req.method) &&
    pathname.startsWith('/api/')
  ) {
    return NextResponse.json(
      { error: 'demo mode: writes disabled' },
      { status: 403 }
    )
  }

  const token = process.env.MC_API_TOKEN
  if (!token) return NextResponse.next() // dev mode

  // SSE token in query string
  if (pathname === '/api/events/stream') {
    const qToken = req.nextUrl.searchParams.get('token')
    if (qToken === token) return NextResponse.next()
  }

  // Bearer header
  const auth = req.headers.get('authorization')
  if (auth && auth.startsWith('Bearer ') && auth.slice(7) === token) {
    return NextResponse.next()
  }

  // Same-origin browser requests are allowed
  if (isSameOrigin(req)) return NextResponse.next()

  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
