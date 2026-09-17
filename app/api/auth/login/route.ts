import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authJson, requireSameOrigin } from '@/lib/auth/http'
import { auditAuth, readAccess } from '@/lib/auth/session'
import { loginDestination } from '@/lib/auth/access'

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (typeof body?.email !== 'string' || typeof body?.password !== 'string' || body.email.length > 254 || body.password.length > 1024) return authJson({ error: 'Informe e-mail e senha.' }, 400)
  const db = await createClient()
  const { error } = await db.auth.signInWithPassword({ email: body.email.trim().toLowerCase(), password: body.password })
  if (error) {
    // No password, e-mail, token or full provider response in application logs.
    console.info('[auth]', { event: 'login_failed', code: error.code || 'invalid_credentials' })
    return authJson({ error: 'E-mail ou senha inválidos.' }, error.status === 429 ? 429 : 401)
  }
  try {
    const access = await readAccess()
    if (!access) throw new Error('Sessão inválida.')
    if (access.memberships.length === 1) {
      const { error: selectionError } = await db.rpc('select_organization', { p_organization_id: access.memberships[0].organization_id })
      if (selectionError) throw selectionError
    }
    await auditAuth('login')
    return authJson({ next: loginDestination(typeof body.next === 'string' ? body.next : null, access.memberships.length) })
  } catch {
    await db.auth.signOut({ scope: 'local' })
    return authJson({ error: 'Não foi possível validar seu acesso. Tente novamente.' }, 503)
  }
}
