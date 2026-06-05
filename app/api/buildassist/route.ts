import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const { messages, profileId } = await req.json()

    const supabase = await createClient()

    // Carregar contexto das obras do usuário
    const [obrasRes, etapasRes, materiaisRes] = await Promise.all([
      supabase.from('obras').select('*').order('created_at', { ascending: false }).limit(10),
      supabase
        .from('etapas')
        .select('*, obras(nome)')
        .gte('data_inicio', new Date().toISOString().split('T')[0])
        .order('data_inicio')
        .limit(20),
      supabase
        .from('materiais')
        .select('*, obras(nome), sinapi_insumos(descricao)')
        .neq('status_compra', 'comprado')
        .limit(20),
    ])

    const obras = obrasRes.data || []
    const etapas = etapasRes.data || []
    const materiais = materiaisRes.data || []

    const hoje = new Date().toLocaleDateString('pt-BR')
    const contextData = JSON.stringify({ obras, etapas, materiais }, null, 2)

    const systemPrompt = `Você é o BuildAssist, assistente de obras da BuildSmart AI.

CONTEXTO ATUAL (${hoje}):
${contextData}

INSTRUÇÕES:
- Responda sempre em português brasileiro, de forma direta e prática
- Foque em antecipação: alertas de materiais, otimização de cronograma, clima
- Nunca invente dados — use apenas o contexto fornecido
- Seja conciso e objetivo (máximo 3 parágrafos por resposta)
- Use listas quando for listar itens
- Se houver etapas críticas (início ≤ 7 dias), sempre mencione
- Se houver materiais pendentes, sempre mencione`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Resposta inesperada da IA')
    }

    return NextResponse.json({ message: content.text })
  } catch (error) {
    console.error('BuildAssist error:', error)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 })
  }
}
