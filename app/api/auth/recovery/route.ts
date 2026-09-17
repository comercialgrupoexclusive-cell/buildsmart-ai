import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authJson, requireSameOrigin } from '@/lib/auth/http'

export async function POST(request: NextRequest) {
  const denied = requireSameOrigin(request)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  if (typeof body?.email !== 'string' || body.email.length > 254) {
    return authJson({ error: 'Informe um e-mail válido.' }, 400)
  }

  const origin = request.headers.get('origin')
  if (!origin) return authJson({ error: 'Origem da requisição inválida.' }, 403)

  const db = await createClient()
  const { error } = await db.auth.resetPasswordForEmail(body.email.trim().toLowerCase(), {
    redirectTo: new URL('/auth/confirm', origin).toString(),
  })

  if (error?.status === 429) {
    return authJson({ error: 'Aguarde alguns minutos antes de solicitar outro link.' }, 429)
  }

  // A generic response prevents account enumeration. Provider errors are not
  // exposed because the requester must not learn whether the e-mail exists.
  return authJson({ ok: true })
}
