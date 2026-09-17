import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  const db = await createClient()
  const result = code ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && (type === 'invite' || type === 'recovery') ? await db.auth.verifyOtp({ token_hash: tokenHash, type }) : null
  const target = result && !result.error ? '/auth/redefinir-senha' : '/login?link=invalido'
  return NextResponse.redirect(new URL(target, request.url), { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
