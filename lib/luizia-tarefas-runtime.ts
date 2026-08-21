// ═══════════════════════════════════════════════════════════════════════════
// Runtime compartilhado de Tarefas para superfícies de chat que NÃO são o
// WhatsApp nem o obra-ai (hoje: o chat flutuante / /api/buildassist).
//
// Reaproveita 100% de lib/tarefas-ai-tools.ts (tools, resolução segura,
// autorização, pending actions, auditoria) — não duplica nenhuma regra de
// negócio. O que este arquivo adiciona é só a ORQUESTRAÇÃO:
//
//   pergunta → fast path determinístico (sem LLM) quando dá para responder
//              só com list_tasks, sem precisar interpretar nome de entidade
//   → senão, um loop de function-calling ESCOPADO só às tools de tarefas
//     (nunca o dump de 8 tabelas do resto do BuildAssist) → tool real → texto
//
// Chat só recebe as tools de leitura (list_tasks/get_task) — mesmo que o
// modelo tente chamar uma tool de escrita, ela nem está na lista oferecida
// à OpenAI, então fisicamente não pode ser chamada. Work recebe o conjunto
// completo (create/update/complete/reopen/cancel/suggest/confirm/reject),
// com a mesma regra de autorização (ordem explícita executa; sugestão da
// Luiza vira proposta pendente) já embutida em tarefas-ai-tools.ts.
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { tarefasAiToolDefs, execTarefasAiTool, type TarefasAiCtx } from './tarefas-ai-tools'
import { normalizarNome } from './ai-resolve'
import { isChangeIntent, MENSAGEM_BLOQUEIO_CHAT } from './luizia-work'

type DB = SupabaseClient
type ChatMsg = { role: 'user' | 'assistant'; content: string }

function supabase(): DB | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type FiltroListTasks = 'hoje' | 'amanha' | 'atrasadas' | 'semana' | 'proximas' | 'aguardando' | 'todas'

export function detectarFiltroDeterministico(promptNorm: string): FiltroListTasks | null {
  if (/\batrasad/.test(promptNorm)) return 'atrasadas'
  if (/\bamanha\b/.test(promptNorm)) return 'amanha'
  if (/\baguardando\b/.test(promptNorm)) return 'aguardando'
  if (/\b(esta|essa|nesta|nessa) semana\b/.test(promptNorm)) return 'semana'
  if (/\bhoje\b/.test(promptNorm)) return 'hoje'
  if (/\btodas\b|\btudo\b/.test(promptNorm)) return 'todas'
  return null
}

// Conservador de propósito: qualquer sinal de que a pergunta menciona uma
// obra/projeto/pessoa específica por nome tira do fast path (que não sabe
// resolver nome nenhum) e manda para o loop com IA, que tem as tools de
// resolução segura para isso. Um falso negativo aqui (cair no loop de IA à
// toa) é seguro; um falso positivo (fast path ignorar um nome) não seria.
export function mencionaEntidadeNomeada(promptNorm: string): boolean {
  if (/\bo que (o|a) \w+/.test(promptNorm)) return true // "o que o Fulano tem"
  if (/\b[a-z]*\d{2,}\b/.test(promptNorm)) return true // código tipo r0224
  if (/\bprojeto\b|\bobra\b/.test(promptNorm)) return true // menção explícita por nome
  if (/\bresponsavel\b|\bpara (o|a) \w+/.test(promptNorm)) return true
  return false
}

export async function tentarFastPath(db: DB, prompt: string, ctx: TarefasAiCtx): Promise<string | null> {
  if (isChangeIntent(prompt)) return null // qualquer intenção de CRUD nunca passa pelo fast path
  const norm = normalizarNome(prompt)
  const filtro = detectarFiltroDeterministico(norm)
  if (!filtro) return null
  if (mencionaEntidadeNomeada(norm)) return null
  return execTarefasAiTool(db, 'list_tasks', { filtro }, ctx)
}

