// ═══════════════════════════════════════════════════════════════════════════
// Runtime compartilhado de Tarefas para superfícies de chat que NÃO são o
// WhatsApp nem o obra-ai (hoje: o chat flutuante / /api/buildassist).
//
// Reaproveita 100% de lib/tarefas-ai-tools.ts (tools, resolução segura,
// autorização, pending actions, auditoria) — não duplica nenhuma regra de
// negócio. O que este arquivo adiciona é só a ORQUESTRAÇÃO:
//
//   pergunta → fast path determinístico (sem LLM) quando dá para responder
//              só com list_tasks/resumo geral, sem precisar interpretar
//              nome de entidade nem chamar a IA
//   → senão, um loop de function-calling ESCOPADO só às tools de tarefas
//     (nunca o dump de 8 tabelas do resto do BuildAssist) → tool real → texto
//
// Rodada de hotfix (2026-08-21, baseada em conversa real de produção):
// TODA escrita nesta superfície passa por proposta + confirmação explícita
// — nunca uma tool de escrita direta (create_task/update_task/complete_task/
// reopen_task/cancel_task) é oferecida ao modelo aqui, nem em Work. Em vez
// disso oferecemos propose_create_task (criação) e suggest_task_change
// (edição/status) — ambas já implementam "nunca escreve sozinha, só grava
// uma proposta pendente" em tarefas-ai-tools.ts — e confirm_pending_action/
// reject_pending_action para resolver. Chat continua só com list_tasks/
// get_task (mesmo que o modelo tente, a tool nem está na lista oferecida).
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { tarefasAiToolDefs, execTarefasAiTool, type TarefasAiCtx } from './tarefas-ai-tools'
import { normalizarNome } from './ai-resolve'
import { isChangeIntent, MENSAGEM_BLOQUEIO_CHAT } from './luizia-work'
import { listarPendentesAtivas } from './luizia-pending-actions'
import { hojeISO, TAREFAS_ABERTAS, ordenarTarefas } from './tarefas'
import type { Tarefa } from './types'

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

// GERAL != MINHAS (bug real de produção: "no geral o que temos?" respondeu
// só as tarefas do usuário, sem avisar). Frases que pedem uma VISÃO GERAL —
// nunca devem ser tratadas como pessoais só por não terem outro escopo.
export function detectarResumoGeral(promptNorm: string): boolean {
  if (/\bcomo estao as coisas\b/.test(promptNorm)) return true
  if (/\bcomo estao as tarefas\b/.test(promptNorm)) return true
  if (/\bvisao geral\b/.test(promptNorm)) return true
  if (/\bno geral\b/.test(promptNorm)) return true
  // "o que temos" sem "minhas"/"pra mim"/"eu tenho" é geral por padrão —
  // ver regra "na dúvida, prefira geral e explicite o recorte na resposta".
  if (/\bo que temos\b/.test(promptNorm) && !/\bminhas?\b|\bpra mim\b|\beu tenho\b|\btenho hoje\b/.test(promptNorm)) return true
  return false
}

// Bug real de produção: Luiza prometeu mandar a lista pro WhatsApp do
// usuário (não existe tool nenhuma pra isso nesta superfície) e sugeriu
// "mude para Work" como se isso resolvesse. Detecção puramente textual —
// nenhuma tool de envio existe hoje (WhatsApp/e-mail/PDF/impressão), então
// nem tentamos oferecer ao modelo: recusamos com honestidade antes de
// gastar uma chamada de IA.
export function detectarPedidoCapabilityInexistente(promptNorm: string): boolean {
  const temAlvoExterno = /\bwhats(\s?app)?\b|\bzap\b|\be[- ]?mail\b|\bimprimir\b|\bpdf\b/.test(promptNorm)
  const temVerboEnvio = /\bmanda(r)?\b|\benvia(r)?\b/.test(promptNorm)
  return temAlvoExterno && temVerboEnvio
}

const MENSAGEM_CAPABILITY_INEXISTENTE = 'Hoje eu ainda não consigo enviar essa lista por WhatsApp, e-mail ou arquivo por este chat — só consigo listar as tarefas aqui mesmo, na conversa. Quer que eu liste agora?'

