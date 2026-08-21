import OpenAI from 'openai'
import {
  comSkillTag, detectSkill, interpretarPedidoDeAlteracao, MENSAGEM_BLOQUEIO_CHAT,
  type LuiziaDraft, type LuiziaPageContext, type LuiziaSkillId,
} from './luizia-work'
import { processLuiziaWork } from './luizia-tools'
import { runTarefasSkill, temPropostaPendenteAtiva } from './luizia-tarefas-runtime'
import { runAvisosSkill, temPropostaPendenteAtivaAvisos } from './luizia-avisos-runtime'

type Row = Record<string, unknown>

export type LuiziaMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type LuiziaModo = 'chat' | 'work'

export type LuiziaContext = {
  modo?: string
  modoLuiza?: LuiziaModo
  pagina?: LuiziaPageContext
  draftAtual?: LuiziaDraft | null
  obraAtual?: Row | null
  obras?: Row[]
  orcamentos?: Row[]
  itensOrcamento?: Row[]
  etapas?: Row[]
  materiais?: Row[]
  medicoes?: Row[]
  diario?: Row[]
  progresso?: Record<string, number>
  composicoes?: Row[]
  insumos?: Row[]
  fornecedores?: Row[]
  listasCompras?: Row[]
  arquivos?: Row[]
  uploadedFiles?: Row[]
  [key: string]: unknown
}

export type LuiziaResult = {
  message: string
  mode: 'local-fallback' | 'openai' | 'blocked' | 'draft' | 'tool'
  model?: string
  skill: LuiziaSkillId
  draft: LuiziaDraft | null
  blocked: boolean
  // Quando esta resposta escreveu de fato em `tarefas` ou em
  // `luizia_wa_dispatches` (criação/edição confirmada), diz qual domínio —
  // o cliente usa isso para disparar o evento certo (buildsmart:tarefas-
  // changed / buildsmart:luiza-dispatches-changed) e quem estiver ouvindo
  // (/tarefas, ContextoTarefas, o painel admin) recarrega sem F5.
  mutatedDomain?: 'tarefas' | 'avisos' | null
}

export function hasOpenAiKey() {
  const key = process.env.OPENAI_API_KEY || ''
  return key.startsWith('sk-') && !key.includes('placeholder') && !key.includes('your_')
}

export function modelFor(complex: boolean) {
  const requested = complex ? process.env.OPENAI_COMPLEX_MODEL : process.env.OPENAI_SIMPLE_MODEL
  const allowed = new Set(['gpt-4o-mini', 'gpt-4o'])
  if (requested && allowed.has(requested)) return requested
  return complex ? 'gpt-4o' : 'gpt-4o-mini'
}

