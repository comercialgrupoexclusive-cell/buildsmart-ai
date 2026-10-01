import type { SupabaseClient } from '@supabase/supabase-js'

// EAP do Processo — estrutura própria (processo_etapa). Etapa de topo tem
// parent_id nulo; subetapa aponta para a etapa-mãe.
export type EtapaStatus = 'a_fazer' | 'em_andamento' | 'concluido' | 'bloqueado'

export type ProcessoEtapa = {
  id: string
  processo_id: string
  parent_id: string | null
  nome: string
  descricao: string | null
  status: EtapaStatus
  ordem: number
  data_inicio: string | null
  data_fim: string | null
  progresso: number
  responsavel_id: string | null
  created_at: string
  updated_at: string
}

export const STATUS_EAP: { id: EtapaStatus; label: string; cor: string }[] = [
  { id: 'a_fazer', label: 'A fazer', cor: 'var(--text-secondary)' },
  { id: 'em_andamento', label: 'Em andamento', cor: 'var(--accent)' },
  { id: 'concluido', label: 'Concluído', cor: 'var(--success)' },
  { id: 'bloqueado', label: 'Bloqueado', cor: 'var(--danger)' },
]

export async function listarEtapas(supabase: SupabaseClient, processoId: string): Promise<ProcessoEtapa[]> {
  const { data } = await supabase
    .from('processo_etapa')
    .select('*')
    .eq('processo_id', processoId)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as ProcessoEtapa[]
}

export async function criarEtapa(
  supabase: SupabaseClient,
  input: { processo_id: string; nome: string; parent_id?: string | null; status?: EtapaStatus; ordem?: number },
): Promise<ProcessoEtapa | null> {
  const { data } = await supabase.from('processo_etapa').insert({
    processo_id: input.processo_id,
    nome: input.nome,
    parent_id: input.parent_id ?? null,
    status: input.status ?? 'a_fazer',
    ordem: input.ordem ?? 0,
  }).select('*').single()
  return (data as ProcessoEtapa) ?? null
}

export async function atualizarEtapa(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<ProcessoEtapa, 'nome' | 'descricao' | 'status' | 'ordem' | 'data_inicio' | 'data_fim' | 'progresso' | 'parent_id' | 'responsavel_id'>>,
): Promise<void> {
  await supabase.from('processo_etapa').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function excluirEtapa(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from('processo_etapa').delete().eq('id', id)
}

// Persiste a nova ordem (ordem = posição) de um conjunto de irmãos.
export async function reordenarEtapas(supabase: SupabaseClient, idsNaOrdem: string[]): Promise<void> {
  await Promise.all(idsNaOrdem.map((id, i) =>
    supabase.from('processo_etapa').update({ ordem: i, updated_at: new Date().toISOString() }).eq('id', id),
  ))
}
