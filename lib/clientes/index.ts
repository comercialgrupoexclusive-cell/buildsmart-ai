import type { SupabaseClient } from '@supabase/supabase-js'

// Cliente não tem tabela própria: o "cadastro" é o conjunto de nomes já usados
// em processos (cadastro no ponto de uso, seção 4). Retorna os nomes distintos
// da organização (RLS já isola) para alimentar o combobox de cliente.
export async function listarClientesSugeridos(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('processos')
    .select('cliente_nome')
    .not('cliente_nome', 'is', null)
    .order('cliente_nome')
  const nomes = (data ?? []).map((r: { cliente_nome: string | null }) => (r.cliente_nome ?? '').trim()).filter(Boolean)
  return Array.from(new Set(nomes))
}
