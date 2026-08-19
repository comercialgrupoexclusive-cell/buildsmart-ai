import { createClient } from '@supabase/supabase-js'
import { supabaseUrl } from '@/lib/supabase/config'

// Cliente com a service_role key — uso exclusivamente server-side, nunca
// exposto ao browser. As RPCs administrativas do Portal/Feed so aceitam
// execute de service_role (ver migration lock_down_portal_admin_rpcs), entao
// qualquer chamada a essas RPCs precisa passar por este cliente.
export function createServiceClient() {
  const url = supabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
