import { NextRequest, NextResponse } from 'next/server'

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  let invalidOrigin = false
  if (origin) {
    try {
      const parsed = new URL(origin)
      const publicHost = (request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host)
        .split(',')[0]
        .trim()
      const publicProtocol = (request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', ''))
        .split(',')[0]
        .trim()
      invalidOrigin = parsed.host !== publicHost || parsed.protocol !== `${publicProtocol}:`
    } catch {
      invalidOrigin = true
    }
  }
  if (fetchSite === 'cross-site' || invalidOrigin) {
    return NextResponse.json({ error: 'Origem da requisição inválida.' }, { status: 403 })
  }
  return null
}

export function authJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' } })
}
