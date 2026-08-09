import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/portal/portal-service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const budget = request.nextUrl.searchParams.get('budget') || 'todos'
  const context = await getPortalContext(token, budget)
  if (!context) return NextResponse.json({ error: 'Link invalido ou expirado.' }, { status: 404 })
  return NextResponse.json(context, { headers: { 'Cache-Control': 'private, no-store' } })
}
