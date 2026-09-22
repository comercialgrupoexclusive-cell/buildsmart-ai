// Camada pública do Motor de Operação — UI só chama estas Actions, nunca o
// Service ou o Repository diretamente (mesma disciplina de lib/processo).
import type { SupabaseClient } from '@supabase/supabase-js'
import * as service from '../service/operacoes-service'
import type {
  AtualizarEtapaInput,
  AtualizarOperacaoInput,
  CriarEtapaInput,
  CriarOperacaoInput,
  Operacao,
  OperacaoEtapa,
} from '../domain/types'

export async function criarOperacao(supabase: SupabaseClient, input: CriarOperacaoInput) {
  return service.criarOperacao(supabase, input)
}

export async function obterOperacao(supabase: SupabaseClient, id: string): Promise<Operacao | null> {
  return service.obterOperacao(supabase, id)
}

export async function listarOperacoes(supabase: SupabaseClient): Promise<Operacao[]> {
  return service.listarOperacoes(supabase)
}

export async function atualizarOperacao(supabase: SupabaseClient, id: string, patch: AtualizarOperacaoInput): Promise<Operacao> {
  return service.atualizarOperacao(supabase, id, patch)
}

export async function excluirOperacao(supabase: SupabaseClient, id: string): Promise<void> {
  return service.excluirOperacao(supabase, id)
}

export async function criarEtapa(supabase: SupabaseClient, input: CriarEtapaInput): Promise<OperacaoEtapa> {
  return service.criarEtapa(supabase, input)
}

export async function listarEtapasDaOperacao(supabase: SupabaseClient, operacaoId: string): Promise<OperacaoEtapa[]> {
  return service.listarEtapasDaOperacao(supabase, operacaoId)
}

export async function atualizarEtapa(supabase: SupabaseClient, id: string, patch: AtualizarEtapaInput): Promise<OperacaoEtapa> {
  return service.atualizarEtapa(supabase, id, patch)
}

export async function reordenarEtapas(supabase: SupabaseClient, etapaIdsEmOrdem: string[]): Promise<void> {
  return service.reordenarEtapas(supabase, etapaIdsEmOrdem)
}

export async function excluirEtapa(supabase: SupabaseClient, id: string): Promise<void> {
  return service.excluirEtapa(supabase, id)
}
