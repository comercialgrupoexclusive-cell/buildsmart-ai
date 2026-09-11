// Checagem de vínculos antes de excluir um item/subetapa de orcamento_itens.
//
// P4.4 (validação real Allegra, seção 6): "Item já ligado a planejamento,
// medição, compra ou financeiro: nunca apagar histórico em cascata
// silenciosamente. Se a exclusão for incompatível com vínculos existentes,
// bloquear a exclusão destrutiva [...] informando claramente o motivo."
//
// financiamento_itens e medicao_itens já têm FK ON DELETE NO ACTION (o
// Postgres bloqueia sozinho, com um erro cru). Mas
// planejamento_itens.orcamento_item_id é ON DELETE CASCADE (apaga progresso
// físico registrado junto do item) e compra_itens.(subetapa_)orcamento_item_id
// é ON DELETE SET NULL (desvincula a compra silenciosamente, sem apagar o
// lançamento em si) — os dois casos onde o banco sozinho permitiria perda
// silenciosa de rastreabilidade. A checagem de materiais (também NO ACTION
// no banco) é só para dar uma mensagem legível em vez do erro de FK cru.
import type { SupabaseClient } from '@supabase/supabase-js'

export type VinculoBloqueio = { tabela: string; label: string; quantidade: number }

export async function verificarVinculosItem(supabase: SupabaseClient, itemId: string): Promise<VinculoBloqueio[]> {
  const [planejamento, compras, materiais] = await Promise.all([
    supabase.from('planejamento_itens').select('id, progresso_executado', { count: 'exact', head: false }).eq('orcamento_item_id', itemId),
    supabase.from('compra_itens').select('id', { count: 'exact', head: true }).or(`orcamento_item_id.eq.${itemId},subetapa_orcamento_item_id.eq.${itemId}`),
    supabase.from('materiais').select('id', { count: 'exact', head: true }).eq('subetapa_orcamento_item_id', itemId),
  ])

  const bloqueios: VinculoBloqueio[] = []

  const progressoRegistrado = ((planejamento.data || []) as { progresso_executado: number }[])
    .filter(p => Number(p.progresso_executado || 0) > 0)
  if (progressoRegistrado.length > 0) {
    bloqueios.push({ tabela: 'planejamento_itens', label: 'avanço físico registrado', quantidade: progressoRegistrado.length })
  }

  if ((compras.count || 0) > 0) {
    bloqueios.push({ tabela: 'compra_itens', label: 'compra(s)/requisição(ões) vinculada(s)', quantidade: compras.count || 0 })
  }
  if ((materiais.count || 0) > 0) {
    bloqueios.push({ tabela: 'materiais', label: 'material(is) de suprimento vinculado(s)', quantidade: materiais.count || 0 })
  }

  return bloqueios
}

export function descreverBloqueios(bloqueios: VinculoBloqueio[]): string {
  const partes = bloqueios.map(b => `${b.quantidade} ${b.label}`)
  return `Não é possível excluir: há ${partes.join(' e ')}. Remova ou desvincule antes de excluir o item.`
}

// Exclusão segura: barra explicitamente os dois vínculos que o banco não
// bloqueia sozinho (ver comentário acima); os demais (financiamento, medição,
// materiais por outra FK) continuam protegidos pelo próprio banco e o erro
// de FK sobe como exceção normal.
export async function excluirItemComVinculo(supabase: SupabaseClient, itemId: string): Promise<void> {
  const bloqueios = await verificarVinculosItem(supabase, itemId)
  if (bloqueios.length > 0) {
    throw new Error(descreverBloqueios(bloqueios))
  }
  const { error } = await supabase.from('orcamento_itens').delete().eq('id', itemId)
  if (error) throw error
}
