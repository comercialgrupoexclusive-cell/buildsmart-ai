// ═══════════════════════════════════════════════════════════════════════════
// Avanço físico da obra — fonte ÚNICA de "quanto foi feito".
//
// O cronograma (etapas → subetapas_cronograma → servicos_cronograma) guarda o
// percentual_executado real em cada nível. As quantidades e valores vivem no
// orçamento (orcamento_itens.quantidade × preco_unitario_snapshot), ligados à
// etapa por etapa_id. Aqui juntamos os dois para produzir o avanço PONDERADO
// POR VALOR (como fazem Sienge, Procore etc.) em vez de média simples.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type ServicoProg = { id: string; nome: string; percentual: number }
export type AvancoEixo = 'fisico' | 'mao_obra' | 'gerenciamento'
export type SubetapaProg = { id: string; nome: string; percentual: number; valorContratado: number; servicos: ServicoProg[] }
export type EtapaProg = {
  id: string
  nome: string
  ordem: number
  percentual: number      // avanço acumulado da etapa (rolado do cronograma)
  valorContratado: number // R$ do orçamento alocado nesta etapa
  data_inicio: string | null
  data_fim: string | null
  subetapas: SubetapaProg[]
}

export type ObraProgresso = {
  etapas: EtapaProg[]
  valorTotal: number         // Σ valor contratado das etapas
  avancoPonderado: number    // % ponderado por valor (0-100)
  avancoSimples: number      // % média simples das etapas (fallback / comparação)
  temValores: boolean        // false = orçamento sem valores → usar média simples
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

/**
 * Carrega o cronograma da obra + valores do orçamento e devolve o avanço
 * ponderado por valor. Se a obra não tiver valores no orçamento, cai para a
 * média simples das etapas (sinalizado por `temValores: false`).
 */
export async function loadObraProgresso(
  supabase: SupabaseClient,
  obraId: string,
  eixo: AvancoEixo = 'fisico',
  orcamentoIds?: string[],
): Promise<ObraProgresso> {
  let orcamentosQuery = supabase.from('orcamentos').select('id,gerenciamento_percentual,gerenciamento_distribuicao').eq('obra_id', obraId)
  if (orcamentoIds?.length) orcamentosQuery = orcamentosQuery.in('id', orcamentoIds)

  const [{ data: etapasData }, { data: orcamentos }] = await Promise.all([
    supabase
      .from('etapas')
      .select('id, nome, ordem, percentual_executado, percentual_mao_obra, percentual_gerenciamento, data_inicio, data_fim, subetapas_cronograma(id, nome, percentual_executado, percentual_mao_obra, percentual_gerenciamento, ordem, servicos_cronograma(id, nome, percentual_executado, percentual_mao_obra, percentual_gerenciamento, ordem))')
      .eq('obra_id', obraId)
      .order('ordem'),
    orcamentosQuery,
  ])

  // Valor contratado por etapa = Σ (quantidade × preço unit) dos itens do orçamento
  const orcRows = (orcamentos || []) as { id: string; gerenciamento_percentual: number; gerenciamento_distribuicao: Record<string, number> | null }[]
  const orcIds = orcRows.map(o => o.id)
  const fatorGerenciamento = new Map(orcRows.map(o => [o.id, 1 + num(o.gerenciamento_percentual) / 100]))
  const valorPorEtapa: Record<string, number> = {}
  const valorPorSubetapa = new Map<string, number>()
  const subetapasMaoObraPorEtapa = new Map<string, Set<string>>()
  if (orcIds.length > 0) {
    const { data: itens } = await supabase
      .from('orcamento_itens')
      .select('orcamento_id, etapa_id, subetapa, tipo_linha, descricao_snapshot, quantidade, preco_unitario_snapshot, classificacao_snapshot, subetapa_valor_manual, subetapa_valor_manual_ativo')
      .in('orcamento_id', orcIds)
    type OrcItem = { orcamento_id: string; etapa_id: string | null; subetapa: string | null; tipo_linha: string; descricao_snapshot: string | null; quantidade: number; preco_unitario_snapshot: number; classificacao_snapshot: string | null; subetapa_valor_manual: number | null; subetapa_valor_manual_ativo: boolean }
    const somaPorSub = new Map<string, number>()
    const manualPorSub = new Map<string, number>()
    ;((itens || []) as OrcItem[]).forEach(it => {
        if (!it.etapa_id) return
        const itemMaoObra = normalizarClassificacao(it.classificacao_snapshot) === 'MAO_DE_OBRA' || descricaoMaoObra(it.descricao_snapshot)
        if (eixo === 'mao_obra' && !itemMaoObra) return
        const fator = eixo === 'fisico' ? (fatorGerenciamento.get(it.orcamento_id) || 1) : eixo === 'gerenciamento' ? Math.max(0, (fatorGerenciamento.get(it.orcamento_id) || 1) - 1) : 1
        const chaveSub = `${it.etapa_id}::${normalizarNome(it.subetapa || '')}`
        if (it.tipo_linha === 'subetapa') {
          if (it.subetapa_valor_manual_ativo) manualPorSub.set(chaveSub, num(it.subetapa_valor_manual) * fator)
          return
        }
        somaPorSub.set(chaveSub, (somaPorSub.get(chaveSub) || 0) + num(it.quantidade) * num(it.preco_unitario_snapshot) * fator)
        if (eixo === 'mao_obra' && it.subetapa) {
          const nomes = subetapasMaoObraPorEtapa.get(it.etapa_id) || new Set<string>()
          nomes.add(normalizarNome(it.subetapa))
          subetapasMaoObraPorEtapa.set(it.etapa_id, nomes)
        }
      })
    for (const chave of new Set([...somaPorSub.keys(), ...manualPorSub.keys()])) {
      const valor = manualPorSub.has(chave) ? manualPorSub.get(chave)! : (somaPorSub.get(chave) || 0)
      valorPorSubetapa.set(chave, valor)
      const etapaId = chave.split('::')[0]
      valorPorEtapa[etapaId] = (valorPorEtapa[etapaId] || 0) + valor
    }
    if (eixo === 'gerenciamento') {
      const totalGerenciamento = [...valorPorSubetapa.values()].reduce((soma, valor) => soma + valor, 0)
      const distribuicao = orcRows.length === 1 ? orcRows[0].gerenciamento_distribuicao || {} : {}
      if (Object.keys(distribuicao).length > 0 && totalGerenciamento > 0) {
        valorPorSubetapa.clear()
        for (const etapaId of Object.keys(valorPorEtapa)) valorPorEtapa[etapaId] = 0
        for (const [chaveDistribuicao, percentual] of Object.entries(distribuicao)) {
          const valor = totalGerenciamento * num(percentual) / 100
          valorPorSubetapa.set(chaveDistribuicao, valor)
          const etapaId = chaveDistribuicao.split('::')[0]
          valorPorEtapa[etapaId] = (valorPorEtapa[etapaId] || 0) + valor
        }
      }
    }
  }

  type RawEtapa = {
    id: string; nome: string; ordem: number; percentual_executado: number; percentual_mao_obra: number; percentual_gerenciamento: number
    data_inicio: string | null; data_fim: string | null
    subetapas_cronograma: { id: string; nome: string; percentual_executado: number; percentual_mao_obra: number; percentual_gerenciamento: number; ordem: number; servicos_cronograma: { id: string; nome: string; percentual_executado: number; percentual_mao_obra: number; percentual_gerenciamento: number; ordem: number }[] }[]
  }

  const percentualDe = (item: { percentual_executado: number; percentual_mao_obra: number; percentual_gerenciamento: number }) =>
    num(eixo === 'mao_obra' ? item.percentual_mao_obra : eixo === 'gerenciamento' ? item.percentual_gerenciamento : item.percentual_executado)

  const etapas: EtapaProg[] = ((etapasData || []) as RawEtapa[]).map(e => {
    const subetapas = (e.subetapas_cronograma || [])
      .sort((a, b) => a.ordem - b.ordem)
      .filter(s => eixo !== 'mao_obra' || subetapasMaoObraPorEtapa.get(e.id)?.has(normalizarNome(s.nome)) || s.servicos_cronograma.some(v => descricaoMaoObra(v.nome)))
      .map(s => ({
        id: s.id,
        nome: s.nome,
        percentual: percentualDe(s),
        valorContratado: valorPorSubetapa.get(`${e.id}::${normalizarNome(s.nome)}`) || 0,
        servicos: (s.servicos_cronograma || [])
          .sort((a, b) => a.ordem - b.ordem)
          .filter(v => eixo === 'fisico' || (eixo === 'mao_obra' && descricaoMaoObra(v.nome)))
          .map(v => ({ id: v.id, nome: v.nome, percentual: percentualDe(v) })),
      }))
    const valorContratado = valorPorEtapa[e.id] || 0
    const valorSubetapas = subetapas.reduce((total, sub) => total + sub.valorContratado, 0)
    const valorResidual = Math.max(0, valorContratado - valorSubetapas)
    const percentual = valorContratado > 0 && valorSubetapas > 0
      ? (subetapas.reduce((total, sub) => total + sub.percentual * sub.valorContratado, 0) + percentualDe(e) * valorResidual) / valorContratado
      : percentualDe(e)
    return {
      id: e.id,
      nome: e.nome,
      ordem: e.ordem,
      percentual,
      valorContratado,
      data_inicio: e.data_inicio,
      data_fim: e.data_fim,
      subetapas,
    }
  }).filter(e => eixo === 'fisico' || e.valorContratado > 0)

  const valorTotal = etapas.reduce((acc, e) => acc + e.valorContratado, 0)
  const temValores = valorTotal > 0

  const avancoSimples = etapas.length > 0
    ? etapas.reduce((acc, e) => acc + e.percentual, 0) / etapas.length
    : 0

  const avancoPonderado = temValores
    ? etapas.reduce((acc, e) => acc + e.percentual * e.valorContratado, 0) / valorTotal
    : avancoSimples

  return { etapas, valorTotal, avancoPonderado, avancoSimples, temValores }
}

/**
 * Aplica novos percentuais em serviços do cronograma e propaga para cima:
 * serviço → subetapa (média dos serviços) → etapa (média das subetapas).
 * É o elo que faz um lançamento de RDO/campo atualizar o avanço da obra.
 */
export async function propagarAvancoServicos(
  supabase: SupabaseClient,
  obraId: string,
  updates: { servicoId: string; percentual: number }[],
  eixo: AvancoEixo = 'fisico',
): Promise<void> {
  if (updates.length === 0) return
  const alvo = new Map(updates.map(u => [u.servicoId, clampPct(u.percentual)]))

  // Carrega a árvore para recalcular os pais afetados
  const { data: etapasData } = await supabase
    .from('etapas')
    .select('id, percentual_executado, percentual_mao_obra, percentual_gerenciamento, subetapas_cronograma(id, percentual_executado, percentual_mao_obra, percentual_gerenciamento, servicos_cronograma(id, percentual_executado, percentual_mao_obra, percentual_gerenciamento))')
    .eq('obra_id', obraId)

  type PctRaw = { percentual_executado: number; percentual_mao_obra: number; percentual_gerenciamento: number }
  type Raw = PctRaw & { id: string; subetapas_cronograma: (PctRaw & { id: string; servicos_cronograma: (PctRaw & { id: string })[] })[] }
  const campo = eixo === 'mao_obra' ? 'percentual_mao_obra' : eixo === 'gerenciamento' ? 'percentual_gerenciamento' : 'percentual_executado'
  const atual = (item: PctRaw) => num(item[campo])

  const svcUpdates: { id: string; percentual_executado: number }[] = []
  const subUpdates: { id: string; percentual_executado: number; status: string }[] = []
  const etaUpdates: { id: string; percentual_executado: number; status: string }[] = []

  const statusDe = (p: number) => (p >= 100 ? 'concluida' : p > 0 ? 'em_andamento' : 'planejada')

  for (const eta of (etapasData || []) as Raw[]) {
    const subs = eta.subetapas_cronograma || []
    let etaTemMudanca = false
    const subPcts: number[] = []
    for (const sub of subs) {
      const svcs = sub.servicos_cronograma || []
      let subTemMudanca = false
      const novosSvc = svcs.map(sv => {
        if (alvo.has(sv.id)) {
          const novo = alvo.get(sv.id)!
          if (novo !== atual(sv)) { svcUpdates.push({ id: sv.id, percentual_executado: novo }); subTemMudanca = true }
          return novo
        }
        return atual(sv)
      })
      const subPct = novosSvc.length > 0 ? novosSvc.reduce((a, b) => a + b, 0) / novosSvc.length : atual(sub)
      subPcts.push(subPct)
      if (subTemMudanca && subPct !== atual(sub)) {
        subUpdates.push({ id: sub.id, percentual_executado: subPct, status: statusDe(subPct) })
        etaTemMudanca = true
      } else if (subTemMudanca) {
        etaTemMudanca = true
      }
    }
    if (etaTemMudanca && subPcts.length > 0) {
      const etaPct = subPcts.reduce((a, b) => a + b, 0) / subPcts.length
      if (etaPct !== atual(eta)) {
        etaUpdates.push({ id: eta.id, percentual_executado: etaPct, status: statusDe(etaPct) })
      }
    }
  }

  // Persiste em paralelo
  await Promise.all([
    ...svcUpdates.map(u => supabase.from('servicos_cronograma').update({ [campo]: u.percentual_executado }).eq('id', u.id)),
    ...subUpdates.map(u => supabase.from('subetapas_cronograma').update(eixo === 'fisico' ? { [campo]: u.percentual_executado, status: u.status } : { [campo]: u.percentual_executado }).eq('id', u.id)),
    ...etaUpdates.map(u => supabase.from('etapas').update(eixo === 'fisico' ? { [campo]: u.percentual_executado, status: u.status } : { [campo]: u.percentual_executado }).eq('id', u.id)),
  ])
}

function normalizarClassificacao(value: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
}

function normalizarNome(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function descricaoMaoObra(value: string | null): boolean {
  return /mao\s+de\s+obra/i.test(normalizarNome(value || ''))
}

/** Cor por percentual — padrão do app. */
export function corPorPercentual(p: number): string {
  if (p >= 100) return 'var(--success)'
  if (p >= 50) return 'var(--accent)'
  if (p > 0) return 'var(--warning)'
  return 'var(--text-secondary)'
}

export const clampPct = (v: number) => (isNaN(v) ? 0 : Math.min(100, Math.max(0, v)))