async function montarResumoGeral(db: DB, ctx: TarefasAiCtx): Promise<string> {
  let query = db.from('tarefas').select('*')
  if (ctx.fixedObraId) query = query.eq('obra_id', ctx.fixedObraId)
  else if (ctx.fixedProjetoId) query = query.eq('projeto_id', ctx.fixedProjetoId)
  const { data, error } = await query.in('status', TAREFAS_ABERTAS as unknown as string[]).limit(500)
  if (error) return 'Não consegui consultar as tarefas agora.'

  const abertas = ordenarTarefas((data || []) as Tarefa[])
  const hoje = hojeISO()
  const atrasadas = abertas.filter(t => t.data_prazo && t.data_prazo < hoje)
  const paraHoje = abertas.filter(t => t.data_prazo === hoje)
  const aguardando = abertas.filter(t => t.status === 'aguardando')
  const semResponsavel = abertas.filter(t => !t.responsavel_id)
  const minhas = ctx.profileId ? abertas.filter(t => t.responsavel_id === ctx.profileId) : null

  const linhas = [
    'Hoje temos:',
    `- ${abertas.length} tarefa(s) aberta(s)`,
    minhas ? `- ${minhas.length} atribuída(s) a você` : null,
    `- ${atrasadas.length} atrasada(s)`,
    `- ${paraHoje.length} para hoje`,
    `- ${aguardando.length} aguardando`,
    `- ${semResponsavel.length} sem responsável`,
  ].filter((l): l is string => l !== null)

  const prioritarias = abertas.slice(0, 3)
  if (prioritarias.length > 0) {
    linhas.push('', 'Prioridades imediatas:')
    prioritarias.forEach((t, i) => {
      const prazo = t.data_prazo ? ` (prazo ${new Date(t.data_prazo + 'T12:00').toLocaleDateString('pt-BR')})` : ''
      linhas.push(`${i + 1}. ${t.titulo}${prazo}`)
    })
  }

  if (abertas.length === 0) linhas.push('Nenhuma tarefa aberta no momento.')

  return linhas.join('\n')
}

export async function tentarFastPath(db: DB, prompt: string, ctx: TarefasAiCtx): Promise<string | null> {
  if (isChangeIntent(prompt)) return null // qualquer intenção de CRUD nunca passa pelo fast path
  const norm = normalizarNome(prompt)
  if (detectarPedidoCapabilityInexistente(norm)) return MENSAGEM_CAPABILITY_INEXISTENTE
  if (detectarResumoGeral(norm)) return montarResumoGeral(db, ctx)
  const filtro = detectarFiltroDeterministico(norm)
  if (!filtro) return null
  if (mencionaEntidadeNomeada(norm)) return null
  return execTarefasAiTool(db, 'list_tasks', { filtro }, ctx)
}

// Tools de escrita DIRETA nunca são oferecidas nesta superfície — mesmo em
// Work, mesmo para uma ordem explícita do usuário. Regra do hotfix: aqui
// ESCRITA = CONFIRMAÇÃO OBRIGATÓRIA, sempre, sem exceção por "a ordem foi
// explícita" (essa exceção continua existindo só no WhatsApp, ver
// tarefas-ai-tools.ts). propose_create_task/suggest_task_change cobrem
// 100% dos casos (criar, prazo, prioridade, responsável, status, concluir,
// reabrir, cancelar) sem escrever — só confirm_pending_action escreve.
const TOOLS_ESCRITA_DIRETA = new Set(['create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task'])
const TOOLS_LEITURA = new Set(['list_tasks', 'get_task'])

// Heurística para saber se uma chamada de tool nesta superfície de fato
// escreveu em `tarefas` — usada só para decidir se avisamos a UI para
// recarregar (evento buildsmart:tarefas-changed), nunca para autorização.
const TOOLS_QUE_PODEM_ESCREVER = new Set(['confirm_pending_action'])
function pareceFalhaOuRecusa(msg: string): boolean {
  return /^(Erro ao criar|Erro ao alterar|Não encontrei|Não consegui|Essa (tarefa|sugestão)|Preciso de|Você tem \d+ sugest|Certo, não vou alterar nada)/.test(msg)
}

