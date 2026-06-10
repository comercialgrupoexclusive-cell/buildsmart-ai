import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

type ZApiPayload = {
  type: string
  phone: string
  fromMe: boolean
  senderName?: string
  chatName?: string
  text?: { message: string }
}

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key)
}

function cleanPhone(raw: string) {
  return raw.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '').trim()
}

async function sendZApi(phone: string, message: string) {
  const id = process.env.ZAPI_INSTANCE_ID
  const token = process.env.ZAPI_TOKEN
  const clientToken = process.env.ZAPI_CLIENT_TOKEN
  if (!id || !token) return

  await fetch(`https://api.z-api.io/instances/${id}/token/${token}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(clientToken ? { 'Client-Token': clientToken } : {}),
    },
    body: JSON.stringify({ phone, message }),
  }).catch(() => null)
}

// GET — Z-API faz ping para verificar se o endpoint está ativo
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Luizia WhatsApp' })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ZApiPayload

    // Só processa mensagens recebidas
    if (body.type !== 'ReceivedCallback') return NextResponse.json({ ok: true })
    if (body.fromMe) return NextResponse.json({ ok: true })

    const messageText = body.text?.message?.trim()
    if (!messageText) return NextResponse.json({ ok: true })

    const phone = cleanPhone(body.phone)
    const senderName = body.senderName || body.chatName || phone

    const openaiKey = process.env.OPENAI_API_KEY || ''
    if (!openaiKey.startsWith('sk-')) {
      return NextResponse.json({ ok: false, error: 'OpenAI nao configurado' })
    }

    const db = supabase()

    // Busca config global, regra do numero e historico em paralelo
    const [config, phoneRule, historyRows] = await Promise.all([
      db
        ? db.from('luizia_wa_config').select('key,value').then(r =>
            Object.fromEntries((r.data || []).map((x: any) => [x.key, x.value]))
          )
        : Promise.resolve({} as Record<string, string>),
      db
        ? db.from('luizia_wa_phone_rules').select('*').eq('phone', phone).maybeSingle().then(r => r.data)
        : Promise.resolve(null),
      db
        ? db
            .from('luizia_wa_messages')
            .select('role,content')
            .eq('phone', phone)
            .order('created_at', { ascending: false })
            .limit(12)
            .then(r => [...(r.data || [])].reverse())
        : Promise.resolve([]),
    ])

    // Verifica modo pausado e bloqueio
    if (config['modo_pausado'] === 'true') return NextResponse.json({ ok: true, skip: 'paused' })
    if (phoneRule?.bloqueado) return NextResponse.json({ ok: true, skip: 'blocked' })

    const DEFAULT_PERSONA = `Voce e a Luizia, assistente inteligente do BuildSmart AI, sistema de gestao de obras para construcao civil. Responda via WhatsApp de forma breve, clara e em portugues brasileiro. NAO use markdown (asterisco, hashtag, bullet). Escreva texto simples. Maximo 3 paragrafos curtos.`

    const systemPrompt = [
      config['persona_global'] || DEFAULT_PERSONA,
      phoneRule?.persona || '',
    ].filter(Boolean).join('\n\n')

    const openai = new OpenAI({ apiKey: openaiKey })
    const model = 'gpt-4o-mini'

    const aiResponse = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(historyRows as Array<{ role: 'user' | 'assistant'; content: string }>),
        { role: 'user', content: messageText },
      ],
      max_tokens: 600,
    })

    const reply = aiResponse.choices[0]?.message?.content?.trim()
    if (!reply) return NextResponse.json({ ok: false, error: 'Resposta vazia da IA' })

    // Salva historico e envia resposta em paralelo
    await Promise.all([
      db
        ? db.from('luizia_wa_messages').insert([
            { phone, sender_name: senderName, role: 'user', content: messageText },
            { phone, sender_name: 'Luizia', role: 'assistant', content: reply },
          ])
        : Promise.resolve(),
      sendZApi(phone, reply),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[whatsapp/webhook]', err)
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
