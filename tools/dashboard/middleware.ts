import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// The dashboard's /api/* routes spawn daemons, run deploys, kill process trees,
// and rewrite .env — and they're unauthenticated localhost endpoints. Without a
// same-origin check, any site the operator visits while the dashboard is running
// could drive those actions cross-site (CSRF). This blocks state-changing methods
// whose request did not originate from the dashboard itself, while still allowing
// non-browser clients (curl, scripts) that send neither Origin nor Sec-Fetch-Site.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function middleware(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method)) return NextResponse.next()

  const secFetchSite = request.headers.get('sec-fetch-site')
  // Modern browsers tag the request: same-origin / none are first-party; anything
  // else (cross-site, same-site) is a third-party context we reject.
  if (secFetchSite) {
    if (secFetchSite === 'same-origin' || secFetchSite === 'none') return NextResponse.next()
    return forbidden()
  }

  // No Sec-Fetch-Site: fall back to an Origin host check when present.
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host === request.headers.get('host')) return NextResponse.next()
    } catch {
      // Malformed Origin → reject below.
    }
    return forbidden()
  }

  // Neither header → non-browser client (curl, internal tooling). Allow.
  return NextResponse.next()
}

function forbidden() {
  return new NextResponse('Cross-site request blocked', { status: 403 })
}

export const config = {
  matcher: '/api/:path*',
}
