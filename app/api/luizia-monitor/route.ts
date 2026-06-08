import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('luizia_logs')
    .select('*')
    .order('at', { ascending: false })
    .limit(250)

  if (error) {
    return NextResponse.json({ logs: [], remote: false, error: error.message })
  }

  return NextResponse.json({ logs: data || [], remote: true })
}

export async function POST(req: NextRequest) {
  const payload = sanitize(await req.json())
  if (!payload.pergunta || !payload.resposta) {
    return NextResponse.json({ error: 'Pergunta ou resposta vazia' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('luizia_logs').insert(payload)

  if (error) {
    return NextResponse.json({ ok: false, remote: false, error: error.message })
  }

  return NextResponse.json({ ok: true, remote: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const { error } = await supabase.from('luizia_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  if (error) {
    return NextResponse.json({ ok: false, remote: false, error: error.message })
  }

  return NextResponse.json({ ok: true, remote: true })
}
