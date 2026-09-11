// ═══════════════════════════════════════════════════════════════════════════
// Fonte ÚNICA do Financeiro. Não é uma fonte financeira nova — apenas lê o
// que já existe, com nomenclatura clara:
//
//   Planejado original  = baseline do orçamento (orcamento_itens_baseline),
//                          capturada ao "Iniciar Obra". Pode não existir
//                          ainda (obras que não passaram por esse fluxo) —
//                          nesse caso o valor é null, nunca 0 disfarçado.
//   Planejado atual     = orçamento atual (orcamento_itens), sempre o
//                          estado vivo, editável.
//   Comprometido/       = soma de compra_itens com status_valor='confirmado'.
//   Contratado            Isto é um compromisso financeiro assumido, não
//                          necessariamente dinheiro pago.
//   Pago                = subconjunto do Comprometido com
//                          status_pagamento='pago'.
//   A pagar             = Comprometido - Pago.
//   Saldo do orçamento  = Planejado atual - Comprometido.
//   atual
//   Avanço físico       = lib/planejamento-progresso.ts (fonte única de
//                          avanço físico) — nunca misturado com % financeiro.
//
// "status_valor='confirmado'" por si só não significa "pago" — por isso o
// nome exposto aqui é sempre Comprometido/Contratado, nunca "realizado".
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPlanejamentoProgresso } from './planejamento-progresso'
import { TODOS_ORCAMENTOS } from './obra-orcamento-context'
import type { TipoCusto } from './types'
import { carregarArvoreValores, calcularTotal, calcularTotalOperacional } from './orcamento/arvore'

export type FinanceiroPorEtapa = {
  etapaId: string | null
  etapaNome: string
  planejadoAtual: number
  comprometido: number
  pago: number
}

export type FinanceiroPorTipoCusto = {
  tipo: TipoCusto | 'nao_classificado'
  comprometido: number
  pago: number
}

export type FinanceiroResumo = {
  planejadoOriginal: number | null   // null = baseline ainda não capturada
  planejadoAtual: number
  comprometido: number
  pago: number
  aPagar: number
  saldoOrcamentoAtual: number
  avancoFisico: number               // 0-100, sempre de lib/planejamento-progresso
  porEtapa: FinanceiroPorEtapa[]
  porTipoCusto: FinanceiroPorTipoCusto[]
}

type OrcRow = { id: string; bdi_percentual: number | null; gerenciamento_percentual: number | null; gerenciamento_valor_fixo: number | null }
type BaselineItemRow = { orcamento_id: string; quantidade: number; preco_unitario_snapshot: number }
type CompraRow = {
  id: string; orcamento_id: string | null; etapa_id: string | null
  valor_total: number | null; status_valor: 'confirmado' | 'estimado'
  status_pagamento: 'pendente' | 'pago'; tipo_custo: TipoCusto | null
}
type PagamentoRow = { compra_item_id: string; valor_pago: number }

// Pago acumulado por compra_item: soma do histórico de pagamentos quando
// existe (nunca sobrescrito por data — decisão 5, P4.3); cai para o flag
// binário legado (status_pagamento) só para itens que nunca tiveram um
// pagamento registrado na tabela nova, preservando dados antigos de /obras.
function pagoPorItem(compras: CompraRow[], pagamentos: PagamentoRow[]): Map<string, number> {
  const somaPorItem = new Map<string, number>()
  pagamentos.forEach(p => somaPorItem.set(p.compra_item_id, (somaPorItem.get(p.compra_item_id) || 0) + Number(p.valor_pago || 0)))
  const resultado = new Map<string, number>()
  compras.forEach(c => {
    const total = Number(c.valor_total || 0)
    const registrado = somaPorItem.get(c.id)
    const pago = registrado !== undefined ? Math.min(registrado, total) : (c.status_pagamento === 'pago' ? total : 0)
    resultado.set(c.id, pago)
  })
  return resultado
}

