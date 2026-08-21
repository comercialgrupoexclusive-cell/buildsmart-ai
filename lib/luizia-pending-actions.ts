// ═══════════════════════════════════════════════════════════════════════════
// Proposta pendente da Luiza — trava real de servidor para a regra "sugestão
// da Luiza nunca escreve sozinha", em vez de depender só do prompt.
//
// Fluxo:
//   suggest_task_change  -> grava aqui (status='pending'), NÃO escreve em tarefas.
//   confirm_pending_action -> executa exatamente o que foi gravado (status='executed').
//   reject_pending_action  -> só marca (status='rejected'), nunca escreve.
//
// Ver migration 20260821120000_luizia_hardening_v1_1 (tabela
// luizia_pending_task_actions, RLS sem policy — só service_role acessa).
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

type DB = SupabaseClient

export const PENDING_TTL_MINUTOS = 30

export type PendingAction = {
  id: string
  conversation_key: string
  profile_id: string | null
  actor: string | null
  origem: string
  tool: 'create_task' | 'update_task' | 'complete_task' | 'reopen_task' | 'cancel_task'
  argumentos: Record<string, unknown>
  descricao: string
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed'
  created_at: string
  expires_at: string
  resolved_at: string | null
}

export async function criarPropostaPendente(db: DB, params: {
  conversationKey: string
  profileId?: string | null
  actor: string
  origem: string
  tool: PendingAction['tool']
  argumentos: Record<string, unknown>
  descricao: string
}): Promise<PendingAction | null> {
  const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTOS * 60000).toISOString()
  const { data } = await db.from('luizia_pending_task_actions').insert({
    conversation_key: params.conversationKey,
    profile_id: params.profileId ?? null,
    actor: params.actor,
    origem: params.origem,
    tool: params.tool,
    argumentos: params.argumentos,
    descricao: params.descricao,
    status: 'pending',
    expires_at: expiresAt,
  }).select('*').single()
  return (data as PendingAction) || null
}

function estaExpirada(p: PendingAction): boolean {
  return new Date(p.expires_at).getTime() < Date.now()
}

/** Propostas ainda válidas (pending e não expiradas) desta conversa, mais recentes primeiro. */
export async function listarPendentesAtivas(db: DB, conversationKey: string): Promise<PendingAction[]> {
  const { data } = await db.from('luizia_pending_task_actions')
    .select('*')
    .eq('conversation_key', conversationKey)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)
  const todas = (data || []) as PendingAction[]
  const ativas = todas.filter(p => !estaExpirada(p))
  const expiradas = todas.filter(p => estaExpirada(p))
  if (expiradas.length) {
    await db.from('luizia_pending_task_actions').update({ status: 'expired', resolved_at: new Date().toISOString() })
      .in('id', expiradas.map(p => p.id))
  }
  return ativas
}

export type ResolverPendenteResultado =
  | { tipo: 'nenhuma' }
  | { tipo: 'ambigua'; candidatas: PendingAction[] }
  | { tipo: 'nao_encontrada' }
  | { tipo: 'expirada' }
  | { tipo: 'ok'; acao: PendingAction }

/**
 * Acha a proposta pendente a resolver: pelo id, se informado; senão filtra
 * pelo título da tarefa (quando informado, para desambiguar entre várias);
 * senão exige que exista exatamente uma ativa na conversa.
 */
export async function acharPendenteParaResolver(db: DB, conversationKey: string, opts?: { pendingId?: string; titulo?: string }): Promise<ResolverPendenteResultado> {
  if (opts?.pendingId) {
    const { data } = await db.from('luizia_pending_task_actions').select('*').eq('id', opts.pendingId).eq('conversation_key', conversationKey).maybeSingle()
    const p = data as PendingAction | null
    if (!p) return { tipo: 'nao_encontrada' }
    if (p.status !== 'pending') return p.status === 'expired' ? { tipo: 'expirada' } : { tipo: 'nao_encontrada' }
    if (estaExpirada(p)) {
      await db.from('luizia_pending_task_actions').update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('id', p.id)
      return { tipo: 'expirada' }
    }
    return { tipo: 'ok', acao: p }
  }

  const { data } = await db.from('luizia_pending_task_actions')
    .select('*')
    .eq('conversation_key', conversationKey)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)
  const todas = (data || []) as PendingAction[]
  const expiradas = todas.filter(p => estaExpirada(p))
  if (expiradas.length) {
    await db.from('luizia_pending_task_actions').update({ status: 'expired', resolved_at: new Date().toISOString() })
      .in('id', expiradas.map(p => p.id))
  }
  let ativas = todas.filter(p => !estaExpirada(p))
  if (ativas.length === 0) return todas.length > 0 ? { tipo: 'expirada' } : { tipo: 'nenhuma' }

  if (opts?.titulo && ativas.length > 1) {
    const alvo = opts.titulo.toLowerCase()
    const filtradas = ativas.filter(p => p.descricao.toLowerCase().includes(alvo))
    if (filtradas.length > 0) ativas = filtradas
  }

  if (ativas.length > 1) return { tipo: 'ambigua', candidatas: ativas }
  return { tipo: 'ok', acao: ativas[0] }
}

export async function marcarRejeitada(db: DB, id: string) {
  await db.from('luizia_pending_task_actions').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', id)
}

export async function marcarExecutada(db: DB, id: string) {
  await db.from('luizia_pending_task_actions').update({ status: 'executed', resolved_at: new Date().toISOString() }).eq('id', id)
}

export function formatarListaPendentes(candidatas: PendingAction[]): string {
  return `Você tem ${candidatas.length} sugestões minhas aguardando confirmação: ${candidatas.map((p, i) => `(${i + 1}) ${p.descricao.split('\n')[0]}`).join(' | ')}. Qual delas você está confirmando?`
}
