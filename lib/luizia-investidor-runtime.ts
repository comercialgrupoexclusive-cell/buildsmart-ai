// ═══════════════════════════════════════════════════════════════════════════
// Runtime do Laboratório Investidor para a Luiza (Marco 6 — CRUD total),
// mesmo padrão de lib/luizia-tarefas-runtime.ts e lib/luizia-avisos-runtime.ts:
//
//   pergunta → fast path determinístico (só para "listar prospecções" sem
//              nome nenhum a resolver) → senão, loop de function-calling
//              ESCOPADO só às tools do Investidor (lib/investidor-ai-tools.ts)
//
// TODA escrita passa por proposta + confirmação explícita — nenhuma tool de
// escrita direta é oferecida ao modelo nesta superfície, mesmo em Work
// (mesma regra de Tarefas/Avisos, "confirmação/auditoria conforme política
// do sistema" da especificação do Investidor).
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { investidorAiToolDefs, execInvestidorAiTool, type InvestidorAiCtx } from './investidor-ai-tools'
import { isChangeIntent, MENSAGEM_BLOQUEIO_CHAT } from './luizia-work'
import { listarPendentesAtivas } from './luizia-pending-actions'

type DB = SupabaseClient
type ChatMsg = { role: 'user' | 'assistant'; content: string }

type ResponsesClient = OpenAI & {
  responses: {
    create(params: {
      model: string
      tools: Array<{ type: 'web_search_preview' }>
      input: Array<{ role: string; content: string }>
      max_output_tokens: number
    }): Promise<{
      output_text?: string
      output?: Array<{ content?: Array<{ text?: string }> }>
    }>
  }
}

function supabase(): DB | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Fast path deliberadamente estreito: só dispara para um pedido claro de
// "listar tudo, sem filtro, sem nome" — qualquer nome específico (entre
// aspas, ex.: usuário citou uma prospecção) ou pedido de fase específica
// (que list_prospeccoes já sabe filtrar) vai direto para o loop com IA, mais
// seguro para não perder nuance.
const REGEX_LISTAR_TUDO = /\b(quais s[ãa]o as prospec[çc][õo]es|liste as prospec[çc][õo]es|listar prospec[çc][õo]es|mostr[ae] as prospec[çc][õo]es|todas as prospec[çc][õo]es)\b/i

function mencionaEntidadeNomeada(promptNorm: string): boolean {
  return promptNorm.includes('"')
}

function ehPedidoDeListarTudo(promptNorm: string): boolean {
  return REGEX_LISTAR_TUDO.test(promptNorm)
}

function shouldUseWebSearch(prompt: string, requested?: boolean): boolean {
  return Boolean(requested)
    || /\b(pesquis(e|a|ar)|busc(a|ar)|procure|internet|web|not[íi]cia|noticias|atualizado|mais recente|últim[ao]s?|pre[çc]o atual|norma atual)\b/i.test(prompt)
}

function isCapabilitiesQuestion(prompt: string): boolean {
  return /\b(habilidades|o que voc[êe] consegue|o que voce consegue|o que pode fazer|fun[çc][õo]es da luiz)/i.test(prompt)
}

function capabilitiesMessage() {
  return [
    'No Laboratório Investidor, minhas habilidades principais são:',
    '- Chat: consultar e comparar prospecções, cenários e ativos sem gravar nada.',
    '- Work: preparar rascunhos de alteração e executar apenas após confirmação explícita.',
    '- Web Search: pesquisar evidências externas somente quando pedido, sem executar CRUD por esse caminho.',
    '- Multimodal: usar anexos transcritos/extraídos quando a interface enviar esse contexto.',
  ].join('\n')
}

const TOOLS_LEITURA = new Set(['list_prospeccoes', 'get_prospeccao', 'list_ativos', 'compare_prospeccoes', 'list_agentes_investidor', 'list_rotinas_investidor'])
const TOOLS_QUE_PODEM_ESCREVER = new Set(['confirm_pending_action'])
function pareceFalhaOuRecusa(msg: string): boolean {
  return /^(Erro ao|Não encontrei|Não consegui|Encontrei \d+|Essa proposta|Preciso |Certo, não vou alterar nada|"[^"]+" já)/.test(msg)
}

