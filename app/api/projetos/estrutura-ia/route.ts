import { NextRequest, NextResponse } from 'next/server'
import { gerarEstruturaProjeto } from '@/lib/projeto-ai'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { nomeProjeto, descricao } = await req.json() as { nomeProjeto: string; descricao?: string }

    if (!nomeProjeto || !nomeProjeto.trim()) {
      return NextResponse.json({ error: 'Nome do projeto é obrigatório' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data } = await supabase.from('projeto_ia_config').select('value').eq('key', 'prompt_estrutura').maybeSingle()

    return NextResponse.json(await gerarEstruturaProjeto({ nomeProjeto, descricao, promptPersonalizado: data?.value }))
  } catch (error: unknown) {
    console.error('Estrutura IA error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao gerar estrutura'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
