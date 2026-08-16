import type { SupabaseClient } from '@supabase/supabase-js'

export const ETAPAS_PADRAO_CHANGED_EVENT = 'buildsmart:etapas-padrao-changed'

export const ETAPAS_PADRAO_SINAPI = [
  'Serviços Preliminares e Gerais',
  'Infraestrutura',
  'Supraestrutura',
  'Paredes e Painéis',
  'Esquadrias',
  'Vidros e Plásticos',
  'Coberturas',
  'Impermeabilizações',
  'Revestimentos Internos',
  'Forros',
  'Revestimentos Externos',
  'Pinturas',
  'Pisos',
  'Acabamentos',
  'Instalações Elétricas e Telefônicas',
  'Instalações Hidráulicas',
  'Instalações: Esgoto e Águas Pluviais',
  'Louças e Metais',
  'Complementos',
  'Outros',
]

export type EtapaPadrao = { id: string; nome: string; ordem: number }

export async function fetchEtapasPadrao(supabase: SupabaseClient): Promise<EtapaPadrao[]> {
  const { data, error } = await supabase
    .from('etapas_padrao')
    .select('id,nome,ordem')
    .order('ordem', { ascending: true })
  if (error || !data) return []
  return data as EtapaPadrao[]
}

export async function criarEtapaPadrao(supabase: SupabaseClient, nome: string, ordem: number) {
  const { data, error } = await supabase
    .from('etapas_padrao')
    .insert({ nome, ordem })
    .select('id,nome,ordem')
    .single()
  if (error) throw error
  return data as EtapaPadrao
}

export async function atualizarEtapaPadrao(supabase: SupabaseClient, id: string, nome: string) {
  const { error } = await supabase.from('etapas_padrao').update({ nome }).eq('id', id)
  if (error) throw error
}

export async function removerEtapaPadrao(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('etapas_padrao').delete().eq('id', id)
  if (error) throw error
}

export async function restaurarEtapasPadrao(supabase: SupabaseClient): Promise<EtapaPadrao[]> {
  const { data: existentes } = await supabase.from('etapas_padrao').select('id')
  const ids = (existentes || []).map((e: { id: string }) => e.id)
  if (ids.length > 0) {
    await supabase.from('etapas_padrao').delete().in('id', ids)
  }
  const rows = ETAPAS_PADRAO_SINAPI.map((nome, i) => ({ nome, ordem: i + 1 }))
  const { data, error } = await supabase.from('etapas_padrao').insert(rows).select('id,nome,ordem').order('ordem', { ascending: true })
  if (error) throw error
  return (data || []) as EtapaPadrao[]
}

export function notifyEtapasPadraoChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ETAPAS_PADRAO_CHANGED_EVENT))
}
