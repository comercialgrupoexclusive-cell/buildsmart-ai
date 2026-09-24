import type { SupabaseClient } from '@supabase/supabase-js'

// Triagem: o que foi decidido sobre uma entrada da Caixa (ver migration
// 20260924040000). Vive separada da entrada de propósito — a entrada é
// append-only, e o que a gente decide sobre ela muda com o tempo.
//
// A coluna `status` que existe em processo_caixa_entrada é resquício da
// primeira fundação e nunca pôde mudar (não há policy de UPDATE lá). Quem
// responde "em que pé está esta entrada" é daqui.

export type TriagemStatus = 'novo' | 'tarefa' | 'processo' | 'um_dia_talvez' | 'arquivado'

export const TRIAGEM_STATUS_LABEL: Record<TriagemStatus, string> = {
  novo: 'Não triado',
  tarefa: 'Virou tarefa',
  processo: 'Virou processo',
  um_dia_talvez: 'Um dia talvez',
  arquivado: 'Arquivado',
}

export type Triagem = {
  entrada_id: string
  status: TriagemStatus
  resumo: string | null
  tarefa_id: string | null
  processo_criado_id: string | null
  triado_por_ia: boolean
  triado_em: string | null
  created_at: string
  updated_at: string
}

// Uma consulta só para a lista inteira — nunca uma por entrada.
export async function listarTriagens(supabase: SupabaseClient, entradaIds: string[]): Promise<Triagem[]> {
  if (entradaIds.length === 0) return []
  const { data, error } = await supabase
    .from('caixa_entrada_triagem')
    .select('*')
    .in('entrada_id', entradaIds)
  if (error) throw error
  return (data ?? []) as Triagem[]
}

export async function definirTriagem(
  supabase: SupabaseClient,
  entradaId: string,
  patch: Partial<Pick<Triagem, 'status' | 'resumo' | 'tarefa_id' | 'processo_criado_id' | 'triado_por_ia'>>,
): Promise<Triagem> {
  const { data, error } = await supabase
    .from('caixa_entrada_triagem')
    .upsert(
      {
        entrada_id: entradaId,
        ...patch,
        triado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'entrada_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as Triagem
}
