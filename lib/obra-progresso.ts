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
export type SubetapaProg = { id: string; nome: string; percentual: number; servicos: ServicoProg[] }
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
): Promise<ObraProgresso> {
  const [{ data: etapasData }, { data: orcamentos }] = await Promise.all([
    supabase
      .from('etapas')
      .select('id, nome, ordem, percentual_executado, data_inicio, data_fim, subetapas_cronograma(id, nome, percentual_executado, ordem, servicos_cronograma(id, nome, percentual_executado, ordem))')
      .eq('obra_id', obraId)
      .order('ordem'),
    supabase.from('orcamentos').select('id').eq('obra_id', obraId),
  ])

  // Valor contratado por etapa = Σ (quantidade × preço unit) dos itens do orçamento
  const orcIds = ((orcamentos || []) as { id: string }[]).map(o => o.id)
  const valorPorEtapa: Record<string, number> = {}
  if (orcIds.length > 0) {
    const { data: itens } = await supabase
      .from('orcamento_itens')
      .select('etapa_id, quantidade, preco_unitario_snapshot')
      .in('orcamento_id', orcIds)
    ;((itens || []) as { etapa_id: string | null; quantidade: number; preco_unitario_snapshot: number }[])
      .forEach(it => {
        if (!it.etapa_id) return
        valorPorEtapa[it.etapa_id] = (valorPorEtapa[it.etapa_id] || 0) + num(it.quantidade) * num(it.preco_unitario_snapshot)
      })
  }

  type RawEtapa = {
    id: string; nome: string; ordem: number; percentual_executado: number
    data_inicio: string | null; data_fim: string | null
    subetapas_cronograma: { id: string; nome: string; percentual_executado: number; ordem: number; servicos_cronograma: { id: string; nome: string; percentual_executado: number; ordem: number }[] }[]
  }

  const etapas: EtapaProg[] = ((etapasData || []) as RawEtapa[]).map(e => ({
    id: e.id,
    nome: e.nome,
    ordem: e.ordem,
    percentual: num(e.percentual_executado),
    valorContratado: valorPorEtapa[e.id] || 0,
    data_inicio: e.data_inicio,
    data_fim: e.data_fim,
    subetapas: (e.subetapas_cronograma || [])
      .sort((a, b) => a.ordem - b.ordem)
      .map(s => ({
        id: s.id,
        nome: s.nome,
        percentual: num(s.percentual_executado),
        servicos: (s.servicos_cronograma || [])
          .sort((a, b) => a.ordem - b.ordem)
          .map(v => ({ id: v.id, nome: v.nome, percentual: num(v.percentual_executado) })),
      })),
  }))

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
): Promise<void> {
  if (updates.length === 0) return
  const alvo = new Map(updates.map(u => [u.servicoId, clampPct(u.percentual)]))

  // Carrega a árvore para recalcular os pais afetados
  const { data: etapasData } = await supabase
    .from('etapas')
    .select('id, percentual_executado, subetapas_cronograma(id, percentual_executado, servicos_cronograma(id, percentual_executado))')
    .eq('obra_id', obraId)

  type Raw = { id: string; percentual_executado: number; subetapas_cronograma: { id: string; percentual_executado: number; servicos_cronograma: { id: string; percentual_executado: number }[] }[] }

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
          if (novo !== num(sv.percentual_executado)) { svcUpdates.push({ id: sv.id, percentual_executado: novo }); subTemMudanca = true }
          return novo
        }
        return num(sv.percentual_executado)
      })
      const subPct = novosSvc.length > 0 ? novosSvc.reduce((a, b) => a + b, 0) / novosSvc.length : num(sub.percentual_executado)
      subPcts.push(subPct)
      if (subTemMudanca && subPct !== num(sub.percentual_executado)) {
        subUpdates.push({ id: sub.id, percentual_executado: subPct, status: statusDe(subPct) })
        etaTemMudanca = true
      } else if (subTemMudanca) {
        etaTemMudanca = true
      }
    }
    if (etaTemMudanca && subPcts.length > 0) {
      const etaPct = subPcts.reduce((a, b) => a + b, 0) / subPcts.length
      if (etaPct !== num(eta.percentual_executado)) {
        etaUpdates.push({ id: eta.id, percentual_executado: etaPct, status: statusDe(etaPct) })
      }
    }
  }

  // Persiste em paralelo
  await Promise.all([
    ...svcUpdates.map(u => supabase.from('servicos_cronograma').update({ percentual_executado: u.percentual_executado }).eq('id', u.id)),
    ...subUpdates.map(u => supabase.from('subetapas_cronograma').update({ percentual_executado: u.percentual_executado, status: u.status }).eq('id', u.id)),
    ...etaUpdates.map(u => supabase.from('etapas').update({ percentual_executado: u.percentual_executado, status: u.status }).eq('id', u.id)),
  ])
}

/** Cor por percentual — padrão do app. */
export function corPorPercentual(p: number): string {
  if (p >= 100) return 'var(--success)'
  if (p >= 50) return 'var(--accent)'
  if (p > 0) return 'var(--warning)'
  return 'var(--text-secondary)'
}

export const clampPct = (v: number) => (isNaN(v) ? 0 : Math.min(100, Math.max(0, v)))
