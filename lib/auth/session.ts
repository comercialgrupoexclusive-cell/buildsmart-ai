import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

export type Membership = {
  organization_id: string
  role: 'owner' | 'admin' | 'member'
  organizations: { id: string; nome: string; slug: string; ativo: boolean }
}

export async function readAccess() {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return null
  const [profileResult, membershipResult, activeResult] = await Promise.all([
    db.from('profiles').select('id,name,apelido,photo_url,theme_color,dark_mode,onboarding_done,tipo,pode_excluir,cidade,estado,created_at,auth_user_id,email').eq('auth_user_id', user.id).maybeSingle(),
    db.from('organization_members').select('organization_id,role,organizations!inner(id,nome,slug,ativo)').eq('user_id', user.id).eq('ativo', true).eq('organizations.ativo', true),
    db.rpc('current_organization_id'),
  ])
  if (profileResult.error || membershipResult.error || activeResult.error) throw new Error('Não foi possível validar seu acesso.')
  const memberships = (membershipResult.data || []) as unknown as Membership[]
  const active = memberships.find(m => m.organization_id === activeResult.data) || null
  return { db, user, profile: profileResult.data as Profile | null, memberships, active }
}

export async function auditAuth(event: 'login' | 'logout' | 'password_changed') {
  const db = await createClient()
  const { error } = await db.rpc('log_auth_event', { p_event: event })
  if (error) console.error('[auth]', { event: 'audit_failed', code: error.code })
}
