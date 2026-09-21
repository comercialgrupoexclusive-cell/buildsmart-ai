// Repository do domínio Investidor (Tellus R01 / Seção D).
//
// Única camada que fala com o Supabase para as tabelas da oportunidade. Não
// contém regra de negócio (isso é do Service) nem orquestração/classificação
// (isso é das Actions). Mantém exatamente as mesmas queries que a UI já
// executava — nenhuma tabela nova, nenhum comportamento novo.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProspeccaoAnaliseMercado,
  ProspeccaoCenario,
  ProspeccaoComparavel,
  ProspeccaoEvidencia,
  ProspeccaoFicha,
} from '@/lib/types'

// ─── Ficha ────────────────────────────────────────────────────────────────
export async function obterFicha(db: SupabaseClient, prospeccaoId: string): Promise<ProspeccaoFicha | null> {
  const { data, error } = await db.from('prospeccao_ficha').select('*').eq('prospeccao_id', prospeccaoId).maybeSingle()
  if (error) throw error
  return (data as ProspeccaoFicha | null) ?? null
}

export async function inserirFicha(
  db: SupabaseClient,
  payload: Partial<ProspeccaoFicha> & { prospeccao_id: string },
): Promise<ProspeccaoFicha> {
  const { data, error } = await db.from('prospeccao_ficha').insert(payload).select('*').single()
  if (error) throw error
  return data as ProspeccaoFicha
}

export async function atualizarFicha(
  db: SupabaseClient,
  fichaId: string,
  patch: Partial<ProspeccaoFicha>,
): Promise<ProspeccaoFicha> {
  const { data, error } = await db.from('prospeccao_ficha').update(patch).eq('id', fichaId).select('*').single()
  if (error) throw error
  return data as ProspeccaoFicha
}

// ─── Evidências ─────────────────────────────────────────────────────────────
export async function listarEvidencias(db: SupabaseClient, prospeccaoId: string): Promise<ProspeccaoEvidencia[]> {
  const { data, error } = await db
    .from('prospeccao_evidencias')
    .select('*')
    .eq('prospeccao_id', prospeccaoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProspeccaoEvidencia[]
}

export async function inserirEvidencia(
  db: SupabaseClient,
  payload: Partial<ProspeccaoEvidencia> & { prospeccao_id: string; informacao: string },
): Promise<ProspeccaoEvidencia> {
  const { data, error } = await db.from('prospeccao_evidencias').insert(payload).select('*').single()
  if (error) throw error
  return data as ProspeccaoEvidencia
}

export async function excluirEvidencia(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('prospeccao_evidencias').delete().eq('id', id)
  if (error) throw error
}

// ─── Mercado / comparáveis ───────────────────────────────────────────────────
export async function atualizarSelecaoComparavel(
  db: SupabaseClient,
  id: string,
  campo: 'salvo' | 'favorito',
  valor: boolean,
): Promise<void> {
  const { error } = await db.from('prospeccao_comparaveis').update({ [campo]: valor }).eq('id', id)
  if (error) throw error
}

export async function inserirAnaliseMercado(
  db: SupabaseClient,
  payload: Partial<ProspeccaoAnaliseMercado> & { prospeccao_id: string },
): Promise<ProspeccaoAnaliseMercado> {
  const { data, error } = await db.from('prospeccao_analises_mercado').insert(payload).select('*').single()
  if (error) throw error
  return data as ProspeccaoAnaliseMercado
}

// ─── Cenários / viabilidade ──────────────────────────────────────────────────
export async function inserirCenario(
  db: SupabaseClient,
  payload: Partial<ProspeccaoCenario> & { prospeccao_id: string; nome: string },
): Promise<ProspeccaoCenario> {
  const { data, error } = await db.from('prospeccao_cenarios').insert(payload).select('*').single()
  if (error) throw error
  return data as ProspeccaoCenario
}

export async function atualizarCenario(
  db: SupabaseClient,
  id: string,
  patch: Partial<ProspeccaoCenario>,
): Promise<ProspeccaoCenario> {
  const { data, error } = await db.from('prospeccao_cenarios').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as ProspeccaoCenario
}

export async function excluirCenario(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('prospeccao_cenarios').delete().eq('id', id)
  if (error) throw error
}

// Unicidade do "principal" é garantida no banco pela RPC
// prospeccao_cenario_definir_principal (transação: zera os outros e marca
// este) — nunca por dois UPDATEs soltos do cliente.
export async function definirCenarioPrincipal(
  db: SupabaseClient,
  prospeccaoId: string,
  cenarioId: string,
): Promise<void> {
  const { error } = await db.rpc('prospeccao_cenario_definir_principal', {
    p_prospeccao_id: prospeccaoId,
    p_cenario_id: cenarioId,
  })
  if (error) throw error
}

// ─── Comparáveis (Pesquisa Imobiliária) ──────────────────────────────────────
export async function listarComparaveis(db: SupabaseClient, prospeccaoId: string): Promise<ProspeccaoComparavel[]> {
  const { data, error } = await db
    .from('prospeccao_comparaveis')
    .select('*')
    .eq('prospeccao_id', prospeccaoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProspeccaoComparavel[]
}

export async function inserirComparavel(
  db: SupabaseClient,
  payload: Partial<ProspeccaoComparavel> & { prospeccao_id: string },
): Promise<ProspeccaoComparavel> {
  const { data, error } = await db.from('prospeccao_comparaveis').insert(payload).select('*').single()
  if (error) throw error
  return data as ProspeccaoComparavel
}

export async function atualizarComparavel(
  db: SupabaseClient,
  id: string,
  patch: Partial<ProspeccaoComparavel>,
): Promise<ProspeccaoComparavel> {
  const { data, error } = await db.from('prospeccao_comparaveis').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as ProspeccaoComparavel
}

export async function excluirComparavel(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('prospeccao_comparaveis').delete().eq('id', id)
  if (error) throw error
}

// ─── Decisão (fase da oportunidade) ──────────────────────────────────────────
export async function atualizarFaseProspeccao(
  db: SupabaseClient,
  prospeccaoId: string,
  fase: string,
): Promise<void> {
  const { error } = await db.from('prospeccoes').update({ fase }).eq('id', prospeccaoId)
  if (error) throw error
}
