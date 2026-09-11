import type { SupabaseClient } from '@supabase/supabase-js'

// P4.6 Bloco B — CRUD de plantas do Processo (tabela `plantas`, RLS via
// processo_is_accessible). plan_json é o FloorPlanSerializable inteiro do
// Axonometra vendorizado (vendor/axonometra) — este módulo nunca abre esse
// JSON, só guarda/recupera, exatamente como o editor espera em axo:load/
// axo:save.
export type Planta = {
  id: string
  processo_id: string
  nome: string
  plan_json: unknown
  plan_schema_version: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

const PLANO_VAZIO = { version: 2, floors: [{ furnitureArray: [], wallNodes: [], wallNodeLinks: [], wallSegmentStatus: {} }], furnitureId: 0, wallNodeId: 0 }

export async function listarPlantas(supabase: SupabaseClient, processoId: string): Promise<Planta[]> {
  const { data, error } = await supabase
    .from('plantas')
    .select('id, processo_id, nome, plan_schema_version, created_at, updated_at, created_by, updated_by')
    .eq('processo_id', processoId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []) as Planta[]
}

export async function obterPlanta(supabase: SupabaseClient, plantaId: string): Promise<Planta | null> {
  const { data, error } = await supabase.from('plantas').select('*').eq('id', plantaId).maybeSingle()
  if (error) throw error
  return data as Planta | null
}

export async function criarPlanta(supabase: SupabaseClient, processoId: string, nome: string, profileId?: string): Promise<Planta> {
  const { data, error } = await supabase
    .from('plantas')
    .insert({
      processo_id: processoId,
      nome,
      plan_json: PLANO_VAZIO,
      plan_schema_version: 2,
      created_by: profileId || null,
      updated_by: profileId || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Planta
}

export async function salvarPlanoPlanta(supabase: SupabaseClient, plantaId: string, planJson: unknown, profileId?: string): Promise<void> {
  const version = (planJson as { version?: number })?.version
  const { error } = await supabase
    .from('plantas')
    .update({
      plan_json: planJson,
      plan_schema_version: typeof version === 'number' ? version : 2,
      updated_at: new Date().toISOString(),
      updated_by: profileId || null,
    })
    .eq('id', plantaId)
  if (error) throw error
}

export async function renomearPlanta(supabase: SupabaseClient, plantaId: string, nome: string): Promise<void> {
  const { error } = await supabase.from('plantas').update({ nome }).eq('id', plantaId)
  if (error) throw error
}

export async function excluirPlanta(supabase: SupabaseClient, plantaId: string): Promise<void> {
  const { error } = await supabase.from('plantas').delete().eq('id', plantaId)
  if (error) throw error
}
