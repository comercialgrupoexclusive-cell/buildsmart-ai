// ═══════════════════════════════════════════════════════════════════════════
// Runtime do Laboratório Investidor para a Luiza (Marco 6 — CRUD total;
// Marco 7 — Web Search nativo), mesmo padrão de lib/luizia-tarefas-runtime.ts
// e lib/luizia-avisos-runtime.ts:
//
//   pergunta → fast path determinístico (só para "listar prospecções" sem
//              nome nenhum a resolver) → senão, loop de function-calling
//              ESCOPADO só às tools do Investidor (lib/investidor-ai-tools.ts)
//
// TODA escrita passa por proposta + confirmação explícita — nenhuma tool de
// escrita direta é oferecida ao modelo nesta superfície, mesmo em Work
// (mesma regra de Tarefas/Avisos, "confirmação/auditoria conforme política
// do sistema" da especificação do Investidor).
//
// Marco 7 / Web Search: este é o ÚNICO runtime da Luiza migrado para a
// Responses API da OpenAI (client.responses.create) — Tarefas, Avisos e o
// Chat geral (lib/luizia-core.ts) continuam em Chat Completions, sem
// nenhuma alteração. A migração foi feita aqui, e só aqui, para habilitar a
// tool nativa `web_search` (pesquisa executada pela própria OpenAI, sem
// provedor externo/segunda chave de API — ver correção do usuário na
// Rodada 7 e RELATORIO_INVESTIDOR_RODADA_07.md). As tool defs do domínio
// continuam vivendo em lib/investidor-ai-tools.ts no formato do Chat
// Completions (nenhuma outra tela depende da Responses API); o adaptador
// `paraFunctionToolResponses` abaixo só converte o formato na borda deste
// arquivo — menor mudança possível, sem duplicar a definição das tools.
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { investidorAiToolDefs, execInvestidorAiTool, type InvestidorAiCtx } from './investidor-ai-tools'
import { isChangeIntent, MENSAGEM_BLOQUEIO_CHAT } from './luizia-work'
import { listarPendentesAtivas } from './luizia-pending-actions'

type DB = SupabaseClient
type ChatMsg = { role: 'user' | 'assistant'; content: string }

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

const TOOLS_LEITURA = new Set(['list_prospeccoes', 'get_prospeccao', 'list_ativos', 'compare_prospeccoes', 'list_evidencias'])
const TOOLS_QUE_PODEM_ESCREVER = new Set(['confirm_pending_action'])
function pareceFalhaOuRecusa(msg: string): boolean {
  return /^(Erro ao|Não encontrei|Não consegui|Encontrei \d+|Essa proposta|Preciso |Certo, não vou alterar nada|"[^"]+" já)/.test(msg)
}

// Converte uma tool do formato do Chat Completions (usado por
// lib/investidor-ai-tools.ts, compartilhado hoje só por este arquivo — ver
// grep) para o formato flat exigido pela Responses API. `strict: false`
// preserva o comportamento atual (schemas com campos opcionais); ativar
// strict exigiria reescrever todo `parameters` para não ter campo opcional,
// fora do escopo desta migração.
function paraFunctionToolResponses(t: OpenAI.Chat.ChatCompletionTool): OpenAI.Responses.FunctionTool {
  if (t.type !== 'function') throw new Error('Tool custom não suportada nesta migração — só as function tools do Investidor.')
  return {
    type: 'function',
    name: t.function.name,
    description: t.function.description ?? null,
    parameters: t.function.parameters ?? null,
    strict: false,
  }
}

// Native web_search da OpenAI (Responses API) — sem provedor externo, sem
// segunda chave de API. Disponível também em modo Chat: é uma ação de
// pesquisa/consulta, não de escrita (ver especificação seção 6).
const WEB_SEARCH_TOOL: OpenAI.Responses.WebSearchTool = { type: 'web_search' }

// Junta os textos de saída + as fontes (url_citation) de possíveis buscas
// web numa única string — sem isso, a Luiza pesquisaria mas o link nunca
// chegaria ao usuário.
function extrairTextoComFontes(output: OpenAI.Responses.Response['output']): string {
  const blocosDeTexto: string[] = []
  const fontesVistas = new Set<string>()
  const fontes: string[] = []
  for (const item of output) {
    if (item.type !== 'message') continue
    for (const parte of item.content) {
      if (parte.type !== 'output_text') continue
      if (parte.text.trim()) blocosDeTexto.push(parte.text.trim())
      for (const anotacao of parte.annotations) {
        if (anotacao.type !== 'url_citation' || fontesVistas.has(anotacao.url)) continue
        fontesVistas.add(anotacao.url)
        fontes.push(`- ${anotacao.title || anotacao.url}: ${anotacao.url}`)
      }
    }
  }
  const texto = blocosDeTexto.join('\n').trim()
  if (!texto) return ''
  return fontes.length ? `${texto}\n\nFontes:\n${fontes.join('\n')}` : texto
}

