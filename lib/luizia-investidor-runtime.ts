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
// Marco 7 / Web Search + Multimodal: este é o ÚNICO runtime da Luiza
// migrado para a Responses API da OpenAI (client.responses.create) —
// Tarefas, Avisos e o Chat geral (lib/luizia-core.ts) continuam em Chat
// Completions, sem nenhuma alteração. A migração foi feita aqui, e só
// aqui, para habilitar a tool nativa `web_search` (pesquisa executada pela
// própria OpenAI, sem provedor externo/segunda chave de API) e o suporte a
// entrada multimodal (foto/PDF anexados no chat, e link colado pelo
// usuário via a tool `extrair_link` — ver RELATORIO_INVESTIDOR_RODADA_07.md).
// As tool defs do domínio continuam vivendo em lib/investidor-ai-tools.ts
// no formato do Chat Completions (nenhuma outra tela depende da Responses
// API); o adaptador `paraFunctionToolResponses` abaixo só converte o
// formato na borda deste arquivo — menor mudança possível, sem duplicar a
// definição das tools.
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { investidorAiToolDefs, execInvestidorAiTool, type InvestidorAiCtx } from './investidor-ai-tools'
import { isChangeIntent, MENSAGEM_BLOQUEIO_CHAT } from './luizia-work'
import { listarPendentesAtivas } from './luizia-pending-actions'

type DB = SupabaseClient
type ChatMsg = { role: 'user' | 'assistant'; content: string }

