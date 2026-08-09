import { NextRequest, NextResponse } from 'next/server'
import { getPortalCanvas, savePortalCanvas } from '@/lib/portal/portal-service'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const canvas = await getPortalCanvas(token)
    if (!canvas) return NextResponse.json({ error: 'Portal nao autorizado.' }, { status: 403 })
    return NextResponse.json(canvas)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao abrir o Board.' }, { status: 400 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const body = await request.json() as { document?: unknown; files?: unknown[] }
    if (!body.document) return NextResponse.json({ error: 'Documento obrigatorio.' }, { status: 400 })
    return NextResponse.json(await savePortalCanvas(token, body.document, body.files || []))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao salvar o Board.' }, { status: 400 })
  }
}
