// Camada pública do Motor de Processo (contrato P2/P3, seção 6 do plano):
// UI, API e Luiza só chamam estas Actions — nunca o Service ou o Repository
// diretamente. Hoje são um passthrough fino; é aqui que entram
// permissão/Audit quando existirem, sem reabrir o contrato dos módulos que
// já consomem isso.
import type { SupabaseClient } from '@supabase/supabase-js'
import * as service from '../service/processo-service'
import type {
  AtualizarProcessoInput,
  CriarProcessoInput,
  ListarProcessosFiltros,
  Processo,
  ProcessoModuloVinculo,
  ProcessoStatus,
} from '../domain/types'

export async function criarProcesso(supabase: SupabaseClient, input: CriarProcessoInput): Promise<Processo> {
  return service.criarProcesso(supabase, input)
}

export async function obterProcesso(supabase: SupabaseClient, id: string): Promise<Processo | null> {
  return service.obterProcesso(supabase, id)
}

export async function listarProcessos(supabase: SupabaseClient, filtros?: ListarProcessosFiltros): Promise<Processo[]> {
  return service.listarProcessos(supabase, filtros)
}

export async function atualizarDadosProcesso(
  supabase: SupabaseClient,
  id: string,
  patch: AtualizarProcessoInput,
): Promise<Processo> {
  return service.atualizarDadosProcesso(supabase, id, patch)
}

export async function alterarStatusProcesso(supabase: SupabaseClient, id: string, status: ProcessoStatus): Promise<Processo> {
  return service.alterarStatusProcesso(supabase, id, status)
}

export async function habilitarModulo(supabase: SupabaseClient, processoId: string, moduleKey: string): Promise<void> {
  return service.habilitarModulo(supabase, processoId, moduleKey)
}

export async function desabilitarModulo(supabase: SupabaseClient, processoId: string, moduleKey: string): Promise<void> {
  return service.desabilitarModulo(supabase, processoId, moduleKey)
}

export async function listarModulosDoProcesso(supabase: SupabaseClient, processoId: string): Promise<ProcessoModuloVinculo[]> {
  return service.listarModulosDoProcesso(supabase, processoId)
}

export function listarModulosDisponiveis() {
  return service.listarModulosDisponiveis()
}
