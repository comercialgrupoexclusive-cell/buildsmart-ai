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
  ProcessoGrupo,
  ProcessoModuloVinculo,
  ProcessoStatus,
  ProcessoUso,
} from '../domain/types'
import type { ProcessoTemplate, SalvarTemplateInput } from '../domain/template'

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

export async function listarGrupos(supabase: SupabaseClient): Promise<ProcessoGrupo[]> {
  return service.listarGrupos(supabase)
}

export async function criarGrupo(supabase: SupabaseClient, nome: string, organizationId: string | null): Promise<ProcessoGrupo> {
  return service.criarGrupo(supabase, nome, organizationId)
}

export async function agruparProcessos(supabase: SupabaseClient, processoIds: string[], grupoId: string | null): Promise<void> {
  return service.agruparProcessos(supabase, processoIds, grupoId)
}

export async function duplicarProcesso(supabase: SupabaseClient, id: string): Promise<Processo> {
  return service.duplicarProcesso(supabase, id)
}

export async function excluirProcesso(supabase: SupabaseClient, id: string): Promise<void> {
  return service.excluirProcesso(supabase, id)
}

export async function registrarUso(supabase: SupabaseClient, processoId: string, profileId: string, moduleKey: string): Promise<void> {
  return service.registrarUso(supabase, processoId, profileId, moduleKey)
}

export async function listarUso(supabase: SupabaseClient): Promise<ProcessoUso[]> {
  return service.listarUso(supabase)
}

export async function listarModulosDeVarios(supabase: SupabaseClient, processoIds: string[]): Promise<ProcessoModuloVinculo[]> {
  return service.listarModulosDeVarios(supabase, processoIds)
}

export async function listarTemplates(supabase: SupabaseClient): Promise<ProcessoTemplate[]> {
  return service.listarTemplates(supabase)
}

export async function criarTemplate(supabase: SupabaseClient, input: SalvarTemplateInput, organizationId: string | null): Promise<ProcessoTemplate> {
  return service.criarTemplate(supabase, input, organizationId)
}

export async function atualizarTemplate(supabase: SupabaseClient, id: string, patch: Partial<SalvarTemplateInput>): Promise<ProcessoTemplate> {
  return service.atualizarTemplate(supabase, id, patch)
}

export async function excluirTemplate(supabase: SupabaseClient, id: string): Promise<void> {
  return service.excluirTemplate(supabase, id)
}
