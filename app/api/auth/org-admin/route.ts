import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerAuthClient } from '@/lib/supabase/server'

// P4.6 Bloco A — administração de usuários DENTRO da Organização (OWNER/
// ADMIN): listar, criar, definir username/senha/papel/ativo, conceder
// Processo a CONVIDADO. Usa a service_role key (auth.admin.*) porque criar/
// resetar credencial real do Supabase Auth não é uma operação de RLS — mas
// cada ação abaixo reconfirma no servidor, antes de tocar o banco, que quem
// está chamando é realmente owner/admin da organização-alvo (nunca confia
// em organizationId/memberId isolado vindo do corpo da requisição sem essa
// checagem).

const EMAIL_DOMAIN = 'users.buildsmart.internal'
function technicalEmail(profileId: string) {
  return `p-${profileId}@${EMAIL_DOMAIN}`
}

async function callerProfileId(): Promise<string | null> {
  const supabase = await createServerAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createServiceClient()
  if (!db) return null
  const { data } = await db.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id || null
}

async function requireOrgAdmin(db: NonNullable<ReturnType<typeof createServiceClient>>, organizationId: string) {
  const profileId = await callerProfileId()
  if (!profileId) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const { data: membership } = await db
    .from('organization_members')
    .select('papel, ativo')
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!membership || !membership.ativo || (membership.papel !== 'owner' && membership.papel !== 'admin')) {
    return { error: NextResponse.json({ error: 'Sem permissão para administrar esta organização.' }, { status: 403 }) }
  }
  return { profileId }
}

async function organizationIdOfMember(db: NonNullable<ReturnType<typeof createServiceClient>>, memberId: string) {
  const { data } = await db.from('organization_members').select('organization_id').eq('id', memberId).maybeSingle()
  return data?.organization_id as string | undefined
}