async function rodarLoopTarefas(prompt: string, history: ChatMsg[], ctx: TarefasAiCtx, db: DB, permitirEscrita: boolean): Promise<{ message: string; mutated: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey.startsWith('sk-')) return { message: 'A IA não está configurada agora (sem chave da OpenAI).', mutated: false }
  const openai = new OpenAI({ apiKey })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const scoped = !!(ctx.fixedObraId || ctx.fixedProjetoId)
  const todasTools = tarefasAiToolDefs(scoped)
  const tools = permitirEscrita
    ? todasTools.filter(t => t.type === 'function' && !TOOLS_ESCRITA_DIRETA.has(t.function.name))
    : todasTools.filter(t => t.type === 'function' && TOOLS_LEITURA.has(t.function.name))

  const persona = [
    `Você é a Luiza, assistente do BuildSmart AI. DATA ATUAL: ${hoje}.`,
    'Responda em português brasileiro, breve (até 3 blocos curtos), sem markdown pesado.',
    'Aqui você só lida com TAREFAS (ação que uma PESSOA precisa fazer) — nunca confunda com etapa/serviço do cronograma da obra (isso é Planejamento, outro assunto, você não tem acesso a isso aqui).',
    'Use SEMPRE as funções para consultar — nunca invente uma tarefa que não veio do resultado da função. Se o resultado disser que um nome bateu em mais de uma opção, pergunte qual antes de agir — nunca escolha sozinho.',
    'Pergunta pessoal ("minhas tarefas", "o que eu tenho", "pra mim") usa list_tasks sem escopo_geral. Pergunta GERAL ("no geral", "todas", "o que temos", "como estão as tarefas") usa list_tasks com escopo_geral=true — nunca vire escopo pessoal por engano. Na dúvida, prefira geral e explicite o recorte na resposta (ex.: "no geral há 19 abertas, sendo 9 suas").',
    'Você NÃO tem nenhuma ferramenta para enviar mensagem por WhatsApp, e-mail, gerar PDF ou arquivo — se pedirem isso, diga claramente que ainda não consegue fazer essa parte por aqui, sem sugerir trocar de modo (trocar de modo não resolve isso).',
    permitirEscrita
      ? [
          'REGRA DE ESCRITA (obrigatória nesta superfície, sem exceção): você NUNCA escreve uma tarefa diretamente, mesmo que o usuário peça de forma bem explícita. Todo pedido de criar/mudar prazo/prioridade/responsável/status/concluir/reabrir/cancelar segue SEMPRE: (1) monte um rascunho — para criação use propose_create_task, para alteração/status de uma tarefa existente use suggest_task_change; (2) mostre o rascunho completo ao usuário e pergunte se pode confirmar; (3) se faltar um dado importante (ex. prazo), pergunte antes de propor, ou proponha sem esse campo e pergunte por ele; (4) SÓ chame confirm_pending_action depois que o usuário confirmar EXPLICITAMENTE nesta mensagem (ex.: "sim", "confirmo", "pode criar", "pode salvar", "ok, confirma") — uma mensagem que só ajusta um dado (ex.: "amanhã", "prioridade alta", "Gabriel") é refinamento, não confirmação: chame de novo propose_create_task/suggest_task_change com os dados atualizados e pergunte de novo. Se o usuário recusar ("não", "cancela", "deixa"), chame reject_pending_action.',
          'Se o pedido for "pra mim"/"minha tarefa"/"anota pra mim" ao criar, use para_mim=true no propose_create_task (não tente resolver o nome do próprio usuário).',
        ].join(' ')
      : 'Você está em modo consulta (Chat) — só pode listar/buscar tarefas, nunca alterar. Se o usuário pedir para criar, mudar, concluir ou cancelar algo, diga que ele precisa mudar para o modo Work (botão de alternância ao lado do campo de mensagem) para isso.',
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
      const resultado = await execTarefasAiTool(db, tc.function.name, args as Record<string, any>, ctx)
      if (TOOLS_QUE_PODEM_ESCREVER.has(tc.function.name) && resultado && !pareceFalhaOuRecusa(resultado)) mutated = true
      messages.push({ role: 'tool', tool_call_id: tc.id, content: resultado ?? 'Função não reconhecida.' })
    }
  }
  return { message: 'Não consegui concluir a consulta agora. Tente reformular.', mutated }
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
  mutated: boolean
}

function conversationKeyFloating(profileId: string | null): string {
  return `floating:${profileId || 'anon'}`
}

// Usado por lib/luizia-core.ts para forçar o roteamento de volta à skill
// tarefas mesmo quando a mensagem seguinte ("amanhã", "sim", "não") não
// tem nenhuma palavra-chave de tarefas — sem isso, um refinamento/confirmação
// de uma proposta em aberto se perderia no roteamento genérico por texto.
export async function temPropostaPendenteAtiva(profileId: string | null): Promise<boolean> {
  const db = supabase()
  if (!db) return false
  const ativas = await listarPendentesAtivas(db, conversationKeyFloating(profileId))
  return ativas.length > 0
}

export async function runTarefasSkill(input: TarefasSkillInput): Promise<TarefasSkillResult> {
  // Checagem puramente textual, sem precisar de banco nem de rede — roda
  // ANTES de qualquer tentativa de conexão, para nunca depender da
  // disponibilidade do banco para decidir se bloqueia uma alteração no Chat.
  if (input.modo === 'chat' && isChangeIntent(input.prompt)) {
    return { message: MENSAGEM_BLOQUEIO_CHAT, usedLLM: false, blocked: true, mutated: false }
  }

  const db = supabase()
  if (!db) return { message: 'Banco de dados indisponível agora.', usedLLM: false, blocked: false, mutated: false }

  const conversationKey = conversationKeyFloating(input.profileId)
  const ctx: TarefasAiCtx = {
    actor: input.actor,
    origem: 'floating',
    profileId: input.profileId,
    conversationKey,
    fixedObraId: input.fixedObraId,
    fixedProjetoId: input.fixedProjetoId,
  }

  const fastPath = await tentarFastPath(db, input.prompt, ctx)
  if (fastPath !== null) return { message: fastPath, usedLLM: false, blocked: false, mutated: false }

  const permitirEscrita = input.modo === 'work'
  const { message, mutated } = await rodarLoopTarefas(input.prompt, input.history, ctx, db, permitirEscrita)
  return { message, usedLLM: true, blocked: false, mutated }
}
