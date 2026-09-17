import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

// Keep the existing untyped query contract of the business modules during this auth change.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): any {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
