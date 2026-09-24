import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }))

import { proxy } from '@/proxy'

type CookieAdapter = {
  getAll: () => Array<{ name: string; value: string }>
  setAll: (values: Array<{
    name: string
    value: string
    options?: { httpOnly?: boolean; path?: string; sameSite?: 'lax' | 'strict' | 'none' }
  }>) => void
}

function providerClient(options: {
  user?: { id: string; email: string } | null
  refreshCookies?: boolean
  organization?: string | null
  organizationError?: Record<string, unknown> | null
} = {}) {
  return (_url: string, _key: string, config: { cookies: CookieAdapter }) => ({
    auth: {
      getUser: vi.fn(async () => {
        if (options.refreshCookies) {
          config.cookies.setAll([{
            name: 'sb-project-auth-token',
            value: 'fresh-session-token',
            options: { httpOnly: true, path: '/', sameSite: 'lax' },
          }])
        }
        return {
          data: { user: options.user === undefined ? null : options.user },
          error: options.user ? null : {
            name: 'AuthSessionMissingError',
            message: 'Auth session missing',
            status: 400,
            code: 'session_not_found',
          },
        }
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: options.organization || null,
      error: options.organizationError || null,
    }),
  })
}

describe('authentication proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key')
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.SUPABASE_ANON_KEY
    delete process.env.SUPABASE_URL
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects an expired session to login with the full internal path and propagated refresh cookie', async () => {
    createServerClientMock.mockImplementation(providerClient({ refreshCookies: true }))
    const request = new NextRequest('https://buildsmart.test/processos/obra-42?tab=board', {
      headers: { cookie: 'sb-project-auth-token=stale-session-token' },
    })

    const response = await proxy(request)

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') || 'https://invalid.test')
    expect(location.origin).toBe('https://buildsmart.test')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/processos/obra-42?tab=board')
    expect(response.cookies.get('sb-project-auth-token')?.value).toBe('fresh-session-token')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('allows an anonymous visitor to request a password recovery link', async () => {
    // Regression: /api/auth/recovery was missing from PUBLIC_API, so the proxy
    // returned "Sessão expirada." for every recovery request before the route
    // handler ever ran — nobody without an existing session could recover a
    // password, which defeats the whole point of the endpoint.
    createServerClientMock.mockImplementation(providerClient())
    const request = new NextRequest('https://buildsmart.test/api/auth/recovery', { method: 'POST' })

    const response = await proxy(request)

    expect(response.status).not.toBe(401)
  })

  it('does not bypass authentication when the application data mode is local', async () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'local')
    createServerClientMock.mockImplementation(providerClient())

    const response = await proxy(new NextRequest('https://buildsmart.test/processos'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') || 'https://invalid.test')
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/processos')
  })

  it('fails closed when Supabase configuration is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    const response = await proxy(new NextRequest('https://buildsmart.test/processos'))

    expect(response.status).toBe(503)
    await expect(response.text()).resolves.toBe('Acesso temporariamente indisponível.')
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(createServerClientMock).not.toHaveBeenCalled()
  })

  it('fails closed when organization validation returns an error', async () => {
    createServerClientMock.mockImplementation(providerClient({
      user: { id: 'user-1', email: 'ana@example.test' },
      organizationError: {
        message: 'Database unavailable',
        code: '08006',
        details: null,
        hint: null,
      },
    }))

    const response = await proxy(new NextRequest('https://buildsmart.test/processos/obra-42'))

    expect(response.status).toBe(503)
    await expect(response.text()).resolves.toBe('Não foi possível validar a organização. Tente novamente.')
    expect(response.headers.get('location')).toBeNull()
  })

  it('preserves the requested path when an authenticated user must select an organization', async () => {
    createServerClientMock.mockImplementation(providerClient({
      user: { id: 'user-1', email: 'ana@example.test' },
      organization: null,
    }))

    const response = await proxy(new NextRequest('https://buildsmart.test/processos/obra-42?tab=board'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') || 'https://invalid.test')
    expect(location.pathname).toBe('/organizacoes')
    expect(location.searchParams.get('next')).toBe('/processos/obra-42?tab=board')
  })
})