async function rodarWebSearchInvestidor(prompt: string, history: ChatMsg[], ctx: InvestidorAiCtx): Promise<{ message: string; mutated: false }> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey.startsWith('sk-')) return { message: 'A busca web da IA não está configurada agora (sem chave da OpenAI).', mutated: false }

  const openai = new OpenAI({ apiKey })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const systemPrompt = [
    `Você é a Luiza, assistente do BuildSmart AI no Laboratório Investidor. DATA ATUAL: ${hoje}.`,
    'Use a busca web apenas como leitura/evidência externa para apoiar análise de prospecções, mercado, imóveis, financiamento, risco e contexto público.',
    'Este caminho NÃO possui ferramentas CRUD, NÃO consulta SQL e NÃO escreve no banco. Nunca diga que criou, alterou, confirmou, excluiu ou converteu dados.',
    'Diferencie claramente evidência externa pesquisada de dados internos do BuildSmart.',
    'Se faltar dado interno de uma prospecção, diga o que falta em vez de inventar.',
    'Se o pedido envolver alteração, explique que a alteração precisa ser feita pelo modo Work com rascunho e confirmação.',
    ctx.fixedProspeccaoId ? `Contexto escopado à prospecção atual: ${ctx.fixedProspeccaoId}.` : 'Contexto geral do Laboratório Investidor.',
  ].join('\n')

  const response = await (openai as ResponsesClient).responses.create({
    model: 'gpt-4o',
    tools: [{ type: 'web_search_preview' }],
    input: [
      { role: 'system', content: systemPrompt },
      ...history.slice(-8).map(message => ({ role: message.role, content: message.content })),
      { role: 'user', content: prompt },
    ],
    max_output_tokens: 900,
  })

  const content = response.output_text || response.output?.flatMap(item => item.content || []).map(part => part.text || '').join('\n').trim()
  if (!content) throw new Error('Resposta vazia da IA')
  return { message: content, mutated: false }
}

async function rodarLoopInvestidor(prompt: string, history: ChatMsg[], ctx: InvestidorAiCtx, db: DB, permitirEscrita: boolean): Promise<{ message: string; mutated: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey.startsWith('sk-')) return { message: 'A IA não está configurada agora (sem chave da OpenAI).', mutated: false }
  const openai = new OpenAI({ apiKey })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const scoped = !!ctx.fixedProspeccaoId
  const todasTools = investidorAiToolDefs(scoped)
  const tools = permitirEscrita
    ? todasTools
    : todasTools.filter(t => t.type === 'function' && TOOLS_LEITURA.has(t.function.name))

  const persona = [
    `Você é a Luiza, assistente do BuildSmart AI. DATA ATUAL: ${hoje}.`,
    'Responda em português brasileiro, breve (até 4 blocos curtos), sem markdown pesado.',
    'Aqui você lida com o Laboratório Investidor: Prospecções (oportunidades de leilão), seus Cenários financeiros (À vista/SAC/PRICE, com investimento total/venda líquida/lucro/rentabilidade já calculados pelo mesmo motor da tela), Ativos (Prospecções já convertidas em Projeto), Rotinas e Agentes assistidos. Nunca confunda Cenário financeiro com o cronograma/planejamento da obra — são coisas diferentes.',
    'Use SEMPRE as funções para consultar — nunca invente um número ou dado que não veio do resultado de uma função. Se o resultado disser que um nome bateu em mais de uma prospecção/cenário, pergunte qual antes de agir — nunca escolha sozinho.',
    'Ao propor um cenário novo ou alterado, sempre mostre o resultado calculado (investimento total, venda líquida, lucro, rentabilidade) e pergunte se pode confirmar antes de chamar confirm_pending_action.',
    permitirEscrita
      ? 'REGRA DE ESCRITA (obrigatória, sem exceção): você NUNCA cria, altera, exclui, converte ou executa rotina diretamente, mesmo com ordem explícita. Todo pedido de criar/editar prospecção, criar/editar/excluir cenário, marcar cenário principal, converter em Ativo, criar/editar rotina ou executar rotina passa SEMPRE por uma tool propose_* primeiro, mostrando o rascunho e perguntando se pode confirmar. SÓ chame confirm_pending_action depois que o usuário confirmar EXPLICITAMENTE nesta mensagem (ex.: "sim", "confirmo", "pode criar"). Uma mensagem que só ajusta um dado é refinamento — chame de novo a mesma tool propose_* com os dados atualizados. Se o usuário recusar, chame reject_pending_action.'
      : 'Você está em modo consulta (Chat) — só pode listar, buscar e comparar, nunca alterar nem executar rotina. Se o usuário pedir para criar, editar, excluir, marcar principal, converter algo ou executar rotina, diga que ele precisa mudar para o modo Work (botão de alternância ao lado do campo de mensagem).',
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
      max_tokens: 600,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultado = await execInvestidorAiTool(db, tc.function.name, args as Record<string, any>, ctx)
      if (TOOLS_QUE_PODEM_ESCREVER.has(tc.function.name) && resultado && !pareceFalhaOuRecusa(resultado)) mutated = true
      messages.push({ role: 'tool', tool_call_id: tc.id, content: resultado ?? 'Função não reconhecida.' })
    }
  }
  return { message: 'Não consegui concluir a consulta agora. Tente reformular.', mutated }
}

