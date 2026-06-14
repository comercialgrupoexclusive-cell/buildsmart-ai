import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { sendZApiText } from '@/lib/zapi'

export const maxDuration = 60

// ─── Supabase (service role — bypassa RLS) ───────────────────────────────────
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
type DB = NonNullable<ReturnType<typeof supabase>>

type Dispatch = {
  id: string
  nome: string
  tipo: 'resumo_obra' | 'personalizada'
  obra_id: string | null
  destino_phone: string
  destino_nome: string | null
  mensagem: string | null
  dias_semana: string        // "0,1,2..." 0=domingo
  horario: string            // "HH:MM:SS"
  recorrente: boolean
  ativo: boolean
}

// ─── Cálculo do próximo envio (fuso America/Sao_Paulo = UTC-3 fixo) ──────────
// Inclui jitter aleatório de 0 a 120 segundos para humanizar o horário
function calcNextRun(diasSemana: string, horario: string, after: Date = new Date()): Date | null {
  const dias = diasSemana.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6)
  if (dias.length === 0) return null
  const hhmm = horario.slice(0, 5) // "HH:MM"

  for (let i = 0; i < 8; i++) {
    // Data corrente no fuso de SP
    const spNow = new Date(after.getTime() - 3 * 3600 * 1000)
    const candidate = new Date(spNow)
    candidate.setUTCDate(candidate.getUTCDate() + i)
    const dow = candidate.getUTCDay()
    if (!dias.includes(dow)) continue

    const dateStr = candidate.toISOString().split('T')[0]
    // Constrói o timestamp no fuso -03:00
    const runAt = new Date(`${dateStr}T${hhmm}:00-03:00`)
    if (runAt.getTime() > after.getTime()) {
      const jitterMs = Math.floor(Math.random() * 120 * 1000) // 0–2 min
      return new Date(runAt.getTime() + jitterMs)
    }
  }
  return null
}

