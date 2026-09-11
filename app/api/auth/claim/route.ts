import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// P4.5 FOCO 1 — migra um profile do gate por senha em texto plano
// (profiles.password_hash) para uma sessão real do Supabase Auth. É
// chamado uma única vez por perfil, na primeira vez que ele é selecionado
// depois desta rodada; depois disso o perfil já tem auth_user_id e passa a
// entrar por supabase.auth.signInWithPassword direto (ver app/page.tsx).
//
// Usa a service_role key (nunca exposta ao browser) para criar o usuário
// já confirmado (email_confirm: true) — não depende de e-mail de
// confirmação, que este app nunca configurou.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    profileId?: string
    oldPassword?: string
    email?: string
    newPassword?: string
  } | null

  const profileId = body?.profileId
  const email = body?.email?.trim().toLowerCase()
  const newPassword = body?.newPassword

  if (!profileId || !email || !newPassword) {
    return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, password_hash, auth_user_id')
    .eq('id', profileId)
    .maybeSingle()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
  }
  if (profile.auth_user_id) {
    return NextResponse.json({ error: 'Este perfil já foi migrado. Use a senha configurada para entrar.' }, { status: 409 })
  }
  // Mesma comparação que o app já usava para este gate (MVP, texto plano) —
  // reconfirmada aqui no servidor antes de criar a credencial real.
  if (profile.password_hash && profile.password_hash !== body?.oldPassword) {
    return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 })
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password: newPassword,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    const msg = createError?.message || ''
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return NextResponse.json({ error: 'Este e-mail já está em uso por outro acesso.' }, { status: 409 })
    }
    return NextResponse.json({ error: msg || 'Não foi possível criar o acesso.' }, { status: 500 })
  }

  const { error: linkError } = await db
    .from('profiles')
    .update({ auth_user_id: created.user.id, email, password_hash: null })
    .eq('id', profileId)

  if (linkError) {
    // Não deixa um auth.users órfão sem profile vinculado.
    await db.auth.admin.deleteUser(created.user.id).catch(() => {})
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