export async function loadFinanceiroResumo(
  supabase: SupabaseClient,
  params: { obraId?: string; processoId?: string; orcamentoId: string; orcamentoIds: string[] },
): Promise<FinanceiroResumo> {
  const { obraId, processoId, orcamentoId, orcamentoIds } = params
  const consolidado = orcamentoId === TODOS_ORCAMENTOS
  const idsAtivos = consolidado ? orcamentoIds : orcamentoIds.filter(id => id === orcamentoId)

  let etapasQuery = supabase.from('etapas').select('id, nome')
  etapasQuery = obraId ? etapasQuery.eq('obra_id', obraId) : etapasQuery.eq('processo_id', processoId as string)
  let comprasQuery = supabase.from('compra_itens').select('id, orcamento_id, etapa_id, valor_total, status_valor, status_pagamento, tipo_custo')
  comprasQuery = obraId ? comprasQuery.eq('obra_id', obraId) : comprasQuery.eq('processo_id', processoId as string)

  const [orcRes, arvore, baselineRes, etapasRes, comprasRes, progresso] = await Promise.all([
    idsAtivos.length ? supabase.from('orcamentos').select('id, bdi_percentual, gerenciamento_percentual, gerenciamento_valor_fixo').in('id', idsAtivos) : Promise.resolve({ data: [] }),
    carregarArvoreValores(supabase, idsAtivos),
    idsAtivos.length ? supabase.from('orcamento_itens_baseline').select('orcamento_id, quantidade, preco_unitario_snapshot').in('orcamento_id', idsAtivos) : Promise.resolve({ data: [] }),
    etapasQuery,
    comprasQuery,
    loadPlanejamentoProgresso(supabase, idsAtivos),
  ])

  const orcs = (orcRes.data || []) as OrcRow[]
  const gerenciamentoPorOrcamento = new Map(orcs.map(o => [o.id, { pct: Number(o.gerenciamento_percentual ?? 0), fixo: o.gerenciamento_valor_fixo != null ? Number(o.gerenciamento_valor_fixo) : null }]))
  const baselineItens = (baselineRes.data || []) as BaselineItemRow[]
  const etapaNomePorId = new Map(((etapasRes.data || []) as { id: string; nome: string }[]).map(e => [e.id, e.nome]))

  const todasCompras = (comprasRes.data || []) as CompraRow[]
  const compras = todasCompras.filter(c => consolidado
    ? (!c.orcamento_id || orcamentoIds.includes(c.orcamento_id))
    : c.orcamento_id === orcamentoId)

  const compraIds = compras.map(c => c.id)
  const pagamentosRes = compraIds.length ? await supabase.from('compra_pagamentos').select('compra_item_id, valor_pago').in('compra_item_id', compraIds) : { data: [] }
  const pagoPorId = pagoPorItem(compras, (pagamentosRes.data || []) as PagamentoRow[])

  // Planejado atual: custo direto sempre a partir da árvore canônica do
  // orçamento (orcamento_arvore_valores — respeita valor manual/informado e
  // composição, nunca quantidade × preço em paralelo), + BDI + gerenciamento
  // (valor fixo contratado quando definido, senão percentual sobre o
  // direto) — mesmo total que o Orçamento mostra como "Valor total".
  const planejadoAtual = orcs.reduce((total, orc) => {
    const linhasDoOrc = arvore.filter(l => l.orcamento_id === orc.id)
    const custoDireto = calcularTotal(linhasDoOrc)
    const ger = gerenciamentoPorOrcamento.get(orc.id)
    const { total: totalOrc } = calcularTotalOperacional({
      custoDireto,
      bdiPercentual: Number(orc.bdi_percentual ?? 0),
      gerenciamentoPercentual: ger?.pct ?? 0,
      gerenciamentoValorFixo: ger?.fixo ?? null,
    })
    return total + totalOrc
  }, 0)

  // Planejado original: baseline. Se nenhum dos orçamentos ativos tem
  // baseline capturada, o valor é null (não é a mesma coisa que R$ 0).
  // Baseline é snapshot imutável (não passa pelo motor canônico vivo) —
  // mantém quantidade × preço, igual sempre foi.
  const orcamentosComBaseline = new Set(baselineItens.map(i => i.orcamento_id))
  const planejadoOriginal = orcamentosComBaseline.size === 0 ? null : orcs.reduce((total, orc) => {
    if (!orcamentosComBaseline.has(orc.id)) return total
    const itensBaseline = baselineItens.filter(i => i.orcamento_id === orc.id)
    const subtotal = itensBaseline.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.preco_unitario_snapshot || 0), 0)
    return total + subtotal * (1 + Number(orc.bdi_percentual ?? 0) / 100)
  }, 0)

  // Comprometido/Contratado e Pago — nunca chamados de "realizado": um
  // lançamento confirmado é um compromisso, não necessariamente dinheiro
  // que já saiu do caixa.
  const comprometido = compras.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0)
  const pago = compras.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + (pagoPorId.get(c.id) || 0), 0)
  const aPagar = Math.max(0, comprometido - pago)
  const saldoOrcamentoAtual = planejadoAtual - comprometido

  const itensArvore = arvore.filter(l => l.tipo_linha === 'item')
  const etapaIds = new Set<string>()
  itensArvore.forEach(i => { if (i.etapa_id) etapaIds.add(i.etapa_id) })
  compras.forEach(c => { if (c.etapa_id) etapaIds.add(c.etapa_id) })
  const porEtapa: FinanceiroPorEtapa[] = [...etapaIds].map(etapaId => {
    // Por etapa: só custo direto + BDI (gerenciamento é global do orçamento,
    // não distribuído aqui — ver gerenciamento_distribuicao em Ajuste de
    // Distribuição, fora do escopo desta correção).
    const planejadoAtualEtapa = orcs.reduce((total, orc) => {
      const itens = itensArvore.filter(i => i.orcamento_id === orc.id && i.etapa_id === etapaId)
      const subtotal = itens.reduce((s, i) => s + i.valor, 0)
      return total + subtotal * (1 + Number(orc.bdi_percentual ?? 0) / 100)
    }, 0)
    const comprasDaEtapa = compras.filter(c => c.etapa_id === etapaId)
    return {
      etapaId,
      etapaNome: etapaNomePorId.get(etapaId) || 'Etapa',
      planejadoAtual: planejadoAtualEtapa,
      comprometido: comprasDaEtapa.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0),
      pago: comprasDaEtapa.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + (pagoPorId.get(c.id) || 0), 0),
    }
  }).sort((a, b) => b.planejadoAtual - a.planejadoAtual)
  const comprasSemEtapa = compras.filter(c => !c.etapa_id)
  if (comprasSemEtapa.length > 0) {
    porEtapa.push({
      etapaId: null,
      etapaNome: 'Sem etapa',
      planejadoAtual: 0,
      comprometido: comprasSemEtapa.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0),
      pago: comprasSemEtapa.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + (pagoPorId.get(c.id) || 0), 0),
    })
  }

  const tiposPresentes = new Set<TipoCusto | 'nao_classificado'>()
  compras.forEach(c => tiposPresentes.add(c.tipo_custo || 'nao_classificado'))
  const porTipoCusto: FinanceiroPorTipoCusto[] = [...tiposPresentes].map(tipo => {
    const comprasDoTipo = compras.filter(c => (c.tipo_custo || 'nao_classificado') === tipo)
    return {
      tipo,
      comprometido: comprasDoTipo.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0),
      pago: comprasDoTipo.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + (pagoPorId.get(c.id) || 0), 0),
    }
  }).sort((a, b) => b.comprometido - a.comprometido)

  return {
    planejadoOriginal,
    planejadoAtual,
    comprometido,
    pago,
    aPagar,
    saldoOrcamentoAtual,
    avancoFisico: progresso.avancoPonderado,
    porEtapa,
    porTipoCusto,
  }
}
