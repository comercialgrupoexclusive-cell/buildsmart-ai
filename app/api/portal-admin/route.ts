import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'
import { SESSION_COOKIE, verifyProfileToken } from '@/lib/portal-admin-session'

// Proxy unico para as RPCs administrativas do Portal/Feed (feed_admin_*,
// portal_content_admin_*, portal_visibility_admin_*, portal_link_*,
// portal_message_admin_*, portal_tour_admin_*). Essas RPCs so aceitam
// execute de service_role no banco (migration lock_down_portal_admin_rpcs) —
// este endpoint e o unico lugar que as chama, sempre com o profile_id da
// sessao assinada, nunca com o que o cliente mandar no corpo.

// Nome do argumento de perfil de cada RPC administrativa permitida.
const ADMIN_RPC_PROFILE_ARG: Record<string, string> = {
  feed_admin_archive: 'p_profile_id',
  feed_admin_list: 'p_profile_id',
  feed_admin_publish: 'p_profile_id',
  feed_admin_send_photo_to_board: 'p_profile_id',
  feed_admin_update_photo: 'p_profile_id',
  portal_content_admin_get: 'p_profile_id',
  portal_content_admin_set: 'p_profile_id',
  portal_link_create: 'p_profile_id',
  portal_link_set_active: 'p_profile_id',
  portal_links_list: 'p_profile_id',
  portal_message_admin_send: 'p_profile_id',
  portal_messages_admin_get: 'p_profile_id',
  portal_tour_admin_list: 'p_profile_id',
  portal_tour_admin_manage: 'p_profile_id',
  portal_visibility_admin_get: 'p_profile_id',
  portal_visibility_admin_set: 'p_profile_id',
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { fn?: string; args?: Record<string, unknown> } | null
  const fn = body?.fn
  if (!fn || !Object.prototype.hasOwnProperty.call(ADMIN_RPC_PROFILE_ARG, fn)) {
    return NextResponse.json({ error: 'Operacao nao permitida.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const profileId = verifyProfileToken(cookieStore.get(SESSION_COOKIE)?.value)
  if (!profileId) {
    return NextResponse.json({ error: 'Sessao expirada. Selecione seu perfil novamente.', code: 'session_expired' }, { status: 401 })
  }

  const db = createServiceClient()
  if (!db) return NextResponse.json({ error: 'Servidor nao configurado.' }, { status: 500 })

  const args = { ...(body?.args || {}) }
  args[ADMIN_RPC_PROFILE_ARG[fn]] = profileId

  const { data, error } = await db.rpc(fn, args)
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
  return NextResponse.json({ data })
}
