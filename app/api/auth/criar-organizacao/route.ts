import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient as createServerAuthClient } from '@/lib/supabase/server'
import { responderSessaoOrganizacao } from '@/lib/auth/organizacao-session'

type CriarOrganizacaoResultado = {
  organization_id: string
  organization_slug: string
  profile_id: string
}

// P4.7 — Fluxo 1 (nova Organização): signUp público (anon key) com um
// e-mail técnico descartável — o uuid nele não corresponde a profile
// nenhum, então o trigger de "Primeiro acesso" não faz nada aqui; quem cria
// o profile/organization/organization_member (owner) de verdade é a RPC
// criar_organizacao_publica (SECURITY DEFINER), chamada já autenticado
// (auth.uid() da sessão que acabou de nascer). Sem service_role em nenhum
// passo.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    orgNome?: string
    userNome?: string
    username?: string
    password?: string
  } | null

  const orgNome = body?.orgNome?.trim()
  const userNome = body?.userNome?.trim()
  const username = body?.username?.trim()
  const password = body?.password

  if (!orgNome || !userNome || !username || !password) {
    return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'A senha precisa ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const supabase = await createServerAuthClient()

  const email = `p-${randomUUID()}@users.buildsmart.internal`
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 500 })
  }
  if (!signUpData.session || !signUpData.user) {
    return NextResponse.json(
      { error: 'Conta criada, mas a confirmação de e-mail está exigindo uma etapa extra no projeto Supabase. Fale com o suporte.' },
      { status: 500 }
    )
  }

  const { data: criadoRaw, error: criarError } = await supabase
    .rpc('criar_organizacao_publica', { p_org_nome: orgNome, p_user_nome: userNome, p_username: username })
    .maybeSingle()
  const criado = criadoRaw as CriarOrganizacaoResultado | null
  if (criarError || !criado) {
    return NextResponse.json({ error: criarError?.message || 'Não foi possível criar a organização.' }, { status: 500 })
  }

  const resposta = await responderSessaoOrganizacao(supabase, criado.profile_id, {
    id: criado.organization_id,
    nome: orgNome,
    slug: criado.organization_slug,
  })
  if (!resposta) {
    return NextResponse.json({ error: 'Não foi possível carregar o perfil.' }, { status: 500 })
  }
  return NextResponse.json(resposta)
}
