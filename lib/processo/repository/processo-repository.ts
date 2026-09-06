// Repository do Motor de Processo (P3.1) — única camada que fala com as
// tabelas `processos`/`processo_modulos`. Sem regra de negócio aqui: quem
// valida nome/status/módulo é lib/processo/service/processo-service.ts.
// Recebe o client (nunca cria o seu) para ser testável com FakeDB (ver
// lib/__tests__/fake-supabase.ts) sem depender de rede.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AtualizarProcessoInput, Processo, ProcessoModuloVinculo, ProcessoStatus, ListarProcessosFiltros } from '../domain/types'

const TABELA_PROCESSOS = 'processos'
const TABELA_MODULOS = 'processo_modulos'

type NovoProcessoDados = {
  nome: string
  tipo: string | null
  cliente_nome: string | null
  endereco: string | null
  responsavel_id: string | null
  organization_id: string | null
  status: ProcessoStatus
  archived_at: string | null
}

export async function inserirProcesso(supabase: SupabaseClient, dados: NovoProcessoDados): Promise<Processo> {
  const { data, error } = await supabase.from(TABELA_PROCESSOS).insert(dados).select().single()
  if (error || !data) throw new Error(error?.message || 'Não foi possível criar o processo.')
  return data as Processo
}

export async function buscarProcessoPorId(supabase: SupabaseClient, id: string): Promise<Processo | null> {
  const { data } = await supabase.from(TABELA_PROCESSOS).select('*').eq('id', id).maybeSingle()
  return (data as Processo | null) ?? null
}

export async function listarProcessosRaw(supabase: SupabaseClient, filtros: ListarProcessosFiltros): Promise<Processo[]> {
  let query = supabase.from(TABELA_PROCESSOS).select('*').order('created_at', { ascending: false })
  if (filtros.status) query = query.eq('status', filtros.status)
  if (filtros.q) query = query.ilike('nome', `%${filtros.q}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data as Processo[]) || []
}

export async function atualizarProcessoRaw(
  supabase: SupabaseClient,
  id: string,
  patch: AtualizarProcessoInput & { updated_at: string },
): Promise<void> {
  const { error } = await supabase.from(TABELA_PROCESSOS).update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function atualizarStatusRaw(
  supabase: SupabaseClient,
  id: string,
  status: ProcessoStatus,
  archivedAt: string | null,
  updatedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from(TABELA_PROCESSOS)
    .update({ status, archived_at: archivedAt, updated_at: updatedAt })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function inserirModulos(supabase: SupabaseClient, processoId: string, moduleKeys: string[]): Promise<void> {
  if (moduleKeys.length === 0) return
  const agora = new Date().toISOString()
  const rows = moduleKeys.map(key => ({ processo_id: processoId, module_key: key, enabled: true, enabled_at: agora }))
  const { error } = await supabase.from(TABELA_MODULOS).insert(rows)
  if (error) throw new Error(error.message)
}

export async function listarModulosRaw(supabase: SupabaseClient, processoId: string): Promise<ProcessoModuloVinculo[]> {
  const { data, error } = await supabase.from(TABELA_MODULOS).select('*').eq('processo_id', processoId).order('module_key')
  if (error) throw new Error(error.message)
  return (data as ProcessoModuloVinculo[]) || []
}

export async function buscarModuloVinculo(
  supabase: SupabaseClient,
  processoId: string,
  moduleKey: string,
): Promise<ProcessoModuloVinculo | null> {
  const { data } = await supabase
    .from(TABELA_MODULOS)
    .select('*')
    .eq('processo_id', processoId)
    .eq('module_key', moduleKey)
    .maybeSingle()
  return (data as ProcessoModuloVinculo | null) ?? null
}

export async function upsertModuloVinculo(
  supabase: SupabaseClient,
  processoId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<void> {
  const existente = await buscarModuloVinculo(supabase, processoId, moduleKey)
  const agora = new Date().toISOString()
  if (existente) {
    const { error } = await supabase
      .from(TABELA_MODULOS)
      .update({ enabled, enabled_at: enabled ? agora : existente.enabled_at, disabled_at: enabled ? null : agora })
      .eq('id', existente.id)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from(TABELA_MODULOS)
    .insert({ processo_id: processoId, module_key: moduleKey, enabled, enabled_at: agora, disabled_at: enabled ? null : agora })
  if (error) throw new Error(error.message)
}
