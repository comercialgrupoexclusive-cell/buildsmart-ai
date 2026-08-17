// ═══════════════════════════════════════════════════════════════════════════
// Fonte ÚNICA de avanço físico para Planejamento + Medições + RDO.
//
// Árvore: Etapa → Subetapa → Item, sempre derivada do ORÇAMENTO
// (orcamento_itens), nunca de uma árvore paralela. O avanço real de cada
// item fica em planejamento_itens.progresso_executado — não existe outra
// tabela de progresso. Subetapa/Etapa/Obra NÃO têm percentual próprio: são
// sempre recalculados a partir dos itens filhos, ponderados pelo valor do
// orçamento (quantidade × preço unitário, ou valor manual da subetapa
// quando ativo). Esta é a única função de rollup — Planejamento, Medições
// e RDO leem e escrevem por aqui.
//
// O cronograma legado (etapas.percentual_executado, subetapas_cronograma,
// servicos_cronograma) continua existindo só como compatibilidade para
// outros consumidores (Gantt legado, mão de obra/gerenciamento) — este
// módulo nunca lê nem escreve nessas tabelas.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type PlanItemNode = {
  id: string                 // orcamento_itens.id (tipo_linha='item')
  orcamentoId: string
  descricao: string
  codigo: string
  etapaId: string
  subetapaKey: string | null
  valorContratado: number
  progressoExecutado: number
  progressoPlanejado: number
  proximaMedicaoPercentual: number | null
  planId: string | null      // planejamento_itens.id, se já existir
}

export type PlanSubetapaNode = {
  id: string | null          // orcamento_itens.id do header (tipo_linha='subetapa'), quando existir
  nome: string
  etapaId: string
  valorContratado: number
  progressoExecutado: number // ponderado pelos itens filhos
  itens: PlanItemNode[]
}

export type PlanEtapaNode = {
  id: string
  nome: string
  ordem: number
  valorContratado: number
  progressoExecutado: number // ponderado por subetapas + itens soltos
  subetapas: PlanSubetapaNode[]
  itensSoltos: PlanItemNode[]
}

