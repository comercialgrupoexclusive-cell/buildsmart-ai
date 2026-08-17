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

type OrcRow = { id: string; bdi_percentual: number | null }
type OrcItemRow = { orcamento_id: string; etapa_id: string | null; quantidade: number; preco_unitario_snapshot: number }
type BaselineItemRow = { orcamento_id: string; quantidade: number; preco_unitario_snapshot: number }
type CompraRow = {
  orcamento_id: string | null; etapa_id: string | null
  valor_total: number | null; status_valor: 'confirmado' | 'estimado'
  status_pagamento: 'pendente' | 'pago'; tipo_custo: TipoCusto | null
}

function valorComBdi(itens: { quantidade: number; preco_unitario_snapshot: number }[], bdiPercentual: number) {
  const subtotal = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.preco_unitario_snapshot || 0), 0)
  return subtotal * (1 + Number(bdiPercentual || 0) / 100)
}

export async function loadFinanceiroResumo(
  supabase: SupabaseClient,
  params: { obraId: string; orcamentoId: string; orcamentoIds: string[] },
): Promise<FinanceiroResumo> {
  const { obraId, orcamentoId, orcamentoIds } = params
  const consolidado = orcamentoId === TODOS_ORCAMENTOS
  const idsAtivos = consolidado ? orcamentoIds : orcamentoIds.filter(id => id === orcamentoId)

  const [orcRes, orcItensRes, baselineRes, etapasRes, comprasRes, progresso] = await Promise.all([
    idsAtivos.length ? supabase.from('orcamentos').select('id, bdi_percentual').in('id', idsAtivos) : Promise.resolve({ data: [] }),
    idsAtivos.length ? supabase.from('orcamento_itens').select('orcamento_id, etapa_id, quantidade, preco_unitario_snapshot').in('orcamento_id', idsAtivos) : Promise.resolve({ data: [] }),
    idsAtivos.length ? supabase.from('orcamento_itens_baseline').select('orcamento_id, quantidade, preco_unitario_snapshot').in('orcamento_id', idsAtivos) : Promise.resolve({ data: [] }),
    supabase.from('etapas').select('id, nome').eq('obra_id', obraId),
    supabase.from('compra_itens').select('orcamento_id, etapa_id, valor_total, status_valor, status_pagamento, tipo_custo').eq('obra_id', obraId),
    loadPlanejamentoProgresso(supabase, idsAtivos),
  ])

  const orcs = (orcRes.data || []) as OrcRow[]
  const bdiPorOrcamento = new Map(orcs.map(o => [o.id, Number(o.bdi_percentual ?? 0)]))
  const orcItens = (orcItensRes.data || []) as OrcItemRow[]
  const baselineItens = (baselineRes.data || []) as BaselineItemRow[]
  const etapaNomePorId = new Map(((etapasRes.data || []) as { id: string; nome: string }[]).map(e => [e.id, e.nome]))

  const todasCompras = (comprasRes.data || []) as CompraRow[]
  const compras = todasCompras.filter(c => consolidado
    ? (!c.orcamento_id || orcamentoIds.includes(c.orcamento_id))
    : c.orcamento_id === orcamentoId)

  // Planejado atual: orçamento(s) ativo(s), com BDI, sempre a partir de
  // orcamento_itens (nunca valor_contrato — essa é outra métrica).
  const planejadoAtual = orcs.reduce((total, orc) => {
    const itensDoOrc = orcItens.filter(i => i.orcamento_id === orc.id)
    return total + valorComBdi(itensDoOrc, bdiPorOrcamento.get(orc.id) ?? 0)
  }, 0)

  // Planejado original: baseline. Se nenhum dos orçamentos ativos tem
  // baseline capturada, o valor é null (não é a mesma coisa que R$ 0).
  const orcamentosComBaseline = new Set(baselineItens.map(i => i.orcamento_id))
  const planejadoOriginal = orcamentosComBaseline.size === 0 ? null : orcs.reduce((total, orc) => {
    if (!orcamentosComBaseline.has(orc.id)) return total
    const itensBaseline = baselineItens.filter(i => i.orcamento_id === orc.id)
    return total + valorComBdi(itensBaseline, bdiPorOrcamento.get(orc.id) ?? 0)
  }, 0)

  // Comprometido/Contratado e Pago — nunca chamados de "realizado": um
  // lançamento confirmado é um compromisso, não necessariamente dinheiro
  // que já saiu do caixa.
  const comprometido = compras.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0)
  const pago = compras.filter(c => c.status_valor === 'confirmado' && c.status_pagamento === 'pago').reduce((s, c) => s + Number(c.valor_total || 0), 0)
  const aPagar = Math.max(0, comprometido - pago)
  const saldoOrcamentoAtual = planejadoAtual - comprometido

  const etapaIds = new Set<string>()
  orcItens.forEach(i => { if (i.etapa_id) etapaIds.add(i.etapa_id) })
  compras.forEach(c => { if (c.etapa_id) etapaIds.add(c.etapa_id) })
  const porEtapa: FinanceiroPorEtapa[] = [...etapaIds].map(etapaId => {
    const itensDaEtapa = orcItens.filter(i => i.etapa_id === etapaId)
    const planejadoAtualEtapa = orcs.reduce((total, orc) => {
      const itens = itensDaEtapa.filter(i => i.orcamento_id === orc.id)
      return total + valorComBdi(itens, bdiPorOrcamento.get(orc.id) ?? 0)
    }, 0)
    const comprasDaEtapa = compras.filter(c => c.etapa_id === etapaId)
    return {
      etapaId,
      etapaNome: etapaNomePorId.get(etapaId) || 'Etapa',
      planejadoAtual: planejadoAtualEtapa,
      comprometido: comprasDaEtapa.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0),
      pago: comprasDaEtapa.filter(c => c.status_valor === 'confirmado' && c.status_pagamento === 'pago').reduce((s, c) => s + Number(c.valor_total || 0), 0),
    }
  }).sort((a, b) => b.planejadoAtual - a.planejadoAtual)
  const comprasSemEtapa = compras.filter(c => !c.etapa_id)
  if (comprasSemEtapa.length > 0) {
    porEtapa.push({
      etapaId: null,
      etapaNome: 'Sem etapa',
      planejadoAtual: 0,
      comprometido: comprasSemEtapa.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0),
      pago: comprasSemEtapa.filter(c => c.status_valor === 'confirmado' && c.status_pagamento === 'pago').reduce((s, c) => s + Number(c.valor_total || 0), 0),
    })
  }

  const tiposPresentes = new Set<TipoCusto | 'nao_classificado'>()
  compras.forEach(c => tiposPresentes.add(c.tipo_custo || 'nao_classificado'))
  const porTipoCusto: FinanceiroPorTipoCusto[] = [...tiposPresentes].map(tipo => {
    const comprasDoTipo = compras.filter(c => (c.tipo_custo || 'nao_classificado') === tipo)
    return {
      tipo,
      comprometido: comprasDoTipo.filter(c => c.status_valor === 'confirmado').reduce((s, c) => s + Number(c.valor_total || 0), 0),
      pago: comprasDoTipo.filter(c => c.status_valor === 'confirmado' && c.status_pagamento === 'pago').reduce((s, c) => s + Number(c.valor_total || 0), 0),
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