async function rodarLoopTarefas(prompt: string, history: ChatMsg[], ctx: TarefasAiCtx, db: DB, permitirEscrita: boolean): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey.startsWith('sk-')) return 'A IA não está configurada agora (sem chave da OpenAI).'
  const openai = new OpenAI({ apiKey })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const scoped = !!(ctx.fixedObraId || ctx.fixedProjetoId)
  const todasTools = tarefasAiToolDefs(scoped)
  const tools = permitirEscrita ? todasTools : todasTools.filter(t => t.type === 'function' && (t.function.name === 'list_tasks' || t.function.name === 'get_task'))

  const persona = [
    `Você é a Luiza, assistente do BuildSmart AI. DATA ATUAL: ${hoje}.`,
    'Responda em português brasileiro, breve (até 3 blocos curtos), sem markdown pesado.',
    'Aqui você só lida com TAREFAS (ação que uma PESSOA precisa fazer) — nunca confunda com etapa/serviço do cronograma da obra (isso é Planejamento, outro assunto, você não tem acesso a isso aqui).',
    'Use SEMPRE as funções para consultar — nunca invente uma tarefa que não veio do resultado da função. Se o resultado disser que um nome bateu em mais de uma opção, pergunte qual antes de agir — nunca escolha sozinho.',
    permitirEscrita
      ? 'REGRA DE AUTORIZAÇÃO: se o usuário pedir algo explicitamente nesta mensagem (ex.: "passa para sexta", "marca como concluída"), chame a função de escrita direto (update_task/complete_task/reopen_task/cancel_task/create_task). Se a mudança for uma SUGESTÃO SUA (você percebeu algo e quer recomendar), use suggest_task_change — ela nunca escreve sozinha — e só chame confirm_pending_action depois que o usuário confirmar explicitamente numa mensagem seguinte. Se ele recusar, use reject_pending_action.'
      : 'Você está em modo consulta (Chat) — só pode listar/buscar tarefas, nunca alterar. Se o usuário pedir para criar, mudar, concluir ou cancelar algo, diga que ele precisa mudar para o modo Work (botão de alternância ao lado do campo de mensagem) para isso.',
  ].join('\n')

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: persona },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: prompt },
  ]

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
      return choice.message.content?.trim() || 'Não consegui responder agora.'
    }
    messages.push(choice.message)
    const fnCalls = choice.message.tool_calls.filter((t): t is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function' } => t.type === 'function')
    for (const tc of fnCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
      const resultado = await execTarefasAiTool(db, tc.function.name, args as Record<string, any>, ctx)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: resultado ?? 'Função não reconhecida.' })
    }
  }
  return 'Não consegui concluir a consulta agora. Tente reformular.'
}

export type TarefasSkillInput = {
  prompt: string
  history: ChatMsg[]
  modo: 'chat' | 'work'
  profileId: string | null
  actor: string
  fixedObraId?: string
  fixedProjetoId?: string
}

export type TarefasSkillResult = {
  message: string
  usedLLM: boolean
  blocked: boolean
}

export async function runTarefasSkill(input: TarefasSkillInput): Promise<TarefasSkillResult> {
  // Checagem puramente textual, sem precisar de banco nem de rede — roda
  // ANTES de qualquer tentativa de conexão, para nunca depender da
  // disponibilidade do banco para decidir se bloqueia uma alteração no Chat.
  if (input.modo === 'chat' && isChangeIntent(input.prompt)) {
    return { message: MENSAGEM_BLOQUEIO_CHAT, usedLLM: false, blocked: true }
  }

  const db = supabase()
  if (!db) return { message: 'Banco de dados indisponível agora.', usedLLM: false, blocked: false }

  const conversationKey = `floating:${input.profileId || 'anon'}`
  const ctx: TarefasAiCtx = {
    actor: input.actor,
    origem: 'floating',
    profileId: input.profileId,
    conversationKey,
    fixedObraId: input.fixedObraId,
    fixedProjetoId: input.fixedProjetoId,
  }

  const fastPath = await tentarFastPath(db, input.prompt, ctx)
  if (fastPath !== null) return { message: fastPath, usedLLM: false, blocked: false }

  const permitirEscrita = input.modo === 'work'
  const message = await rodarLoopTarefas(input.prompt, input.history, ctx, db, permitirEscrita)
  return { message, usedLLM: true, blocked: false }
}
