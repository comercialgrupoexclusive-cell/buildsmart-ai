// Service do Motor de Operação — regra de negócio: validação de nome,
// normalização, exclusão segura de etapa (só quando não há Processo nela),
// reordenação. Repository só executa queries; este arquivo decide o que é
// válido.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  atualizarEtapaRaw,
  atualizarOperacaoRaw,
  buscarEtapaPorId,
  buscarOperacaoPorId,
  contarProcessosNaEtapa,
  excluirEtapaRaw,
  excluirOperacaoRaw,
  inserirEtapa,
  inserirEtapasEmLote,
  inserirOperacao,
  listarEtapasDaOperacaoRaw,
  listarOperacoesRaw,
  reordenarEtapasRaw,
} from '../repository/operacoes-repository'
import type {
  AtualizarEtapaInput,
  AtualizarOperacaoInput,
  CriarEtapaInput,
  CriarOperacaoInput,
  Operacao,
  OperacaoEtapa,
} from '../domain/types'

function normalizarTexto(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t || null
}

async function resolverOrganizacaoUnica(supabase: SupabaseClient, organizationId?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('current_organization_id')
  if (error || !data || (organizationId && organizationId !== data)) {
    throw new Error('Selecione a organização antes de criar a Operação.')
  }
  return data as string
}

export async function criarOperacao(supabase: SupabaseClient, input: CriarOperacaoInput): Promise<{ operacao: Operacao; etapas: OperacaoEtapa[] }> {
  const nome = (input.nome ?? '').trim()
  if (!nome) throw new Error('Nome da Operação é obrigatório.')

  const organizationId = await resolverOrganizacaoUnica(supabase, input.organization_id)
  const operacao = await inserirOperacao(supabase, {
    nome,
    descricao: normalizarTexto(input.descricao),
    organization_id: organizationId,
  })

  const etapas = input.etapasIniciais && input.etapasIniciais.length > 0
    ? await inserirEtapasEmLote(supabase, operacao.id, input.etapasIniciais)
    : []

  return { operacao, etapas }
}

export async function obterOperacao(supabase: SupabaseClient, id: string): Promise<Operacao | null> {
  return buscarOperacaoPorId(supabase, id)
}

export async function listarOperacoes(supabase: SupabaseClient): Promise<Operacao[]> {
  return listarOperacoesRaw(supabase)
}

export async function atualizarOperacao(supabase: SupabaseClient, id: string, patch: AtualizarOperacaoInput): Promise<Operacao> {
  const existente = await buscarOperacaoPorId(supabase, id)
  if (!existente) throw new Error('Operação não encontrada.')

  const dadosPatch: { nome?: string; descricao?: string | null } = {}
  if (patch.nome !== undefined) {
    const nome = patch.nome.trim()
    if (!nome) throw new Error('Nome da Operação é obrigatório.')
    dadosPatch.nome = nome
  }
  if (patch.descricao !== undefined) dadosPatch.descricao = normalizarTexto(patch.descricao)

  await atualizarOperacaoRaw(supabase, id, { ...dadosPatch, updated_at: new Date().toISOString() })
  const atualizado = await buscarOperacaoPorId(supabase, id)
  if (!atualizado) throw new Error('Operação não encontrada após atualização.')
  return atualizado
}

// Exclusão da Operação em si continua disponível como CRUD de fallback, mas
// só quando ela não tem mais nenhuma etapa configurada (esvaziar as etapas
// primeiro já força o usuário a decidir o destino de cada Processo — não
// existe exclusão em cascata silenciosa de Processos).
export async function excluirOperacao(supabase: SupabaseClient, id: string): Promise<void> {
  const existente = await buscarOperacaoPorId(supabase, id)
  if (!existente) throw new Error('Operação não encontrada.')
  const etapas = await listarEtapasDaOperacaoRaw(supabase, id)
  if (etapas.length > 0) throw new Error('Exclua todas as etapas desta Operação antes de excluí-la.')
  await excluirOperacaoRaw(supabase, id)
}

