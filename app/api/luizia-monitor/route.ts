import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type LuiziaLogPayload = {
  origem?: string
  usuario?: string | null
  pergunta?: string
  resposta?: string
  mode?: string | null
  model?: string | null
}

function sanitize(payload: LuiziaLogPayload) {
  return {
    origem: payload.origem === 'floating' ? 'floating' : 'buildassist',
    usuario: payload.usuario || null,
    pergunta: String(payload.pergunta || '').slice(0, 12000),
    resposta: String(payload.resposta || '').slice(0, 24000),
    mode: payload.mode || null,
    model: payload.model || null,
  }
}

function supabaseAdminLite() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url.startsWith('http') || !key) return null
  return createClient(url, key)
}

export async function GET() {
  try {
    const supabase = supabaseAdminLite()
    if (!supabase) {
      return NextResponse.json({ logs: [], remote: false, error: 'Supabase nao configurado neste ambiente.' })
    }

    const { data, error } = await supabase
      .from('luizia_logs')
      .select('*')
      .order('at', { ascending: false })
      .limit(250)

    if (error) {
      return NextResponse.json({ logs: [], remote: false, error: error.message })
    }

    return NextResponse.json({ logs: data || [], remote: true })
  } catch (error: any) {
    return NextResponse.json({ logs: [], remote: false, error: error?.message || 'Falha ao buscar historico online.' })
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = sanitize(await req.json())
    if (!payload.pergunta || !payload.resposta) {
      return NextResponse.json({ error: 'Pergunta ou resposta vazia' }, { status: 400 })
    }

    const supabase = supabaseAdminLite()
    if (!supabase) {
      return NextResponse.json({ ok: false, remote: false, error: 'Supabase nao configurado neste ambiente.' })
    }

    const { error } = await supabase.from('luizia_logs').insert(payload)

    if (error) {
      return NextResponse.json({ ok: false, remote: false, error: error.message })
    }

    return NextResponse.json({ ok: true, remote: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, remote: false, error: error?.message || 'Falha ao salvar historico online.' })
  }
}

export async function DELETE() {
  try {
    const supabase = supabaseAdminLite()
    if (!supabase) {
      return NextResponse.json({ ok: false, remote: false, error: 'Supabase nao configurado neste ambiente.' })
    }

    const { error } = await supabase.from('luizia_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      return NextResponse.json({ ok: false, remote: false, error: error.message })
    }

    return NextResponse.json({ ok: true, remote: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, remote: false, error: error?.message || 'Falha ao limpar historico online.' })
  }
}