// Anexo multimodal (Marco 7) — vem do LuiziaFloatingChat só quando o
// usuário está no contexto /investidor (componente já restringe isso; ver
// RELATORIO_INVESTIDOR_RODADA_07.md). `dataUrl` é a imagem em base64 (não
// persistida no histórico — só usada nesta chamada); `textoExtraido` é o
// texto de um PDF já extraído no cliente via /api/extract-pdf (reaproveitado,
// não uma segunda implementação de extração de PDF).
export type InvestidorAnexo = {
  tipo: 'imagem' | 'pdf'
  nome: string
  dataUrl?: string
  textoExtraido?: string
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

function isCapabilitiesQuestion(prompt: string): boolean {
  return /\b(habilidades|o que voc[êe] consegue|o que voce consegue|o que pode fazer|fun[çc][õo]es da luiz)/i.test(prompt)
}

function capabilitiesMessage() {
  return [
    'No Laboratório Investidor, minhas habilidades principais são:',
    '- Chat: consultar e comparar prospecções, cenários e ativos sem gravar nada.',
    '- Work: preparar rascunhos de alteração e executar apenas após confirmação explícita.',
    '- Web Search: pesquisar evidências externas somente quando fizer sentido, sem executar CRUD por esse caminho.',
    '- Multimodal: usar anexos transcritos/extraídos quando a interface enviar esse contexto.',
  ].join('\n')
}

const TOOLS_LEITURA = new Set(['list_prospeccoes', 'get_prospeccao', 'list_ativos', 'compare_prospeccoes', 'list_evidencias', 'extrair_link', 'list_agentes_investidor', 'list_rotinas_investidor'])
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
export function paraFunctionToolResponses(t: OpenAI.Chat.ChatCompletionTool): OpenAI.Responses.FunctionTool {
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
export function extrairTextoComFontes(output: OpenAI.Responses.Response['output']): string {
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

// Monta a mensagem do usuário com o anexo (Marco 7): imagem vira parte
// `input_image` (visão nativa da Responses API, sem upload a nenhum
// storage — a própria OpenAI recebe o data URL); PDF já chega como texto
// extraído (cliente já chamou /api/extract-pdf) e entra como texto normal.
// Sem anexo, mantém o formato simples de sempre (string).
export function montarMensagemUsuario(prompt: string, anexo: InvestidorAnexo | null | undefined): OpenAI.Responses.EasyInputMessage {
  if (!anexo) return { role: 'user', content: prompt }

  const partes: OpenAI.Responses.ResponseInputContent[] = []
  const textoBase = [
    prompt.trim(),
    anexo.tipo === 'pdf' && anexo.textoExtraido
      ? `Conteúdo extraído do PDF anexado ("${anexo.nome}"):\n${anexo.textoExtraido}`
      : anexo.tipo === 'imagem'
        ? `[Imagem anexada: "${anexo.nome}"]`
        : null,
  ].filter((l): l is string => !!l).join('\n\n')
  if (textoBase) partes.push({ type: 'input_text', text: textoBase })
  if (anexo.tipo === 'imagem' && anexo.dataUrl) partes.push({ type: 'input_image', detail: 'auto', image_url: anexo.dataUrl })

  return { role: 'user', content: partes.length ? partes : prompt }
}

async function rodarLoopInvestidor(prompt: string, history: ChatMsg[], ctx: InvestidorAiCtx, db: DB, permitirEscrita: boolean, anexo?: InvestidorAnexo | null): Promise<{ message: string; mutated: boolean; analiseMercado?: Record<string, unknown> }> {
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
    'Aqui você lida com o Laboratório Investidor: Prospecções (oportunidades de leilão), seus Cenários financeiros (À vista/SAC/PRICE, com investimento total/venda líquida/lucro/rentabilidade já calculados pelo mesmo motor da tela), Ativos (Prospecções já convertidas em Projeto), Rotinas e Agentes assistidos. Nunca confunda Cenário financeiro com o cronograma/planejamento da obra — são coisas diferentes.',
    'Use SEMPRE as funções para consultar — nunca invente um número ou dado que não veio do resultado de uma função. Se o resultado disser que um nome bateu em mais de uma prospecção/cenário, pergunte qual antes de agir — nunca escolha sozinho.',
    'Você também tem uma ferramenta de pesquisa na internet (web_search) — use-a só quando fizer sentido (ex.: o usuário pede para pesquisar algo externo, verificar um valor de mercado, ou confirmar uma informação que não está nos seus dados). Nunca use pesquisa web para inventar dado de prospecção/cenário que deveria vir das funções do sistema. Ao usar a pesquisa, sempre cite as fontes retornadas.',
    'Se o usuário colar um link específico (não uma pesquisa) e pedir para ler/analisar, use a tool extrair_link com essa URL exata — não confunda com web_search.',
    'Se a mensagem trouxer uma foto ou o texto de um PDF anexado, ou o resultado de extrair_link, extraia as informações relevantes sobre a oportunidade (valores, datas, condições, restrições, estado do imóvel). Para CADA informação extraída, classifique explicitamente a natureza antes de sugerir registrar: "observado" (está literalmente escrito/visível na foto, PDF ou página), "inferido" (você concluiu a partir do que viu, sem estar explícito) ou "estimado" (é uma suposição/cálculo seu — nunca trate um preço anunciado como o valor real de venda). Depois de extrair, ofereça registrar como evidência com propose_create_evidencia, citando a fonte (nome do arquivo, "foto enviada pelo usuário" ou a URL) e a data de hoje como data_evidencia (a menos que o documento tenha outra data explícita escrita nele).',
    'Ao propor um cenário novo ou alterado, sempre mostre o resultado calculado (investimento total, venda líquida, lucro, rentabilidade) e pergunte se pode confirmar antes de chamar confirm_pending_action.',
    // Skill 1 — Pesquisa e Análise de Mercado Imobiliário.
    'FICHA DA PROSPECÇÃO (Skill 1): se pedirem para extrair/ler a fonte do imóvel-alvo (link/PDF/foto), leia com extrair_link ou o anexo, e chame preencher_ficha_extraida com os atributos encontrados (tipo, endereço, área, dormitórios, banheiros, vagas, terraço, churrasqueira, preço anunciado, condomínio, estado/conservação, demais características). REGRA FUNDAMENTAL: fonte é evidência, não verdade — nunca escreva algo como confirmado; só registre o que a fonte disse. A validação humana acontece depois, na tela de Ficha.',
    'PESQUISA DE COMPARÁVEIS (Skill 1): se pedirem para pesquisar comparáveis, use web_search priorizando, nessa ordem: mesmo prédio/condomínio, mesma rua, entorno imediato, e só então bairro. Compare por tipologia, área, dormitórios, banheiros, vagas, características relevantes, estado/conservação e localização. Não pesquise volume por pesquisar — pare quando tiver amostra suficiente. Para CADA comparável encontrado, chame registrar_comparaveis_brutos ANTES de tirar qualquer conclusão, preservando preço, área, características, fonte e a URL individual do anúncio (nunca invente uma URL — se só achar a página do empreendimento, marque url_confirmada=false).',
    'ANÁLISE DE MERCADO (Skill 1): quando pedirem para analisar o mercado, use a ficha validada, evidências e os comparáveis já salvos/favoritados (não use qualquer resultado bruto ruim só porque foi encontrado — "favorito" é sinal do usuário, não garantia de qualidade técnica). Separe claramente dado observado de inferência/estimativa/pendência. Chame registrar_analise_mercado com o resumo e a faixa conservadora/base/otimista — deixe claro que a faixa é uma ESTIMATIVA sua, nunca um fato, e evite falsa precisão.',
    'Orçamento de reforma, quantitativos, custos de reforma e cronograma da reforma NÃO pertencem a esta skill — se pedirem isso aqui, diga que essa parte fica para uma etapa seguinte.',
    permitirEscrita
      ? 'REGRA DE ESCRITA (obrigatória, sem exceção): você NUNCA cria, altera, exclui, converte ou executa rotina diretamente, mesmo com ordem explícita. Todo pedido de criar/editar prospecção, criar/editar/excluir cenário, marcar cenário principal, converter em Ativo, registrar evidência, criar/editar rotina ou executar rotina passa SEMPRE por uma tool propose_* primeiro, mostrando o rascunho e perguntando se pode confirmar. SÓ chame confirm_pending_action depois que o usuário confirmar EXPLICITAMENTE nesta mensagem (ex.: "sim", "confirmo", "pode criar"). Uma mensagem que só ajusta um dado é refinamento — chame de novo a mesma tool propose_* com os dados atualizados. Se o usuário recusar, chame reject_pending_action. EXCEÇÃO explícita: preencher_ficha_extraida, registrar_comparaveis_brutos e registrar_analise_mercado NÃO passam por confirmação — são descoberta/pesquisa (ficha extraída ainda depende de validação humana na tela; comparáveis brutos são candidatos de pesquisa; a análise só vira permanente quando o usuário clicar "Encerrar" na tela) — chame-as diretamente quando fizer sentido no fluxo desta skill.'
      : 'Você está em modo consulta (Chat) — só pode listar, buscar, comparar e pesquisar, nunca alterar nem executar rotina. Se o usuário pedir para criar, editar, excluir, marcar principal, converter algo, registrar evidência ou executar rotina, diga que ele precisa mudar para o modo Work (botão de alternância ao lado do campo de mensagem).',
  ].join('\n')

  let input: OpenAI.Responses.ResponseInputItem[] = [
    ...history.map((m): OpenAI.Responses.EasyInputMessage => ({ role: m.role, content: m.content })),
    montarMensagemUsuario(prompt, anexo),
  ]

  let mutated = false
  let analiseMercado: Record<string, unknown> | undefined
  let loop = 0
  while (loop < 4) {
    loop++
    const res = await openai.responses.create({
      model: permitirEscrita ? 'gpt-4o' : 'gpt-4o-mini',
      instructions: persona,
      input,
      tools,
      tool_choice: 'auto',
      max_output_tokens: 800,
    })
    const fnCalls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call')
    if (fnCalls.length === 0) {
      const texto = extrairTextoComFontes(res.output)
      return { message: texto || 'Não consegui responder agora.', mutated, analiseMercado }
    }
    input = [...input, ...(res.output as unknown as OpenAI.Responses.ResponseInputItem[])]
    for (const fc of fnCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(fc.arguments) } catch { /* ignore */ }
      // registrar_analise_mercado não grava nada — a UI (Skill 1 Mercado)
      // precisa dos argumentos estruturados (faixa, resumo) para desenhar a
      // tabela/gráficos, não só do texto de confirmação em prosa.
      if (fc.name === 'registrar_analise_mercado') analiseMercado = args
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resultado = await execInvestidorAiTool(db, fc.name, args as Record<string, any>, ctx)
      if (TOOLS_QUE_PODEM_ESCREVER.has(fc.name) && resultado && !pareceFalhaOuRecusa(resultado)) mutated = true
      input.push({ type: 'function_call_output', call_id: fc.call_id, output: resultado ?? 'Função não reconhecida.' })
    }
  }
  return { message: 'Não consegui concluir a consulta agora. Tente reformular.', mutated, analiseMercado }
}

export type InvestidorSkillInput = {
  prompt: string
  history: ChatMsg[]
  modo: 'chat' | 'work'
  profileId: string | null
  actor: string
  fixedProspeccaoId?: string | null
  anexo?: InvestidorAnexo | null
}

export type InvestidorSkillResult = {
  message: string
  usedLLM: boolean
  blocked: boolean
  mutated: boolean
  analiseMercado?: Record<string, unknown>
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
    'convert_to_ativo', 'create_evidencia',
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

  // Fast path só para "listar tudo" sem nome nenhum a resolver — qualquer
  // menção específica (aspas, "esta"/"aquela") ou anexo (o usuário quer que
  // o CONTEÚDO do anexo seja processado, não uma listagem) vai direto para
  // o loop com IA.
  const norm = input.prompt.toLowerCase()
  if (!input.anexo && !isChangeIntent(input.prompt) && !mencionaEntidadeNomeada(norm) && ehPedidoDeListarTudo(norm)) {
    const resultado = await execInvestidorAiTool(db, 'list_prospeccoes', {}, ctx)
    if (resultado) return { message: resultado, usedLLM: false, blocked: false, mutated: false }
  }

  const permitirEscrita = input.modo === 'work'
  const { message, mutated, analiseMercado } = await rodarLoopInvestidor(input.prompt, input.history, ctx, db, permitirEscrita, input.anexo)
  return { message, usedLLM: true, blocked: false, mutated, analiseMercado }
}