// ─── Gera resumo da obra via IA ───────────────────────────────────────────────
async function gerarResumoObra(db: DB, obraId: string, instrucaoExtra: string | null, botName: string): Promise<string> {
  const hoje = new Date().toISOString().split('T')[0]

  const [obraRes, etapasRes, materiaisRes, medicoesRes] = await Promise.all([
    db.from('obras').select('nome,status,endereco,responsavel,data_previsao').eq('id', obraId).single(),
    db.from('etapas').select('nome,status,data_inicio,data_fim').eq('obra_id', obraId).order('data_inicio').limit(20),
    db.from('materiais').select('descricao,quantidade_total,unidade,status_compra,data_necessidade')
      .eq('obra_id', obraId).neq('status_compra', 'comprado').order('data_necessidade').limit(15),
    db.from('medicoes').select('percentual_executado,observacao,created_at').eq('obra_id', obraId)
      .order('created_at', { ascending: false }).limit(3),
  ])

  const obra = obraRes.data as any
  if (!obra) return ''

  const etapas = (etapasRes.data || []) as any[]
  const proximasEtapas = etapas.filter(e => e.data_inicio && e.data_inicio >= hoje && e.status !== 'concluida').slice(0, 5)
  const emAndamento = etapas.filter(e => e.status === 'em_andamento')
  const concluidas = etapas.filter(e => e.status === 'concluida').length
  const materiais = (materiaisRes.data || []) as any[]
  const medicoes = (medicoesRes.data || []) as any[]

  const dados = [
    `Obra: ${obra.nome} (status: ${obra.status})`,
    obra.responsavel ? `Responsavel: ${obra.responsavel}` : '',
    obra.data_previsao ? `Previsao de conclusao: ${obra.data_previsao}` : '',
    `Avanco: ${concluidas}/${etapas.length} etapas concluidas`,
    emAndamento.length ? `Em andamento: ${emAndamento.map(e => e.nome).join(', ')}` : '',
    proximasEtapas.length ? `Proximas etapas:\n${proximasEtapas.map(e => `- ${e.nome} (inicio ${e.data_inicio})`).join('\n')}` : 'Sem proximas etapas agendadas.',
    materiais.length ? `Materiais pendentes de compra:\n${materiais.map(m => `- ${m.descricao} ${m.quantidade_total || ''} ${m.unidade || ''}${m.data_necessidade ? ` (necessario ${m.data_necessidade})` : ''}`).join('\n')}` : 'Sem materiais pendentes.',
    medicoes.length ? `Ultimo registro do diario: ${medicoes[0].observacao || ''} (${(medicoes[0].created_at || '').split('T')[0]})` : '',
  ].filter(Boolean).join('\n')

  const openaiKey = process.env.OPENAI_API_KEY || ''
  if (!openaiKey.startsWith('sk-')) {
    // Sem IA: envia os dados estruturados direto
    return `Resumo da obra ${obra.nome} (${hoje}):\n\n${dados}`
  }

  const openai = new OpenAI({ apiKey: openaiKey })
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Voce e a ${botName}, assistente do BuildSmart AI. Escreva um resumo de status de obra para enviar num grupo de WhatsApp da equipe. Texto simples SEM markdown (sem asterisco, sem hashtag). Tom profissional e direto, em portugues brasileiro. Estrutura: saudacao curta com nome da obra e data, status/avanco, proximas atividades, materiais pendentes (se houver), e encerramento curto. Maximo ~15 linhas.${instrucaoExtra ? `\n\nInstrucao adicional do gestor: ${instrucaoExtra}` : ''}`,
      },
      { role: 'user', content: `Dados atuais da obra (data de hoje: ${hoje}):\n\n${dados}` },
    ],
    max_tokens: 500,
  })
  return res.choices[0]?.message?.content?.trim() || ''
}

// ─── Processa um disparo ──────────────────────────────────────────────────────
async function processDispatch(db: DB, d: Dispatch, botName: string) {
  let conteudo = ''
  let status: 'ok' | 'erro' = 'ok'
  let erro: string | null = null

  try {
    if (d.tipo === 'personalizada') {
      conteudo = d.mensagem || ''
    } else if (d.tipo === 'resumo_obra' && d.obra_id) {
      conteudo = await gerarResumoObra(db, d.obra_id, d.mensagem, botName)
    }

    if (!conteudo.trim()) {
      status = 'erro'
      erro = 'Conteudo vazio (verifique mensagem/obra do disparo)'
    } else {
      const sent = await sendZApiText(d.destino_phone, conteudo)
      if (!sent.ok) { status = 'erro'; erro = sent.error || 'Falha no envio Z-API' }
    }
  } catch (err: any) {
    status = 'erro'
    erro = err?.message || 'Erro desconhecido'
  }

  // Log do envio
  await db.from('luizia_wa_dispatch_log').insert({
    dispatch_id: d.id,
    conteudo: conteudo.slice(0, 4000),
    status,
    erro,
  })

  // Reagenda ou desativa
  const updates: Record<string, unknown> = { last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  if (d.recorrente) {
    const next = calcNextRun(d.dias_semana, d.horario)
    updates.next_run_at = next ? next.toISOString() : null
    if (!next) updates.ativo = false
  } else {
    updates.ativo = false
    updates.next_run_at = null
  }
  await db.from('luizia_wa_dispatches').update(updates).eq('id', d.id)

  return { id: d.id, nome: d.nome, status, erro }
}

// ─── GET — healthcheck ────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Luiza Dispatch' })
}

// ─── POST — chamado pelo pg_cron a cada 5 min (ou manualmente p/ teste) ───────
export async function POST(req: NextRequest) {
  const db = supabase()
  if (!db) return NextResponse.json({ error: 'DB nao configurado' }, { status: 500 })

  try {
    const secret = process.env.DISPATCH_SECRET || ''
    const headerKey = req.headers.get('x-dispatch-key') || ''

    let body: any = {}
    try { body = await req.json() } catch { /* corpo vazio ok */ }

    // Config do bot (nome)
    const { data: cfgRows } = await db.from('luizia_wa_config').select('key,value')
    const cfg = Object.fromEntries((cfgRows || []).map((r: any) => [r.key, r.value]))
    const botName = cfg['bot_name'] || 'Luiza'

    // ── Modo teste: "Enviar agora" do painel (dispara 1 específico) ───────────
    if (body?.dispatch_id) {
      const { data: d } = await db.from('luizia_wa_dispatches').select('*').eq('id', body.dispatch_id).single()
      if (!d) return NextResponse.json({ error: 'Disparo nao encontrado' }, { status: 404 })
      // Envio manual não desativa nem reagenda — só envia e loga
      const disp = d as Dispatch
      let conteudo = ''
      if (disp.tipo === 'personalizada') conteudo = disp.mensagem || ''
      else if (disp.obra_id) conteudo = await gerarResumoObra(db, disp.obra_id, disp.mensagem, botName)
      if (!conteudo.trim()) return NextResponse.json({ error: 'Conteudo vazio' }, { status: 400 })
      const sent = await sendZApiText(disp.destino_phone, conteudo)
      await db.from('luizia_wa_dispatch_log').insert({
        dispatch_id: disp.id, conteudo: conteudo.slice(0, 4000),
        status: sent.ok ? 'ok' : 'erro', erro: sent.error || null,
      })
      return NextResponse.json({ ok: sent.ok, manual: true, erro: sent.error || null })
    }

    // ── Modo cron: exige o secret ──────────────────────────────────────────────
    if (!secret || headerKey !== secret) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    if (cfg['modo_pausado'] === 'true') return NextResponse.json({ ok: true, skip: 'paused' })

    // Busca disparos vencidos
    const now = new Date().toISOString()
    const { data: due } = await db
      .from('luizia_wa_dispatches')
      .select('*')
      .eq('ativo', true)
      .lte('next_run_at', now)
      .limit(10)

    if (!due?.length) return NextResponse.json({ ok: true, processed: 0 })

    const results = []
    for (const d of due as Dispatch[]) {
      results.push(await processDispatch(db, d, botName))
    }

    console.log('DISPATCH RUN', JSON.stringify(results))
    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (err: any) {
    console.error('[dispatch]', err)
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
