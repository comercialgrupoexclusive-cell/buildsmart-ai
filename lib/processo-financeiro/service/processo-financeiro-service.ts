// Service do Financeiro Real do Processo — regra de negócio: validação de
// natureza/categoria/valor/status, vínculo com o Processo (e por extensão
// com a organização, via processo_is_accessible no RLS), e o cálculo do
// resumo — sempre derivado da fonte única (lançamentos), nunca persistido
// à parte para não divergir.
import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarProcessoPorId } from '../../processo/repository/processo-repository'
import {
  atualizarLancamentoRaw,
  buscarLancamentoPorId,
  excluirLancamentoRaw,
  inserirLancamento,
  listarLancamentosPorProcessoRaw,
} from '../repository/processo-financeiro-repository'
import {
  NATUREZAS_LANCAMENTO,
  STATUS_LANCAMENTO,
  type AtualizarLancamentoInput,
  type CriarLancamentoInput,
  type LancamentoFinanceiro,
  type ResumoFinanceiroProcesso,
} from '../domain/types'

function normalizarTexto(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t || null
}

async function validarProcessoAcessivel(supabase: SupabaseClient, processoId: string): Promise<void> {
  const processo = await buscarProcessoPorId(supabase, processoId)
  if (!processo) throw new Error('Processo não encontrado.')
}

export async function criarLancamentoFinanceiro(supabase: SupabaseClient, input: CriarLancamentoInput): Promise<LancamentoFinanceiro> {
  await validarProcessoAcessivel(supabase, input.processo_id)

  if (!NATUREZAS_LANCAMENTO.includes(input.natureza)) throw new Error(`Natureza inválida: ${input.natureza}`)
  const categoria = (input.categoria ?? '').trim()
  if (!categoria) throw new Error('Categoria é obrigatória.')
  if (!(input.valor > 0)) throw new Error('Valor precisa ser maior que zero.')
  const status = input.status ?? 'PENDENTE'
  if (!STATUS_LANCAMENTO.includes(status)) throw new Error(`Status inválido: ${status}`)

  return inserirLancamento(supabase, {
    processo_id: input.processo_id,
    natureza: input.natureza,
    categoria,
    descricao: normalizarTexto(input.descricao),
    valor: input.valor,
    status,
    data_lancamento: input.data_lancamento || null,
    data_realizacao: input.data_realizacao || null,
    comprovante_url: normalizarTexto(input.comprovante_url),
    observacao: normalizarTexto(input.observacao),
  })
}

export async function listarLancamentosFinanceiros(supabase: SupabaseClient, processoId: string): Promise<LancamentoFinanceiro[]> {
  await validarProcessoAcessivel(supabase, processoId)
  return listarLancamentosPorProcessoRaw(supabase, processoId)
}

export async function atualizarLancamentoFinanceiro(
  supabase: SupabaseClient,
  id: string,
  patch: AtualizarLancamentoInput,
): Promise<LancamentoFinanceiro> {
  const existente = await buscarLancamentoPorId(supabase, id)
  if (!existente) throw new Error('Lançamento não encontrado.')

  const dadosPatch: AtualizarLancamentoInput = {}
  if (patch.natureza !== undefined) {
    if (!NATUREZAS_LANCAMENTO.includes(patch.natureza)) throw new Error(`Natureza inválida: ${patch.natureza}`)
    dadosPatch.natureza = patch.natureza
  }
  if (patch.categoria !== undefined) {
    const categoria = patch.categoria.trim()
    if (!categoria) throw new Error('Categoria é obrigatória.')
    dadosPatch.categoria = categoria
  }
  if (patch.descricao !== undefined) dadosPatch.descricao = normalizarTexto(patch.descricao)
  if (patch.valor !== undefined) {
    if (!(patch.valor > 0)) throw new Error('Valor precisa ser maior que zero.')
    dadosPatch.valor = patch.valor
  }
  if (patch.status !== undefined) {
    if (!STATUS_LANCAMENTO.includes(patch.status)) throw new Error(`Status inválido: ${patch.status}`)
    dadosPatch.status = patch.status
  }
  if (patch.data_lancamento !== undefined) dadosPatch.data_lancamento = patch.data_lancamento || null
  if (patch.data_realizacao !== undefined) dadosPatch.data_realizacao = patch.data_realizacao || null
  if (patch.comprovante_url !== undefined) dadosPatch.comprovante_url = normalizarTexto(patch.comprovante_url)
  if (patch.observacao !== undefined) dadosPatch.observacao = normalizarTexto(patch.observacao)

  await atualizarLancamentoRaw(supabase, id, { ...dadosPatch, updated_at: new Date().toISOString() })
  const atualizado = await buscarLancamentoPorId(supabase, id)
  if (!atualizado) throw new Error('Lançamento não encontrado após atualização.')
  return atualizado
}

export async function excluirLancamentoFinanceiro(supabase: SupabaseClient, id: string): Promise<void> {
  const existente = await buscarLancamentoPorId(supabase, id)
  if (!existente) throw new Error('Lançamento não encontrado.')
  await excluirLancamentoRaw(supabase, id)
}

// Marca como REALIZADO e registra a data de realização (hoje, se nenhuma for
// informada) — um custo pendente vira obrigação real cumprida. Voltar para
// PENDENTE/CANCELADO é o mesmo atualizarLancamentoFinanceiro genérico, sem
// precisar de uma segunda Action espelhada.
export async function marcarLancamentoRealizado(
  supabase: SupabaseClient,
  id: string,
  dataRealizacao?: string | null,
): Promise<LancamentoFinanceiro> {
  const existente = await buscarLancamentoPorId(supabase, id)
  if (!existente) throw new Error('Lançamento não encontrado.')
  const data = dataRealizacao || existente.data_realizacao || new Date().toISOString().slice(0, 10)
  await atualizarLancamentoRaw(supabase, id, { status: 'REALIZADO', data_realizacao: data, updated_at: new Date().toISOString() })
  const atualizado = await buscarLancamentoPorId(supabase, id)
  if (!atualizado) throw new Error('Lançamento não encontrado após atualização.')
  return atualizado
}

// Resumo SEMPRE derivado da fonte única — nada aqui é persistido à parte.
// CANCELADO não entra em nenhuma soma (não é entrada nem saída real, nem
// pendência).
export async function obterResumoFinanceiroDoProcesso(supabase: SupabaseClient, processoId: string): Promise<ResumoFinanceiroProcesso> {
  const lancamentos = await listarLancamentosFinanceiros(supabase, processoId)
  const resumo: ResumoFinanceiroProcesso = {
    entradas_realizadas: 0,
    saidas_realizadas: 0,
    saldo_realizado: 0,
    entradas_pendentes: 0,
    saidas_pendentes: 0,
  }
  for (const l of lancamentos) {
    if (l.status === 'CANCELADO') continue
    if (l.natureza === 'ENTRADA') {
      if (l.status === 'REALIZADO') resumo.entradas_realizadas += l.valor
      else resumo.entradas_pendentes += l.valor
    } else {
      if (l.status === 'REALIZADO') resumo.saidas_realizadas += l.valor
      else resumo.saidas_pendentes += l.valor
    }
  }
  resumo.saldo_realizado = resumo.entradas_realizadas - resumo.saidas_realizadas
  return resumo
}
