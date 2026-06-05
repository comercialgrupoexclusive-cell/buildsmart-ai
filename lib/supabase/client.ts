import { createBrowserClient } from '@supabase/ssr'

function getUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return url.startsWith('http') ? url : 'https://placeholder.supabase.co'
}

function getKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return key.length > 10 ? key : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder.placeholder'
}

export function createClient() {
  return createBrowserClient(getUrl(), getKey())
}
