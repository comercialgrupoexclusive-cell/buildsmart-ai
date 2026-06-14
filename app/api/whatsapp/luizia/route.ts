import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { askLuizia } from '@/lib/luizia-core'
import { createLocalClient, isLocalDataMode } from '@/lib/data/local-client'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/config'

type QueryLike = {
  select: (columns?: string) => QueryLike
  order: (column: string, options?: { ascending?: boolean }) => QueryLike
  limit: (count: number) => Promise<unknown> | QueryLike
  insert: (payload: unknown) => Promise<unknown> | QueryLike
}

type SupabaseLike = {
  from: (table: string) => QueryLike
}

type Row = Record<string, unknown>

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twiml(message: string, status = 200) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

function getSupabase(): SupabaseLike | null {
  if (isLocalDataMode()) return createLocalClient() as unknown as SupabaseLike

  const url = supabaseUrl()
  const key = supabaseAnonKey()
  if (!url.startsWith('http') || !key) return null

  return createSupabaseClient(url, key) as unknown as SupabaseLike
}

function safeRows(result: unknown): Row[] {
  const data = result && typeof result === 'object' && 'data' in result ? result.data : null
  return Array.isArray(data) ? data as Row[] : []
}

function compact(row: Row, fields: string[]) {
  return fields.reduce((acc, field) => {
    if (row[field] !== undefined && row[field] !== null) acc[field] = row[field]
    return acc
  }, {} as Row)
}

async function buildWhatsappContext(from: string) {
  const supabase = getSupabase()
  if (!supabase) {
    return {
      modo: 'whatsapp',
      origem: 'whatsapp',
      usuario: { whatsapp: from },
      observacao: 'Supabase nao configurado; contexto de obra indisponivel. Atendimento somente orientativo.',
    }
  }

  const [
    obrasRes,
    orcamentosRes,
    etapasRes,
    materiaisRes,
    fornecedoresRes,
  ] = await Promise.all([
    supabase.from('obras').select('id,nome,status,data_inicio,data_previsao,responsavel,area_m2,uf').order('created_at', { ascending: false }).limit(3),
    supabase.from('orcamentos').select('id,obra_id,tipo,status,versao,bdi_percentual,created_at').order('created_at', { ascending: false }).limit(8),
    supabase.from('etapas').select('id,obra_id,nome,data_inicio,data_fim,status,ordem').order('data_inicio').limit(25),
    supabase.from('materiais').select('id,obra_id,etapa_id,subetapa,descricao,unidade,quantidade_total,quantidade_comprada,status_compra,data_necessidade').order('data_necessidade').limit(35),
    supabase.from('fornecedores').select('id,obra_id,nome,categoria,telefone,ativo').order('nome').limit(20),
  ])

  const obras = safeRows(obrasRes)
  const obraAtual = obras[0] || null
  const obraId = obraAtual?.id || ''
  const orcamentos = safeRows(orcamentosRes).filter(item => !obraId || item.obra_id === obraId)
  const etapas = safeRows(etapasRes).filter(item => !obraId || item.obra_id === obraId)
  const materiais = safeRows(materiaisRes).filter(item => !obraId || item.obra_id === obraId)
  const fornecedores = safeRows(fornecedoresRes).filter(item => !item.obra_id || item.obra_id === obraId)
  const materiaisAbertos = materiais.filter(item => item.status_compra !== 'comprado').slice(0, 15)
  const proximasEtapas = etapas.filter(item => item.status !== 'concluida').slice(0, 10)

  return {
    modo: 'whatsapp',
    origem: 'whatsapp',
    geradoEm: new Date().toISOString(),
    usuario: { whatsapp: from },
    obraAtual,
    obras: obras.map(obra => compact(obra, ['id', 'nome', 'status', 'data_inicio', 'data_previsao', 'responsavel', 'area_m2', 'uf'])),
    orcamentos,
    etapas: proximasEtapas,
    materiais: materiaisAbertos,
    fornecedores: fornecedores.slice(0, 12),
    resumoSistema: {
      obras: obras.length,
      orcamentos: safeRows(orcamentosRes).length,
      etapas: safeRows(etapasRes).length,
      materiais: safeRows(materiaisRes).length,
      fornecedores: safeRows(fornecedoresRes).length,
      materiaisEmAberto: materiaisAbertos.length,
      proximasEtapas: proximasEtapas.length,
    },
    observacao: 'Atendimento pelo WhatsApp. Contexto carregado no servidor em modo somente leitura. A Luiza nao pode criar, editar nem excluir dados.',
  }
}

