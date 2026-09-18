import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import { destinoSeguro } from '@/lib/auth/next-path'

const PUBLIC_PAGES = new Set(['/', '/login', '/criar-organizacao', '/onboarding', '/auth/confirm', '/auth/redefinir-senha'])
const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/password', '/api/auth/recovery', '/api/session', '/api/auth/claim', '/api/auth/bootstrap-owner', '/api/auth/login-organizacao', '/api/auth/primeiro-acesso', '/api/auth/criar-organizacao'])

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const finish = (result = response) => {
    if (result !== response) for (const cookie of response.cookies.getAll()) result.cookies.set(cookie)
    result.headers.set('Cache-Control', 'private, no-store')
    result.headers.set('Pragma', 'no-cache')
    return result
  }
  try {
    const db = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })
    const { data: { user } } = await db.auth.getUser()
    const path = request.nextUrl.pathname
    const externalEndpoint = path.startsWith('/api/portal/') || path === '/api/whatsapp/webhook'
    const publicPage = PUBLIC_PAGES.has(path) || path.startsWith('/o/') || PUBLIC_API.has(path) || path.startsWith('/portal/') || externalEndpoint
    if (!user && !publicPage) {
      if (path.startsWith('/api/')) return finish(NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 }))
      const target = new URL('/login', request.url)
      const next = destinoSeguro(path + request.nextUrl.search)
      if (next) target.searchParams.set('next', next)
      return finish(NextResponse.redirect(target))
    }
    const selectionRoute = path === '/organizacoes' || path === '/api/auth/access' || path === '/api/auth/organization'
    if (user && !publicPage && !selectionRoute) {
      const { data: organization, error } = await db.rpc('current_organization_id')
      if (error) return finish(new NextResponse('Não foi possível validar a organização. Tente novamente.', { status: 503 }))
      if (!organization) {
        if (path.startsWith('/api/')) return finish(NextResponse.json({ error: 'Selecione uma organização.' }, { status: 403 }))
        const target = new URL('/organizacoes', request.url)
        target.searchParams.set('next', destinoSeguro(path + request.nextUrl.search) || '/experimento-360')
        return finish(NextResponse.redirect(target))
      }
    }
    if (user && ['/api/luizia-monitor', '/api/luizia-test', '/api/whatsapp/dispatch', '/api/debug-zapi'].includes(path)) {
      const { data: allowed, error } = await db.rpc('is_platform_admin')
      if (error || !allowed) return finish(NextResponse.json({ error: 'Operação não autorizada.' }, { status: 403 }))
    }
    return finish()
  } catch {
    return finish(new NextResponse('Acesso temporariamente indisponível.', { status: 503 }))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp4|glb|gltf|bin|wasm)$).*)'],
}
