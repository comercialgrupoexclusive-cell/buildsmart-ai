import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createClientMock, cookiesMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  cookiesMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

import { GET as getAccess } from '@/app/api/auth/access/route'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { POST as selectOrganization } from '@/app/api/auth/organization/route'
import { POST as changePassword } from '@/app/api/auth/password/route'

type Membership = {
  organization_id: string
  role: 'owner' | 'admin' | 'member'
  organizations: { id: string; nome: string; slug: string; ativo: boolean }
}

type DbOptions = {
  user?: { id: string; email: string } | null
  getUserError?: Record<string, unknown> | null
  memberships?: Membership[]
  activeOrganization?: string | null
  signInError?: Record<string, unknown> | null
  signOutError?: Record<string, unknown> | null
  updateUserError?: Record<string, unknown> | null
  selectOrganizationError?: Record<string, unknown> | null
}

function membership(id: string, role: Membership['role'] = 'member'): Membership {
  return {
    organization_id: id,
    role,
    organizations: { id, nome: `Organização ${id}`, slug: `org-${id}`, ativo: true },
  }
}

function thenableQuery<T>(result: T) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.maybeSingle = vi.fn().mockResolvedValue(result)
  query.then = (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return query
}

function createDb(options: DbOptions = {}) {
  const user = options.user === undefined
    ? { id: 'user-1', email: 'ana@example.test' }
    : options.user
  const memberships = options.memberships || []
  const profile = {
    id: 'profile-1',
    name: 'Ana',
    apelido: null,
    photo_url: null,
    theme_color: null,
    dark_mode: false,
    onboarding_done: true,
    tipo: 'usuario',
    pode_excluir: false,
    cidade: null,
    estado: null,
    created_at: '2026-09-17T12:00:00.000Z',
    auth_user_id: user?.id || 'user-1',
    email: user?.email || null,
  }
  const profileResult = { data: user ? profile : null, error: null }
  const membershipResult = { data: memberships, error: null }

  const signInWithPassword = vi.fn().mockResolvedValue(
    options.signInError
      ? { data: { user: null, session: null }, error: options.signInError }
      : { data: { user, session: { access_token: 'provider-token' } }, error: null },
  )
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
    error: options.getUserError || null,
  })
  const signOut = vi.fn().mockResolvedValue({ error: options.signOutError || null })
  const updateUser = vi.fn().mockResolvedValue({
    data: { user },
    error: options.updateUserError || null,
  })
  const rpc = vi.fn(async (name: string) => {
    if (name === 'current_organization_id') {
      return { data: options.activeOrganization || null, error: null }
    }
    if (name === 'select_organization') {
      return { data: null, error: options.selectOrganizationError || null }
    }
    if (name === 'log_auth_event') return { data: null, error: null }
    throw new Error(`RPC inesperada: ${name}`)
  })
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return thenableQuery(profileResult)
    if (table === 'organization_members') return thenableQuery(membershipResult)
    throw new Error(`Tabela inesperada: ${table}`)
  })

  return {
    auth: { signInWithPassword, getUser, signOut, updateUser },
    from,
    rpc,
  }
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://buildsmart.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://buildsmart.test',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('auth route handlers', () => {
  const cookieDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    cookiesMock.mockResolvedValue({ delete: cookieDelete })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('authenticates with the normalized e-mail and returns the requested internal destination', async () => {
    const db = createDb({ memberships: [membership('org-a')] })
    createClientMock.mockResolvedValue(db)

    const response = await login(jsonRequest('/api/auth/login', {
      email: '  ANA@Example.Test ',
      password: 'correct horse battery staple',
      next: '/processos/obra-42?tab=board',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ next: '/processos/obra-42?tab=board' })
    expect(db.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'correct horse battery staple',
    })
    expect(db.rpc).toHaveBeenCalledWith('select_organization', { p_organization_id: 'org-a' })
  })

  it('returns one generic credential error without writing identifiers or secrets to logs', async () => {
    const db = createDb({
      signInError: {
        name: 'AuthApiError',
        message: 'Invalid login credentials for ana@example.test / segredo-absoluto',
        status: 400,
        code: 'invalid_credentials',
      },
    })
    createClientMock.mockResolvedValue(db)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const response = await login(jsonRequest('/api/auth/login', {
      email: 'ana@example.test',
      password: 'segredo-absoluto',
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'E-mail ou senha inválidos.' })
    const logOutput = JSON.stringify(info.mock.calls)
    expect(logOutput).not.toContain('ana@example.test')
    expect(logOutput).not.toContain('segredo-absoluto')
    expect(logOutput).not.toContain('Invalid login credentials')
  })

  it('rejects a cross-site login before credentials reach the provider', async () => {
    const db = createDb()
    createClientMock.mockResolvedValue(db)

    const response = await login(jsonRequest('/api/auth/login', {
      email: 'ana@example.test',
      password: 'segredo-absoluto',
    }, {
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Origem da requisição inválida.' })
    expect(db.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('replaces an external post-login target with the application home', async () => {
    const db = createDb({ memberships: [membership('org-a')] })
    createClientMock.mockResolvedValue(db)

    const response = await login(jsonRequest('/api/auth/login', {
      email: 'ana@example.test',
      password: 'correct horse battery staple',
      next: 'https://evil.example/steal-session',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ next: '/experimento-360' })
  })

  it.each([
    { count: 0, want: '/organizacoes?next=%2Fprocessos%2Fobra-42' },
    { count: 1, want: '/processos/obra-42' },
    { count: 3, want: '/organizacoes?next=%2Fprocessos%2Fobra-42' },
  ])('routes a successful login with $count memberships to $want', async ({ count, want }) => {
    const db = createDb({
      memberships: Array.from({ length: count }, (_, index) => membership(`org-${index + 1}`)),
    })
    createClientMock.mockResolvedValue(db)

    const response = await login(jsonRequest('/api/auth/login', {
      email: 'ana@example.test',
      password: 'correct horse battery staple',
      next: '/processos/obra-42',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ next: want })
  })

  it('does not let a signed-in user select an organization outside their memberships', async () => {
    const db = createDb({ memberships: [membership('org-allowed')] })
    createClientMock.mockResolvedValue(db)

    const response = await selectOrganization(jsonRequest('/api/auth/organization', {
      organizationId: 'org-forbidden',
      next: '/experimento-360',
    }))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Organização indisponível.' })
    expect(db.rpc.mock.calls.some(([name]) => name === 'select_organization')).toBe(false)
  })

  it('sanitizes the destination after an authorized organization selection', async () => {
    const db = createDb({ memberships: [membership('org-allowed')] })
    createClientMock.mockResolvedValue(db)

    const response = await selectOrganization(jsonRequest('/api/auth/organization', {
      organizationId: 'org-allowed',
      next: '//evil.example/steal-session',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ next: '/experimento-360' })
    expect(db.rpc).toHaveBeenCalledWith('select_organization', { p_organization_id: 'org-allowed' })
  })

  it('reports a provider logout failure instead of claiming success', async () => {
    const db = createDb({
      signOutError: {
        name: 'AuthApiError',
        message: 'Database unavailable',
        status: 500,
        code: 'unexpected_failure',
      },
    })
    createClientMock.mockResolvedValue(db)

    const response = await logout(jsonRequest('/api/auth/logout', {}))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Não foi possível encerrar a sessão. Tente novamente.' })
    expect(cookieDelete).not.toHaveBeenCalled()
  })

  it('clears application session cookies after a successful local logout', async () => {
    const db = createDb()
    createClientMock.mockResolvedValue(db)

    const response = await logout(jsonRequest('/api/auth/logout', {}))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(db.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(cookieDelete.mock.calls.map(([name]) => name)).toEqual(['bs_session', 'bs_org'])
  })

  it('does not report password-change success when global session revocation fails', async () => {
    const db = createDb({
      signOutError: {
        name: 'AuthApiError',
        message: 'Unable to revoke sessions',
        status: 500,
        code: 'unexpected_failure',
      },
    })
    createClientMock.mockResolvedValue(db)

    const response = await changePassword(jsonRequest('/api/auth/password', {
      password: 'uma-senha-nova-e-forte',
    }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Senha alterada; não foi possível encerrar as sessões. Tente sair novamente.',
    })
    expect(db.auth.updateUser).toHaveBeenCalledWith({ password: 'uma-senha-nova-e-forte' })
    expect(db.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('does not allow an expired recovery session to change a password', async () => {
    const db = createDb({ user: null })
    createClientMock.mockResolvedValue(db)

    const response = await changePassword(jsonRequest('/api/auth/password', {
      password: 'uma-senha-nova-e-forte',
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Link expirado. Solicite outro convite ou link de recuperação.',
    })
    expect(db.auth.updateUser).not.toHaveBeenCalled()
  })

  it('returns the access snapshot produced from the authenticated provider session', async () => {
    const memberships = [membership('org-a', 'owner'), membership('org-b', 'member')]
    const db = createDb({ memberships, activeOrganization: 'org-b' })
    createClientMock.mockResolvedValue(db)

    const response = await getAccess()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      profile: expect.objectContaining({ auth_user_id: 'user-1', email: 'ana@example.test' }),
      organization: memberships[1].organizations,
      memberships,
    })
  })

  it('fails closed when the access endpoint has no authenticated provider user', async () => {
    const db = createDb({ user: null })
    createClientMock.mockResolvedValue(db)

    const response = await getAccess()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Sessão expirada.' })
  })
})
