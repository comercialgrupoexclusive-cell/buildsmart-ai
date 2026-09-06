// Service do Motor de Processo (P3.1) — regra de negócio do Core: validação
// de nome/status/módulo, normalização de texto, bookkeeping de
// timestamps/archived_at. Repository (../repository) só executa queries;
// este arquivo decide o que é válido.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  atualizarProcessoRaw,
  atualizarStatusRaw,
  buscarProcessoPorId,
  inserirModulos,
  inserirProcesso,
  listarModulosRaw,
  listarProcessosRaw,
  upsertModuloVinculo,
} from '../repository/processo-repository'
import {
  PROCESSO_STATUSES,
  type AtualizarProcessoInput,
  type CriarProcessoInput,
  type ListarProcessosFiltros,
  type Processo,
  type ProcessoModuloVinculo,
  type ProcessoStatus,
} from '../domain/types'
import { PROCESSO_MODULES, isValidProcessoModuleKey, modulosHabilitadosPorPadrao } from '../domain/module-registry'

function normalizarTexto(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t || null
}

export async function criarProcesso(supabase: SupabaseClient, input: CriarProcessoInput): Promise<Processo> {
  const nome = (input.nome ?? '').trim()
  if (!nome) throw new Error('Nome do processo é obrigatório.')

  const moduleKeys = input.modulos && input.modulos.length > 0 ? input.modulos : modulosHabilitadosPorPadrao()
  const invalidos = moduleKeys.filter(k => !isValidProcessoModuleKey(k))
  if (invalidos.length > 0) throw new Error(`Módulo(s) desconhecido(s): ${invalidos.join(', ')}`)

  const processo = await inserirProcesso(supabase, {
    nome,
    tipo: normalizarTexto(input.tipo),
    cliente_nome: normalizarTexto(input.cliente_nome),
    endereco: normalizarTexto(input.endereco),
    responsavel_id: input.responsavel_id || null,
    organization_id: input.organization_id || null,
    status: 'ACTIVE',
    archived_at: null,
  })

  await inserirModulos(supabase, processo.id, moduleKeys)
  return processo
}

export async function obterProcesso(supabase: SupabaseClient, id: string): Promise<Processo | null> {
  return buscarProcessoPorId(supabase, id)
}

export async function listarProcessos(supabase: SupabaseClient, filtros: ListarProcessosFiltros = {}): Promise<Processo[]> {
  return listarProcessosRaw(supabase, filtros)
}

export async function atualizarDadosProcesso(
  supabase: SupabaseClient,
  id: string,
  patch: AtualizarProcessoInput,
): Promise<Processo> {
  const existente = await buscarProcessoPorId(supabase, id)
  if (!existente) throw new Error('Processo não encontrado.')

  const dadosPatch: Partial<Processo> = {}
  if (patch.nome !== undefined) {
    const nome = patch.nome.trim()
    if (!nome) throw new Error('Nome do processo é obrigatório.')
    dadosPatch.nome = nome
  }
  if (patch.tipo !== undefined) dadosPatch.tipo = normalizarTexto(patch.tipo)
  if (patch.cliente_nome !== undefined) dadosPatch.cliente_nome = normalizarTexto(patch.cliente_nome)
  if (patch.endereco !== undefined) dadosPatch.endereco = normalizarTexto(patch.endereco)
  if (patch.responsavel_id !== undefined) dadosPatch.responsavel_id = patch.responsavel_id || null

  await atualizarProcessoRaw(supabase, id, { ...dadosPatch, updated_at: new Date().toISOString() })

  const atualizado = await buscarProcessoPorId(supabase, id)
  if (!atualizado) throw new Error('Processo não encontrado após atualização.')
  return atualizado
}

export async function alterarStatusProcesso(supabase: SupabaseClient, id: string, status: ProcessoStatus): Promise<Processo> {
  if (!PROCESSO_STATUSES.includes(status)) throw new Error(`Status inválido: ${status}`)
  const existente = await buscarProcessoPorId(supabase, id)
  if (!existente) throw new Error('Processo não encontrado.')

  // archived_at é bookkeeping direto do status (única regra de transição
  // exigida pelo plano P3 nesta rodada — seção 3.2: "archived_at nullable").
  const archivedAt = status === 'ARCHIVED' ? new Date().toISOString() : null
  await atualizarStatusRaw(supabase, id, status, archivedAt, new Date().toISOString())

  const atualizado = await buscarProcessoPorId(supabase, id)
  if (!atualizado) throw new Error('Processo não encontrado após atualização.')
  return atualizado
}

async function alterarModulo(supabase: SupabaseClient, processoId: string, moduleKey: string, enabled: boolean): Promise<void> {
  if (!isValidProcessoModuleKey(moduleKey)) throw new Error(`Módulo desconhecido: ${moduleKey}`)
  const processo = await buscarProcessoPorId(supabase, processoId)
  if (!processo) throw new Error('Processo não encontrado.')
  await upsertModuloVinculo(supabase, processoId, moduleKey, enabled)
}

export async function habilitarModulo(supabase: SupabaseClient, processoId: string, moduleKey: string): Promise<void> {
  await alterarModulo(supabase, processoId, moduleKey, true)
}

export async function desabilitarModulo(supabase: SupabaseClient, processoId: string, moduleKey: string): Promise<void> {
  await alterarModulo(supabase, processoId, moduleKey, false)
}

export async function listarModulosDoProcesso(supabase: SupabaseClient, processoId: string): Promise<ProcessoModuloVinculo[]> {
  return listarModulosRaw(supabase, processoId)
}

export function listarModulosDisponiveis() {
  return PROCESSO_MODULES
}
