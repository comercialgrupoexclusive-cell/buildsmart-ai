'use client'

// Fonte única da config da organização atual no client: nome, logo, nome do
// assistente de IA (configurável — nunca "Luiza" hardcoded), cores de marca e
// se o usuário pode editar tudo isso (owner/admin). Carrega uma vez no
// AppLayout e distribui por contexto; `recarregar` atualiza após editar.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { ASSISTENTE_NOME_PADRAO } from './branding'

export type OrganizacaoInfo = {
  id: string | null
  nome: string
  logoUrl: string | null
  assistenteNome: string
  corPrincipal: string | null
  corDestaque: string | null
  podeEditar: boolean
}

type OrganizacaoContexto = OrganizacaoInfo & { recarregar: () => Promise<void> }

const PADRAO: OrganizacaoInfo = {
  id: null,
  nome: '',
  logoUrl: null,
  assistenteNome: ASSISTENTE_NOME_PADRAO,
  corPrincipal: null,
  corDestaque: null,
  podeEditar: false,
}

const Ctx = createContext<OrganizacaoContexto>({
  ...PADRAO,
  recarregar: async () => {},
})

type LinhaOrg = {
  id: string
  nome: string | null
  logo_url: string | null
  assistente_nome: string | null
  cor_principal: string | null
  cor_destaque: string | null
}

const COLUNAS = 'id, nome, logo_url, assistente_nome, cor_principal, cor_destaque'

async function buscarOrganizacao(
  supabase: SupabaseClient,
): Promise<OrganizacaoInfo | null> {
  const { data: oid } = await supabase.rpc('current_organization_id')
  const id = (oid as string | null) ?? null
  if (!id) return null

  const [org, membro] = await Promise.all([
    supabase.from('organizations').select(COLUNAS).eq('id', id).maybeSingle(),
    supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', id)
      .limit(1)
      .maybeSingle(),
  ])
  const linha = org.data as LinhaOrg | null
  if (!linha) return null

  const papel = (membro.data as { role: string } | null)?.role
  const nomeAssistente = linha.assistente_nome?.trim()
  return {
    id: linha.id,
    nome: linha.nome ?? '',
    logoUrl: linha.logo_url,
    assistenteNome: nomeAssistente || ASSISTENTE_NOME_PADRAO,
    corPrincipal: linha.cor_principal,
    corDestaque: linha.cor_destaque,
    podeEditar: papel === 'owner' || papel === 'admin',
  }
}

export function OrganizacaoProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [org, setOrg] = useState<OrganizacaoInfo>(PADRAO)

  const recarregar = useCallback(async () => {
    const atual = await buscarOrganizacao(supabase)
    if (atual) setOrg(atual)
  }, [supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => { void recarregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [recarregar])

  const valor = useMemo(() => ({ ...org, recarregar }), [org, recarregar])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useOrganizacao() {
  return useContext(Ctx)
}

// Atalho para o caso mais comum: o nome do assistente de IA desta organização.
export function useAssistenteNome() {
  return useContext(Ctx).assistenteNome
}
