import { NextRequest, NextResponse } from 'next/server'
import { gerarEstruturaOrcamento, type EtapaEstrutura } from '@/lib/orcamento-ai'

export async function POST(req: NextRequest) {
  try {
    const { obraNome, descricao, catalogo, itensAtuais, instrucao } = await req.json() as {
      obraNome: string
      descricao?: string
      catalogo: { codigo: string; descricao: string; unidade: string }[]
      itensAtuais?: EtapaEstrutura[]
      instrucao?: string
    }

    if (!obraNome || !obraNome.trim()) {
      return NextResponse.json({ error: 'Nome da obra é obrigatório' }, { status: 400 })
    }
    if (!Array.isArray(catalogo) || catalogo.length === 0) {
      return NextResponse.json({ error: 'Catálogo de composições vazio' }, { status: 400 })
    }

    return NextResponse.json(await gerarEstruturaOrcamento({ obraNome, descricaoObra: descricao, catalogo, itensAtuais, instrucao }))
  } catch (error: unknown) {
    console.error('Estrutura de orçamento IA error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao gerar estrutura'
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 500 })
  }
}
