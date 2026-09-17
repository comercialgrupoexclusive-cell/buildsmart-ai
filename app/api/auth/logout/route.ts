import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { auditAuth } from '@/lib/auth/session'
import { authJson, requireSameOrigin } from '@/lib/auth/http'

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request)
  if (denied) return denied
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (user) await auditAuth('logout')
  const { error } = await db.auth.signOut({ scope: 'local' })
  if (error && error.status !== 401 && error.status !== 403) return authJson({ error: 'Não foi possível encerrar a sessão. Tente novamente.' }, 503)
  const jar = await cookies()
  for (const name of ['bs_session', 'bs_org']) jar.delete(name)
  return authJson({ ok: true })
}
