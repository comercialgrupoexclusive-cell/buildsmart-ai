// Repository do Motor de Operação — única camada que fala com as tabelas
// `operacoes`/`operacao_etapas`. Sem regra de negócio aqui: quem valida
// nome/exclusão segura é lib/operacoes/service/operacoes-service.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Operacao, OperacaoEtapa } from '../domain/types'

const TABELA_OPERACOES = 'operacoes'
const TABELA_ETAPAS = 'operacao_etapas'

export async function inserirOperacao(
  supabase: SupabaseClient,
  dados: { nome: string; descricao: string | null; organization_id: string },
): Promise<Operacao> {
  const { data, error } = await supabase.from(TABELA_OPERACOES).insert(dados).select('*').single()
  if (error) throw new Error(error.message || 'Não foi possível criar a Operação.')
  return data as Operacao
}

export async function buscarOperacaoPorId(supabase: SupabaseClient, id: string): Promise<Operacao | null> {
  const { data } = await supabase.from(TABELA_OPERACOES).select('*').eq('id', id).maybeSingle()
  return (data as Operacao | null) ?? null
}

export async function listarOperacoesRaw(supabase: SupabaseClient): Promise<Operacao[]> {
  const { data, error } = await supabase.from(TABELA_OPERACOES).select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as Operacao[]) || []
}

export async function atualizarOperacaoRaw(
  supabase: SupabaseClient,
  id: string,
  patch: { nome?: string; descricao?: string | null; updated_at: string },
): Promise<void> {
  const { error } = await supabase.from(TABELA_OPERACOES).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirOperacaoRaw(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from(TABELA_OPERACOES).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function inserirEtapa(
  supabase: SupabaseClient,
  dados: { operacao_id: string; nome: string; ordem: number; cor: string | null },
): Promise<OperacaoEtapa> {
  const { data, error } = await supabase.from(TABELA_ETAPAS).insert(dados).select('*').single()
  if (error) throw new Error(error.message || 'Não foi possível criar a etapa.')
  return data as OperacaoEtapa
}

// Semeadura em lote (template Investidor) — uma única viagem ao banco.
export async function inserirEtapasEmLote(
  supabase: SupabaseClient,
  operacaoId: string,
  nomes: readonly string[],
): Promise<OperacaoEtapa[]> {
  if (nomes.length === 0) return []
  const linhas = nomes.map((nome, i) => ({ operacao_id: operacaoId, nome, ordem: i, cor: null }))
  const { data, error } = await supabase.from(TABELA_ETAPAS).insert(linhas).select('*')
  if (error) throw new Error(error.message || 'Não foi possível criar as etapas.')
  return (data as OperacaoEtapa[]) || []
}

export async function listarEtapasDaOperacaoRaw(supabase: SupabaseClient, operacaoId: string): Promise<OperacaoEtapa[]> {
  const { data, error } = await supabase
    .from(TABELA_ETAPAS)
    .select('*')
    .eq('operacao_id', operacaoId)
    .order('ordem', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as OperacaoEtapa[]) || []
}

export async function buscarEtapaPorId(supabase: SupabaseClient, id: string): Promise<OperacaoEtapa | null> {
  const { data } = await supabase.from(TABELA_ETAPAS).select('*').eq('id', id).maybeSingle()
  return (data as OperacaoEtapa | null) ?? null
}

export async function atualizarEtapaRaw(
  supabase: SupabaseClient,
  id: string,
  patch: { nome?: string; cor?: string | null; ordem?: number; updated_at: string },
): Promise<void> {
  const { error } = await supabase.from(TABELA_ETAPAS).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

// Reordenação em lote — um UPDATE por etapa, todas dentro do mesmo request
// lógico (Promise.all). Pequeno número de linhas por Operação, não justifica
// uma função de banco dedicada.
export async function reordenarEtapasRaw(
  supabase: SupabaseClient,
  ordens: { id: string; ordem: number }[],
): Promise<void> {
  const agora = new Date().toISOString()
  const resultados = await Promise.all(
    ordens.map(({ id, ordem }) => supabase.from(TABELA_ETAPAS).update({ ordem, updated_at: agora }).eq('id', id)),
  )
  const comErro = resultados.find(r => r.error)
  if (comErro?.error) throw new Error(comErro.error.message)
}

export async function excluirEtapaRaw(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from(TABELA_ETAPAS).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function contarProcessosNaEtapa(supabase: SupabaseClient, etapaId: string): Promise<number> {
  const { count, error } = await supabase
    .from('processos')
    .select('id', { count: 'exact', head: true })
    .eq('etapa_operacional_id', etapaId)
  if (error) throw new Error(error.message)
  return count ?? 0
}
