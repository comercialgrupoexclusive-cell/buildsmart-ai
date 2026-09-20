// Tellus R01 / Seção B — vínculo canônico Processo ↔ Oportunidade.
//
// Antes desta seção, `prospeccoes` não tinha nenhuma relação com `processos`:
// as telas listavam TODAS as oportunidades, mesmo abertas dentro de um
// Processo, e o laboratório resolvia o contexto com IDs fixos. Este módulo é
// a camada mínima que elimina as duas coisas.
//
// Regra travada: uma oportunidade de AQUISIÇÃO (is_venda=false) pertence a no
// máximo um Processo, e um Processo resolve no máximo uma oportunidade de
// aquisição. O primeiro lado é a própria coluna `prospeccoes.processo_id`; o
// segundo é garantido no banco pelo índice único parcial criado na migration
// 20260920070000 — a checagem daqui é apenas mensagem amigável antecipada,
// não a fonte da verdade.
//
// Prospecção-sombra de VENDA (is_venda=true) não é oportunidade de aquisição:
// ela pertence a um Ativo via project_id e nunca entra neste vínculo.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Prospeccao } from './types'

const TABELA = 'prospeccoes'

export async function obterOportunidadeDoProcesso(
  supabase: SupabaseClient,
  processoId: string,
): Promise<Prospeccao | null> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .eq('processo_id', processoId)
    .eq('is_venda', false)
    .maybeSingle()
  if (error) throw error
  return (data as Prospeccao | null) ?? null
}

/**
 * Oportunidades de aquisição ainda sem Processo — as candidatas a vínculo.
 *
 * O filtro de `processo_id` é feito no cliente de propósito: `is null` não é
 * expressável do mesmo jeito em todos os caminhos de teste, e o conjunto é
 * pequeno. O recorte que importa (`is_venda=false`) vai no banco.
 */
export async function listarOportunidadesVinculaveis(supabase: SupabaseClient): Promise<Prospeccao[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .eq('is_venda', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Prospeccao[]).filter(p => !p.processo_id)
}

async function buscarProspeccao(supabase: SupabaseClient, prospeccaoId: string): Promise<Prospeccao | null> {
  const { data } = await supabase.from(TABELA).select('*').eq('id', prospeccaoId).maybeSingle()
  return (data as Prospeccao | null) ?? null
}

export async function vincularOportunidadeAoProcesso(
  supabase: SupabaseClient,
  prospeccaoId: string,
  processoId: string,
): Promise<void> {
  const oportunidade = await buscarProspeccao(supabase, prospeccaoId)
  if (!oportunidade) throw new Error('Oportunidade não encontrada.')
  if (oportunidade.is_venda) {
    throw new Error('Prospecção de venda não é oportunidade de aquisição e não pode ser vinculada a um Processo.')
  }

  const { data: processo } = await supabase.from('processos').select('id').eq('id', processoId).maybeSingle()
  if (!processo) throw new Error('Processo não encontrado.')

  // Idempotente: revincular ao mesmo Processo não é erro nem escrita nova.
  if (oportunidade.processo_id === processoId) return
  if (oportunidade.processo_id) {
    throw new Error('Esta oportunidade já está vinculada a outro Processo. Desvincule antes de mover.')
  }

  const jaVinculada = await obterOportunidadeDoProcesso(supabase, processoId)
  if (jaVinculada) {
    throw new Error('Este Processo já possui uma oportunidade vinculada. Desvincule a atual antes de vincular outra.')
  }

  const { error } = await supabase.from(TABELA).update({ processo_id: processoId }).eq('id', prospeccaoId)
  if (error) throw error
}

export async function desvincularOportunidade(supabase: SupabaseClient, prospeccaoId: string): Promise<void> {
  const { error } = await supabase.from(TABELA).update({ processo_id: null }).eq('id', prospeccaoId)
  if (error) throw error
}
