// Motor de Processo (P3.3) — resolve ou cria o orçamento operacional de um
// Processo. Mesmo raciocínio de lib/investidor-venda.ts
// (getOrCreateProspeccaoVenda): reaproveita 100% da tabela `orcamentos` e
// do componente components/obra/ObraOrcamento.tsx (que já resolve tudo por
// `orcamentoId`) — só decide qual linha usar/criar quando o Processo ainda
// não tem nenhuma.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOrCreateOrcamentoDoProcesso(supabase: SupabaseClient, processoId: string): Promise<string> {
  const { data: existente } = await supabase
    .from('orcamentos')
    .select('id')
    .eq('processo_id', processoId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existente) return existente.id as string

  const { data: novo, error } = await supabase
    .from('orcamentos')
    .insert({ processo_id: processoId, tipo: 'executivo', bdi_percentual: 25, status: 'em_projeto', versao: 1 })
    .select('id')
    .single()
  if (error || !novo) throw new Error(error?.message || 'Não foi possível preparar o orçamento do processo.')
  return novo.id as string
}