async function rodarLoopInvestidor(prompt: string, history: ChatMsg[], ctx: InvestidorAiCtx, db: DB, permitirEscrita: boolean): Promise<{ message: string; mutated: boolean }> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey.startsWith('sk-')) return { message: 'A IA não está configurada agora (sem chave da OpenAI).', mutated: false }
  const openai = new OpenAI({ apiKey })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const scoped = !!ctx.fixedProspeccaoId
  const todasTools = investidorAiToolDefs(scoped)
  const domainTools = permitirEscrita
    ? todasTools
    : todasTools.filter(t => t.type === 'function' && TOOLS_LEITURA.has(t.function.name))
  const tools: OpenAI.Responses.Tool[] = [...domainTools.map(paraFunctionToolResponses), WEB_SEARCH_TOOL]

  const persona = [
    `Você é a Luiza, assistente do BuildSmart AI. DATA ATUAL: ${hoje}.`,
    'Responda em português brasileiro, breve (até 4 blocos curtos), sem markdown pesado.',
    'Aqui você lida com o Laboratório Investidor: Prospecções (oportunidades de leilão), seus Cenários financeiros (À vista/SAC/PRICE, com investimento total/venda líquida/lucro/rentabilidade já calculados pelo mesmo motor da tela) e Ativos (Prospecções já convertidas em Projeto). Nunca confunda Cenário financeiro com o cronograma/planejamento da obra — são coisas diferentes.',
    'Use SEMPRE as funções para consultar — nunca invente um número ou dado que não veio do resultado de uma função. Se o resultado disser que um nome bateu em mais de uma prospecção/cenário, pergunte qual antes de agir — nunca escolha sozinho.',
    'Você também tem uma ferramenta de pesquisa na internet (web_search) — use-a só quando fizer sentido (ex.: o usuário pede para pesquisar algo externo, verificar um valor de mercado, ou confirmar uma informação que não está nos seus dados). Nunca use pesquisa web para inventar dado de prospecção/cenário que deveria vir das funções do sistema. Ao usar a pesquisa, sempre cite as fontes retornadas.',
    'Ao propor um cenário novo ou alterado, sempre mostre o resultado calculado (investimento total, venda líquida, lucro, rentabilidade) e pergunte se pode confirmar antes de chamar confirm_pending_action.',
    permitirEscrita
      ? 'REGRA DE ESCRITA (obrigatória, sem exceção): você NUNCA cria, altera, exclui ou converte nada diretamente, mesmo com ordem explícita. Todo pedido de criar/editar prospecção, criar/editar/excluir cenário, marcar cenário principal, converter em Ativo ou registrar evidência passa SEMPRE por uma tool propose_* primeiro, mostrando o rascunho e perguntando se pode confirmar. SÓ chame confirm_pending_action depois que o usuário confirmar EXPLICITAMENTE nesta mensagem (ex.: "sim", "confirmo", "pode criar"). Uma mensagem que só ajusta um dado é refinamento — chame de novo a mesma tool propose_* com os dados atualizados. Se o usuário recusar, chame reject_pending_action.'
      : 'Você está em modo consulta (Chat) — só pode listar, buscar, comparar e pesquisar, nunca alterar. Se o usuário pedir para criar, editar, excluir, marcar principal, converter ou registrar evidência, diga que ele precisa mudar para o modo Work (botão de alternância ao lado do campo de mensagem).',
  ].join('\n')

  let input: OpenAI.Responses.ResponseInputItem[] = [
    ...history.map((m): OpenAI.Responses.EasyInputMessage => ({ role: m.role, content: m.content })),
    { role: 'user', content: prompt },
  ]

  let mutated = false
  let loop = 0
  while (loop < 4) {
    loop++
    const res = await openai.responses.create({
      model: permitirEscrita ? 'gpt-4o' : 'gpt-4o-mini',
      instructions: persona,
      input,
      tools,
      tool_choice: 'auto',
      max_output_tokens: 600,
    })
    const fnCalls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call')
    if (fnCalls.length === 0) {
      const texto = extrairTextoComFontes(res.output)
      return { message: texto || 'Não consegui responder agora.', mutated }
    }
    input = [...input, ...(res.output as unknown as OpenAI.Responses.ResponseInputItem[])]
    for (const fc of fnCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(fc.arguments) } catch { /* ignore */ }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultado = await execInvestidorAiTool(db, fc.name, args as Record<string, any>, ctx)
      if (TOOLS_QUE_PODEM_ESCREVER.has(fc.name) && resultado && !pareceFalhaOuRecusa(resultado)) mutated = true
      input.push({ type: 'function_call_output', call_id: fc.call_id, output: resultado ?? 'Função não reconhecida.' })
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
  return ativas.some(p => ['create_prospeccao', 'update_prospeccao', 'create_cenario', 'update_cenario', 'delete_cenario', 'set_cenario_principal', 'convert_to_ativo', 'create_evidencia'].includes(p.tool))
}

export async function runInvestidorSkill(input: InvestidorSkillInput): Promise<InvestidorSkillResult> {
  if (input.modo === 'chat' && isChangeIntent(input.prompt)) {
    return { message: MENSAGEM_BLOQUEIO_CHAT, usedLLM: false, blocked: true, mutated: false }
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
