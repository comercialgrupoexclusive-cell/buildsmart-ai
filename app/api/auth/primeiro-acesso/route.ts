import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerAuthClient } from '@/lib/supabase/server'
import { responderSessaoOrganizacao } from '@/lib/auth/organizacao-session'

type ResolverAcesso = {
  status: 'nao_encontrado' | 'sem_acesso' | 'ok'
  email: string | null
  organization_id: string | null
  organization_nome: string | null
}

// P4.7 — "Primeiro acesso": ativa a credencial real de um member já
// pré-cadastrado em organization_members (ativo, ainda sem auth_user_id).
// Nunca cria membro novo nem organização — só destrava quem já existe.
// resolver_acesso_organizacao (anon-safe) confirma a elegibilidade e devolve
// o e-mail técnico determinístico; supabase.auth.signUp (Auth público, anon
// key) cria a credencial; o trigger on_auth_user_created_link_profile
// (migration P4.7) vincula profiles.auth_user_id automaticamente assim que
// o auth.users é criado — nada disso passa pela service_role key.
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
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const supabase = await createServerAuthClient()

  const { data: resolvedRaw, error: resolveError } = await supabase
    .rpc('resolver_acesso_organizacao', { p_slug: slug, p_username: username })
    .maybeSingle()
  const resolved = resolvedRaw as ResolverAcesso | null

  if (resolveError || !resolved || resolved.status === 'nao_encontrado') {
    return NextResponse.json({ error: 'Usuário não encontrado nesta organização.' }, { status: 404 })
  }
  if (resolved.status === 'ok') {
    return NextResponse.json({ error: 'Este acesso já foi configurado. Use "Entrar".' }, { status: 409 })
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: resolved.email!,
    password,
  })
  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 500 })
  }
  if (!signUpData.session || !signUpData.user) {
    return NextResponse.json(
      { error: 'Conta criada, mas a confirmação de e-mail está exigindo uma etapa extra no projeto Supabase. Fale com o suporte.' },
      { status: 500 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', signUpData.user.id)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json({ error: 'Não foi possível vincular o acesso ao perfil.' }, { status: 500 })
  }

  const resposta = await responderSessaoOrganizacao(supabase, profile.id, {
    id: resolved.organization_id!,
    nome: resolved.organization_nome!,
    slug,
  })
  if (!resposta) {
    return NextResponse.json({ error: 'Não foi possível carregar o perfil.' }, { status: 500 })
  }
  return NextResponse.json(resposta)
}