function limitJson(value: unknown, maxLength = 60000) {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n... contexto reduzido para caber na chamada ...`
}

function isWhatsappContext(context: LuiziaContext) {
  return context.modo === 'whatsapp' || context.origem === 'whatsapp'
}

function firstUserQuestion(messages: LuiziaMessage[]) {
  return [...messages].reverse().find(m => m.role === 'user')?.content || ''
}

function summarizeList<T>(items: T[] | undefined, limit = 5) {
  return Array.isArray(items) ? items.slice(0, limit) : []
}

function localFallback(messages: LuiziaMessage[], context: LuiziaContext) {
  const question = firstUserQuestion(messages).toLowerCase()
  const obra = context.obraAtual || context.obras?.[0]
  const etapas = context.etapas || []
  const materiais = context.materiais || []
  const orcamentos = context.orcamentos || []
  const fornecedores = context.fornecedores || []
  const listasCompras = context.listasCompras || []
  const diario = context.diario || []
  const arquivos = [...(context.arquivos || []), ...(context.uploadedFiles || [])]

  const proximasEtapas = etapas
    .filter(e => e.status !== 'concluida')
    .slice(0, 4)
    .map(e => `- ${e.nome}${e.data_inicio ? `: inicio previsto em ${e.data_inicio}` : ''}`)
    .join('\n')

  const materiaisAComprar = materiais
    .filter(m => m.status_compra !== 'comprado')
    .slice(0, 5)
    .map(m => `- ${m.descricao}: ${Number(m.quantidade_total || 0).toLocaleString('pt-BR')} ${m.unidade || ''}${m.subetapa ? ` (${m.subetapa})` : ''}`)
    .join('\n')

  if (question.includes('arquivo') || question.includes('projeto') || question.includes('planta')) {
    return [
      `Estou em modo local sem chave da OpenAI configurada, mas ja consigo organizar os arquivos da obra ${obra?.nome || 'selecionada'}.`,
      arquivos.length > 0
        ? `Arquivos recebidos/anexados:\n${arquivos.slice(0, 6).map(a => `- ${a.nome || a.name}: ${a.categoria || a.tipo || a.type || 'arquivo'}`).join('\n')}`
        : 'Ainda nao encontrei arquivo anexado ou enviado nesta conversa.',
      'Quando voce colar a OPENAI_API_KEY no .env.local, eu passo a interpretar o conteudo enviado e cruzar com orcamento, cronograma, compras, diario e materiais.',
    ].join('\n\n')
  }

  if (question.includes('compra') || question.includes('comprar') || question.includes('fornecedor')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${materiais.filter(m => m.status_compra !== 'comprado').length} material(is) em aberto, ${listasCompras.length} lista(s) de compra e ${fornecedores.length} fornecedor(es) disponiveis.`,
      materiaisAComprar ? `Materiais para acompanhar:\n${materiaisAComprar}` : 'Nao encontrei materiais em aberto.',
      fornecedores.length > 0 ? `Fornecedores de referencia:\n${summarizeList(fornecedores, 4).map(f => `- ${f.nome} (${f.categoria})`).join('\n')}` : 'Ainda nao ha fornecedores cadastrados para cruzar com compras.',
    ].join('\n\n')
  }

  if (question.includes('diario') || question.includes('diÃ¡rio') || question.includes('medicao') || question.includes('mediÃ§Ã£o') || question.includes('avanco') || question.includes('avanÃ§o')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${diario.length} registro(s) de diario e ${context.medicoes?.length || 0} medicao(oes).`,
      proximasEtapas ? `Etapas para comparar com o avanco:\n${proximasEtapas}` : 'Ainda faltam etapas planejadas para comparar o avanco.',
      'Com a chave da OpenAI configurada, eu consigo resumir diario, progresso e proximas decisoes com mais precisao.',
    ].join('\n\n')
  }

  if (question.includes('orcamento') || question.includes('orÃ§amento')) {
    return [
      `Para a obra ${obra?.nome || 'atual'}, encontrei ${orcamentos.length} orcamento(s) local(is).`,
      proximasEtapas ? `Etapas que ajudam a ordenar o orcamento:\n${proximasEtapas}` : 'Ainda faltam etapas suficientes para estruturar o orcamento por execucao.',
      materiaisAComprar ? `Materiais ja previstos:\n${materiaisAComprar}` : 'Ainda nao ha materiais previstos a partir do orcamento.',
    ].join('\n\n')
  }

  return [
    `Resumo local da obra ${obra?.nome || 'atual'}: ${etapas.length} etapa(s), ${materiais.length} material(is), ${orcamentos.length} orcamento(s), ${fornecedores.length} fornecedor(es) e ${diario.length} registro(s) de diario.`,
    proximasEtapas ? `Proximas etapas previstas:\n${proximasEtapas}` : 'Nao encontrei proximas etapas planejadas.',
    materiaisAComprar ? `Materiais para acompanhar:\n${materiaisAComprar}` : 'Nao encontrei materiais em aberto para compra.',
    'Esta resposta foi gerada em modo local de teste. Para ativar IA real, configure OPENAI_API_KEY no .env.local e reinicie o servidor.',
  ].join('\n\n')
}

async function gerarRespostaNormal(
  messages: LuiziaMessage[],
  context: LuiziaContext,
  complex: boolean,
): Promise<{ message: string; mode: 'local-fallback' | 'openai'; model?: string }> {
  if (!hasOpenAiKey()) {
    return {
      message: localFallback(messages, context),
      mode: 'local-fallback',
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const hoje = new Date().toLocaleDateString('pt-BR')
  const isWhatsapp = isWhatsappContext(context)
  const model = modelFor(isWhatsapp ? false : complex)
  const contextLimit = isWhatsapp ? 12000 : 60000
  const maxTokens = isWhatsapp ? 420 : complex ? 1800 : 900

  const systemPrompt = `Voce e a Luiza, a assistente IA da BuildSmart AI. O nome vem de Luiz + IA.

DATA ATUAL: ${hoje}

PAPEL:
- Ajudar usuarios leigos a controlar obras residenciais de 40m2 a 200m2.
- Ser pratico, simples e preditivo.
- Prever proximas etapas, proximos materiais, compras, medicoes e pontos de decisao.
- Nao usar tom alarmista. Prefira "previsto", "ponto de atencao", "proximo passo".

REGRAS:
- Responda sempre em portugues brasileiro.
- Use apenas os dados do contexto quando falar da obra.
- Voce pode cruzar todos os dados recebidos no contexto: obras, orcamentos, itens, insumos, composicoes, materiais, compras, fornecedores, cronograma, diario, medicoes, arquivos e usuarios.
- Quando faltar dado, diga claramente o que falta.
- Seja curto: ate 4 blocos pequenos.
- Separe materiais, mao de obra e equipamentos quando esse assunto aparecer.
- Diferencie material em aberto, material parcial e material comprado.
- Ao falar de compras, considere fornecedores e listas de compra.
- Ao falar de avanco, considere diario, medicoes e progresso.
- Nao prometa leitura real de arquivos se o conteudo do arquivo nao foi enviado.
- Quando sugerir criacao/alteracao no sistema, deixe claro que o usuario deve revisar antes de salvar.
- Voce ainda nao executa acoes no banco nem cria registros diretamente.
- O contexto e somente leitura. Nao invente que alterou dados.
- Nunca diga que criou, salvou, excluiu ou alterou uma obra, orcamento, compra, diario ou material.
- Quando o usuario pedir para criar algo, responda preparando os dados sugeridos e diga que ele precisa confirmar/salvar pela tela correspondente.
${isWhatsapp ? '- Pelo WhatsApp, responda ainda mais curto: no maximo 2 blocos pequenos. Priorize resposta direta e proximo passo.' : ''}

CONTEXTO LOCAL/SISTEMA:
${limitJson(context, contextLimit)}`

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(message => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    ],
    max_tokens: maxTokens,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Resposta vazia da IA')

  return { message: content, model, mode: 'openai' }
}

/**
 * Orquestra Chat/Work.
 *
 * Chat: somente leitura. Qualquer pedido com cara de alteração é bloqueado
 * ANTES de chamar a IA, com a mensagem fixa exigida — nunca muda de modo
 * sozinha.
 *
 * Work: monta/atualiza um rascunho estruturado sem escrita antecipada. Uma
 * confirmação explícita executa exatamente as operações assinadas do draft
 * pela camada server-side de tools. Perguntas normais continuam respondendo
 * como no Chat.
 *
 * Em ambos os modos, a resposta ganha uma linha discreta "Usando skill: X"
 * — o roteamento de skill é só contexto de página + palavras do pedido,
 * sem seletor manual e sem skills personalizadas (isso fica para depois).
 */
export async function askLuizia({
  messages,
  complex = false,
  context = {},
}: {
  messages: LuiziaMessage[]
  complex?: boolean
  context?: LuiziaContext
}): Promise<LuiziaResult> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Mensagem vazia')
  }

  const ultimaMensagem = firstUserQuestion(messages)
  const draftAtual = context.draftAtual || null
  const usuario = context.usuario as { id?: string; name?: string } | null | undefined

  // Bug real de produção: o usuário digitou "modo work" esperando que isso
  // mudasse a interface — Luiza sugeriu "mude para Work" mesmo já estando
  // lá. A mensagem em si NUNCA muda o modo real (isso é estado do cliente,
  // context.modoLuiza) — só avisa honestamente o estado atual, sem chamar
  // IA nem rotear para nenhuma skill.
  const pedidoDeModo = /\bmodo\s+(work|chat)\b/i.exec(ultimaMensagem)
  if (pedidoDeModo && (context.modoLuiza === 'work' || context.modoLuiza === 'chat')) {
    const desejado = pedidoDeModo[1].toLowerCase() === 'work' ? 'Work' : 'Chat'
    const atualLabel = context.modoLuiza === 'work' ? 'Work' : 'Chat'
    const skillModo = detectSkill(context.pagina, ultimaMensagem)
    if (atualLabel === desejado) {
      return {
        message: comSkillTag(`Você já está em ${atualLabel}.`, skillModo),
        mode: 'blocked', skill: skillModo, draft: draftAtual, blocked: false,
      }
    }
    return {
      message: comSkillTag(`Você ainda está em ${atualLabel}. Use o botão de alternância ao lado do campo de mensagem para mudar para ${desejado}.`, skillModo),
      mode: 'blocked', skill: skillModo, draft: draftAtual, blocked: true,
    }
  }

  let skill = detectSkill(context.pagina, ultimaMensagem)

  // Uma proposta pendente da Luiza (criação/edição de tarefa OU de aviso
  // aguardando "sim"/"amanhã"/"não") força de volta para a skill certa
  // mesmo que a mensagem seguinte não tenha nenhuma palavra-chave — sem
  // isso, "amanhã" ou "sim" se perderiam no roteamento genérico por texto e
  // a proposta nunca seria refinada/confirmada. Só verificamos em Work (só
  // lá existe proposta pendente — Chat bloqueia qualquer intenção de
  // escrita antes de chegar aqui).
  if (skill !== 'tarefas' && skill !== 'avisos' && context.modoLuiza === 'work') {
    const [pendenteTarefa, pendenteAviso] = await Promise.all([
      temPropostaPendenteAtiva(usuario?.id || null),
      temPropostaPendenteAtivaAvisos(usuario?.id || null),
    ])
    if (pendenteTarefa) skill = 'tarefas'
    else if (pendenteAviso) skill = 'avisos'
  }

  // Tarefas tem runtime próprio (lib/luizia-tarefas-runtime.ts): reaproveita
  // as MESMAS tools/regras de autorização do WhatsApp e obra-ai, nunca o
  // dump de obras/orçamentos/etapas/materiais/etc. deste arquivo — e nunca
  // passa pelo sistema de rascunho de Orçamento/Planejamento/RDO/Compras
  // (lib/luizia-tools.ts), que não sabe nada sobre tarefas.
  if (skill === 'tarefas') {
    const pagina = context.pagina
    const escopadoATarefas = pagina?.aba === 'tarefas'
    const resultado = await runTarefasSkill({
      prompt: ultimaMensagem,
      history: messages.slice(0, -1),
      modo: context.modoLuiza === 'work' ? 'work' : 'chat',
      profileId: usuario?.id || null,
      actor: usuario?.name || 'Usuário do painel',
      fixedObraId: escopadoATarefas && pagina?.obraId ? pagina.obraId : undefined,
      fixedProjetoId: escopadoATarefas && !pagina?.obraId && pagina?.projetoId ? pagina.projetoId : undefined,
    })
    return {
      message: comSkillTag(resultado.message, skill),
      mode: resultado.blocked ? 'blocked' : 'tool',
      skill,
      draft: draftAtual,
      blocked: resultado.blocked,
      mutatedDomain: resultado.mutated ? 'tarefas' : null,
    }
  }

  // Avisos (lib/luizia-avisos-runtime.ts) — mesmo padrão de Tarefas, reusa o
  // motor de disparos existente (luizia_wa_dispatches) sem duplicar regra.
  if (skill === 'avisos') {
    const resultado = await runAvisosSkill({
      prompt: ultimaMensagem,
      history: messages.slice(0, -1),
      modo: context.modoLuiza === 'work' ? 'work' : 'chat',
      profileId: usuario?.id || null,
      actor: usuario?.name || 'Usuário do painel',
    })
    return {
      message: comSkillTag(resultado.message, skill),
      mode: resultado.blocked ? 'blocked' : 'tool',
      skill,
      draft: draftAtual,
      blocked: resultado.blocked,
      mutatedDomain: resultado.mutated ? 'avisos' : null,
    }
  }

  // Compatibilidade: chamadores que ainda não migraram para Chat/Work
  // (WhatsApp, BuildAssistente IA completo) não mandam modoLuiza — mantêm o
  // comportamento de sempre, sem bloqueio nem rascunho. O seletor Chat/Work
  // desta etapa vive só na LuiziaFloatingChat.
  if (context.modoLuiza !== 'chat' && context.modoLuiza !== 'work') {
    const resposta = await gerarRespostaNormal(messages, context, complex)
    return { ...resposta, skill, draft: draftAtual, blocked: false }
  }

  const modo: LuiziaModo = context.modoLuiza
  const interpretacao = interpretarPedidoDeAlteracao(ultimaMensagem)

  if (modo === 'chat') {
    if (interpretacao.tipo !== 'nenhuma') {
      return { message: MENSAGEM_BLOQUEIO_CHAT, mode: 'blocked', skill, draft: draftAtual, blocked: true }
    }
    const resposta = await gerarRespostaNormal(messages, context, complex)
    return { ...resposta, message: comSkillTag(resposta.message, skill), skill, draft: draftAtual, blocked: false }
  }

  // modo === 'work'. A camada compartilhada resolve o alvo no contexto
  // canônico e, quando a mensagem é uma confirmação explícita, executa
  // exatamente as operações estruturadas já presentes no rascunho.
  try {
    const work = await processLuiziaWork({ prompt: ultimaMensagem, context, draft: draftAtual, skill })
    if (!work) {
      if (interpretacao.tipo !== 'nenhuma') {
        return {
          message: comSkillTag('Entendi a alteração, mas preciso de mais detalhes para montar um rascunho seguro.', skill),
          mode: 'draft', skill, draft: draftAtual, blocked: false,
        }
      }
      const resposta = await gerarRespostaNormal(messages, context, complex)
      return { ...resposta, message: comSkillTag(resposta.message, skill), skill, draft: draftAtual, blocked: false }
    }
    return {
      message: comSkillTag(work.message, skill), mode: 'draft', skill,
      draft: work.draft, blocked: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível processar o modo Work.'
    return { message: comSkillTag(message, skill), mode: 'draft', skill, draft: draftAtual, blocked: false }
  }
}
