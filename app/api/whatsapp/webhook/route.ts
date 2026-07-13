import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

// Aumenta o timeout do Vercel de 10s para 60s (funciona no plano Pro)
// No plano Hobby permanece 10s — se CRUD travar, assinar Vercel Pro
export const maxDuration = 60

// ─── Supabase ────────────────────────────────────────────────────────────────
// Usa SERVICE ROLE KEY no servidor — bypassa RLS e acessa todas as tabelas
// A chave anon bloqueia obras/materiais/etapas por RLS (auth necessária)
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  // Service Role Key tem prioridade (bypass RLS). Fallback para anon key.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
type DB = NonNullable<ReturnType<typeof supabase>>

// ─── Helpers ─────────────────────────────────────────────────────────────────
function cleanPhone(raw: string) {
  return (raw || '').replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '').trim()
}

// ─── Z-API ────────────────────────────────────────────────────────────────────
async function sendZApi(phone: string, message: string) {
  const id = process.env.ZAPI_INSTANCE_ID
  const token = process.env.ZAPI_TOKEN
  const clientToken = process.env.ZAPI_CLIENT_TOKEN
  if (!id || !token) { console.log('ZAPI SEND SKIP'); return }
  try {
    const res = await fetch(`https://api.z-api.io/instances/${id}/token/${token}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
      body: JSON.stringify({ phone, message }),
    })
    const data = await res.json()
    console.log('ZAPI SEND RESULT', res.status, JSON.stringify(data))
  } catch (err: any) { console.log('ZAPI SEND ERROR', err?.message) }
}

// ─── Whisper ─────────────────────────────────────────────────────────────────
async function transcribeAudio(openai: OpenAI, audioUrl: string) {
  try {
    const r = await fetch(audioUrl)
    const buf = await r.arrayBuffer()
    const file = new File([buf], 'audio.ogg', { type: 'audio/ogg; codecs=opus' })
    const t = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'pt' })
    return t.text || ''
  } catch (err: any) { console.log('WHISPER ERROR', err?.message); return '' }
}

// ─── Tools (function calling) ─────────────────────────────────────────────────
function buildTools(crudEnabled: boolean): OpenAI.Chat.ChatCompletionTool[] {
  if (!crudEnabled) return []
  return [
    {
      type: 'function',
      function: {
        name: 'listar_obras',
        description: 'Lista todas as obras cadastradas no BuildSmart com nome, status e UF.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_obra',
        description: 'Cria uma nova obra no BuildSmart.',
        parameters: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Nome da obra' },
            endereco: { type: 'string', description: 'Endereço da obra (opcional)' },
            responsavel: { type: 'string', description: 'Responsável técnico (opcional)' },
            uf: { type: 'string', description: 'Sigla do estado, ex: RS, SP, RJ (padrão RS)' },
            status: { type: 'string', enum: ['orcamento', 'ativa', 'concluida', 'paralisada'], description: 'Status inicial' },
          },
          required: ['nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'atualizar_status_obra',
        description: 'Atualiza o status de uma obra existente.',
        parameters: {
          type: 'object',
          properties: {
            nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' },
            status: { type: 'string', enum: ['orcamento', 'ativa', 'concluida', 'paralisada'] },
          },
          required: ['nome_obra', 'status'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'listar_etapas',
        description: 'Lista as etapas (fases) de uma obra.',
        parameters: {
          type: 'object',
          properties: {
            nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' },
          },
          required: ['nome_obra'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_etapa',
        description: 'Cria uma etapa/fase em uma obra.',
        parameters: {
          type: 'object',
          properties: {
            nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' },
            nome: { type: 'string', description: 'Nome da etapa (ex: Fundação, Estrutura)' },
            status: { type: 'string', enum: ['planejada', 'em_andamento', 'concluida', 'atrasada'], description: 'Status da etapa' },
          },
          required: ['nome_obra', 'nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'listar_materiais',
        description: 'Lista materiais de uma obra, com status de compra.',
        parameters: {
          type: 'object',
          properties: {
            nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' },
            status_compra: { type: 'string', enum: ['nao_comprado', 'parcial', 'comprado', 'todos'] },
          },
          required: ['nome_obra'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'adicionar_material',
        description: 'Adiciona um material a uma obra.',
        parameters: {
          type: 'object',
          properties: {
            nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' },
            descricao: { type: 'string', description: 'Nome/descrição do material (ex: Cimento CP-II, Areia média)' },
            quantidade: { type: 'number', description: 'Quantidade necessária' },
            unidade: { type: 'string', description: 'Unidade (m², kg, un, m, sacos, etc.)' },
            data_necessidade: { type: 'string', description: 'Data de necessidade no formato YYYY-MM-DD (opcional)' },
          },
          required: ['nome_obra', 'descricao'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'registrar_medicao',
        description: 'Registra uma medição ou anotação no diário da obra.',
        parameters: {
          type: 'object',
          properties: {
            nome_obra: { type: 'string', description: 'Nome ou parte do nome da obra' },
            observacao: { type: 'string', description: 'Texto da observação ou registro' },
            percentual_executado: { type: 'number', description: 'Percentual executado no período (0-100), padrão 0' },
          },
          required: ['nome_obra', 'observacao'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'listar_pendencias',
        description: 'Lista materiais pendentes (não comprados) de todas as obras.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
  ]
}

// ─── Executor de funções ──────────────────────────────────────────────────────
async function executeTool(db: DB, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {

      case 'listar_obras': {
        const { data } = await db.from('obras').select('nome,status,uf,responsavel').order('created_at', { ascending: false }).limit(15)
        if (!data?.length) return 'Nenhuma obra cadastrada.'
        return data.map((o: any) => `- ${o.nome} | ${o.status} | ${o.uf}${o.responsavel ? ' | Resp: ' + o.responsavel : ''}`).join('\n')
      }

      case 'criar_obra': {
        const { data, error } = await db.from('obras').insert({
          nome: args.nome,
          endereco: args.endereco || '',
          responsavel: args.responsavel || null,
          uf: (args.uf as string || 'RS').toUpperCase(),
          status: args.status || 'orcamento',
        }).select('id,nome').single()
        if (error) return `Erro ao criar obra: ${error.message}`
        return `Obra "${(data as any).nome}" criada com sucesso!`
      }

      case 'atualizar_status_obra': {
        const { data: obras } = await db.from('obras').select('id,nome').ilike('nome', `%${args.nome_obra}%`).limit(1)
        if (!obras?.length) return `Obra "${args.nome_obra}" nao encontrada.`
        const obra = obras[0] as any
        const { error } = await db.from('obras').update({ status: args.status }).eq('id', obra.id)
        if (error) return `Erro: ${error.message}`
        return `Status da obra "${obra.nome}" atualizado para "${args.status}".`
      }

      case 'listar_etapas': {
        const { data: obras } = await db.from('obras').select('id,nome').ilike('nome', `%${args.nome_obra}%`).limit(1)
        if (!obras?.length) return `Obra "${args.nome_obra}" nao encontrada.`
        const obra = obras[0] as any
        const { data: etapas } = await db.from('etapas').select('nome,status,ordem').eq('obra_id', obra.id).order('ordem')
        if (!etapas?.length) return `Obra "${obra.nome}" nao tem etapas cadastradas.`
        return `Etapas de "${obra.nome}":\n${(etapas as any[]).map(e => `- ${e.nome} (${e.status})`).join('\n')}`
      }

      case 'criar_etapa': {
        const { data: obras } = await db.from('obras').select('id,nome').ilike('nome', `%${args.nome_obra}%`).limit(1)
        if (!obras?.length) return `Obra "${args.nome_obra}" nao encontrada.`
        const obra = obras[0] as any
        const { count } = await db.from('etapas').select('*', { count: 'exact', head: true }).eq('obra_id', obra.id)
        const { error } = await db.from('etapas').insert({
          obra_id: obra.id,
          nome: args.nome,
          status: args.status || 'planejada',
          ordem: (count || 0),
        })
        if (error) return `Erro: ${error.message}`
        return `Etapa "${args.nome}" criada na obra "${obra.nome}".`
      }

      case 'listar_materiais': {
        const { data: obras } = await db.from('obras').select('id,nome').ilike('nome', `%${args.nome_obra}%`).limit(1)
        if (!obras?.length) return `Obra "${args.nome_obra}" nao encontrada.`
        const obra = obras[0] as any
        let query = db.from('materiais').select('descricao,quantidade_total,unidade,status_compra').eq('obra_id', obra.id)
        const sc = args.status_compra as string
        if (sc && sc !== 'todos') query = query.eq('status_compra', sc)
        const { data: mats } = await query.limit(20)
        if (!mats?.length) return `Nenhum material encontrado em "${obra.nome}".`
        return `Materiais de "${obra.nome}":\n${(mats as any[]).map(m => `- ${m.descricao} ${m.quantidade_total || ''} ${m.unidade} (${m.status_compra})`).join('\n')}`
      }

      case 'adicionar_material': {
        const { data: obras } = await db.from('obras').select('id,nome').ilike('nome', `%${args.nome_obra}%`).limit(1)
        if (!obras?.length) return `Obra "${args.nome_obra}" nao encontrada.`
        const obra = obras[0] as any
        const codigo = `WA-${Date.now().toString(36).toUpperCase()}`
        const { error } = await db.from('materiais').insert({
          obra_id: obra.id,
          sinapi_codigo: codigo,
          descricao: args.descricao,
          unidade: (args.unidade as string || 'UN').toUpperCase(),
          quantidade_total: args.quantidade || 1,
          quantidade_comprada: 0,
          status_compra: 'nao_comprado',
          data_necessidade: args.data_necessidade || null,
        })
        if (error) return `Erro: ${error.message}`
        return `Material "${args.descricao}" adicionado a obra "${obra.nome}".`
      }

      case 'registrar_medicao': {
        const { data: obras } = await db.from('obras').select('id,nome').ilike('nome', `%${args.nome_obra}%`).limit(1)
        if (!obras?.length) return `Obra "${args.nome_obra}" nao encontrada.`
        const obra = obras[0] as any
        const hoje = new Date().toISOString().split('T')[0]
        const { error } = await db.from('medicoes').insert({
          obra_id: obra.id,
          periodo_inicio: hoje,
          periodo_fim: hoje,
          percentual_executado: args.percentual_executado || 0,
          observacao: args.observacao,
        })
        if (error) return `Erro: ${error.message}`
        return `Medicao registrada na obra "${obra.nome}": ${args.observacao}`
      }

      case 'listar_pendencias': {
        const { data } = await db
          .from('materiais')
          .select('descricao,quantidade_total,unidade,obras(nome)')
          .eq('status_compra', 'nao_comprado')
          .limit(20)
        if (!data?.length) return 'Nenhuma pendencia de compra encontrada.'
        return `Materiais pendentes:\n${(data as any[]).map(m => `- [${(m.obras as any)?.nome}] ${m.descricao} ${m.quantidade_total} ${m.unidade}`).join('\n')}`
      }

      default:
        return `Funcao "${name}" nao reconhecida.`
    }
  } catch (err: any) {
    console.log(`TOOL ERROR [${name}]`, err?.message)
    return `Erro ao executar ${name}: ${err?.message}`
  }
}

// ─── Contexto BuildSmart do usuário ──────────────────────────────────────────
async function buildUserContext(db: DB, phone: string) {
  try {
    const { data: waUser } = await db
      .from('luizia_wa_users')
      .select('nome,user_id,contexto')
      .eq('phone', phone)
      .maybeSingle()
    if (!waUser) return { ctx: '', waUser: null }

    let ctx = `Usuario identificado: ${(waUser as any).nome || phone}`
    if ((waUser as any).contexto) ctx += `\n${(waUser as any).contexto}`

    // Obras resumidas
    const { data: obras } = await db.from('obras').select('nome,status').order('created_at', { ascending: false }).limit(8)
    if (obras?.length) {
      ctx += `\n\nObras no sistema:\n${(obras as any[]).map(o => `- ${o.nome} (${o.status})`).join('\n')}`
    }
    return { ctx, waUser }
  } catch { return { ctx: '', waUser: null } }
}

// ─── Log ─────────────────────────────────────────────────────────────────────
async function logRaw(db: DB | null, payload: unknown, note: string) {
  if (!db) return
  try {
    await db.from('luizia_logs').insert({
      origem: 'whatsapp', usuario: note,
      pergunta: JSON.stringify(payload).slice(0, 2000),
      resposta: '', mode: 'whatsapp', model: 'log',
    })
  } catch { /* ignore */ }
}

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Luiza WhatsApp' })
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const db = supabase()

  try {
    const body = await req.json()
    console.log('ZAPI WEBHOOK RECEBIDO', JSON.stringify(body).slice(0, 300))
    if (db) await logRaw(db, body, `fromMe=${body?.fromMe} phone=${body?.phone}`)

    if (body.fromMe === true) return NextResponse.json({ ok: true, skip: 'fromMe' })

    // ── Phones ───────────────────────────────────────────────────────────────
    const isGroup: boolean = body.isGroup === true
    const phone = cleanPhone(body.phone || body.chatId || '')
    if (!phone) return NextResponse.json({ ok: true, skip: 'no-phone' })
    const senderPhone = body.participantPhone ? cleanPhone(body.participantPhone) : phone
    const senderName: string = body.senderName || body.chatName || senderPhone
    const lookupPhone = isGroup ? senderPhone : phone

    // ── Roteamento FamilyHub ────────────────────────────────────────────────
    // Mesmo número Z-API atende dois sistemas. Se o telefone pertence a um
    // usuário cadastrado no FamilyHub, repassa a mensagem pro webhook dele e
    // não processa como Luizia/BuildSmart.
    const fhUrl = process.env.FAMILYHUB_SUPABASE_URL
    const fhKey = process.env.FAMILYHUB_SUPABASE_SERVICE_ROLE_KEY
    const fhWebhook = process.env.FAMILYHUB_WEBHOOK_URL
    if (fhUrl && fhKey && fhWebhook) {
      try {
        const fhDb = createClient(fhUrl, fhKey, { auth: { autoRefreshToken: false, persistSession: false } })
        const { data: fhUser } = await fhDb.from('usuarios').select('id').eq('whatsapp', lookupPhone).maybeSingle()
        if (fhUser) {
          await fetch(fhWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          return NextResponse.json({ ok: true, routed: 'familyhub' })
        }
      } catch (err: any) {
        console.log('FAMILYHUB ROUTING ERROR', err?.message)
        // segue como BuildSmart em caso de falha no roteamento
      }
    }

    // ── Texto ─────────────────────────────────────────────────────────────────
    let messageText: string = (body?.text?.message || body?.body || body?.caption || '').trim()

    // ── Config preliminar ──────────────────────────────────────────────────────
    const preConfig: Record<string, string> = db
      ? Object.fromEntries(((await db.from('luizia_wa_config').select('key,value')).data || []).map((r: any) => [r.key, r.value]))
      : {}
    const audioEnabledPre = preConfig['audio_enabled'] !== 'false'

    // ── Áudio ─────────────────────────────────────────────────────────────────
    let isAudio = false
    const audioUrl: string = body?.audio?.audioUrl || body?.audio?.url || ''
    if (!messageText && audioUrl && audioEnabledPre) {
      isAudio = true
      console.log('STEP transcribing-audio')
      const key = process.env.OPENAI_API_KEY || ''
      if (key.startsWith('sk-')) {
        const tmp = new OpenAI({ apiKey: key })
        messageText = await transcribeAudio(tmp, audioUrl)
        console.log('STEP transcript', messageText.slice(0, 80))
      }
    }

    // ── Imagem ────────────────────────────────────────────────────────────────
    const imageUrl: string = body?.image?.imageUrl || body?.image?.url || ''
    const imageCaption: string = body?.image?.caption || ''
    const hasImage = !!imageUrl

    // ── Documento (PDF) ───────────────────────────────────────────────────────
    let isDocument = false
    const docUrl: string = body?.document?.documentUrl || body?.document?.url || ''
    const docMime: string = body?.document?.mimeType || ''
    const docName: string = body?.document?.fileName || body?.document?.title || 'documento'
    const docCaption: string = body?.document?.caption || ''
    if (docUrl && (docMime.includes('pdf') || /\.pdf$/i.test(docName))) {
      isDocument = true
      console.log('STEP extracting-pdf', docName)
      try {
        const { extractText, getDocumentProxy } = await import('unpdf')
        const pdfRes = await fetch(docUrl)
        const buf = await pdfRes.arrayBuffer()
        const pdf = await getDocumentProxy(new Uint8Array(buf))
        const { text, totalPages } = await extractText(pdf, { mergePages: true })
        const textoPdf = (text || '').trim().slice(0, 12000)
        console.log('STEP pdf-text', `${totalPages} pág, ${textoPdf.length} chars`)
        if (textoPdf) {
          messageText = [
            docCaption || messageText || `Analise este documento e me diga o que e importante.`,
            `\n\n[CONTEUDO DO PDF "${docName}" - ${totalPages} pagina(s)]:\n${textoPdf}`,
          ].join('')
        } else {
          messageText = messageText || docCaption || `Recebi o documento "${docName}" mas nao consegui extrair texto dele (pode ser PDF escaneado/imagem).`
        }
      } catch (err: any) {
        console.log('PDF ERROR', err?.message)
      }
    }

    if (!messageText && !hasImage) return NextResponse.json({ ok: true, skip: 'no-content' })

    // ── Grupos: comportamento controlado pela config ──────────────────────────
    // group_require_mention = true → só responde quando mencionar "Luizia"
    // group_require_mention = false (ou ausente) → responde a TUDO no grupo
    // Esse comportamento é configurável pelo painel /admin-luizia → Configuração

    // ── OpenAI ────────────────────────────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY || ''
    console.log('STEP openai-key', openaiKey ? 'ok' : 'MISSING')
    if (!openaiKey.startsWith('sk-')) return NextResponse.json({ ok: false, error: 'OpenAI nao configurado' })
    const openai = new OpenAI({ apiKey: openaiKey })

    // ── Config + regras + histórico + contexto ────────────────────────────────
    const [configArr, phoneRule, historyRows, { ctx: userCtx }] = await Promise.all([
      db ? db.from('luizia_wa_config').select('key,value').then(r => r.data || []) : Promise.resolve([]),
      db ? db.from('luizia_wa_phone_rules').select('*').eq('phone', lookupPhone).maybeSingle().then(r => r.data) : Promise.resolve(null),
      db ? db.from('luizia_wa_messages').select('role,content').eq('phone', isGroup ? phone : lookupPhone)
        .order('created_at', { ascending: false }).limit(16).then(r => [...(r.data || [])].reverse()) : Promise.resolve([]),
      db ? buildUserContext(db, lookupPhone) : Promise.resolve({ ctx: '', waUser: null }),
    ])

    const config: Record<string, string> = Object.fromEntries((configArr as any[]).map(r => [r.key, r.value]))

    if (config['modo_pausado'] === 'true') return NextResponse.json({ ok: true, skip: 'paused' })
    if ((phoneRule as any)?.bloqueado) return NextResponse.json({ ok: true, skip: 'blocked' })

    const crudEnabled = config['crud_enabled'] !== 'false'
    const audioEnabled = config['audio_enabled'] !== 'false'
    const photosEnabled = config['photos_enabled'] !== 'false'
    const requireMention = config['group_require_mention'] === 'true' // padrão: NÃO exige

    // Nome da IA configurável no painel (config bot_name) — usado na detecção de menção
    const botName = (config['bot_name'] || 'Luiza').trim()

    // Filtra grupos se a config exigir menção e a mensagem não citar o nome da IA
    // Aceita o nome configurado + variações Luiza/Luizia (transição de nome)
    if (isGroup && requireMention) {
      const nameEscaped = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const mentionRegex = new RegExp(`${nameEscaped}|luiz(i?)a`, 'i')
      if (!mentionRegex.test(messageText + ' ' + imageCaption)) {
        return NextResponse.json({ ok: true, skip: 'group-no-mention' })
      }
    }

    // ── Busca lista de obras atual para contexto (sempre, não só se vinculado) ─
    let obrasCtx = ''
    if (db && crudEnabled) {
      try {
        const { data: obras } = await db.from('obras').select('nome,status').order('created_at', { ascending: false }).limit(10)
        if (obras?.length) {
          obrasCtx = `Obras cadastradas no sistema:\n${(obras as any[]).map(o => `- ${o.nome} (${o.status})`).join('\n')}`
        }
      } catch { /* ignora */ }
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    const DEFAULT_PERSONA = `Voce e a ${botName}, assistente inteligente do BuildSmart AI, sistema de gestao de obras para construcao civil. Responda via WhatsApp de forma breve, clara e em portugues brasileiro. NAO use markdown (asterisco, hashtag, bullet). Escreva texto simples. Maximo 3 paragrafos curtos. Voce tem acesso ao banco de dados do BuildSmart e pode criar, listar e atualizar obras, etapas, materiais e medicoes usando as funcoes disponiveis. Use sempre as funcoes para consultar dados atuais.`

    const systemPrompt = [
      config['persona_global'] || DEFAULT_PERSONA,
      `Seu nome e ${botName}.`,
      (phoneRule as any)?.persona || '',
      userCtx || '',
      obrasCtx || '',
      isGroup ? `Voce esta em um grupo de WhatsApp chamado "${body.chatName || 'grupo'}".` : '',
      isAudio ? 'O usuario enviou um audio que foi transcrito automaticamente.' : '',
      isDocument ? 'O usuario enviou um documento PDF cujo conteudo foi extraido e incluido na mensagem.' : '',
    ].filter(Boolean).join('\n\n')

    // ── Mensagens ─────────────────────────────────────────────────────────────
    // gpt-4o quando há ferramentas ou imagem — muito mais confiável para tool calling
    const model = (hasImage && photosEnabled) || crudEnabled ? 'gpt-4o' : 'gpt-4o-mini'
    console.log('STEP calling-openai model=' + model)

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] | string = hasImage && photosEnabled
      ? [
          { type: 'image_url', image_url: { url: imageUrl } },
          { type: 'text', text: messageText || imageCaption || 'O que esta nesta imagem?' },
        ]
      : messageText

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(historyRows as OpenAI.Chat.ChatCompletionMessageParam[]),
      { role: 'user', content: userContent as string },
    ]

    const tools = buildTools(crudEnabled)

    // ── Chamada OpenAI (com possível tool_call loop) ───────────────────────────
    let reply = ''
    let loopCount = 0

    while (loopCount < 4) {
      loopCount++
      const aiRes = await openai.chat.completions.create({
        model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        max_tokens: 700,
      })

      const choice = aiRes.choices[0]

      // Sem tool_call → resposta final
      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        reply = choice.message.content?.trim() || ''
        break
      }

      // Executa as funções solicitadas
      messages.push(choice.message)
      // Filtra apenas tool_calls do tipo "function"
      const fnCalls = choice.message.tool_calls.filter(
        (t): t is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function'; function: { name: string; arguments: string } } =>
          t.type === 'function'
      )
      console.log('STEP tool-calls', fnCalls.map(t => t.function.name).join(', '))

      for (const tc of fnCalls) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
        const result = db ? await executeTool(db, tc.function.name, args) : 'Banco de dados indisponivel.'
        console.log(`TOOL [${tc.function.name}]`, result.slice(0, 80))
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
      }
    }

    console.log('STEP reply', reply.slice(0, 80))
    if (!reply) return NextResponse.json({ ok: false, error: 'Resposta vazia' })

    // ── Salva + envia ─────────────────────────────────────────────────────────
    const histPhone = isGroup ? phone : lookupPhone
    const storedText = hasImage
      ? `[foto] ${imageCaption || messageText}`
      : isDocument ? `[pdf] ${docName} ${docCaption || ''}`.trim()
      : isAudio ? `[audio] ${messageText}` : messageText

    console.log('STEP sending-to', phone)
    await Promise.all([
      db ? db.from('luizia_wa_messages').insert([
        { phone: histPhone, sender_name: senderName, role: 'user', content: storedText },
        { phone: histPhone, sender_name: botName, role: 'assistant', content: reply },
      ]) : Promise.resolve(),
      sendZApi(phone, reply),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[whatsapp/webhook]', err)
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 })
  }
}
