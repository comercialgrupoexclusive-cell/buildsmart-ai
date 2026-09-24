// ═══════════════════════════════════════════════════════════════════════════
// Triagem por IA de uma entrada da Caixa de Entrada.
//
// Mesma filosofia de lib/luizia-tarefas-runtime.ts: este arquivo é só
// ORQUESTRAÇÃO. Quem cria tarefa continua sendo execTarefasAiTool
// ('create_task'), com a mesma resolução de responsável, as mesmas validações
// e a mesma linha em luizia_tarefas_log. Nenhuma regra de tarefa é
// reimplementada aqui.
//
// Contrato desta superfície (decisão de produto, diferente do chat): aqui a
// IA ESCREVE DIRETO e a pessoa revisa depois. O chat flutuante faz o oposto
// (propõe e espera confirmação) porque lá o custo de errar é interromper uma
// conversa; aqui a entrada já foi jogada na caixa justamente para ser
// processada sem cerimônia, e desfazer é mudar a triagem.
// ═══════════════════════════════════════════════════════════════════════════
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { execTarefasAiTool, type TarefasAiCtx } from '../tarefas-ai-tools'

export type EntradaParaTriagem = {
  id: string
  processo_id: string | null
  tipo: 'texto' | 'imagem' | 'documento' | 'audio'
  conteudo_texto: string | null
  arquivo_nome: string | null
}

export type ResultadoTriagem = {
  status: 'tarefa' | 'um_dia_talvez' | 'arquivado' | 'novo'
  resumo: string
  tarefaId?: string | null
  mensagem: string
}

type Classificacao = {
  intencao: 'tarefa' | 'um_dia_talvez' | 'anotacao'
  titulo?: string
  descricao?: string
  data_prazo?: string | null
  prioridade?: 'baixa' | 'normal' | 'alta' | 'urgente'
  resumo: string
}

const SISTEMA = `Você classifica anotações soltas que uma pessoa jogou numa caixa de entrada de um sistema de gestão de obras.

Decida a intenção:
- "tarefa": há uma ação a fazer, com ou sem prazo. Ex.: "ligar pro engenheiro", "comprar cimento amanhã", "reunião com o cliente terça 15h" (reunião é uma tarefa com prazo).
- "um_dia_talvez": é uma ideia ou vontade sem compromisso. Ex.: "um dia trocar o piso da sala", "talvez valha olhar aquele terreno".
- "anotacao": é só um registro, sem ação. Ex.: "o concreto chegou às 8h", uma foto de nota fiscal, um número.

Para "tarefa", extraia um título curto e imperativo. Se houver data explícita ou relativa clara ("amanhã", "terça"), converta para AAAA-MM-DD usando a data de hoje informada. Se não houver data, deixe null — não invente prazo.

Responda SOMENTE com JSON:
{"intencao":"tarefa|um_dia_talvez|anotacao","titulo":"...","descricao":"...","data_prazo":"AAAA-MM-DD ou null","prioridade":"baixa|normal|alta|urgente","resumo":"uma frase do que você entendeu"}`

function textoDaEntrada(entrada: EntradaParaTriagem): string | null {
  if (entrada.conteudo_texto?.trim()) return entrada.conteudo_texto.trim()
  // Anexo sem texto não tem o que classificar: vira anotação, sem chamar o
  // modelo à toa. Transcrição de áudio entra antes, em quem chama.
  return null
}

export async function triarEntrada(
  db: SupabaseClient,
  entrada: EntradaParaTriagem,
  opts: { profileId: string | null; actor: string; hojeISO: string },
): Promise<ResultadoTriagem> {
  const texto = textoDaEntrada(entrada)
  if (!texto) {
    return {
      status: 'novo',
      resumo: entrada.arquivo_nome ? `Anexo: ${entrada.arquivo_nome}` : 'Sem texto para interpretar.',
      mensagem: 'Entrada sem texto — nada para interpretar automaticamente.',
    }
  }

  const key = process.env.OPENAI_API_KEY || ''
  if (!key.startsWith('sk-')) {
    return { status: 'novo', resumo: '', mensagem: 'IA não configurada — triagem manual.' }
  }

  const openai = new OpenAI({ apiKey: key })
  const resposta = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: `Hoje é ${opts.hojeISO}.\n\nAnotação:\n${texto}` },
    ],
  })

  let classificacao: Classificacao
  try {
    classificacao = JSON.parse(resposta.choices[0]?.message?.content || '{}') as Classificacao
  } catch {
    return { status: 'novo', resumo: '', mensagem: 'Não consegui interpretar esta entrada.' }
  }

  if (classificacao.intencao === 'um_dia_talvez') {
    return {
      status: 'um_dia_talvez',
      resumo: classificacao.resumo || texto.slice(0, 140),
      mensagem: 'Guardado como "um dia talvez".',
    }
  }

  if (classificacao.intencao !== 'tarefa' || !classificacao.titulo?.trim()) {
    return {
      status: 'arquivado',
      resumo: classificacao.resumo || texto.slice(0, 140),
      mensagem: 'Registrado como anotação.',
    }
  }

  // A criação passa pela mesma tool do WhatsApp e do obra-ai — inclusive a
  // auditoria em luizia_tarefas_log.
  const ctx: TarefasAiCtx = {
    actor: opts.actor,
    origem: 'caixa_entrada',
    profileId: opts.profileId,
    conversationKey: `caixa_entrada:${entrada.id}`,
    ...(entrada.processo_id ? { fixedProcessoId: entrada.processo_id } : {}),
  }

  const retorno = await execTarefasAiTool(db, 'create_task', {
    titulo: classificacao.titulo.trim(),
    descricao: classificacao.descricao || texto,
    data_prazo: classificacao.data_prazo || null,
    prioridade: classificacao.prioridade || 'normal',
  }, ctx)

  // execTarefasAiTool devolve texto, não id. Busca a tarefa recém-criada para
  // amarrar a triagem a ela — mesma janela, mesmo título.
  const { data } = await db
    .from('tarefas')
    .select('id')
    .eq('titulo', classificacao.titulo.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    status: 'tarefa',
    resumo: classificacao.resumo || classificacao.titulo,
    tarefaId: (data as { id: string } | null)?.id ?? null,
    mensagem: retorno || 'Tarefa criada.',
  }
}
