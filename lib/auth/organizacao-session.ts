import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SESSION_COOKIE, sessionCookieOptions, signProfileId } from '@/lib/portal-admin-session'

// P4.7 — resposta padrão dos três pontos de entrada do ciclo normal de
// acesso (login, primeiro acesso, criar organização): mesmo formato de
// {profile, organization, papel} devolvido ao cliente + o cookie bs_session
// assinado que as RPCs administrativas do Portal/Feed ainda usam para saber
// qual profile_id fez a chamada. Extraído para não haver três cópias
// divergentes da mesma lógica de resposta.
export async function responderSessaoOrganizacao(
  supabase: SupabaseClient,
  profileId: string,
  organization: { id: string; nome: string; slug: string }
) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, apelido, photo_url, theme_color, dark_mode, onboarding_done, tipo, pode_excluir, cidade, estado, created_at, auth_user_id, email')
    .eq('id', profileId)
    .maybeSingle()
  if (error || !profile) return null

  const { data: membro } = await supabase
    .from('organization_members')
    .select('papel')
    .eq('organization_id', organization.id)
    .eq('profile_id', profileId)
    .maybeSingle()

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, signProfileId(profileId), sessionCookieOptions)

  return {
    ok: true as const,
    profile,
    organization,
    papel: membro?.papel ?? 'membro',
  }
}
