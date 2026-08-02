import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { projetoAiToolDefs, execProjetoAiTool } from '@/lib/projeto-ai-tools'

export const maxDuration = 60

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type Msg = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const { projetoId, messages = [], projetoNome = '' } = await req.json() as {
      projetoId: string
      messages: Msg[]
      projetoNome?: string
    }

    if (!projetoId || !messages.length) {
      return NextResponse.json({ error: 'projetoId e messages sao obrigatorios' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return NextResponse.json({ error: 'OPENAI_API_KEY nao configurada' }, { status: 500 })
    }

    const db = supabase()
    if (!db) {
      return NextResponse.json({ error: 'Supabase nao configurado' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey })
    const hoje = new Date().toLocaleDateString('pt-BR')

    const systemPrompt = `Voce e a Luiza, assistente IA da BuildSmart AI para gestao de projetos.

DATA ATUAL: ${hoje}
PROJETO ATUAL: "${projetoNome}"

CAPACIDADES:
- Voce pode listar toda a estrutura do projeto (disciplinas, itens, subitens).
- Voce pode criar disciplinas (nivel 1), itens (nivel 2) e subitens (nivel 3).
- Voce pode renomear, excluir ou alterar qualquer item (datas, status, responsavel, marco).
- Voce pode definir predecessoras (dependencias Fim-Inicio) entre itens.
- Voce pode marcar itens como concluidos ou reabrir.
- Use as funcoes disponiveis para executar acoes. Nao invente dados.

REGRAS:
- Responda sempre em portugues brasileiro.
- Seja pratica e objetiva. Maximo 4 blocos curtos.
- Ao criar itens, confirme o que foi criado com um resumo.
- Se o usuario pedir algo ambiguo, pergunte antes de executar.
- Ao listar dados, formate de forma clara e organizada.
- Niveles: 1=Disciplina, 2=Item, 3=Subitem.`

    const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const tools = projetoAiToolDefs(true)
    let reply = ''
    let loopCount = 0

    while (loopCount < 6) {
      loopCount++
      const aiRes = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: oaiMessages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1200,
      })

      const choice = aiRes.choices[0]

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        reply = choice.message.content?.trim() || ''
        break
      }

      oaiMessages.push(choice.message)
      const fnCalls = choice.message.tool_calls.filter(
        (t): t is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function' } => t.type === 'function'
      )

      for (const tc of fnCalls) {
        let args: Record<string, any> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
        const result = await execProjetoAiTool(db, tc.function.name, args, projetoId)
        oaiMessages.push({ role: 'tool', tool_call_id: tc.id, content: result || 'OK' })
      }
    }

    if (!reply) {
      return NextResponse.json({ error: 'Resposta vazia da IA' }, { status: 500 })
    }

    return NextResponse.json({ message: reply, mode: 'openai', model: 'gpt-4o' })
  } catch (error: any) {
    console.error('projeto-chat-ia error:', error)
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 })
  }
}
