// Busca de catálogo para inserir item de orçamento (composição própria,
// SINAPI, insumo) — extraído de components/obra/ObraOrcamento.tsx
// (loadComposicoesProprias/loadSinapiComps/loadInsumosCatalogo), que tinha
// essa lógica presa ao state local do componente. A UI canônica do
// Processo (components/processo/orcamento/) usa isto em vez de reescrever
// as mesmas queries — mesmo raciocínio de inserir-item.ts: uma fonte só,
// nenhuma tela copia a query à mão.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fixMojibake } from '@/lib/utils'

export type ClassificacaoInsumo = 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS'

export type ComposicaoItemJoin = {
  id: string
  composicao_id: string
  insumo_id: string | null
  insumo_proprio_id: string | null
  coeficiente: number
  insumo?: { codigo: string; classificacao: string; descricao: string; unidade: string; precos: Record<string, number> } | null
  insumo_proprio?: { codigo: string; descricao: string; unidade: string; categoria: string; classificacao?: ClassificacaoInsumo | null; grupo?: string | null; preco_unitario: number } | null
}

export type ComposicaoPropriaComCusto = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  grupo: string
  ativo: boolean
  composicao_itens: ComposicaoItemJoin[]
  custo_calculado: number
}

export type SinapiComposicaoResumo = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  grupo: string
  custos: Record<string, number>
  custo_unitario: number | null
}

export type InsumoCatalogo = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  preco_unitario: number
  classificacao: ClassificacaoInsumo
  grupo: string
  origem: 'proprio' | 'sinapi'
}

// Deriva preço/descrição/unidade de um item de composição — mesma regra de
// infoDoItem em ObraOrcamento.tsx (sem snapshot aqui: catálogo é sempre "ao
// vivo", nunca tem descricao_snapshot).
function precoDoItem(ins: ComposicaoItemJoin, uf: string): number {
  if (ins.insumo_proprio) return ins.insumo_proprio.preco_unitario ?? 0
  if (ins.insumo) return ins.insumo.precos?.[uf] ?? 0
  return 0
}

const COMPOSICAO_INSUMOS_EMBED = `composicao_insumos(
  id, composicao_id, insumo_id, insumo_proprio_id, coeficiente,
  insumo:sinapi_insumos(codigo,classificacao,descricao,unidade,precos),
  insumo_proprio:insumos_proprios(codigo,descricao,unidade,categoria,classificacao,grupo,preco_unitario)
)`

export async function buscarComposicoesProprias(supabase: SupabaseClient, uf: string): Promise<ComposicaoPropriaComCusto[]> {
  const { data } = await supabase
    .from('composicoes_proprias')
    .select(`id, codigo, descricao, unidade, grupo, ativo, ${COMPOSICAO_INSUMOS_EMBED}`)
    .eq('ativo', true)
    .order('codigo')
  type Row = { id: string; codigo: string; descricao: string; unidade: string; grupo: string; ativo: boolean; composicao_insumos?: ComposicaoItemJoin[] }
  return ((data || []) as unknown as Row[]).map(comp => {
    const composicao_itens = comp.composicao_insumos || []
    const custo_calculado = composicao_itens.reduce((total, ins) => total + ins.coeficiente * precoDoItem(ins, uf), 0)
    return { id: comp.id, codigo: comp.codigo, descricao: fixMojibake(comp.descricao), unidade: comp.unidade, grupo: comp.grupo, ativo: comp.ativo, composicao_itens, custo_calculado }
  })
}

export async function buscarComposicoesSinapi(supabase: SupabaseClient, termo = ''): Promise<SinapiComposicaoResumo[]> {
  let query = supabase.from('sinapi_composicoes').select('id, codigo, descricao, unidade, grupo, custos, custo_unitario').order('codigo').limit(termo ? 80 : 200)
  if (termo.trim()) query = query.ilike('descricao', `%${termo.trim()}%`)
  const { data } = await query
  return ((data || []) as SinapiComposicaoResumo[]).map(c => ({ ...c, descricao: fixMojibake(c.descricao) }))
}

export async function buscarInsumosCatalogo(supabase: SupabaseClient, termo: string, uf: string): Promise<InsumoCatalogo[]> {
  const termoLimpo = termo.trim()
  let propriosQuery = supabase
    .from('insumos_proprios')
    .select('id,codigo,descricao,unidade,preco_unitario,ativo,categoria,classificacao,grupo')
    .eq('ativo', true)
    .order('descricao')
    .limit(termoLimpo ? 80 : 200)
  let sinapiQuery = supabase
    .from('sinapi_insumos')
    .select('id,codigo,descricao,unidade,precos,classificacao')
    .order('descricao')
    .limit(termoLimpo ? 80 : 200)

  if (termoLimpo) {
    propriosQuery = propriosQuery.ilike('descricao', `%${termoLimpo}%`)
    sinapiQuery = sinapiQuery.ilike('descricao', `%${termoLimpo}%`)
  }

  const [propriosRes, sinapiRes] = await Promise.all([propriosQuery, sinapiQuery])
  type InsumoProprioRow = { id: string; codigo: string; descricao: string; unidade: string; preco_unitario: number; categoria: string; classificacao: ClassificacaoInsumo | null; grupo: string | null }
  type SinapiInsumoRow = { id: string; codigo: string; descricao: string; unidade: string; precos: Record<string, number>; classificacao: string | null }

  const proprios: InsumoCatalogo[] = ((propriosRes.data || []) as InsumoProprioRow[]).map(ins => ({
    id: ins.id,
    codigo: ins.codigo,
    descricao: fixMojibake(ins.descricao),
    unidade: ins.unidade,
    preco_unitario: Number(ins.preco_unitario || 0),
    classificacao: ins.classificacao || (ins.categoria === 'EQUIPAMENTO' ? 'EQUIPAMENTO' : ins.categoria === 'MAO_DE_OBRA' ? 'MAO_DE_OBRA' : 'MATERIAL_SERVICOS'),
    grupo: ins.grupo || '',
    origem: 'proprio',
  }))
  const sinapi: InsumoCatalogo[] = ((sinapiRes.data || []) as SinapiInsumoRow[]).map(ins => ({
    id: ins.id,
    codigo: ins.codigo,
    descricao: fixMojibake(ins.descricao),
    unidade: ins.unidade,
    preco_unitario: Number(ins.precos?.[uf] || 0),
    classificacao: (ins.classificacao === 'EQUIPAMENTO' || ins.classificacao === 'MAO_DE_OBRA') ? ins.classificacao : 'MATERIAL_SERVICOS',
    grupo: '',
    origem: 'sinapi',
  }))
  return [...proprios, ...sinapi]
}
