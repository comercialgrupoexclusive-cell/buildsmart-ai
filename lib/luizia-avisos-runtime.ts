// ═══════════════════════════════════════════════════════════════════════════
// Runtime de Avisos para o chat flutuante — mesmo padrão de
// lib/luizia-tarefas-runtime.ts: fast path determinístico para leitura, loop
// de function-calling ESCOPADO só às tools de avisos para o resto. Chat só
// lê (list_alerts); Work propõe + confirma (nunca uma tool de escrita
// direta é oferecida ao modelo, em nenhum modo — mesma regra beta de
// Tarefas: aqui ESCRITA = CONFIRMAÇÃO OBRIGATÓRIA, sempre).
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { avisosAiToolDefs, execAvisosAiTool, type AvisosAiCtx } from './luizia-avisos-ai-tools'
import { isChangeIntent, MENSAGEM_BLOQUEIO_CHAT } from './luizia-work'
import { listarPendentesAtivas } from './luizia-pending-actions'
import { normalizarNome } from './ai-resolve'

type DB = SupabaseClient
type ChatMsg = { role: 'user' | 'assistant'; content: string }

function supabase(): DB | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// MESMA chave de conversationKey usada por Tarefas (lib/luizia-tarefas-
// runtime.ts) — de propósito: é o mesmo balde de "uma proposta pendente por
// conversa" já usado lá, não uma segunda arquitetura. Se por acaso houver
// uma proposta de tarefa E uma de aviso pendentes ao mesmo tempo, o
// mecanismo existente (acharPendenteParaResolver) já sabe pedir para
// desambiguar — nunca escolhe sozinho.
function conversationKeyFloating(profileId: string | null): string {
  return `floating:${profileId || 'anon'}`
}

export async function temPropostaPendenteAtivaAvisos(profileId: string | null): Promise<boolean> {
  const db = supabase()
  if (!db) return false
  const ativas = await listarPendentesAtivas(db, conversationKeyFloating(profileId))
  return ativas.some(p => p.tool === 'create_alert' || p.tool === 'update_alert')
}

// Pura leitura, sem intenção de escrita: "quais avisos eu tenho?", "qual
// foi o último aviso enviado?" — nunca precisa de LLM para isso.
function ehConsultaSimples(promptNorm: string): boolean {
  return /\bmeus? avisos?\b|\bquais avisos\b|\bultimo aviso\b|\bavisos eu tenho\b/.test(promptNorm)
}

export async function tentarFastPathAvisos(db: DB, prompt: string, ctx: AvisosAiCtx): Promise<string | null> {
  if (isChangeIntent(prompt)) return null
  const norm = normalizarNome(prompt)
  if (!ehConsultaSimples(norm)) return null
  return execAvisosAiTool(db, 'list_alerts', {}, ctx)
}

const TOOLS_QUE_PODEM_ESCREVER = new Set(['confirm_pending_alert'])
function pareceFalhaOuRecusa(msg: string): boolean {
  return /^(Erro ao criar|Erro ao alterar|Não encontrei|Não consegui|Essa proposta|Você tem mais de um|Certo, não vou alterar nada|Seu perfil ainda não|Não entendi)/.test(msg)
}

async function rodarLoopAvisos(prompt: string, history: ChatMsg[], ctx: AvisosAiCtx, db: DB, permitirEscrita: boolean): Promise<{ message: string; mutated: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey.startsWith('sk-')) return { message: 'A IA não está configurada agora (sem chave da OpenAI).', mutated: false }
  const openai = new OpenAI({ apiKey })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const todasTools = avisosAiToolDefs()
  const tools = permitirEscrita
    ? todasTools
    : todasTools.filter(t => t.type === 'function' && t.function.name === 'list_alerts')

  const persona = [
    `Você é a Luiza, assistente do BuildSmart AI. DATA ATUAL: ${hoje}.`,
    'Responda em português brasileiro, breve, sem markdown pesado.',
    'Aqui você lida com AVISOS: mensagens automáticas recorrentes de resumo de tarefas por WhatsApp — reutiliza o motor de disparos existente, sempre resumo_tarefas (nenhum outro tipo de aviso é configurável por aqui).',
    'Um aviso criado por você é SEMPRE para o próprio remetente — nunca peça nem aceite telefone de outra pessoa; a resolução é automática pelo vínculo do perfil dele.',
    permitirEscrita
      ? 'REGRA DE ESCRITA (obrigatória, sem exceção): você NUNCA cria/altera um aviso diretamente. Todo pedido ("me avise...", "pausa meu aviso...", "muda meu aviso...") segue SEMPRE: (1) propose_create_alert ou propose_update_alert monta um preview; (2) mostre o preview e pergunte se pode confirmar; (3) SÓ chame confirm_pending_alert depois que o usuário confirmar EXPLICITAMENTE nesta mensagem ("sim", "confirmo", "pode criar") — uma mensagem que só ajusta um dado (ex.: "às 7h30", "só segunda a sexta") é refinamento: chame propose_create_alert/propose_update_alert de novo com os dados atualizados e pergunte de novo. Se recusar, use reject_pending_alert.'
      : 'Você está em modo consulta (Chat) — só pode listar avisos, nunca criar/alterar. Se pedirem para criar, mudar ou pausar um aviso, diga que precisa mudar para o modo Work (botão de alternância) para isso.',
  ].join('\n')

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: persona },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: prompt },
  ]

  let mutated = false
  let loop = 0
  while (loop < 4) {
    loop++
    const res = await openai.chat.completions.create({
      model: permitirEscrita ? 'gpt-4o' : 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 500,
    })
    const choice = res.choices[0]
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      return { message: choice.message.content?.trim() || 'Não consegui responder agora.', mutated }
    }
    messages.push(choice.message)
    const fnCalls = choice.message.tool_calls.filter((t): t is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function' } => t.type === 'function')
    for (const tc of fnCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
      const resultado = await execAvisosAiTool(db, tc.function.name, args as Record<string, any>, ctx)
      if (TOOLS_QUE_PODEM_ESCREVER.has(tc.function.name) && resultado && !pareceFalhaOuRecusa(resultado)) mutated = true
      messages.push({ role: 'tool', tool_call_id: tc.id, content: resultado ?? 'Função não reconhecida.' })
    }
  }
  return { message: 'Não consegui concluir agora. Tente reformular.', mutated }
}

export type AvisosSkillInput = {
  prompt: string
  history: ChatMsg[]
  modo: 'chat' | 'work'
  profileId: string | null
  actor: string
}

export type AvisosSkillResult = {
  message: string
  usedLLM: boolean
  blocked: boolean
  mutated: boolean
}

export async function runAvisosSkill(input: AvisosSkillInput): Promise<AvisosSkillResult> {
  if (input.modo === 'chat' && isChangeIntent(input.prompt)) {
    return { message: MENSAGEM_BLOQUEIO_CHAT, usedLLM: false, blocked: true, mutated: false }
  }

  const db = supabase()
  if (!db) return { message: 'Banco de dados indisponível agora.', usedLLM: false, blocked: false, mutated: false }

  const ctx: AvisosAiCtx = {
    actor: input.actor,
    profileId: input.profileId,
    conversationKey: conversationKeyFloating(input.profileId),
  }

  const fastPath = await tentarFastPathAvisos(db, input.prompt, ctx)
  if (fastPath !== null) return { message: fastPath, usedLLM: false, blocked: false, mutated: false }

  const permitirEscrita = input.modo === 'work'
  const { message, mutated } = await rodarLoopAvisos(input.prompt, input.history, ctx, db, permitirEscrita)
  return { message, usedLLM: true, blocked: false, mutated }
}