async function logWhatsappConversation(payload: {
  usuario: string
  pergunta: string
  resposta: string
  mode?: string | null
  model?: string | null
}) {
  try {
    const supabase = getSupabase()
    if (!supabase || isLocalDataMode()) return

    await supabase.from('luizia_logs').insert({
      origem: 'whatsapp',
      usuario: payload.usuario,
      pergunta: payload.pergunta.slice(0, 12000),
      resposta: payload.resposta.slice(0, 24000),
      mode: payload.mode || null,
      model: payload.model || null,
    })
  } catch (error) {
    console.error('WhatsApp Luiza monitor error:', error)
  }
}

function publicUrlFor(req: NextRequest) {
  const configuredUrl = process.env.WHATSAPP_LUIZIA_WEBHOOK_URL
  if (configuredUrl?.startsWith('http')) return configuredUrl

  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host
  return `${proto}://${host}${req.nextUrl.pathname}`
}

function isValidTwilioRequest(req: NextRequest, params: Record<string, string>) {
  if (process.env.TWILIO_VALIDATE_SIGNATURE !== 'true') return true

  const token = process.env.TWILIO_AUTH_TOKEN || ''
  const signature = req.headers.get('x-twilio-signature') || ''
  if (!token || !signature) return false

  const data = Object.keys(params).sort().reduce((acc, key) => `${acc}${key}${params[key]}`, publicUrlFor(req))
  const expected = createHmac('sha1', token).update(data).digest('base64')
  return expected === signature
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tempo limite da resposta da Luiza no WhatsApp')), ms)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer))
  })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/whatsapp/luizia',
    message: 'Webhook da Luiza para WhatsApp ativo. Configure esta URL no Twilio como POST.',
  })
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const params = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]))

    if (!isValidTwilioRequest(req, params)) {
      return twiml('Nao foi possivel validar a origem desta mensagem. Confira a configuracao da Twilio.', 403)
    }

    const from = params.From || 'whatsapp:desconhecido'
    const body = (params.Body || '').trim()
    const mediaCount = Number(params.NumMedia || 0)

    if (!body && mediaCount > 0) {
      return twiml('Recebi seu arquivo/imagem, mas nesta primeira versao eu respondo melhor por texto. Envie uma pergunta escrita para a Luiza.')
    }

    if (!body) {
      return twiml('Oi, eu sou a Luiza. Envie uma pergunta sobre obra, orcamento, materiais, compras ou cronograma.')
    }

    let context
    try {
      context = await withTimeout(buildWhatsappContext(from), 2500)
    } catch (error) {
      console.error('WhatsApp Luiza context timeout/error:', error)
      context = {
        modo: 'whatsapp',
        origem: 'whatsapp',
        usuario: { whatsapp: from },
        observacao: 'Nao foi possivel carregar o contexto do sistema a tempo. Responda apenas com orientacoes gerais e diga quando faltar dado da obra.',
      }
    }
    let result
    try {
      result = await withTimeout(askLuizia({
        messages: [{ role: 'user', content: body }],
        complex: false,
        context,
      }), 8500)
    } catch (error) {
      console.error('WhatsApp Luiza timeout/error:', error)
      return twiml('A Luiza demorou mais do que o WhatsApp permite para responder. Tente enviar uma pergunta mais curta ou tente novamente em instantes.')
    }

    await logWhatsappConversation({
      usuario: from,
      pergunta: body,
      resposta: result.message,
      mode: result.mode,
      model: result.model,
    })

    return twiml(result.message)
  } catch (error: unknown) {
    console.error('WhatsApp Luiza error:', error)
    return twiml('Nao consegui responder agora. Confira a configuracao da Luiza no servidor e tente novamente.', 500)
  }
}
