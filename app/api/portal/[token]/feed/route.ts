import { NextRequest, NextResponse } from 'next/server'
import { commentPortalFeed, markPortalStoryViewed, togglePortalFeedLike } from '@/lib/portal/portal-service'

type FeedAction =
  | { action: 'view_story'; itemId: string }
  | { action: 'toggle_like'; itemId: string }
  | { action: 'comment'; itemId: string; texto: string }

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await request.json() as FeedAction
  if (!body.itemId) return NextResponse.json({ error: 'Publicacao invalida.' }, { status: 400 })

  try {
    if (body.action === 'view_story') {
      await markPortalStoryViewed(token, body.itemId)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'toggle_like') {
      return NextResponse.json({ liked: await togglePortalFeedLike(token, body.itemId) })
    }
    if (body.action === 'comment') {
      const texto = body.texto?.trim()
      if (!texto) return NextResponse.json({ error: 'Escreva um comentario.' }, { status: 400 })
      return NextResponse.json({ comment: await commentPortalFeed(token, body.itemId, texto) })
    }
    return NextResponse.json({ error: 'Acao invalida.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Nao foi possivel concluir a acao.' }, { status: 403 })
  }
}
