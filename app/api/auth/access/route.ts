import { readAccess } from '@/lib/auth/session'
import { authJson } from '@/lib/auth/http'

export async function GET() {
  try {
    const access = await readAccess()
    if (!access) return authJson({ error: 'Sessão expirada.' }, 401)
    return authJson({ profile: access.profile, organization: access.active?.organizations || null, memberships: access.memberships })
  } catch { return authJson({ error: 'Não foi possível validar seu acesso.' }, 503) }
}
