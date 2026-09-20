import type { SupabaseClient } from '@supabase/supabase-js'
import type { Processo } from '@/lib/processo'
import type { Prospeccao } from '@/lib/types'

// Template Investidor — a ponte 1:1 entre Processo e prospecção.
//
// Regra de produto (Tellus R01 / Seção C2): o Processo é o núcleo único. No
// template Investidor ele representa a própria operação de investimento/imóvel.
// `prospeccoes` continua existindo tecnicamente como registro interno da
// oportunidade, mas NUNCA deve aparecer ao usuário como um segundo objeto que
// precisa ser criado depois. Por isso a oportunidade é resolvida por
// find-or-create a partir do `processo_id`: quando a Pesquisa é aberta (ou
// quando o Processo é criado), a linha já existe ou é criada em silêncio —
// nunca há um passo "crie o imóvel".
//
// A unicidade 1:1 é garantida no banco por um índice único parcial em
// prospeccoes(processo_id) where processo_id is not null (ver a migration
// prospeccoes_processo_id). Duas aberturas simultâneas não criam duas
// oportunidades: a segunda inserção colide e caímos de volta na existente.
type ProcessoLite = Pick<Processo, 'id' | 'nome' | 'endereco' | 'organization_id'>

async function buscarProspeccaoDoProcesso(
  supabase: SupabaseClient,
  processoId: string,
): Promise<Prospeccao | null> {
  const { data, error } = await supabase
    .from('prospeccoes')
    .select('*')
    .eq('processo_id', processoId)
    .eq('is_venda', false)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return (data?.[0] as Prospeccao | undefined) ?? null
}

export async function obterOuCriarProspeccaoDoProcesso(
  supabase: SupabaseClient,
  processo: ProcessoLite,
): Promise<Prospeccao> {
  const existente = await buscarProspeccaoDoProcesso(supabase, processo.id)
  if (existente) return existente

  const { data, error } = await supabase
    .from('prospeccoes')
    .insert({
      nome: processo.nome,
      endereco: processo.endereco ?? null,
      processo_id: processo.id,
      organization_id: processo.organization_id ?? null,
      is_venda: false,
    })
    .select('*')
    .single()

  if (error) {
    // Corrida: outra aba/efeito criou a oportunidade entre a busca e a
    // inserção (o índice único parcial rejeita a segunda). Reaproveitamos a
    // linha que já existe em vez de propagar o erro.
    const jaCriada = await buscarProspeccaoDoProcesso(supabase, processo.id)
    if (jaCriada) return jaCriada
    throw error
  }
  return data as Prospeccao
}
