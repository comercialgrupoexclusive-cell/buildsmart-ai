'use client'

// Fonte única da config da organização atual no client: nome, logo (foto da org),
// nome do assistente de IA (configurável — nunca "Luiza" hardcoded) e cores de marca.
// Carrega uma vez no AppLayout e distribui por contexto. Antes de carregar, o nome
// do assistente já cai no default genérico "Assistente".

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type OrganizacaoInfo = {
  id: string | null
  nome: string
  logoUrl: string | null
  assistenteNome: string
  corPrincipal: string | null
  corDestaque: string | null
}

const PADRAO: OrganizacaoInfo = {
  id: null, nome: '', logoUrl: null, assistenteNome: 'Assistente', corPrincipal: null, corDestaque: null,
}

const Ctx = createContext<OrganizacaoInfo>(PADRAO)

export function OrganizacaoProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [org, setOrg] = useState<OrganizacaoInfo>(PADRAO)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      const { data: oid } = await supabase.rpc('current_organization_id')
      const id = (oid as string | null) ?? null
      if (!id) return
      const { data } = await supabase
        .from('organizations')
        .select('id, nome, logo_url, assistente_nome, cor_principal, cor_destaque')
        .eq('id', id)
        .maybeSingle()
      if (!ativo || !data) return
      const d = data as {
        id: string; nome: string | null; logo_url: string | null
        assistente_nome: string | null; cor_principal: string | null; cor_destaque: string | null
      }
      setOrg({
        id: d.id,
        nome: d.nome ?? '',
        logoUrl: d.logo_url ?? null,
        assistenteNome: (d.assistente_nome && d.assistente_nome.trim()) || 'Assistente',
        corPrincipal: d.cor_principal ?? null,
        corDestaque: d.cor_destaque ?? null,
      })
    }
    void carregar()
    return () => { ativo = false }
  }, [supabase])

  return <Ctx.Provider value={org}>{children}</Ctx.Provider>
}

export function useOrganizacao() { return useContext(Ctx) }

// Atalho para o caso mais comum: o nome do assistente de IA desta organização.
export function useAssistenteNome() { return useContext(Ctx).assistenteNome }
