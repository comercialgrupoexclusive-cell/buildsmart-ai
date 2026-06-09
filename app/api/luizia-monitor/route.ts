import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

type LogPayload = {
  origem?: 'buildassist' | 'floating' | 'whatsapp'
  usuario?: string | null
  pergunta?: string
  resposta?: string
  mode?: string | null
  model?: string | null
}

function getSupabase() {
  const url = supabaseUrl()
  const key = supabaseAnonKey()
  if (!url.startsWith('http') || !key) return null
  return createClient(url, key)
}

function clean(payload: LogPayload) {
  const origem = ['buildassist', 'floating', 'whatsapp'].includes(payload.origem || '')
    ? payload.origem
    : 'buildassist'

  return {
    origem,
    usuario: payload.usuario || null,
    pergunta: String(payload.pergunta || '').slice(0, 12000),
    resposta: String(payload.resposta || '').slice(0, 24000),
    mode: payload.mode || null,
    model: payload.model || null,
  }
}

export async function GET() {
  try {
    const supabase = getSupabase()
    if (!supabase) return NextResponse.json({ remote: false, logs: [], error: 'Supabase nao configurado.' })

    const { data, error } = await supabase
      .from('luizia_logs')
      .select('*')
      .order('at', { ascending: false })
      .limit(250)

    if (error) return NextResponse.json({ remote: false, logs: [], error: error.message })
    return NextResponse.json({ remote: true, logs: data || [] })
  } catch (error: unknown) {
    return NextResponse.json({ remote: false, logs: [], error: error instanceof Error ? error.message : 'Falha ao buscar historico.' })
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = clean(await req.json())
    if (!payload.pergunta || !payload.resposta) {
      return NextResponse.json({ ok: false, remote: false, error: 'Pergunta ou resposta vazia.' })
    }

    const supabase = getSupabase()
    if (!supabase) return NextResponse.json({ ok: false, remote: false, error: 'Supabase nao configurado.' })

    const { error } = await supabase.from('luizia_logs').insert(payload)
    if (error) return NextResponse.json({ ok: false, remote: false, error: error.message })
    return NextResponse.json({ ok: true, remote: true })
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, remote: false, error: error instanceof Error ? error.message : 'Falha ao salvar historico.' })
  }
}

