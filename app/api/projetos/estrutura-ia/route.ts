import { NextRequest, NextResponse } from 'next/server'
import { gerarEstruturaProjeto } from '@/lib/projeto-ai'
import { createClient } from '@/lib/supabase/server'
import type { ItemArvore } from '@/lib/projeto-itens'

export async function POST(req: NextRequest) {
  try {
    const { nomeProjeto, descricao, itensAtuais, instrucao } = await req.json() as {
      nomeProjeto: string
      descricao?: string
      itensAtuais?: ItemArvore[]
      instrucao?: string
    }

    if (!nomeProjeto || !nomeProjeto.trim()) {
      return NextResponse.json({ error: 'Nome do projeto é obrigatório' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data } = await supabase.from('projeto_ia_config').select('value').eq('key', 'prompt_estrutura').maybeSingle()

    return NextResponse.json(await gerarEstruturaProjeto({ nomeProjeto, descricao, promptPersonalizado: data?.value, itensAtuais, instrucao }))
  } catch (error: unknown) {
    console.error('Estrutura IA error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao gerar estrutura'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
