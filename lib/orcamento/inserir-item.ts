// ═══════════════════════════════════════════════════════════════════════════
// Fonte ÚNICA de inserção de item em orcamento_itens.
//
// Antes desta rodada, ObraOrcamento.tsx tinha DOIS caminhos de insert
// divergentes (handleAddItem e inserirDraft): um deles não gravava
// classificacao_snapshot/grupo_snapshot/tipo_item_snapshot, então dois itens
// visualmente idênticos se comportavam diferente no breakdown por categoria
// e na exportação (achado confirmado ao vivo: 68 linhas de teste com
// composição própria estavam sem tipo_item_snapshot). Esta função é o único
// ponto de insert de linha de custo daqui pra frente — quem cria (Fase 2 —
// UI) chama isto em vez de montar o payload à mão.
//
// Também resolve grupo_id (id estável da linha-cabeçalho de subetapa) e o
// código de item livre via gerar_codigo_item_livre() no banco, em vez do
// padrão Date.now() duplicado em 3 lugares sem proteção contra colisão.
import type { SupabaseClient } from '@supabase/supabase-js'

export type ClassificacaoInsumo = 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS'
export type TipoItemSnapshot = 'COMPOSICAO' | 'INSUMO' | 'ITEM_LIVRE'

export type NovoItemOrcamento = {
  orcamentoId: string
  etapaId: string | null
  grupoId?: string | null
  subetapa?: string | null
  quantidade: number | null
  descricao: string
  unidade: string
  classificacao: ClassificacaoInsumo | null
  grupoSnapshot?: string | null
  ordem?: number | null
} & (
  // precoUnitario aceita null — "a conferir" (hotfix pré-reunião): preço
  // genuinamente indefinido nunca é forçado a 0, nem aqui.
  | { fonte: 'propria'; composicaoId: string; codigo: string; precoUnitario: number | null }
  | { fonte: 'sinapi'; sinapiComposicaoId: string; codigo: string; precoUnitario: number | null }
  | { fonte: 'insumo'; codigo: string; precoUnitario: number | null }
  | { fonte: 'item_livre'; precoUnitario: number | null; codigo?: string }
)

function tipoItemSnapshot(fonte: NovoItemOrcamento['fonte']): TipoItemSnapshot {
  if (fonte === 'propria' || fonte === 'sinapi') return 'COMPOSICAO'
  if (fonte === 'insumo') return 'INSUMO'
  return 'ITEM_LIVRE'
}

export async function inserirItemOrcamento(
  supabase: SupabaseClient,
  input: NovoItemOrcamento
): Promise<{ id: string }> {
  let codigo = input.fonte === 'item_livre' ? input.codigo : input.codigo
  if (input.fonte === 'item_livre' && !codigo) {
    const { data, error } = await supabase.rpc('gerar_codigo_item_livre', { p_orcamento_id: input.orcamentoId })
    if (error) throw error
    codigo = data as string
  }

  const payload = {
    orcamento_id: input.orcamentoId,
    etapa_id: input.etapaId,
    grupo_id: input.grupoId ?? null,
    subetapa: input.subetapa ?? null,
    tipo_linha: 'item' as const,
    composicao_id: input.fonte === 'propria' ? input.composicaoId : null,
    sinapi_composicao_id: input.fonte === 'sinapi' ? input.sinapiComposicaoId : null,
    quantidade: input.quantidade,
    preco_unitario_snapshot: input.precoUnitario,
    descricao_snapshot: input.descricao,
    codigo_snapshot: codigo,
    unidade_snapshot: input.unidade,
    classificacao_snapshot: input.classificacao,
    grupo_snapshot: input.grupoSnapshot ?? null,
    tipo_item_snapshot: tipoItemSnapshot(input.fonte),
    ordem: input.ordem ?? null,
  }

  const { data, error } = await supabase.from('orcamento_itens').insert(payload).select('id').single()
  if (error) throw error
  return { id: data.id as string }
}

// Resolve (ou cria) o id estável da linha-cabeçalho de subetapa — grupo_id
// deve sempre vir daqui, nunca de uma comparação de texto solta.
export async function resolverGrupoId(
  supabase: SupabaseClient,
  params: { orcamentoId: string; etapaId: string | null; nomeSubetapa: string }
): Promise<string> {
  const nome = params.nomeSubetapa.trim()
  let query = supabase
    .from('orcamento_itens')
    .select('id')
    .eq('orcamento_id', params.orcamentoId)
    .eq('tipo_linha', 'subetapa')
    .eq('subetapa', nome)
    .limit(1)
  query = params.etapaId ? query.eq('etapa_id', params.etapaId) : query.is('etapa_id', null)
  const { data: existente } = await query.maybeSingle()
  if (existente?.id) return existente.id as string

  const codigo = `SUB-${nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 24)}`

  const { data, error } = await supabase
    .from('orcamento_itens')
    .insert({
      orcamento_id: params.orcamentoId,
      etapa_id: params.etapaId,
      subetapa: nome,
      tipo_linha: 'subetapa',
      quantidade: 1,
      preco_unitario_snapshot: 0,
      descricao_snapshot: nome,
      codigo_snapshot: codigo,
      unidade_snapshot: 'VB',
      subetapa_valor_manual_ativo: false,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
