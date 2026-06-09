import { NextRequest, NextResponse } from 'next/server'
import { LuiziaContext, LuiziaMessage, askLuizia } from '@/lib/luizia-core'

export async function POST(req: NextRequest) {
  try {
    const { messages = [], complex = false, context = {} } = await req.json() as {
      messages: LuiziaMessage[]
      complex?: boolean
      context?: LuiziaContext
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
    }

    return NextResponse.json(await askLuizia({ messages, complex, context }))
  } catch (error: unknown) {
    console.error('BuildAssist error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao processar mensagem'
    return NextResponse.json({
      error: 'Erro ao processar mensagem',
      detail: message.slice(0, 300),
    }, { status: 500 })
  }
}
