import type { SupabaseClient } from '@supabase/supabase-js'

// Substituição canônica (rodada "OpenPlan3D assume o Planta Baixa") — CRUD
// de plantas do Processo (tabela `plantas`, RLS via processo_is_accessible).
// Este módulo nunca abre o conteúdo geométrico de `plan_json`, só
// guarda/recupera; PlantaEditor.tsx (protocolo bs:load/bs:request-save/
// bs:save) e as funções de envelope abaixo são quem sabem o formato.
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

// Envelope explícito do motor: identifica formato antes de qualquer leitura
// (ver decisão "engine/schemaVersion" da rodada de substituição). Não requer
// migration — `plan_json` já é `jsonb`.
export const OPENPLAN3D_ENGINE = 'openplan3d' as const
export const OPENPLAN3D_SCHEMA_VERSION = 1

export type OpenPlan3DEnvelope = {
  engine: typeof OPENPLAN3D_ENGINE
  schemaVersion: number
  project: unknown
}

function isOpenPlan3DEnvelope(value: unknown): value is OpenPlan3DEnvelope {
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).engine === OPENPLAN3D_ENGINE
    && 'project' in (value as Record<string, unknown>)
}

export function wrapOpenPlan3DProject(project: unknown): OpenPlan3DEnvelope {
  return { engine: OPENPLAN3D_ENGINE, schemaVersion: OPENPLAN3D_SCHEMA_VERSION, project }
}

/**
 * Extrai o projeto OpenPlan3D de `plan_json`, ou `null` se a planta for nova
 * (plan_json vazio) ou estiver no formato legado (Axonometra: `wallNodes`/
 * `wallNodeLinks`/`furnitureArray`, sem `engine`). Não converte o formato
 * legado — instrução explícita da rodada de substituição: o OpenPlan3D
 * inicia documento vazio para esse caso, só troca de formato quando o
 * usuário salvar. `null` aqui sinaliza exatamente "comece vazio" para o
 * bridge (PlantaEditor.tsx envia isso como `plan` de `bs:load`).
 */
export function unwrapOpenPlan3DProject(planJson: unknown): unknown | null {
  return isOpenPlan3DEnvelope(planJson) ? planJson.project ?? null : null
}

const PLANO_VAZIO = wrapOpenPlan3DProject(null)

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
      plan_schema_version: OPENPLAN3D_SCHEMA_VERSION,
      created_by: profileId || null,
      updated_by: profileId || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Planta
}

export async function salvarPlanoPlanta(supabase: SupabaseClient, plantaId: string, planJson: unknown, profileId?: string): Promise<void> {
  const version = isOpenPlan3DEnvelope(planJson) ? planJson.schemaVersion : undefined
  const { error } = await supabase
    .from('plantas')
    .update({
      plan_json: planJson,
      plan_schema_version: typeof version === 'number' ? version : OPENPLAN3D_SCHEMA_VERSION,
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
