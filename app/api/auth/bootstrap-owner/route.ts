import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { technicalEmail } from '@/lib/supabase/technical-email'

// P4.6 — ativa a credencial real do Supabase Auth do PRIMEIRO owner de uma
// Organização, sem depender de já existir uma sessão owner/admin (esse é
// exatamente o problema que este endpoint resolve — ver migration
// bootstrap_owner_tokens). Ao contrário do antigo /api/auth/claim (agora
// desativado), NUNCA aceita profileId/email/username livres do cliente: o
// único dado de identidade que entra aqui é o token — gerado, hasheado e
// guardado só pelo servidor/operador, de uso único, com validade curta, e
// que resolve para um organization_members específico que já existe, já é
// 'owner' e ainda não tem auth_user_id.
function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const password = req.nextUrl.searchParams.get('password')
  if (!token || !password) {
    return NextResponse.json({ error: 'token e password são obrigatórios.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })

  const { data: tokenRow } = await db
    .from('bootstrap_owner_tokens')
    .select('id, member_id, expires_at, used_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token inválido, expirado ou já usado.' }, { status: 401 })
  }

  const { data: member } = await db
    .from('organization_members')
    .select('id, profile_id, papel')
    .eq('id', tokenRow.member_id)
    .maybeSingle()
  if (!member || member.papel !== 'owner') {
    return NextResponse.json({ error: 'Vínculo inválido para bootstrap.' }, { status: 409 })
  }

  const { data: profile } = await db
    .from('profiles')
    .select('id, auth_user_id')
    .eq('id', member.profile_id)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
  if (profile.auth_user_id) {
    return NextResponse.json({ error: 'Este acesso já foi configurado.' }, { status: 409 })
  }

  const email = technicalEmail(profile.id)
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message || 'Não foi possível criar o acesso.' }, { status: 500 })
  }

  const { error: linkError } = await db.from('profiles').update({ auth_user_id: created.user.id, email }).eq('id', profile.id)
  if (linkError) {
    await db.auth.admin.deleteUser(created.user.id).catch(() => {})
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  // Uso único: marca o token gasto mesmo que ele ainda não tivesse expirado.
  await db.from('bootstrap_owner_tokens').update({ used_at: new Date().toISOString() }).eq('id', tokenRow.id)

  return NextResponse.json({ ok: true })
}
