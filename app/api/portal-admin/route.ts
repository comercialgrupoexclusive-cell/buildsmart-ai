import { NextRequest, NextResponse } from 'next/server'

import { readAccess } from '@/lib/auth/session'
import { requireSameOrigin } from '@/lib/auth/http'

// Proxy unico para as RPCs administrativas do Portal/Feed (feed_admin_*,
// portal_content_admin_*, portal_visibility_admin_*, portal_link_*,
// portal_message_admin_*, portal_tour_admin_*). Essas RPCs so aceitam
// execute de service_role no banco (migration lock_down_portal_admin_rpcs) —
// este endpoint e o unico lugar que as chama, sempre com o profile_id da
// sessao assinada, nunca com o que o cliente mandar no corpo.

// Nome do argumento de perfil de cada RPC administrativa permitida. `null`
// significa que a função não recebe profile_id (é só leitura interna) mas
// ainda exige sessão válida — nenhum argumento é substituído nesse caso.
const ADMIN_RPC_PROFILE_ARG: Record<string, string | null> = {
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
  obra_previsao_sugestoes: null,
  obra_previsao_save: 'p_profile_id',
  obra_previsao_undo_last: 'p_profile_id',
  obra_previsoes_list: null,
}

export async function POST(req: NextRequest) {
  const denied = requireSameOrigin(req)
  if (denied) return denied
  const body = await req.json().catch(() => null) as { fn?: string; args?: Record<string, unknown> } | null
  const fn = body?.fn
  if (!fn || !Object.prototype.hasOwnProperty.call(ADMIN_RPC_PROFILE_ARG, fn)) {
    return NextResponse.json({ error: 'Operacao nao permitida.' }, { status: 400 })
  }

  const access = await readAccess()
  const profileId = access?.profile?.id
  if (!profileId) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.', code: 'session_expired' }, { status: 401 })
  }
  // Legacy privileged RPCs do not consistently bind their target to a tenant.
  // Fail closed until each operation has a tenant-aware contract; no bs_session bypass.
  if (!access?.active || !['owner', 'admin'].includes(access.active.role)) {
    return NextResponse.json({ error: 'Operação não autorizada.' }, { status: 403 })
  }
  return NextResponse.json({ error: 'Administração do portal temporariamente indisponível nesta fundação de acesso.' }, { status: 403 })
}
