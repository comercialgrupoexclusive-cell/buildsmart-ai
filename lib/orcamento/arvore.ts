// Fonte única de leitura da árvore Etapa → Grupo → Item de um orçamento.
// Uma linha aqui = uma linha de orcamento_arvore_valores() (RPC) — nenhum
// campo derivado por cálculo próprio; "valor" já vem de orcamento_item_valor()
// no banco (respeita valor_total_manual_ativo, composição própria "ao vivo",
// insumos materializados e o fallback de snapshot — ver
// supabase/migrations/20260906200000_orcamento_motor_canonico.sql).
//
// P4.4 (correções P1): lib/financeiro.ts e lib/planejamento-progresso.ts
// recalculavam quantidade × preco_unitario_snapshot em JS, ignorando o valor
// manual/informado do orçamento — divergindo do total canônico mostrado no
// Orçamento. Este módulo existe para que os dois (e a UI de Orçamento do
// Processo) leiam exatamente a mesma fonte, em vez de reimplementar a
// fórmula pela enésima vez.
import type { SupabaseClient } from '@supabase/supabase-js'

export type LinhaArvore = {
  orcamento_id: string
  etapa_id: string | null
  etapa_nome: string | null
  etapa_ordem: number | null
  grupo_id: string | null
  grupo_nome: string | null
  item_id: string
  tipo_linha: 'item' | 'subetapa'
  tipo_item_snapshot: 'COMPOSICAO' | 'INSUMO' | 'ITEM_LIVRE' | null
  item_descricao: string | null
  item_codigo: string | null
  quantidade: number | null
  unidade: string | null
  classificacao: 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS' | null
  ordem: number | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  subetapa_valor_manual_ativo: boolean | null
  valor_total_manual_ativo: boolean | null
  preco_unitario_snapshot: number | null
  valor: number
}

export async function carregarArvoreValores(supabase: SupabaseClient, orcamentoIds: string[]): Promise<LinhaArvore[]> {
  if (orcamentoIds.length === 0) return []
  const { data, error } = await supabase.rpc('orcamento_arvore_valores', { p_orcamento_ids: orcamentoIds })
  if (error) throw error
  return (data || []) as LinhaArvore[]
}

export type InsumoDetalhe = {
  origem: 'materializado' | 'composicao_viva'
  insumo_id: string | null
  codigo: string
  descricao: string
  unidade: string
  classificacao: 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS' | string
  coeficiente: number | null
  quantidade_calculada: number | null
  quantidade_adotada: number | null
  preco_unitario: number
  valor_total: number
}

export type EtapaResumo = {
  id: string
  nome: string
  ordem: number
  valor: number
}

// Total do orçamento = soma dos itens-folha + delta das subetapas com valor
// manual ativo — mesma fórmula que ObraOrcamento.tsx usa em `subtotal`:
// quando uma subetapa tem valor manual, ele substitui a soma calculada dos
// itens dela, não se soma a ela.
export function calcularTotal(linhas: LinhaArvore[]): number {
  const itens = linhas.filter(l => l.tipo_linha === 'item')
  const subtotalItens = itens.reduce((acc, l) => acc + l.valor, 0)
  const subetapasManuais = linhas.filter(l => l.tipo_linha === 'subetapa' && l.subetapa_valor_manual_ativo)
  const ajusteManual = subetapasManuais.reduce((acc, sub) => {
    const calculado = itens.filter(i => i.grupo_id === sub.item_id).reduce((s, i) => s + i.valor, 0)
    return acc + (sub.valor - calculado)
  }, 0)
  return subtotalItens + ajusteManual
}

export const SEM_ETAPA_ID = '__sem_etapa__'

export function agruparPorEtapa(linhas: LinhaArvore[]): EtapaResumo[] {
  const porEtapa = new Map<string, EtapaResumo>()
  for (const l of linhas) {
    const etapaId = l.etapa_id || SEM_ETAPA_ID
    const atual = porEtapa.get(etapaId) || { id: etapaId, nome: l.etapa_nome || 'Sem etapa', ordem: l.etapa_ordem ?? Number.MAX_SAFE_INTEGER, valor: 0 }
    if (l.tipo_linha === 'item') {
      const donoDeSubetapaManual = l.grupo_id && linhas.some(s => s.item_id === l.grupo_id && s.tipo_linha === 'subetapa' && s.subetapa_valor_manual_ativo)
      if (!donoDeSubetapaManual) atual.valor += l.valor
    } else if (l.subetapa_valor_manual_ativo) {
      atual.valor += l.valor
    }
    porEtapa.set(etapaId, atual)
  }
  return [...porEtapa.values()].sort((a, b) => a.ordem - b.ordem)
}

// Valor "direto" por orçamento (sem BDI nem gerenciamento) — usado por quem
// precisa do total de mais de um orçamento ao mesmo tempo (ex.: Financeiro
// consolidado).
export function calcularTotalPorOrcamento(linhas: LinhaArvore[]): Map<string, number> {
  const porOrcamento = new Map<string, LinhaArvore[]>()
  for (const l of linhas) {
    if (!porOrcamento.has(l.orcamento_id)) porOrcamento.set(l.orcamento_id, [])
    porOrcamento.get(l.orcamento_id)!.push(l)
  }
  const resultado = new Map<string, number>()
  for (const [orcamentoId, linhasDoOrc] of porOrcamento) {
    resultado.set(orcamentoId, calcularTotal(linhasDoOrc))
  }
  return resultado
}

// Gerenciamento (P4.4 P1): valor fixo contratado (gerenciamento_valor_fixo)
// vence sempre que definido — evita o arredondamento de converter um valor
// fixo real em percentual (ex.: R$123.100,00 sobre R$500.250,00 não fecha
// exato em numeric(7,4)). Sem valor fixo, cai no percentual como já era.
export function calcularGerenciamento(custoDireto: number, gerenciamentoPercentual: number, gerenciamentoValorFixo: number | null): number {
  if (gerenciamentoValorFixo != null) return gerenciamentoValorFixo
  return custoDireto * (Number(gerenciamentoPercentual) || 0) / 100
}

// Total operacional do orçamento = custo direto (canônico) + BDI (% sobre o
// direto) + gerenciamento (fixo ou % sobre o direto) — mesma composição que
// app/(app)/orcamentos/page.tsx e lib/financeiro.ts já usavam somando os
// dois percentuais num fator só; aqui só o termo do gerenciamento passa a
// aceitar valor fixo.
export function calcularTotalOperacional(params: {
  custoDireto: number
  bdiPercentual: number
  gerenciamentoPercentual: number
  gerenciamentoValorFixo: number | null
}): { custoDireto: number; bdi: number; gerenciamento: number; total: number } {
  const bdi = params.custoDireto * (Number(params.bdiPercentual) || 0) / 100
  const gerenciamento = calcularGerenciamento(params.custoDireto, params.gerenciamentoPercentual, params.gerenciamentoValorFixo)
  return { custoDireto: params.custoDireto, bdi, gerenciamento, total: params.custoDireto + bdi + gerenciamento }
}
