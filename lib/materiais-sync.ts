// ═══════════════════════════════════════════════════════════════════════════
// Fonte ÚNICA de sincronização Orçamento → Materiais.
//
// Substitui as duas implementações divergentes que existiam (uma em
// ObraOrcamento.tsx sem orcamento_id na chave, outra em ObraMateriais.tsx com
// chave diferente) — daqui pra frente as duas telas chamam esta função.
//
// Caminho: Etapa → Subetapa (id estável) → Item do orçamento → Insumo. Para
// cada item, expande a composição (própria ou SINAPI) em insumos e soma a
// necessidade por (etapa, subetapa, código do insumo) — a mesma linha de
// material sempre recebe a mesma identidade, então rodar a sincronização
// várias vezes atualiza a mesma linha em vez de criar outra (upsert atômico
// via RPC, sobre o índice único uq_materiais_identidade). Nunca mexe em
// quantidade_comprada/status_compra/data_recebimento — isso é histórico de
// compra e não pode ser perdido numa sincronização.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type SincronizarMateriaisResultado = { criados: number; atualizados: number }

type OrcItem = {
  id: string
  etapa_id: string | null
  subetapa: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  codigo_snapshot: string | null
  descricao_snapshot: string | null
  unidade_snapshot: string | null
  quantidade: number
}

type InsumoJoin = { codigo: string; descricao: string; unidade: string } | null

