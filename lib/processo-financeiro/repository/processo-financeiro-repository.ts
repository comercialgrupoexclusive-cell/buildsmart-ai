// Repository do Financeiro Real do Processo — única camada que fala com
// `processo_lancamentos_financeiros`. Sem regra de negócio aqui (isso é do
// Service): nome/valor/categoria são validados antes de chegar até aqui.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AtualizarLancamentoInput, LancamentoFinanceiro } from '../domain/types'

const TABELA = 'processo_lancamentos_financeiros'

export async function inserirLancamento(
  supabase: SupabaseClient,
  dados: Omit<LancamentoFinanceiro, 'id' | 'created_at' | 'updated_at'>,
): Promise<LancamentoFinanceiro> {
  const { data, error } = await supabase.from(TABELA).insert(dados).select('*').single()
  if (error) throw new Error(error.message || 'Não foi possível criar o lançamento.')
  return data as LancamentoFinanceiro
}

export async function buscarLancamentoPorId(supabase: SupabaseClient, id: string): Promise<LancamentoFinanceiro | null> {
  const { data } = await supabase.from(TABELA).select('*').eq('id', id).maybeSingle()
  return (data as LancamentoFinanceiro | null) ?? null
}

export async function listarLancamentosPorProcessoRaw(supabase: SupabaseClient, processoId: string): Promise<LancamentoFinanceiro[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .eq('processo_id', processoId)
    .order('data_lancamento', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as LancamentoFinanceiro[]) || []
}

export async function atualizarLancamentoRaw(
  supabase: SupabaseClient,
  id: string,
  patch: AtualizarLancamentoInput & { updated_at: string },
): Promise<void> {
  const { error } = await supabase.from(TABELA).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function excluirLancamentoRaw(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from(TABELA).delete().eq('id', id)
  if (error) throw new Error(error.message)
}
