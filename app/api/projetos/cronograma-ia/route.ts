import { NextRequest, NextResponse } from 'next/server'
import { sugerirCronogramaProjeto, type ItemParaCronograma } from '@/lib/projeto-ai'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { itens, dataInicioObra } = await req.json() as {
      itens: ItemParaCronograma[]
      dataInicioObra?: string | null
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ error: 'Lista de itens vazia' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data } = await supabase.from('projeto_ia_config').select('value').eq('key', 'prompt_cronograma').maybeSingle()

    return NextResponse.json(await sugerirCronogramaProjeto({ itens, dataInicioObra: dataInicioObra ?? null, promptPersonalizado: data?.value }))
  } catch (error: unknown) {
    console.error('Cronograma IA error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao sugerir cronograma'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
