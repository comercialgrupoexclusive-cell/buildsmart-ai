import { NextRequest } from 'next/server'
import { readAccess } from '@/lib/auth/session'
import { authJson, requireSameOrigin } from '@/lib/auth/http'
import { destinoSeguro } from '@/lib/auth/next-path'

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request)
  if (denied) return denied
  try {
    const body = await request.json().catch(() => null)
    const access = await readAccess()
    if (!access) return authJson({ error: 'Sessão expirada.' }, 401)
    if (!access.memberships.some(m => m.organization_id === body?.organizationId)) return authJson({ error: 'Organização indisponível.' }, 403)
    const { error } = await access.db.rpc('select_organization', { p_organization_id: body.organizationId })
    if (error) return authJson({ error: 'Não foi possível selecionar a organização.' }, 403)
    return authJson({ next: destinoSeguro(typeof body.next === 'string' ? body.next : null) || '/processos' })
  } catch {
    return authJson({ error: 'Não foi possível validar seu acesso.' }, 503)
  }
}
