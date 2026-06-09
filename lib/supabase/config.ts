export const DEFAULT_SUPABASE_URL = 'https://jwezrjyatfjvvsugtugo.supabase.co'
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ZXpyanlhdGZqdnZzdWd0dWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NjkyODksImV4cCI6MjA5NjI0NTI4OX0.gV3MyYH5hYTuYMHAcx3831BzHuXcNSKFzluauJ-Dc6M'

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  return url.startsWith('http') ? url : DEFAULT_SUPABASE_URL
}

export function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
}
