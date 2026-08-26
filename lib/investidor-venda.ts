// Prospecção-sombra de venda (ajuste de produto: Investidor precisa decidir
// preço de VENDA depois de adquirir um Imóvel, não só preço de compra).
//
// Em vez de generalizar prospeccao_ficha/comparaveis/analises_mercado/
// cenarios para aceitarem projeto_id (mudança grande nas 4 tabelas + RLS +
// tools de IA + rota de API), criamos por Imóvel uma segunda linha em
// `prospeccoes` (project_id = o imóvel, is_venda = true) só como contêiner —
// reaproveita 100% dessas tabelas/tools/UI sem tocar em nenhuma delas.
// Nunca aparece na listagem normal de Prospecções (filtro is_venda=false em
// app/(app)/investidor/page.tsx).
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOrCreateProspeccaoVenda(
  supabase: SupabaseClient,
  projetoId: string,
  nomeProjeto: string,
): Promise<string> {
  const { data: existente } = await supabase
    .from('prospeccoes')
    .select('id')
    .eq('project_id', projetoId)
    .eq('is_venda', true)
    .maybeSingle()
  if (existente) return existente.id as string

  const { data: nova, error } = await supabase
    .from('prospeccoes')
    .insert({ nome: `Venda — ${nomeProjeto}`, project_id: projetoId, is_venda: true, fase: 'nova' })
    .select('id')
    .single()
  if (error || !nova) throw new Error(error?.message || 'Não foi possível preparar a análise de venda.')
  return nova.id as string
}

// Só lê — nunca cria. Usado pela Visão Geral do Imóvel, que não deve ter o
// efeito colateral de criar a linha-sombra apenas por ser aberta.
export async function getProspeccaoVenda(supabase: SupabaseClient, projetoId: string): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('prospeccoes')
    .select('id')
    .eq('project_id', projetoId)
    .eq('is_venda', true)
    .maybeSingle()
  return (data as { id: string } | null) ?? null
}
