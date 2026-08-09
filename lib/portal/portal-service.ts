import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import type { PortalContextDTO } from './types'

function portalDb() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function hashPortalToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function getPortalContext(token: string, orcamentoId = 'todos'): Promise<PortalContextDTO | null> {
  if (!token || token.length < 24) return null
  const db = portalDb()
  const params = { p_token_hash: hashPortalToken(token), p_orcamento_id: orcamentoId || 'todos' }
  const [{ data, error }, { data: cronograma, error: scheduleError }, { data: previsoes, error: forecastsError }] = await Promise.all([
    db.rpc('portal_get_context', params),
    db.rpc('portal_get_schedule', params),
    db.rpc('portal_get_previsoes', params),
  ])
  if (error || scheduleError || forecastsError || !data) return null
  return {
    ...(data as PortalContextDTO),
    cronograma: (cronograma || []) as PortalContextDTO['cronograma'],
    previsoes: (previsoes || []) as PortalContextDTO['previsoes'],
  }
}

export async function verifyPortalAccess(token: string) {
  const context = await getPortalContext(token)
  return context ? { obraId: context.obra.id, profileId: context.access.profileId } : null
}

export async function getPortalCanvas(token: string) {
  if (!token || token.length < 24) return null
  const { data, error } = await portalDb().rpc('portal_board_canvas_get', {
    p_token_hash: hashPortalToken(token),
  })
  if (error) throw new Error(error.message)
  return data
}

export async function savePortalCanvas(token: string, document: unknown, files: unknown[]) {
  if (!token || token.length < 24) throw new Error('Link do Portal invalido.')
  const { data, error } = await portalDb().rpc('portal_board_canvas_save', {
    p_token_hash: hashPortalToken(token), p_document: document, p_files: files,
  })
  if (error) throw new Error(error.message)
  return data
}