export async function sincronizarMateriaisDoOrcamento(
  supabase: SupabaseClient,
  params: { obraId: string; orcamentoId: string },
): Promise<SincronizarMateriaisResultado> {
  const { obraId, orcamentoId } = params

  const [{ data: itensData, error: eItens }, { data: headersData, error: eHeaders }] = await Promise.all([
    supabase.from('orcamento_itens')
      .select('id, etapa_id, subetapa, composicao_id, sinapi_composicao_id, codigo_snapshot, descricao_snapshot, unidade_snapshot, quantidade')
      .eq('orcamento_id', orcamentoId).eq('tipo_linha', 'item'),
    supabase.from('orcamento_itens')
      .select('id, etapa_id, subetapa')
      .eq('orcamento_id', orcamentoId).eq('tipo_linha', 'subetapa'),
  ])
  if (eItens) throw eItens
  if (eHeaders) throw eHeaders

  const itens = (itensData || []) as OrcItem[]
  const headers = (headersData || []) as { id: string; etapa_id: string | null; subetapa: string | null }[]
  const headerPorSubetapa = new Map<string, string>()
  headers.forEach(h => {
    const nome = h.subetapa?.trim()
    if (nome) headerPorSubetapa.set(`${h.etapa_id}::${nome}`, h.id)
  })

  const composicaoIds = [...new Set(itens.filter(i => i.composicao_id).map(i => i.composicao_id as string))]
  const sinapiCodigos = [...new Set(itens.filter(i => i.sinapi_composicao_id && i.codigo_snapshot).map(i => i.codigo_snapshot as string))]

  type InsumoComp = { coeficiente: number; codigo: string; descricao: string; unidade: string }
  const insumosPorComposicao = new Map<string, InsumoComp[]>()
  if (composicaoIds.length > 0) {
    const { data, error } = await supabase.from('composicao_insumos')
      .select('composicao_id, coeficiente, insumo:sinapi_insumos(codigo,descricao,unidade), insumo_proprio:insumos_proprios(codigo,descricao,unidade)')
      .in('composicao_id', composicaoIds)
    if (error) throw error
    type Row = { composicao_id: string; coeficiente: number; insumo: InsumoJoin; insumo_proprio: InsumoJoin }
    ;((data || []) as unknown as Row[]).forEach(row => {
      const info = row.insumo || row.insumo_proprio
      if (!info?.codigo) return
      if (!insumosPorComposicao.has(row.composicao_id)) insumosPorComposicao.set(row.composicao_id, [])
      insumosPorComposicao.get(row.composicao_id)!.push({
        coeficiente: Number(row.coeficiente) || 0, codigo: info.codigo,
        descricao: info.descricao || info.codigo, unidade: info.unidade || 'UN',
      })
    })
  }

  type AnaliticoSinapi = { composicao_codigo: string; item_codigo: string; item_descricao: string; item_unidade: string; coeficiente: number }
  const analiticoPorCodigo = new Map<string, AnaliticoSinapi[]>()
  if (sinapiCodigos.length > 0) {
    const { data, error } = await supabase.from('sinapi_composicao_itens')
      .select('composicao_codigo, item_codigo, item_descricao, item_unidade, coeficiente, tipo')
      .in('composicao_codigo', sinapiCodigos).eq('tipo', 'INSUMO')
    if (error) throw error
    ;((data || []) as AnaliticoSinapi[]).forEach(row => {
      if (!analiticoPorCodigo.has(row.composicao_codigo)) analiticoPorCodigo.set(row.composicao_codigo, [])
      analiticoPorCodigo.get(row.composicao_codigo)!.push(row)
    })
  }

  type Acc = { qtd: number; descricao: string; unidade: string }
  const mapa = new Map<string, Acc>()
  const acumular = (etapaId: string | null, subOrcItemId: string | null, codigo: string | null | undefined, descricao: string, unidade: string, qtd: number) => {
    if (!codigo || codigo === '—' || qtd <= 0) return
    const key = `${etapaId ?? 'null'}|${subOrcItemId ?? 'null'}|${codigo}`
    const atual = mapa.get(key)
    if (atual) atual.qtd += qtd
    else mapa.set(key, { qtd, descricao, unidade })
  }

  for (const item of itens) {
    const nomeSub = item.subetapa?.trim()
    const subOrcItemId = nomeSub ? headerPorSubetapa.get(`${item.etapa_id}::${nomeSub}`) || null : null

    if (item.sinapi_composicao_id && item.codigo_snapshot) {
      const analiticos = analiticoPorCodigo.get(item.codigo_snapshot) || []
      if (analiticos.length === 0) {
        // Sem detalhamento analítico importado — lança a própria composição
        // como material (fallback), senão o item não "puxaria" nada.
        acumular(item.etapa_id, subOrcItemId, item.codigo_snapshot, item.descricao_snapshot || item.codigo_snapshot, item.unidade_snapshot || 'UN', item.quantidade)
      } else {
        for (const ins of analiticos) {
          acumular(item.etapa_id, subOrcItemId, ins.item_codigo, ins.item_descricao || ins.item_codigo, ins.item_unidade || 'UN', item.quantidade * ins.coeficiente)
        }
      }
    } else if (item.composicao_id) {
      const lista = insumosPorComposicao.get(item.composicao_id) || []
      if (lista.length === 0) {
        if (item.codigo_snapshot) acumular(item.etapa_id, subOrcItemId, item.codigo_snapshot, item.descricao_snapshot || item.codigo_snapshot, item.unidade_snapshot || 'UN', item.quantidade)
      } else {
        for (const ins of lista) {
          acumular(item.etapa_id, subOrcItemId, ins.codigo, ins.descricao, ins.unidade, item.quantidade * ins.coeficiente)
        }
      }
    }
    // itens digitados manualmente (sem composição vinculada) não geram
    // materiais — não há "receita" de insumos pra puxar.
  }

  const payload = [...mapa.entries()].map(([key, acc]) => {
    const [etapaIdRaw, subRaw, codigo] = key.split('|')
    return {
      etapa_id: etapaIdRaw === 'null' ? null : etapaIdRaw,
      subetapa_orcamento_item_id: subRaw === 'null' ? null : subRaw,
      sinapi_codigo: codigo,
      descricao: acc.descricao,
      unidade: acc.unidade,
      quantidade: Math.round(acc.qtd * 10000) / 10000,
    }
  })

  const { data, error } = await supabase.rpc('sincronizar_materiais_orcamento', {
    p_obra_id: obraId, p_orcamento_id: orcamentoId, p_itens: payload,
  })
  if (error) throw error
  return data as SincronizarMateriaisResultado
}
