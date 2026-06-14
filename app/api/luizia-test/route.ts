import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// Rota para testar a Luiza direto no painel admin
// Não envia WhatsApp — só retorna a resposta da IA
export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

    const openaiKey = process.env.OPENAI_API_KEY || ''
    if (!openaiKey.startsWith('sk-')) return NextResponse.json({ error: 'OpenAI nao configurado' }, { status: 500 })

    const openai = new OpenAI({ apiKey: openaiKey })

    // Busca persona salva
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: cfgRows } = await db.from('luizia_wa_config').select('key,value')
    const cfg = Object.fromEntries((cfgRows || []).map((r: any) => [r.key, r.value]))

    const DEFAULT_PERSONA = `Voce e a Luiza, assistente inteligente do BuildSmart AI. Responda de forma breve, clara e em portugues brasileiro. NAO use markdown. Texto simples. Maximo 3 paragrafos curtos.`
    const systemPrompt = cfg['persona_global'] || DEFAULT_PERSONA

    // Monta histórico da conversa de teste
    const msgs: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(history as Array<{ role: string; text: string }>).map(h => ({
        role: (h.role === 'luizia' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: h.text,
      })),
      { role: 'user', content: message },
    ]

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: msgs,
      max_tokens: 600,
    })

    const reply = res.choices[0]?.message?.content?.trim() || ''
    return NextResponse.json({ reply })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
