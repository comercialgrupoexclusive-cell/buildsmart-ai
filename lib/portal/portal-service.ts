import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'
import type { PortalContextDTO, PortalFeedCommentDTO, PortalFeedItemDTO, PortalMessageDTO, PortalPresentationDTO } from './types'
import { normalizePortalContentVisibility, normalizePortalVisibility } from './sections'

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
  const [{ data, error }, { data: cronograma, error: scheduleError }, { data: previsoes, error: forecastsError }, { data: visibility }, { data: presentation, error: presentationError }, { data: feed, error: feedError }, { data: contentVisibility }, { data: messages }, { data: financial, error: financialError }] = await Promise.all([
    db.rpc('portal_get_context', params),
    db.rpc('portal_get_schedule', params),
    db.rpc('portal_get_previsoes', params),
    db.rpc('portal_get_visibility', { p_token_hash: params.p_token_hash }),
    db.rpc('portal_get_presentation', params),
    db.rpc('feed_portal_get', params),
    db.rpc('portal_get_content_visibility', { p_token_hash: params.p_token_hash }),
    db.rpc('portal_messages_get', { p_token_hash: params.p_token_hash }),
    db.rpc('portal_get_financial', params),
  ])
  if (error || scheduleError || forecastsError || presentationError || feedError || financialError || !data || !presentation || !financial) return null
  const context = data as PortalContextDTO
  const visibleBudgets = context.orcamentos.filter(item => item.status !== 'arquivado')
  if ((orcamentoId === 'todos' || !orcamentoId) && visibleBudgets.length === 1) {
    return getPortalContext(token, visibleBudgets[0].id)
  }
  const normalizedPresentation = { ...(presentation as PortalPresentationDTO), financial: financial as PortalPresentationDTO['financial'] }
  return {
    ...context,
    visibility: normalizePortalVisibility(visibility as PortalContextDTO['visibility'] | null),
    contentVisibility: normalizePortalContentVisibility(contentVisibility as PortalContextDTO['contentVisibility'] | null),
    orcamentos: visibleBudgets,
    cronograma: (cronograma || []) as PortalContextDTO['cronograma'],
    previsoes: (previsoes || []) as PortalContextDTO['previsoes'],
    feed: (feed || []) as PortalFeedItemDTO[],
    messages: (messages || []) as PortalMessageDTO[],
    presentation: normalizedPresentation,
    summary: {
      ...context.summary,
      valorOrcado: normalizedPresentation.financial.budget,
      realizadoFinanceiro: normalizedPresentation.financial.realized,
      pago: normalizedPresentation.financial.paid,
    },
  }
}

export async function markPortalStoryViewed(token: string, itemId: string, fileId?: string | null) {
  const { data, error } = await portalDb().rpc('feed_portal_mark_story_slide_viewed', {
    p_token_hash: hashPortalToken(token), p_item_id: itemId, p_file_id: fileId || null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function togglePortalFeedLike(token: string, itemId: string) {
  const { data, error } = await portalDb().rpc('feed_portal_toggle_like', {
    p_token_hash: hashPortalToken(token), p_item_id: itemId,
  })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function commentPortalFeed(token: string, itemId: string, texto: string) {
  const { data, error } = await portalDb().rpc('feed_portal_comment', {
    p_token_hash: hashPortalToken(token), p_item_id: itemId, p_texto: texto,
  })
  if (error) throw new Error(error.message)
  return data as PortalFeedCommentDTO
}

export async function sendPortalMessage(token: string, texto: string, destinatarioProfileId?: string | null) {
  const { data, error } = await portalDb().rpc('portal_message_send', {
    p_token_hash: hashPortalToken(token), p_texto: texto, p_destinatario_profile_id: destinatarioProfileId || null,
  })
  if (error) throw new Error(error.message)
  return data as PortalMessageDTO
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