export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get('organizationId')
  if (!organizationId) return NextResponse.json({ error: 'organizationId obrigatório.' }, { status: 400 })

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })

  const auth = await requireOrgAdmin(db, organizationId)
  if (auth.error) return auth.error

  const { data: membros, error } = await db
    .from('organization_members')
    .select('id, papel, username, ativo, created_at, profiles!inner(id, name, apelido, tipo, auth_user_id, email)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: convidados } = await db
    .from('processo_convidados')
    .select('processo_id, profile_id, processos(id, nome)')
    .in('profile_id', (membros || []).map(m => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.id).filter(Boolean))

  return NextResponse.json({ membros, convidados: convidados || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    action?: string
    organizationId?: string
    profileId?: string
    memberId?: string
    processoId?: string
    name?: string
    username?: string
    initialPassword?: string
    newPassword?: string
    papel?: string
    ativo?: boolean
  } | null
  if (!body?.action) return NextResponse.json({ error: 'action obrigatória.' }, { status: 400 })

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })

  switch (body.action) {
    case 'bootstrap': {
      const { organizationId, profileId, username, initialPassword } = body
      if (!organizationId || !profileId || !username || !initialPassword) {
        return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
      }
      const auth = await requireOrgAdmin(db, organizationId)
      if (auth.error) return auth.error

      const { data: profile } = await db.from('profiles').select('id, auth_user_id').eq('id', profileId).maybeSingle()
      if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
      if (profile.auth_user_id) return NextResponse.json({ error: 'Este perfil já tem acesso configurado.' }, { status: 409 })

      const email = technicalEmail(profileId)
      const { data: created, error: createError } = await db.auth.admin.createUser({
        email, password: initialPassword, email_confirm: true,
      })
      if (createError || !created?.user) {
        return NextResponse.json({ error: createError?.message || 'Não foi possível criar o acesso.' }, { status: 500 })
      }

      const { error: linkError } = await db.from('profiles').update({ auth_user_id: created.user.id, email }).eq('id', profileId)
      if (linkError) {
        await db.auth.admin.deleteUser(created.user.id).catch(() => {})
        return NextResponse.json({ error: linkError.message }, { status: 500 })
      }
      const { error: usernameError } = await db
        .from('organization_members')
        .update({ username })
        .eq('organization_id', organizationId)
        .eq('profile_id', profileId)
      if (usernameError) return NextResponse.json({ error: usernameError.message }, { status: 500 })

      return NextResponse.json({ ok: true })
    }

    case 'create_member': {
      const { organizationId, name, username, initialPassword, papel } = body
      if (!organizationId || !name || !username || !initialPassword || !papel) {
        return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
      }
      if (!['owner', 'admin', 'membro', 'convidado'].includes(papel)) {
        return NextResponse.json({ error: 'Papel inválido.' }, { status: 400 })
      }
      const auth = await requireOrgAdmin(db, organizationId)
      if (auth.error) return auth.error

      const { data: newProfile, error: profileError } = await db
        .from('profiles')
        .insert({ name, tipo: 'usuario', pode_excluir: true, dark_mode: true, onboarding_done: false })
        .select('id')
        .single()
      if (profileError || !newProfile) {
        return NextResponse.json({ error: profileError?.message || 'Não foi possível criar o perfil.' }, { status: 500 })
      }

      const email = technicalEmail(newProfile.id)
      const { data: created, error: createError } = await db.auth.admin.createUser({
        email, password: initialPassword, email_confirm: true,
      })
      if (createError || !created?.user) {
        await db.from('profiles').delete().eq('id', newProfile.id)
        return NextResponse.json({ error: createError?.message || 'Não foi possível criar o acesso.' }, { status: 500 })
      }
      await db.from('profiles').update({ auth_user_id: created.user.id, email }).eq('id', newProfile.id)

      const { error: memberError } = await db.from('organization_members').insert({
        organization_id: organizationId, profile_id: newProfile.id, papel, username, ativo: true,
      })
      if (memberError) {
        await db.auth.admin.deleteUser(created.user.id).catch(() => {})
        await db.from('profiles').delete().eq('id', newProfile.id)
        return NextResponse.json({ error: memberError.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, profileId: newProfile.id })
    }

    case 'set_papel':
    case 'set_ativo':
    case 'set_username': {
      const { memberId, papel, ativo, username } = body
      if (!memberId) return NextResponse.json({ error: 'memberId obrigatório.' }, { status: 400 })
      const organizationId = await organizationIdOfMember(db, memberId)
      if (!organizationId) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
      const auth = await requireOrgAdmin(db, organizationId)
      if (auth.error) return auth.error

      if (body.action === 'set_papel') {
        if (!papel || !['owner', 'admin', 'membro', 'convidado'].includes(papel)) {
          return NextResponse.json({ error: 'Papel inválido.' }, { status: 400 })
        }
        const { error } = await db.from('organization_members').update({ papel }).eq('id', memberId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else if (body.action === 'set_ativo') {
        const { error } = await db.from('organization_members').update({ ativo: !!ativo }).eq('id', memberId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        if (!username) return NextResponse.json({ error: 'username obrigatório.' }, { status: 400 })
        const { error } = await db.from('organization_members').update({ username }).eq('id', memberId)
        if (error) return NextResponse.json({ error: error.message.includes('duplicate') ? 'Já existe esse usuário nesta organização.' : error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    case 'reset_password': {
      const { memberId, newPassword } = body
      if (!memberId || !newPassword) return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
      const organizationId = await organizationIdOfMember(db, memberId)
      if (!organizationId) return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 })
      const auth = await requireOrgAdmin(db, organizationId)
      if (auth.error) return auth.error

      const { data: member } = await db.from('organization_members').select('profile_id').eq('id', memberId).maybeSingle()
      const { data: profile } = await db.from('profiles').select('auth_user_id').eq('id', member?.profile_id).maybeSingle()
      if (!profile?.auth_user_id) return NextResponse.json({ error: 'Este usuário ainda não tem acesso configurado — use bootstrap.' }, { status: 409 })

      const { error } = await db.auth.admin.updateUserById(profile.auth_user_id, { password: newPassword })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'grant_processo':
    case 'revoke_processo': {
      const { processoId, profileId } = body
      if (!processoId || !profileId) return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 })
      const { data: processo } = await db.from('processos').select('organization_id').eq('id', processoId).maybeSingle()
      if (!processo?.organization_id) return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })
      const auth = await requireOrgAdmin(db, processo.organization_id)
      if (auth.error) return auth.error

      if (body.action === 'grant_processo') {
        const { error } = await db.from('processo_convidados').upsert({ processo_id: processoId, profile_id: profileId }, { onConflict: 'processo_id,profile_id' })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else {
        const { error } = await db.from('processo_convidados').delete().eq('processo_id', processoId).eq('profile_id', profileId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 })
  }
}
