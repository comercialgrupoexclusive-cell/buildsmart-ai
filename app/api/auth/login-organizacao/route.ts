import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerAuthClient } from '@/lib/supabase/server'
import { SESSION_COOKIE, sessionCookieOptions, signProfileId } from '@/lib/portal-admin-session'

// P4.6 Bloco A — login por Organização: usuário digita usuário+senha (não
// e-mail); o servidor resolve slug+username para o e-mail técnico interno
// (profiles.email, nunca exposto ao cliente) e autentica de verdade via
// Supabase Auth. Substitui, como experiência final do MVP, o seletor global
// de perfis de /api/session — mas continua emitindo o mesmo cookie
// assinado bs_session, porque as RPCs administrativas do Portal/Feed (P4.4)
// ainda dependem dele para saber qual profile_id fez a chamada.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    slug?: string
    username?: string
    password?: string
  } | null

  const slug = body?.slug?.trim().toLowerCase()
  const username = body?.username?.trim()
  const password = body?.password

  if (!slug || !username || !password) {
    return NextResponse.json({ error: 'Preencha organização, usuário e senha.' }, { status: 400 })
  }

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })

  const { data: org, error: orgError } = await db
    .from('organizations')
    .select('id, nome, slug')
    .eq('slug', slug)
    .eq('ativo', true)
    .maybeSingle()

  if (orgError || !org) {
    return NextResponse.json({ error: 'Organização não encontrada.' }, { status: 404 })
  }

  const { data: membro, error: membroError } = await db
    .from('organization_members')
    .select('profile_id, papel, username, ativo, profiles!inner(id, name, apelido, photo_url, theme_color, dark_mode, onboarding_done, tipo, pode_excluir, cidade, estado, created_at, auth_user_id, email)')
    .eq('organization_id', org.id)
    .ilike('username', username)
    .eq('ativo', true)
    .maybeSingle()

  if (membroError || !membro) {
    return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 })
  }

  const profile = Array.isArray(membro.profiles) ? membro.profiles[0] : membro.profiles
  if (!profile?.auth_user_id || !profile?.email) {
    return NextResponse.json({ error: 'Acesso ainda não configurado. Peça ao administrador da organização para concluir seu cadastro.' }, { status: 409 })
  }

  const supabase = await createServerAuthClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password,
  })
  if (signInError) {
    return NextResponse.json({ error: 'Usuário ou senha incorretos.' }, { status: 401 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, signProfileId(profile.id), sessionCookieOptions)

  return NextResponse.json({
    ok: true,
    profile,
    organization: { id: org.id, nome: org.nome, slug: org.slug },
    papel: membro.papel,
  })
}
