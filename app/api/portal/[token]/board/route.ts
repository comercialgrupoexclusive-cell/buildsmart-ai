import { NextRequest, NextResponse } from 'next/server'
import { commentPortalBoardItem, createPortalBoardItem, updatePortalBoardItem } from '@/lib/portal/portal-board-service'

type BoardRequest = {
  action: 'create' | 'update' | 'comment' | 'change_status' | 'archive'
  itemId?: string
  input?: Record<string, unknown>
  mensagem?: string
  status?: string
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  try {
    const body = await request.json() as BoardRequest
    if (body.action === 'create') {
      const result = await createPortalBoardItem(token, body.input as Parameters<typeof createPortalBoardItem>[1])
      return NextResponse.json(result, { status: 201 })
    }
    if (!body.itemId) return NextResponse.json({ error: 'Item obrigatorio.' }, { status: 400 })
    if (body.action === 'comment') {
      return NextResponse.json(await commentPortalBoardItem(token, body.itemId, body.mensagem || ''))
    }
    if (body.action === 'archive') {
      return NextResponse.json(await updatePortalBoardItem(token, body.itemId, { status: 'arquivado' }))
    }
    if (body.action === 'change_status') {
      return NextResponse.json(await updatePortalBoardItem(token, body.itemId, { status: body.status as Parameters<typeof updatePortalBoardItem>[2]['status'] }))
    }
    if (body.action === 'update') {
      return NextResponse.json(await updatePortalBoardItem(token, body.itemId, body.input as Parameters<typeof updatePortalBoardItem>[2]))
    }
    return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao atualizar o Board.' }, { status: 400 })
  }
}
