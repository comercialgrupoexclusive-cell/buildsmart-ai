import type { SupabaseClient } from '@supabase/supabase-js'

export type ProjectPhase = 'projeto' | 'em_obra' | 'entregue'

type CycleResult = {
  projeto_id?: string
  obra_id?: string | null
  orcamento_id?: string
  status: ProjectPhase | 'ativo' | 'finalizado'
}

async function runCycleRpc(
  supabase: SupabaseClient,
  fn: 'iniciar_obra' | 'entregar_obra' | 'finalizar_orcamento',
  params: Record<string, string>,
) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) throw new Error(error.message)
  return data as CycleResult
}

export function iniciarObra(supabase: SupabaseClient, projetoId: string) {
  return runCycleRpc(supabase, 'iniciar_obra', { p_projeto_id: projetoId })
}

export function entregarObra(supabase: SupabaseClient, projetoId: string) {
  return runCycleRpc(supabase, 'entregar_obra', { p_projeto_id: projetoId })
}

export function finalizarOrcamento(supabase: SupabaseClient, orcamentoId: string) {
  return runCycleRpc(supabase, 'finalizar_orcamento', { p_orcamento_id: orcamentoId })
}
