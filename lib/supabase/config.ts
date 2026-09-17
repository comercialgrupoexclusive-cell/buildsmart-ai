export function supabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!value || !/^https?:\/\//.test(value)) throw new Error('SUPABASE_URL não configurada.')
  return value
}

// Prefer modern keys; legacy keys remain supported during staged rollout.
export function supabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!value) throw new Error('Chave pública do Supabase não configurada.')
  return value
}
