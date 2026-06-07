import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createLocalClient, isLocalDataMode } from '@/lib/data/local-client'

export async function createClient() {
  if (isLocalDataMode()) return createLocalClient() as any

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
