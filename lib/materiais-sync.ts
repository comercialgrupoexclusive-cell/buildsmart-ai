// ═══════════════════════════════════════════════════════════════════════════
// Fonte ÚNICA de sincronização Orçamento → Materiais.
//
// Regra central: COMPOSIÇÃO NÃO É MATERIAL. Um item do orçamento só gera
// necessidade de material quando existir (1) insumo real em
// composicao_insumos, (2) INSUMO no analítico SINAPI, ou (3) o próprio item
// estiver explicitamente classificado como material (tipo_item_snapshot=
// 'INSUMO' ou classificacao_snapshot='MATERIAL_SERVICOS') — nunca lançando a
// composição em si como material "de qualquer jeito". Quando uma composição
// não tem detalhamento de insumos, isso vira um AVISO ("Composição sem
// insumos cadastrados"), não uma linha falsa em Materiais.
//
// A sincronização é uma RECONCILIAÇÃO, não só um upsert: o RPC
// sincronizar_materiais_orcamento recebe o conjunto esperado calculado aqui,
// grava (upsert atômico, ON CONFLICT sobre uq_materiais_identidade) e depois
// identifica materiais origem='orcamento' que saíram do conjunto — remove os
// sem histórico (compra/lista/requisição) e marca ativo=false os que têm
// histórico, preservando o registro. Materiais origem='manual' nunca são
// tocados por esta função.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type SincronizarMateriaisResultado = {
  criados: number
  atualizados: number
  reativados: number
  marcados_obsoletos: number
  removidos: number
  avisos: string[]
}

type OrcItem = {
  id: string
  etapa_id: string | null
  subetapa: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  codigo_snapshot: string | null
  descricao_snapshot: string | null
  unidade_snapshot: string | null
  tipo_item_snapshot: string | null
  classificacao_snapshot: string | null
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
      .select('id, etapa_id, subetapa, composicao_id, sinapi_composicao_id, codigo_snapshot, descricao_snapshot, unidade_snapshot, tipo_item_snapshot, classificacao_snapshot, quantidade')
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

  const avisos: string[] = []

  for (const item of itens) {
    const nomeSub = item.subetapa?.trim()
    const subOrcItemId = nomeSub ? headerPorSubetapa.get(`${item.etapa_id}::${nomeSub}`) || null : null

    if (item.composicao_id) {
      // Via 1: insumo real cadastrado na composição própria.
      const lista = insumosPorComposicao.get(item.composicao_id) || []
      if (lista.length === 0) {
        avisos.push(`Composição sem insumos cadastrados: ${item.codigo_snapshot || '—'} — ${item.descricao_snapshot || '(sem descrição)'}`)
      } else {
        for (const ins of lista) {
          acumular(item.etapa_id, subOrcItemId, ins.codigo, ins.descricao, ins.unidade, item.quantidade * ins.coeficiente)
        }
      }
    } else if (item.sinapi_composicao_id && item.codigo_snapshot) {
      // Via 2: INSUMO no detalhamento analítico SINAPI.
      const analiticos = analiticoPorCodigo.get(item.codigo_snapshot) || []
      if (analiticos.length === 0) {
        avisos.push(`Composição sem insumos cadastrados: ${item.codigo_snapshot} — ${item.descricao_snapshot || '(sem descrição)'}`)
      } else {
        for (const ins of analiticos) {
          acumular(item.etapa_id, subOrcItemId, ins.item_codigo, ins.item_descricao || ins.item_codigo, ins.item_unidade || 'UN', item.quantidade * ins.coeficiente)
        }
      }
    } else if (item.tipo_item_snapshot === 'INSUMO' || item.classificacao_snapshot === 'MATERIAL_SERVICOS') {
      // Via 3: item sem composição, mas explicitamente classificado como
      // material no próprio orçamento — usa o item como sua própria demanda.
      acumular(item.etapa_id, subOrcItemId, item.codigo_snapshot, item.descricao_snapshot || item.codigo_snapshot || '—', item.unidade_snapshot || 'UN', item.quantidade)
    }
    // Demais itens (mão de obra, item livre sem classificação) não geram
    // material — composição não é material, e não há "receita" de insumos.
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
  return { ...(data as Omit<SincronizarMateriaisResultado, 'avisos'>), avisos }
}
