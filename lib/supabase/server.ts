import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createLocalClient, isLocalDataMode } from '@/lib/data/local-client'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

export async function createClient() {
  if (isLocalDataMode()) return createLocalClient() as any

  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — ignorar
          }
        },
      },
    }
  )
}
