import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // Instanciado dentro do handler para não quebrar o build sem env vars
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder' })
  try {
    const { messages, complex } = await req.json()

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
- Foque em antecipação: alertas de materiais, otimização de cronograma, riscos
- Nunca invente dados — use apenas o contexto fornecido
- Seja conciso e objetivo (máximo 3 parágrafos por resposta)
- Use listas quando for listar itens
- Se houver etapas críticas (início ≤ 7 dias), sempre mencione
- Se houver materiais pendentes, sempre mencione`

    // Modelo: gpt-4o-mini para chat geral | gpt-4.1-mini para operações complexas (anexos, geração de orçamento)
    const model = complex ? 'gpt-4.1-mini' : 'gpt-4o-mini'

    const response = await openai.chat.completions.create({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Resposta vazia da IA')

    return NextResponse.json({ message: content })
  } catch (error) {
    console.error('BuildAssist error:', error)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 })
  }
}
