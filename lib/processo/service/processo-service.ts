// Service do Motor de Processo (P3.1) — regra de negócio do Core: validação
// de nome/status/módulo, normalização de texto, bookkeeping de
// timestamps/archived_at. Repository (../repository) só executa queries;
// este arquivo decide o que é válido.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  atualizarEtapaDoProcessoRaw,
  atualizarOperacaoDoProcessoRaw,
  atualizarProcessoRaw,
  atualizarStatusRaw,
  buscarProcessoPorId,
  inserirModulos,
  inserirProcesso,
  listarModulosRaw,
  listarProcessosPorOperacaoRaw,
  listarProcessosRaw,
  reordenarOrdemEtapaRaw,
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
import {
  PROCESSO_TEMPLATES,
  getProcessoTemplate,
  isValidProcessoTemplateKey,
  type ProcessoTemplateDefinition,
} from '../domain/template-registry'

function normalizarTexto(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t || null
}

async function resolverOrganizacaoUnica(supabase: SupabaseClient, organizationId?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('current_organization_id')
  if (error || !data || (organizationId && organizationId !== data)) {
    throw new Error('Selecione a organização antes de criar o processo.')
  }
  return data as string
}

// Resolve e valida o template ANTES de qualquer escrita (exigência da Seção A:
// validação no domínio/Service). Devolve null quando não há template.
function resolverTemplate(input: CriarProcessoInput): ProcessoTemplateDefinition | null {
  const key = input.template_key
  if (key === undefined || key === null) return null

  if (!isValidProcessoTemplateKey(key)) throw new Error(`Template desconhecido: ${key}`)

  const versao = input.template_version ?? undefined
  const definicao = getProcessoTemplate(key, versao)
  if (!definicao) throw new Error(`Versão de template inexistente: ${key} v${versao}`)
  return definicao
}

export async function criarProcesso(supabase: SupabaseClient, input: CriarProcessoInput): Promise<Processo> {
  const nome = (input.nome ?? '').trim()
  if (!nome) throw new Error('Nome do processo é obrigatório.')

  const template = resolverTemplate(input)

  // Precedência travada (ver domain/types.ts CriarProcessoInput):
  // `modulos` explícito > módulos do template > enabledByDefault do registry.
  // A ordem preserva o contrato anterior — quem já passava `modulos` recebe
  // exatamente o que pediu, com ou sem template.
  const moduleKeys = input.modulos && input.modulos.length > 0
    ? input.modulos
    : template
      ? template.modules
      : modulosHabilitadosPorPadrao()
  const invalidos = moduleKeys.filter(k => !isValidProcessoModuleKey(k))
  if (invalidos.length > 0) throw new Error(`Módulo(s) desconhecido(s): ${invalidos.join(', ')}`)
  const organizationId = await resolverOrganizacaoUnica(supabase, input.organization_id)

  const processo = await inserirProcesso(supabase, {
    nome,
    tipo: normalizarTexto(input.tipo),
    cliente_nome: normalizarTexto(input.cliente_nome),
    endereco: normalizarTexto(input.endereco),
    responsavel_id: input.responsavel_id || null,
    organization_id: organizationId,
    status: 'ACTIVE',
    archived_at: null,
    template_key: template?.key ?? null,
    template_version: template?.version ?? null,
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

// ─── Compatibilização Funcional 01 — vínculo com Operação/Etapa ──────────────
// Processo continua sendo a unidade operacional; estas funções só escrevem
// os três campos aditivos (operacao_id/etapa_operacional_id/ordem_etapa).
// A trigger processos_validar_etapa_operacional (banco) garante que a etapa
// pertence à Operação e à mesma organização — não revalidamos isso aqui,
// evitaria duplicar a fonte da verdade.

export async function listarProcessosPorOperacao(supabase: SupabaseClient, operacaoId: string): Promise<Processo[]> {
  return listarProcessosPorOperacaoRaw(supabase, operacaoId)
}

export async function vincularProcessoAOperacao(supabase: SupabaseClient, processoId: string, operacaoId: string): Promise<Processo> {
  const existente = await buscarProcessoPorId(supabase, processoId)
  if (!existente) throw new Error('Processo não encontrado.')
  await atualizarOperacaoDoProcessoRaw(supabase, processoId, operacaoId)
  const atualizado = await buscarProcessoPorId(supabase, processoId)
  if (!atualizado) throw new Error('Processo não encontrado após atualização.')
  return atualizado
}

// Remove o Processo da Operação (e da etapa, por consequência) — não apaga
// nem arquiva o Processo. Ele volta a se comportar como um Processo comum,
// fora de qualquer Kanban.
export async function desvincularProcessoDaOperacao(supabase: SupabaseClient, processoId: string): Promise<Processo> {
  const existente = await buscarProcessoPorId(supabase, processoId)
  if (!existente) throw new Error('Processo não encontrado.')
  await atualizarOperacaoDoProcessoRaw(supabase, processoId, null)
  const atualizado = await buscarProcessoPorId(supabase, processoId)
  if (!atualizado) throw new Error('Processo não encontrado após atualização.')
  return atualizado
}

// Move o card para outra etapa da MESMA Operação (drag-and-drop entre
// colunas). A ordem exata dentro da coluna de destino é responsabilidade de
// reordenarProcessosDaEtapa, chamada logo em seguida pela UI.
export async function moverProcessoParaEtapa(supabase: SupabaseClient, processoId: string, etapaOperacionalId: string | null): Promise<void> {
  const existente = await buscarProcessoPorId(supabase, processoId)
  if (!existente) throw new Error('Processo não encontrado.')
  await atualizarEtapaDoProcessoRaw(supabase, processoId, etapaOperacionalId)
}

// Persiste a ordem final de TODOS os cards de uma etapa após um
// drag-and-drop — cobre tanto reordenar dentro da mesma coluna quanto a
// posição exata após mover de outra coluna.
export async function reordenarProcessosDaEtapa(supabase: SupabaseClient, processoIdsEmOrdem: string[]): Promise<void> {
  await reordenarOrdemEtapaRaw(supabase, processoIdsEmOrdem.map((id, ordem) => ({ id, ordem })))
}

export function listarTemplatesDisponiveis() {
  return PROCESSO_TEMPLATES
}