export type InvestidorSkillInput = {
  prompt: string
  history: ChatMsg[]
  modo: 'chat' | 'work'
  profileId: string | null
  actor: string
  fixedProspeccaoId?: string | null
  webSearch?: boolean
}

export type InvestidorSkillResult = {
  message: string
  usedLLM: boolean
  blocked: boolean
  mutated: boolean
}

function conversationKeyFloating(profileId: string | null): string {
  return `floating:${profileId || 'anon'}`
}

// Usado por lib/luizia-core.ts para forçar o roteamento de volta à skill
// investidor quando a mensagem seguinte ("sim", "confirmo") não tem nenhuma
// palavra-chave do domínio — mesma lógica de temPropostaPendenteAtiva
// (Tarefas). MESMA chave de conversa que Tarefas/Avisos usam (ver
// lib/luizia-pending-actions.ts) — propostas de qualquer domínio convivem
// na mesma tabela, e confirm_pending_action já sabe recusar educadamente
// uma proposta que não seja do Investidor.
export async function temPropostaPendenteAtivaInvestidor(profileId: string | null): Promise<boolean> {
  const db = supabase()
  if (!db) return false
  const ativas = await listarPendentesAtivas(db, conversationKeyFloating(profileId))
  return ativas.some(p => [
    'create_prospeccao', 'update_prospeccao',
    'create_cenario', 'update_cenario', 'delete_cenario', 'set_cenario_principal',
    'convert_to_ativo',
    'create_investidor_rotina', 'update_investidor_rotina', 'run_investidor_rotina',
  ].includes(p.tool))
}

export async function runInvestidorSkill(input: InvestidorSkillInput): Promise<InvestidorSkillResult> {
  if (input.modo === 'chat' && isChangeIntent(input.prompt)) {
    return { message: MENSAGEM_BLOQUEIO_CHAT, usedLLM: false, blocked: true, mutated: false }
  }

  if (isCapabilitiesQuestion(input.prompt)) {
    return { message: capabilitiesMessage(), usedLLM: false, blocked: false, mutated: false }
  }

  const db = supabase()
  if (!db) return { message: 'Banco de dados indisponível agora.', usedLLM: false, blocked: false, mutated: false }

  const conversationKey = conversationKeyFloating(input.profileId)
  const ctx: InvestidorAiCtx = {
    actor: input.actor,
    origem: 'floating',
    profileId: input.profileId,
    conversationKey,
    fixedProspeccaoId: input.fixedProspeccaoId,
  }

  if (shouldUseWebSearch(input.prompt, input.webSearch) && !isChangeIntent(input.prompt)) {
    const { message } = await rodarWebSearchInvestidor(input.prompt, input.history, ctx)
    return { message, usedLLM: true, blocked: false, mutated: false }
  }

  // Fast path só para "listar tudo" sem nome nenhum a resolver — qualquer
  // menção específica (aspas, "esta"/"aquela") vai direto para o loop com IA.
  const norm = input.prompt.toLowerCase()
  if (!isChangeIntent(input.prompt) && !mencionaEntidadeNomeada(norm) && ehPedidoDeListarTudo(norm)) {
    const resultado = await execInvestidorAiTool(db, 'list_prospeccoes', {}, ctx)
    if (resultado) return { message: resultado, usedLLM: false, blocked: false, mutated: false }
  }

  const permitirEscrita = input.modo === 'work'
  const { message, mutated } = await rodarLoopInvestidor(input.prompt, input.history, ctx, db, permitirEscrita)
  return { message, usedLLM: true, blocked: false, mutated }
}
