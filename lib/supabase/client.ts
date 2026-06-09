import { createBrowserClient } from '@supabase/ssr'
import { createLocalClient, isLocalDataMode } from '@/lib/data/local-client'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

export function createClient() {
  if (isLocalDataMode()) return createLocalClient() as any
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