export async function criarEtapa(supabase: SupabaseClient, input: CriarEtapaInput): Promise<OperacaoEtapa> {
  const nome = (input.nome ?? '').trim()
  if (!nome) throw new Error('Nome da etapa é obrigatório.')
  const existente = await buscarOperacaoPorId(supabase, input.operacao_id)
  if (!existente) throw new Error('Operação não encontrada.')

  const etapasAtuais = await listarEtapasDaOperacaoRaw(supabase, input.operacao_id)
  const proximaOrdem = etapasAtuais.length ? Math.max(...etapasAtuais.map(e => e.ordem)) + 1 : 0
  return inserirEtapa(supabase, { operacao_id: input.operacao_id, nome, ordem: proximaOrdem, cor: normalizarTexto(input.cor) })
}

export async function listarEtapasDaOperacao(supabase: SupabaseClient, operacaoId: string): Promise<OperacaoEtapa[]> {
  return listarEtapasDaOperacaoRaw(supabase, operacaoId)
}

export async function atualizarEtapa(supabase: SupabaseClient, id: string, patch: AtualizarEtapaInput): Promise<OperacaoEtapa> {
  const existente = await buscarEtapaPorId(supabase, id)
  if (!existente) throw new Error('Etapa não encontrada.')

  const dadosPatch: { nome?: string; cor?: string | null } = {}
  if (patch.nome !== undefined) {
    const nome = patch.nome.trim()
    if (!nome) throw new Error('Nome da etapa é obrigatório.')
    dadosPatch.nome = nome
  }
  if (patch.cor !== undefined) dadosPatch.cor = normalizarTexto(patch.cor)

  await atualizarEtapaRaw(supabase, id, { ...dadosPatch, updated_at: new Date().toISOString() })
  const atualizado = await buscarEtapaPorId(supabase, id)
  if (!atualizado) throw new Error('Etapa não encontrada após atualização.')
  return atualizado
}

// Reordena as COLUNAS (etapas) de uma Operação — distinto de reordenar os
// Processos DENTRO de uma etapa (isso é lib/processo, dono de
// processos.ordem_etapa). `operacaoId` é o contexto esperado: toda etapa
// recebida precisa pertencer a ele, senão a escrita é rejeitada inteira —
// esta Action é chamada pela UI hoje, mas o contrato precisa ser seguro
// também para uma futura IA que não tenha a mesma disciplina do dnd-kit.
export async function reordenarEtapas(supabase: SupabaseClient, operacaoId: string, etapaIdsEmOrdem: string[]): Promise<void> {
  if (etapaIdsEmOrdem.length === 0) return
  const etapasDaOperacao = await listarEtapasDaOperacaoRaw(supabase, operacaoId)
  const idsValidos = new Set(etapasDaOperacao.map(e => e.id))
  const foraDoContexto = etapaIdsEmOrdem.filter(id => !idsValidos.has(id))
  if (foraDoContexto.length > 0) throw new Error('Uma ou mais etapas não pertencem a esta Operação.')
  await reordenarEtapasRaw(supabase, etapaIdsEmOrdem.map((id, ordem) => ({ id, ordem })))
}

// "Excluir somente quando seguro" (item 2): uma etapa com Processos nela não
// pode ser excluída silenciosamente — o usuário precisa mover os Processos
// primeiro. Nenhum Processo é apagado ou movido às escondidas aqui.
export async function excluirEtapa(supabase: SupabaseClient, id: string): Promise<void> {
  const existente = await buscarEtapaPorId(supabase, id)
  if (!existente) throw new Error('Etapa não encontrada.')
  const emUso = await contarProcessosNaEtapa(supabase, id)
  if (emUso > 0) {
    throw new Error(`Esta etapa tem ${emUso} Processo${emUso === 1 ? '' : 's'}. Mova ${emUso === 1 ? 'o' : 'os'} Processo${emUso === 1 ? '' : 's'} para outra etapa antes de excluí-la.`)
  }
  await excluirEtapaRaw(supabase, id)
}
