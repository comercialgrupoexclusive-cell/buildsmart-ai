import { createHmac, timingSafeEqual } from 'crypto'

// Sessao minima server-side para as RPCs administrativas do Portal/Feed.
// O app nao usa Supabase Auth (perfis sao escolhidos localmente, sem
// auth.uid()) — este cookie assinado e a unica forma de garantir, no
// servidor, que o profile_id que chega numa RPC administrativa e
// realmente o perfil selecionado, e nao um valor livre enviado pelo
// cliente. Nunca aceitar p_profile_id vindo do corpo da requisicao para
// as RPCs administrativas: sempre usar getSessionProfileId().

export const SESSION_COOKIE = 'bs_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 dias, alinhado a persistencia atual do perfil em localStorage

function secret() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'buildsmart-portal-admin-session-fallback'
  )
}

export function signProfileId(profileId: string): string {
  const sig = createHmac('sha256', secret()).update(profileId).digest('base64url')
  return `${profileId}.${sig}`
}

export function verifyProfileToken(token: string | undefined | null): string | null {
  if (!token) return null
  const separatorIndex = token.lastIndexOf('.')
  if (separatorIndex <= 0) return null
  const profileId = token.slice(0, separatorIndex)
  const sig = token.slice(separatorIndex + 1)
  const expected = createHmac('sha256', secret()).update(profileId).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return profileId
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
}
