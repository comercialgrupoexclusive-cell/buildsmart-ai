// Service do Motor de Processo (P3.1) — regra de negócio do Core: validação
// de nome/status/módulo, normalização de texto, bookkeeping de
// timestamps/archived_at. Repository (../repository) só executa queries;
// este arquivo decide o que é válido.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  atualizarProcessoRaw,
  atualizarStatusRaw,
  buscarProcessoPorId,
  definirGrupoDosProcessosRaw,
  excluirProcessoRaw,
  inserirGrupoRaw,
  inserirModulos,
  inserirProcesso,
  listarGruposRaw,
  atualizarTemplateRaw,
  excluirTemplateRaw,
  inserirTemplateRaw,
  listarModulosDeVariosRaw,
  listarModulosRaw,
  listarTemplatesRaw,
  listarProcessosRaw,
  listarUsoRaw,
  registrarUsoRaw,
  upsertModuloVinculo,
} from '../repository/processo-repository'
import {
  PROCESSO_STATUSES,
  type AtualizarProcessoInput,
  type CriarProcessoInput,
  type ListarProcessosFiltros,
  type Processo,
  type ProcessoGrupo,
  type ProcessoModuloVinculo,
  type ProcessoStatus,
  type ProcessoUso,
} from '../domain/types'
import { PROCESSO_MODULES, isValidProcessoModuleKey, modulosHabilitadosPorPadrao } from '../domain/module-registry'
import type { ProcessoTemplate, SalvarTemplateInput } from '../domain/template'

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

export async function criarProcesso(supabase: SupabaseClient, input: CriarProcessoInput): Promise<Processo> {
  const nome = (input.nome ?? '').trim()
  if (!nome) throw new Error('Nome do processo é obrigatório.')

  const moduleKeys = input.modulos && input.modulos.length > 0 ? input.modulos : modulosHabilitadosPorPadrao()
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
    template_id: input.template_id || null,
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
  if (patch.capa_url !== undefined) dadosPatch.capa_url = normalizarTexto(patch.capa_url)
  if (patch.grupo_id !== undefined) dadosPatch.grupo_id = patch.grupo_id || null

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

// ── Grupos, duplicação, exclusão e rastro de uso ─────────────────────────

export async function listarGrupos(supabase: SupabaseClient): Promise<ProcessoGrupo[]> {
  return listarGruposRaw(supabase)
}

// Nome do grupo é a identidade dele (unique por organização no banco), então
// reaproveita um grupo homônimo em vez de estourar o unique.
export async function criarGrupo(
  supabase: SupabaseClient,
  nome: string,
  organizationId: string | null,
): Promise<ProcessoGrupo> {
  const limpo = normalizarTexto(nome)
  if (!limpo) throw new Error('O grupo precisa de um nome.')
  const existentes = await listarGruposRaw(supabase)
  const igual = existentes.find(g => g.nome.toLowerCase() === limpo.toLowerCase())
  if (igual) return igual
  return inserirGrupoRaw(supabase, limpo, organizationId)
}

export async function agruparProcessos(
  supabase: SupabaseClient,
  processoIds: string[],
  grupoId: string | null,
): Promise<void> {
  await definirGrupoDosProcessosRaw(supabase, processoIds, grupoId)
}

export async function excluirProcesso(supabase: SupabaseClient, id: string): Promise<void> {
  const existente = await buscarProcessoPorId(supabase, id)
  if (!existente) throw new Error('Processo não encontrado.')
  await excluirProcessoRaw(supabase, id)
}

// Duplicar copia os dados de cadastro e os módulos habilitados — nunca o
// conteúdo operacional (orçamento, caixa de entrada, board). O Processo
// novo nasce vazio de trabalho, com a mesma configuração.
export async function duplicarProcesso(supabase: SupabaseClient, id: string): Promise<Processo> {
  const origem = await buscarProcessoPorId(supabase, id)
  if (!origem) throw new Error('Processo não encontrado.')

  const modulos = await listarModulosRaw(supabase, id)
  const habilitados = modulos.filter(m => m.enabled).map(m => m.module_key)

  return criarProcesso(supabase, {
    nome: `${origem.nome} (cópia)`,
    tipo: origem.tipo,
    cliente_nome: origem.cliente_nome,
    endereco: origem.endereco,
    responsavel_id: origem.responsavel_id,
    organization_id: origem.organization_id,
    modulos: habilitados,
    // Cópia de leilão continua leilão — senão o campo Cliente reapareceria
    // na duplicata.
    template_id: origem.template_id,
  })
}

export async function registrarUso(
  supabase: SupabaseClient,
  processoId: string,
  profileId: string,
  moduleKey: string,
): Promise<void> {
  if (!isValidProcessoModuleKey(moduleKey)) return
  await registrarUsoRaw(supabase, processoId, profileId, moduleKey)
}

export async function listarUso(supabase: SupabaseClient): Promise<ProcessoUso[]> {
  return listarUsoRaw(supabase)
}

export async function listarModulosDeVarios(
  supabase: SupabaseClient,
  processoIds: string[],
): Promise<ProcessoModuloVinculo[]> {
  return listarModulosDeVariosRaw(supabase, processoIds)
}

// ── Templates ────────────────────────────────────────────────────────────
// O banco guarda module keys como text[] sem check — validar contra o
// registry aqui evita migration a cada módulo novo e ainda impede gravar
// chave inexistente.
function validarModulos(modulos: string[]): string[] {
  const invalidos = modulos.filter(k => !isValidProcessoModuleKey(k))
  if (invalidos.length > 0) throw new Error(`Módulo(s) desconhecido(s): ${invalidos.join(', ')}`)
  return modulos
}

export async function listarTemplates(supabase: SupabaseClient): Promise<ProcessoTemplate[]> {
  return listarTemplatesRaw(supabase)
}

export async function criarTemplate(
  supabase: SupabaseClient,
  input: SalvarTemplateInput,
  organizationId: string | null,
): Promise<ProcessoTemplate> {
  const nome = normalizarTexto(input.nome)
  if (!nome) throw new Error('O template precisa de um nome.')
  const organizacao = await resolverOrganizacaoUnica(supabase, organizationId)
  return inserirTemplateRaw(supabase, {
    nome,
    descricao: normalizarTexto(input.descricao),
    modulos: validarModulos(input.modulos),
    campos_ocultos: input.campos_ocultos,
    organization_id: organizacao,
  })
}

export async function atualizarTemplate(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<SalvarTemplateInput>,
): Promise<ProcessoTemplate> {
  const dados: Partial<SalvarTemplateInput> = {}
  if (patch.nome !== undefined) {
    const nome = normalizarTexto(patch.nome)
    if (!nome) throw new Error('O template precisa de um nome.')
    dados.nome = nome
  }
  if (patch.descricao !== undefined) dados.descricao = normalizarTexto(patch.descricao)
  if (patch.modulos !== undefined) dados.modulos = validarModulos(patch.modulos)
  if (patch.campos_ocultos !== undefined) dados.campos_ocultos = patch.campos_ocultos
  return atualizarTemplateRaw(supabase, id, dados)
}

export async function excluirTemplate(supabase: SupabaseClient, id: string): Promise<void> {
  await excluirTemplateRaw(supabase, id)
}