export type PlanejamentoProgresso = {
  etapas: PlanEtapaNode[]
  valorTotal: number
  avancoPonderado: number
  avancoSimples: number
  temValores: boolean
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
export const clampPct = (v: number) => (isNaN(v) ? 0 : Math.min(100, Math.max(0, v)))

function mediaPonderada(pares: { valor: number; peso: number }[]): number {
  const pesoTotal = pares.reduce((acc, p) => acc + p.peso, 0)
  if (pesoTotal > 0) return pares.reduce((acc, p) => acc + p.valor * p.peso, 0) / pesoTotal
  if (pares.length === 0) return 0
  return pares.reduce((acc, p) => acc + p.valor, 0) / pares.length
}

/**
 * Carrega a árvore Etapa → Subetapa → Item de um ou mais orçamentos, com o
 * avanço executado ponderado por valor em cada nível.
 */
export async function loadPlanejamentoProgresso(
  supabase: SupabaseClient,
  orcamentoIds: string[],
): Promise<PlanejamentoProgresso> {
  if (orcamentoIds.length === 0) {
    return { etapas: [], valorTotal: 0, avancoPonderado: 0, avancoSimples: 0, temValores: false }
  }

  const [{ data: etapasData }, { data: itensData }, { data: planData }] = await Promise.all([
    supabase.from('etapas').select('id, nome, ordem, orcamento_id').in('orcamento_id', orcamentoIds).order('ordem'),
    supabase.from('orcamento_itens')
      .select('id, orcamento_id, etapa_id, subetapa, tipo_linha, descricao_snapshot, codigo_snapshot, quantidade, preco_unitario_snapshot, subetapa_valor_manual, subetapa_valor_manual_ativo')
      .in('orcamento_id', orcamentoIds),
    supabase.from('planejamento_itens')
      .select('id, orcamento_item_id, ref_tipo, progresso_executado, progresso_planejado, proxima_medicao_percentual')
      .in('orcamento_id', orcamentoIds)
      .eq('ref_tipo', 'item'),
  ])

  type RawEtapa = { id: string; nome: string; ordem: number; orcamento_id: string }
  type RawItem = {
    id: string; orcamento_id: string; etapa_id: string | null; subetapa: string | null; tipo_linha: string
    descricao_snapshot: string | null; codigo_snapshot: string | null
    quantidade: number; preco_unitario_snapshot: number
    subetapa_valor_manual: number | null; subetapa_valor_manual_ativo: boolean
  }
  type RawPlan = {
    id: string
    orcamento_item_id: string | null
    progresso_executado: number
    progresso_planejado: number
    proxima_medicao_percentual: number | null
  }

  const etapas = (etapasData || []) as RawEtapa[]
  const itens = (itensData || []) as RawItem[]
  const planByOrcItem = new Map<string, RawPlan>()
  ;((planData || []) as RawPlan[]).forEach(p => { if (p.orcamento_item_id) planByOrcItem.set(p.orcamento_item_id, p) })

  const headersPorEtapa = new Map<string, Map<string, RawItem>>() // etapaId -> subetapaNome -> header row
  itens.filter(it => it.tipo_linha === 'subetapa' && it.etapa_id).forEach(h => {
    const nome = (h.subetapa || '').trim()
    if (!nome) return
    if (!headersPorEtapa.has(h.etapa_id!)) headersPorEtapa.set(h.etapa_id!, new Map())
    headersPorEtapa.get(h.etapa_id!)!.set(nome, h)
  })

  const itensPorEtapa = new Map<string, RawItem[]>()
  itens.filter(it => it.tipo_linha === 'item' && it.etapa_id).forEach(it => {
    if (!itensPorEtapa.has(it.etapa_id!)) itensPorEtapa.set(it.etapa_id!, [])
    itensPorEtapa.get(it.etapa_id!)!.push(it)
  })

  function toItemNode(it: RawItem): PlanItemNode {
    const plan = planByOrcItem.get(it.id) || null
    return {
      id: it.id,
      orcamentoId: it.orcamento_id,
      descricao: it.descricao_snapshot || '(sem descrição)',
      codigo: it.codigo_snapshot || '—',
      etapaId: it.etapa_id!,
      subetapaKey: it.subetapa?.trim() || null,
      valorContratado: num(it.quantidade) * num(it.preco_unitario_snapshot),
      progressoExecutado: clampPct(num(plan?.progresso_executado)),
      progressoPlanejado: clampPct(num(plan?.progresso_planejado)),
      proximaMedicaoPercentual: plan?.proxima_medicao_percentual == null
        ? null
        : clampPct(num(plan.proxima_medicao_percentual)),
      planId: plan?.id || null,
    }
  }

  const etapaNodes: PlanEtapaNode[] = etapas.map(e => {
    const etapaItens = itensPorEtapa.get(e.id) || []
    const headers = headersPorEtapa.get(e.id) || new Map<string, RawItem>()

    const grupos = new Map<string, RawItem[]>()
    const soltos: RawItem[] = []
    etapaItens.forEach(it => {
      const nome = it.subetapa?.trim()
      if (!nome) { soltos.push(it); return }
      if (!grupos.has(nome)) grupos.set(nome, [])
      grupos.get(nome)!.push(it)
    })

    const subetapas: PlanSubetapaNode[] = [...grupos.entries()].map(([nome, grupoItens]) => {
      const nodeItens = grupoItens.map(toItemNode)
      const header = headers.get(nome) || null
      const valorManualAtivo = header?.subetapa_valor_manual_ativo && header.subetapa_valor_manual != null
      const valorContratado = valorManualAtivo
        ? num(header!.subetapa_valor_manual)
        : nodeItens.reduce((acc, i) => acc + i.valorContratado, 0)
      const progressoExecutado = mediaPonderada(nodeItens.map(i => ({ valor: i.progressoExecutado, peso: i.valorContratado })))
      return { id: header?.id || null, nome, etapaId: e.id, valorContratado, progressoExecutado, itens: nodeItens }
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    const itensSoltos = soltos.map(toItemNode)

    const valorContratado = subetapas.reduce((acc, s) => acc + s.valorContratado, 0)
      + itensSoltos.reduce((acc, i) => acc + i.valorContratado, 0)
    const progressoExecutado = mediaPonderada([
      ...subetapas.map(s => ({ valor: s.progressoExecutado, peso: s.valorContratado })),
      ...itensSoltos.map(i => ({ valor: i.progressoExecutado, peso: i.valorContratado })),
    ])

    return { id: e.id, nome: e.nome, ordem: e.ordem, valorContratado, progressoExecutado, subetapas, itensSoltos }
  }).sort((a, b) => a.ordem - b.ordem)

  const valorTotal = etapaNodes.reduce((acc, e) => acc + e.valorContratado, 0)
  const temValores = valorTotal > 0
  const avancoSimples = etapaNodes.length > 0
    ? etapaNodes.reduce((acc, e) => acc + e.progressoExecutado, 0) / etapaNodes.length
    : 0
  const avancoPonderado = temValores
    ? etapaNodes.reduce((acc, e) => acc + e.progressoExecutado * e.valorContratado, 0) / valorTotal
    : avancoSimples

  return { etapas: etapaNodes, valorTotal, avancoPonderado, avancoSimples, temValores }
}

/**
 * Único ponto de escrita do avanço real de um item. Faz upsert em
 * planejamento_itens (ref_tipo='item') — nunca escreve em subetapa/etapa
 * (elas são sempre calculadas, regra 8) nem no cronograma legado (regra 4).
 */
export async function setItemProgresso(
  supabase: SupabaseClient,
  params: {
    orcamentoId: string
    obraId: string
    orcamentoItemId: string
    etapaId: string
    subetapaKey: string | null
    percentual: number
  },
): Promise<void> {
  const pct = clampPct(params.percentual)
  const { data: existente } = await supabase
    .from('planejamento_itens')
    .select('id, proxima_medicao_percentual')
    .eq('orcamento_id', params.orcamentoId)
    .eq('ref_tipo', 'item')
    .eq('orcamento_item_id', params.orcamentoItemId)
    .maybeSingle()

  if (existente) {
    const proximaAtual = existente.proxima_medicao_percentual == null
      ? null
      : clampPct(num(existente.proxima_medicao_percentual))
    const { error } = await supabase
      .from('planejamento_itens')
      .update({
        progresso_executado: pct,
        proxima_medicao_percentual: proximaAtual != null && proximaAtual < pct ? pct : proximaAtual,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('planejamento_itens')
      .insert({
        obra_id: params.obraId,
        orcamento_id: params.orcamentoId,
        ref_tipo: 'item',
        etapa_id: params.etapaId,
        subetapa_key: params.subetapaKey,
        orcamento_item_id: params.orcamentoItemId,
        progresso_executado: pct,
      })
    if (error) throw error
  }
}

/** Previsão operacional acumulada da próxima medição, ligada ao mesmo item. */
export async function setItemProximaMedicao(
  supabase: SupabaseClient,
  params: {
    orcamentoId: string
    obraId: string
    orcamentoItemId: string
    etapaId: string
    subetapaKey: string | null
    percentual: number
  },
): Promise<void> {
  const { data: existente, error: loadError } = await supabase
    .from('planejamento_itens')
    .select('id, progresso_executado')
    .eq('orcamento_id', params.orcamentoId)
    .eq('ref_tipo', 'item')
    .eq('orcamento_item_id', params.orcamentoItemId)
    .maybeSingle()
  if (loadError) throw loadError

  const executado = clampPct(num(existente?.progresso_executado))
  const proxima = Math.max(executado, clampPct(params.percentual))
  if (existente) {
    const { error } = await supabase
      .from('planejamento_itens')
      .update({ proxima_medicao_percentual: proxima, updated_at: new Date().toISOString() })
      .eq('id', existente.id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('planejamento_itens').insert({
    obra_id: params.obraId,
    orcamento_id: params.orcamentoId,
    ref_tipo: 'item',
    etapa_id: params.etapaId,
    subetapa_key: params.subetapaKey,
    orcamento_item_id: params.orcamentoItemId,
    progresso_executado: 0,
    proxima_medicao_percentual: proxima,
  })
  if (error) throw error
}

/** Cor por percentual — mesmo padrão do app. */
export function corPorPercentual(p: number): string {
  if (p >= 100) return 'var(--success)'
  if (p >= 50) return 'var(--accent)'
  if (p > 0) return 'var(--warning)'
  return 'var(--text-secondary)'
}
