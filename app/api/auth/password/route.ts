import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { auditAuth } from '@/lib/auth/session'
import { authJson, requireSameOrigin } from '@/lib/auth/http'

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request)
  if (denied) return denied
  const body = await request.json().catch(() => null)
  if (typeof body?.password !== 'string' || body.password.length < 12 || body.password.length > 1024) return authJson({ error: 'Use uma senha com pelo menos 12 caracteres.' }, 400)
  const db = await createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return authJson({ error: 'Link expirado. Solicite outro convite ou link de recuperação.' }, 401)
  const { error } = await db.auth.updateUser({ password: body.password })
  if (error) return authJson({ error: 'Não foi possível alterar a senha. Solicite um novo link.' }, 400)
  await auditAuth('password_changed')
  const { error: logoutError } = await db.auth.signOut({ scope: 'global' })
  if (logoutError) return authJson({ error: 'Senha alterada; não foi possível encerrar as sessões. Tente sair novamente.' }, 503)
  return authJson({ ok: true })
}
