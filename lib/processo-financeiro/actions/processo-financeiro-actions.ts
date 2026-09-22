// Camada pública do Financeiro Real do Processo — UI e uma futura IA só
// chamam estas Actions, nunca o Service ou o Repository diretamente (mesma
// disciplina de lib/processo e lib/operacoes).
import type { SupabaseClient } from '@supabase/supabase-js'
import * as service from '../service/processo-financeiro-service'
import type {
  AtualizarLancamentoInput,
  CriarLancamentoInput,
  LancamentoFinanceiro,
  ResumoFinanceiroProcesso,
} from '../domain/types'

export async function criarLancamentoFinanceiro(supabase: SupabaseClient, input: CriarLancamentoInput): Promise<LancamentoFinanceiro> {
  return service.criarLancamentoFinanceiro(supabase, input)
}

export async function listarLancamentosFinanceiros(supabase: SupabaseClient, processoId: string): Promise<LancamentoFinanceiro[]> {
  return service.listarLancamentosFinanceiros(supabase, processoId)
}

export async function atualizarLancamentoFinanceiro(
  supabase: SupabaseClient,
  id: string,
  patch: AtualizarLancamentoInput,
): Promise<LancamentoFinanceiro> {
  return service.atualizarLancamentoFinanceiro(supabase, id, patch)
}

export async function excluirLancamentoFinanceiro(supabase: SupabaseClient, id: string): Promise<void> {
  return service.excluirLancamentoFinanceiro(supabase, id)
}

export async function marcarLancamentoRealizado(
  supabase: SupabaseClient,
  id: string,
  dataRealizacao?: string | null,
): Promise<LancamentoFinanceiro> {
  return service.marcarLancamentoRealizado(supabase, id, dataRealizacao)
}

export async function obterResumoFinanceiroDoProcesso(supabase: SupabaseClient, processoId: string): Promise<ResumoFinanceiroProcesso> {
  return service.obterResumoFinanceiroDoProcesso(supabase, processoId)
}
