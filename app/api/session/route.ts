import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { SESSION_COOKIE, sessionCookieOptions, signProfileId } from '@/lib/portal-admin-session'

// Emite a sessao assinada usada pelas RPCs administrativas do Portal/Feed.
// Chamado pelo seletor de perfil (app/page.tsx) logo apos escolher um perfil
// (com ou sem senha) — mantem a UX atual identica, so passa a existir um
// cookie httpOnly comprovando qual profile_id foi realmente selecionado.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { profileId?: string; password?: string } | null
  const profileId = body?.profileId
  if (!profileId) {
    return NextResponse.json({ error: 'profileId obrigatorio' }, { status: 400 })
  }

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor nao configurado.' }, { status: 500 })

  const { data: profile, error } = await db
    .from('profiles')
    .select('id, password_hash')
    .eq('id', profileId)
    .maybeSingle()

  if (error || !profile) {
    return NextResponse.json({ error: 'Perfil nao encontrado.' }, { status: 404 })
  }

  // Mesma comparacao ja usada no seletor de perfil (MVP, sem hash real) —
  // preservada aqui apenas para confirmar a senha no servidor antes de
  // emitir a sessao assinada.
  if (profile.password_hash && profile.password_hash !== body?.password) {
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, signProfileId(profile.id), sessionCookieOptions)
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  return NextResponse.json({ ok: true })
}
