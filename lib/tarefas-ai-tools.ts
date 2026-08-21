// ═══════════════════════════════════════════════════════════════════════════
// Ferramentas de IA (function-calling) para o motor único de Tarefas —
// COMPARTILHADAS entre o WhatsApp (webhook) e o agente in-app (obra-ai),
// mesmo padrão de lib/ai-obra-tools.ts e lib/projeto-ai-tools.ts.
//
// Tarefa != Planejamento: estas funções NUNCA tocam etapas/cronograma/
// orçamento — só a tabela `tarefas` (ação de uma pessoa, não atividade da
// obra). Reprogramar uma tarefa é só mudar data_prazo dela.
//
// Toda escrita grava uma linha em luizia_tarefas_log (ver migration
// 20260821_luizia_tarefas_log). Consultas (list_tasks/get_task) não logam.
//
// Rodada de hardening (20260821120000_luizia_hardening_v1_1):
// - Resolução de obra/projeto/responsável/tarefa por nome nunca escolhe
//   sozinha entre duas correspondências reais — ver lib/ai-resolve.ts.
// - "Minhas tarefas" no WhatsApp usa o vínculo estrutural
//   luizia_wa_phone_rules.profile_id (ctx.profileId), nunca fuzzy match
//   pelo nome do contato.
// - Sugestão da Luiza (não ordem explícita) nunca escreve na mesma chamada —
//   grava uma proposta pendente (lib/luizia-pending-actions.ts) que só vira
//   escrita real via confirm_pending_action, numa mensagem seguinte.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'
import type { Tarefa } from './types'
import { isAtrasada, hojeISO, TAREFAS_ABERTAS, PRIORIDADE_LABEL, STATUS_LABEL, ordenarTarefas } from './tarefas'
import { resolverComSeguranca, formatarAmbiguidade, type ResolveOutcome } from './ai-resolve'
import { criarPropostaPendente, acharPendenteParaResolver, marcarRejeitada, marcarExecutada, formatarListaPendentes } from './luizia-pending-actions'

type DB = SupabaseClient
type Args = Record<string, any>

export type TarefasAiCtx = {
  actor: string           // nome/telefone de quem está conversando (label livre, sem auth real)
  origem: 'whatsapp' | 'obra_ai' | 'floating'
  fixedObraId?: string    // modo escopado (obra-ai, floating dentro de Obra>Tarefas): tarefas restritas a esta obra
  fixedProjetoId?: string // modo escopado (floating dentro de Projeto>Tarefas): tarefas restritas a este projeto
  profileId?: string | null   // identidade estrutural do remetente (whatsapp: luizia_wa_phone_rules.profile_id; floating: currentProfile.id direto — nunca por nome)
  conversationKey: string     // chave da conversa p/ propostas pendentes (whatsapp: telefone; obra_ai: obra_ai:{obraId}; floating: floating:{profileId})
}

export const TAREFAS_AI_TOOL_NAMES = [
  'list_tasks', 'get_task', 'create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task',
  'suggest_task_change', 'propose_create_task', 'confirm_pending_action', 'reject_pending_action',
]

type AcaoStatus = 'concluir' | 'reabrir' | 'cancelar'
type AcaoTool = 'update_task' | 'complete_task' | 'reopen_task' | 'cancel_task'
const TOOL_POR_ACAO: Record<'editar' | AcaoStatus, AcaoTool> = {
  editar: 'update_task', concluir: 'complete_task', reabrir: 'reopen_task', cancelar: 'cancel_task',
}

// ─── Definições das tools ────────────────────────────────────────────────────
export function tarefasAiToolDefs(scoped: boolean): OpenAI.Chat.ChatCompletionTool[] {
  const ctxProps = scoped ? {} : {
    obra_nome: { type: 'string', description: 'Nome ou parte do nome da obra (opcional)' },
    projeto_nome: { type: 'string', description: 'Nome ou parte do nome do projeto (opcional)' },
  }
  return [
    {
      type: 'function',
      function: {
        name: 'list_tasks',
        description: 'Lista tarefas do motor de Tarefas do BuildSmart. Tarefa é uma ação que uma PESSOA precisa fazer (ex.: "confirmar pontos de ar-condicionado") — não confunda com etapa/serviço do cronograma da obra (isso é Planejamento, outra coisa). Use para responder perguntas como "o que tenho hoje", "minhas tarefas", "o que está atrasado", "o que tenho essa semana", "o que estou aguardando", "quais tarefas são da obra/projeto X", "o que o Fulano precisa fazer". Se a pergunta for pessoal ("tenho", "minhas", "pra mim", "o que eu tenho") e você NÃO souber de quem é (não informe responsavel_nome/obra_nome/projeto_nome nesse caso) — a função resolve automaticamente pelo remetente. Se a pergunta for GERAL ("no geral", "todas", "o que temos", "visão geral", "como estão as tarefas") — envie escopo_geral=true para NÃO filtrar por responsável nenhum, mesmo que a pergunta pareça pessoal à primeira vista. Na dúvida entre pessoal e geral, prefira geral e deixe a resposta explicitar o recorte (ex.: "no geral há 19 abertas, sendo 9 suas"). Sempre baseie a resposta no resultado desta função — nunca invente tarefa.',
        parameters: {
          type: 'object',
          properties: {
            filtro: {
              type: 'string',
              enum: ['hoje', 'amanha', 'atrasadas', 'semana', 'proximas', 'aguardando', 'todas'],
              description: 'hoje = vence hoje ou atrasada; amanha = prazo EXATAMENTE amanhã (não confundir com hoje); atrasadas = só vencidas; semana = prazo nos próximos 7 dias; proximas = qualquer prazo futuro; aguardando = status aguardando; todas = sem filtro de prazo/status (ainda exclui concluída/cancelada por padrão)',
            },
            responsavel_nome: { type: 'string', description: 'Nome ou parte do nome do responsável — só informe quando o usuário pedir tarefas de OUTRA pessoa explicitamente (ex.: "o que o Gabriel tem?"). Não informe para perguntas pessoais ("minhas tarefas").' },
            escopo_geral: { type: 'boolean', description: 'true = pergunta é sobre o todo ("no geral", "todas", "o que temos"), nunca filtrar por responsável mesmo sem outro escopo informado. Não combine com responsavel_nome.' },
            incluir_concluidas: { type: 'boolean', description: 'Se true, inclui tarefas concluídas/canceladas (padrão false)' },
            ...ctxProps,
          },
          required: ['filtro'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_task',
        description: 'Busca uma tarefa específica pelo título (busca por semelhança). Use antes de editar/concluir/cancelar quando precisar confirmar qual tarefa exatamente o usuário quer dizer, ou se ele pedir detalhes de uma tarefa.',
        parameters: {
          type: 'object',
          properties: { titulo: { type: 'string', description: 'Título ou parte do título da tarefa' } },
          required: ['titulo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Cria uma nova tarefa (ação de uma pessoa) — diferente de criar uma etapa do cronograma da obra. Use quando o usuário pedir para criar, anotar ou lembrar uma tarefa/pendência. Isto é sempre uma ordem explícita (criar é um ato único, não uma sugestão) — pode chamar direto. Se esta ferramenta não estiver disponível para você nesta conversa, use propose_create_task em vez desta.',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Título da tarefa (obrigatório)' },
            descricao: { type: 'string', description: 'Detalhes opcionais' },
            responsavel_nome: { type: 'string', description: 'Nome do responsável (opcional, busca por semelhança nos perfis cadastrados)' },
            para_mim: { type: 'boolean', description: 'true quando o usuário disse "pra mim"/"minha tarefa"/"anota pra mim" — responsável é o próprio remetente. Não combine com responsavel_nome.' },
            prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'], description: 'Padrão: normal' },
            data_prazo: { type: 'string', description: 'Prazo YYYY-MM-DD (opcional)' },
            ...ctxProps,
          },
          required: ['titulo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_create_task',
        description: 'Prepara (SEM CRIAR) uma proposta de nova tarefa para o usuário revisar e confirmar — use esta função em vez de create_task sempre que a superfície exigir confirmação explícita antes de qualquer escrita (ex.: chat flutuante). Devolve um rascunho com Tarefa/Responsável/Prazo/Prioridade/Contexto para você repassar ao usuário terminando com uma pergunta de confirmação (ou pedindo o dado que faltar, ex. prazo). Chamar de novo com argumentos atualizados SUBSTITUI o rascunho anterior desta conversa (não cria um segundo). NUNCA escreve em tarefas — só confirm_pending_action escreve, depois que o usuário confirmar explicitamente.',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Título da tarefa (obrigatório)' },
            descricao: { type: 'string', description: 'Detalhes opcionais' },
            responsavel_nome: { type: 'string', description: 'Nome do responsável (opcional, busca por semelhança nos perfis cadastrados)' },
            para_mim: { type: 'boolean', description: 'true quando o usuário disse "pra mim"/"minha tarefa"/"anota pra mim" — responsável é o próprio remetente. Não combine com responsavel_nome.' },
            prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'], description: 'Padrão: normal' },
            data_prazo: { type: 'string', description: 'Prazo YYYY-MM-DD (opcional, deixe de fora se o usuário ainda não disse)' },
            ...ctxProps,
          },
          required: ['titulo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_task',
        description: 'Altera prazo (reprogramação), prioridade, responsável ou status (pendente/em_andamento/aguardando) de uma tarefa existente. Para concluir, reabrir ou cancelar use complete_task/reopen_task/cancel_task, não esta função. USE ESTA FUNÇÃO SOMENTE quando o usuário der uma ordem explícita para aquela mudança nesta mensagem (ex.: "muda para sexta", "passa para o Gabriel", "coloca como aguardando cliente"), OU quando ele estiver corrigindo os parâmetros de uma sugestão sua ao confirmar (ex.: "sim, mas passa para terça"). Se a mudança for uma sugestão SUA que ainda não foi confirmada, use suggest_task_change em vez desta.',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Título ou parte do título da tarefa a alterar' },
            novo_prazo: { type: 'string', description: 'Novo prazo YYYY-MM-DD. Envie string vazia "" para remover o prazo.' },
            nova_prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'] },
            novo_responsavel_nome: { type: 'string', description: 'Novo responsável (busca por semelhança)' },
            novo_status: { type: 'string', enum: ['pendente', 'em_andamento', 'aguardando'], description: 'Não use "concluida" ou "cancelada" aqui — use complete_task/cancel_task' },
          },
          required: ['titulo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'complete_task',
        description: 'Marca uma tarefa como concluída. Só chame quando o usuário confirmar explicitamente que terminou ou pedir para concluir/marcar como feita nesta mensagem. Se for você sugerindo concluir, use suggest_task_change.',
        parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título ou parte do título' } }, required: ['titulo'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reopen_task',
        description: 'Reabre uma tarefa concluída (volta para pendente). Só chame quando o usuário pedir explicitamente nesta mensagem.',
        parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'cancel_task',
        description: 'Cancela uma tarefa. Só chame quando o usuário pedir explicitamente para cancelar nesta mensagem. Se for você sugerindo cancelar, use suggest_task_change.',
        parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'suggest_task_change',
        description: 'Registra uma SUGESTÃO SUA de mudança numa tarefa (reprogramação por atraso/conflito, concluir, reabrir ou cancelar) — NUNCA escreve na tarefa. Use sempre que a ideia partiu de você, não de uma ordem explícita do usuário nesta mensagem (ex.: você percebeu uma tarefa atrasada e quer recomendar mudar o prazo). A função devolve o texto da sugestão para você repassar terminando com uma pergunta — só executa depois que o usuário confirmar explicitamente numa mensagem seguinte (aí chame confirm_pending_action).',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Título ou parte do título da tarefa' },
            acao: { type: 'string', enum: ['editar', 'concluir', 'reabrir', 'cancelar'], description: 'O que você está sugerindo' },
            novo_prazo: { type: 'string', description: 'Só para acao=editar: novo prazo YYYY-MM-DD sugerido' },
            nova_prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta', 'urgente'], description: 'Só para acao=editar' },
            novo_responsavel_nome: { type: 'string', description: 'Só para acao=editar' },
            novo_status: { type: 'string', enum: ['pendente', 'em_andamento', 'aguardando'], description: 'Só para acao=editar' },
            justificativa: { type: 'string', description: 'Por que você está sugerindo isso (ex.: "está atrasada e conflita com X"), incluída na mensagem ao usuário' },
          },
          required: ['titulo', 'acao'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'confirm_pending_action',
        description: 'Executa a sugestão pendente que o usuário acabou de confirmar (ex.: ele respondeu "sim", "pode", "faz isso" depois de você sugerir algo com suggest_task_change). NÃO use para uma ordem nova/direta — isso é update_task/complete_task/etc. Se houver mais de uma sugestão pendente, o resultado vai pedir para escolher.',
        parameters: {
          type: 'object',
          properties: {
            pending_id: { type: 'string', description: 'Id da proposta, se você já sabe qual (opcional)' },
            titulo: { type: 'string', description: 'Título da tarefa da sugestão, se precisar desambiguar entre várias pendentes (opcional)' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reject_pending_action',
        description: 'Descarta a sugestão pendente que o usuário recusou (ex.: ele respondeu "não"). Nunca escreve na tarefa.',
        parameters: {
          type: 'object',
          properties: {
            pending_id: { type: 'string', description: 'Id da proposta, se você já sabe qual (opcional)' },
            titulo: { type: 'string', description: 'Título da tarefa da sugestão, se precisar desambiguar entre várias pendentes (opcional)' },
          },
          required: [],
        },
      },
    },
  ]
}

// ─── Resolução segura por nome (obra / projeto / responsável) ───────────────
// Busca fuzzy (ilike) para reunir candidatas, depois nunca escolhe sozinha
// entre duas correspondências reais — ver lib/ai-resolve.ts. `null` = nome
// não foi informado; caso contrário sempre um ResolveOutcome (unica/ambigua/
// nao_encontrada), nunca "a mais recente" por padrão.
async function resolveObraPorNome(db: DB, nome?: string): Promise<ResolveOutcome<{ id: string; nome: string }> | null> {
  if (!nome) return null
  const { data } = await db.from('obras').select('id,nome').ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as { id: string; nome: string }[], o => o.nome)
}

async function resolveProjetoPorNome(db: DB, nome?: string): Promise<ResolveOutcome<{ id: string; nome: string }> | null> {
  if (!nome) return null
  const { data } = await db.from('projetos').select('id,nome').ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as { id: string; nome: string }[], p => p.nome)
}

async function resolveResponsavelPorNome(db: DB, nome?: string): Promise<ResolveOutcome<{ id: string; name: string }> | null> {
  if (!nome) return null
  const { data } = await db.from('profiles').select('id,name').ilike('name', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as { id: string; name: string }[], p => p.name)
}

// Acha uma tarefa pelo título com a mesma regra de segurança (exata > fuzzy
// única > ambígua > não encontrada). `escopoResponsavelId`, quando informado,
// restringe a busca às tarefas dessa pessoa (usado por "minhas tarefas").
async function acharTarefa(db: DB, titulo: string, fixedObraId?: string, fixedProjetoId?: string, escopoResponsavelId?: string | null): Promise<ResolveOutcome<Tarefa>> {
  let query = db.from('tarefas').select('*').ilike('titulo', `%${titulo}%`).limit(8)
  if (fixedObraId) query = query.eq('obra_id', fixedObraId)
  else if (fixedProjetoId) query = query.eq('projeto_id', fixedProjetoId)
  if (escopoResponsavelId) query = query.eq('responsavel_id', escopoResponsavelId)
  const { data } = await query
  return resolverComSeguranca(titulo, (data || []) as Tarefa[], t => t.titulo)
}

async function acharTarefaPorId(db: DB, id: string): Promise<Tarefa | null> {
  const { data } = await db.from('tarefas').select('*').eq('id', id).maybeSingle()
  return (data as Tarefa) || null
}

function formatData(iso: string | null): string {
  if (!iso) return 'sem prazo'
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR')
}

async function contextoDaTarefa(db: DB, t: Tarefa): Promise<string> {
  if (t.obra_id) {
    const { data } = await db.from('obras').select('nome').eq('id', t.obra_id).maybeSingle()
    return (data as any)?.nome ? `obra ${(data as any).nome}` : 'obra'
  }
  if (t.projeto_id) {
    const { data } = await db.from('projetos').select('nome').eq('id', t.projeto_id).maybeSingle()
    return (data as any)?.nome ? `projeto ${(data as any).nome}` : 'projeto'
  }
  return 'sem contexto'
}

function formatTarefaLinha(t: Tarefa, ctxLabel?: string): string {
  const atraso = isAtrasada(t) ? ' [ATRASADA]' : ''
  const partes = [
    `"${t.titulo}"`,
    `status ${STATUS_LABEL[t.status]}${atraso}`,
    `prioridade ${PRIORIDADE_LABEL[t.prioridade]}`,
    `prazo ${formatData(t.data_prazo)}`,
  ]
  if (t.responsavel_nome) partes.push(`responsável ${t.responsavel_nome}`)
  if (ctxLabel) partes.push(ctxLabel)
  return '- ' + partes.join(', ')
}

// ─── Log de auditoria (só escritas) ──────────────────────────────────────────
async function logAcao(db: DB, params: {
  tarefaId: string | null
  acao: 'criar' | 'editar' | 'concluir' | 'reabrir' | 'cancelar'
  ctx: TarefasAiCtx
  valorAnterior?: Record<string, unknown> | null
  valorNovo?: Record<string, unknown> | null
  resultado: 'ok' | 'erro'
  erro?: string | null
}) {
  try {
    await db.from('luizia_tarefas_log').insert({
      tarefa_id: params.tarefaId,
      acao: params.acao,
      usuario: params.ctx.actor,
      origem: params.ctx.origem,
      valor_anterior: params.valorAnterior ?? null,
      valor_novo: params.valorNovo ?? null,
      resultado: params.resultado,
      erro: params.erro ?? null,
    })
  } catch { /* log nunca deve derrubar a ferramenta */ }
}

// ─── Construção de patch (compartilhada entre execução direta e proposta) ───
type PatchResultado = { patch: Record<string, unknown>; mudancas: string[] } | { erro: string }

async function construirPatchEdicao(db: DB, args: Args): Promise<PatchResultado> {
  const patch: Record<string, unknown> = {}
  const mudancas: string[] = []
  if (args.novo_prazo !== undefined) {
    patch.data_prazo = args.novo_prazo === '' ? null : args.novo_prazo
    mudancas.push(patch.data_prazo ? `prazo para ${formatData(patch.data_prazo as string)}` : 'prazo removido')
  }
  if (args.nova_prioridade) {
    patch.prioridade = args.nova_prioridade
    mudancas.push(`prioridade para ${PRIORIDADE_LABEL[args.nova_prioridade as Tarefa['prioridade']]}`)
  }
  if (args.novo_status) {
    if (!['pendente', 'em_andamento', 'aguardando'].includes(args.novo_status)) {
      return { erro: `Status "${args.novo_status}" inválido aqui — use complete_task para concluir ou cancel_task para cancelar.` }
    }
    patch.status = args.novo_status
    mudancas.push(`status para ${STATUS_LABEL[args.novo_status as Tarefa['status']]}`)
  }
  if (args.novo_responsavel_nome) {
    const resp = await resolveResponsavelPorNome(db, args.novo_responsavel_nome)
    if (!resp || resp.tipo === 'nao_encontrada') return { erro: `Não encontrei ninguém chamado "${args.novo_responsavel_nome}" nos perfis. Nada foi alterado.` }
    if (resp.tipo === 'ambigua') return { erro: formatarAmbiguidade('responsáveis', args.novo_responsavel_nome, resp.candidatos.map(r => r.name)) }
    patch.responsavel_id = resp.item.id
    patch.responsavel_nome = resp.item.name
    mudancas.push(`responsável para ${resp.item.name}`)
  }
  if (Object.keys(patch).length === 0) return { erro: 'Não entendi o que alterar — diga prazo, prioridade, responsável ou status.' }
  patch.updated_at = new Date().toISOString()
  return { patch, mudancas }
}

function patchStatus(acao: AcaoStatus): Record<string, unknown> {
  const agora = new Date().toISOString()
  if (acao === 'concluir') return { status: 'concluida', concluida: true, concluida_em: agora, updated_at: agora }
  if (acao === 'reabrir') return { status: 'pendente', concluida: false, concluida_em: null, updated_at: agora }
  return { status: 'cancelada', concluida: false, concluida_em: null, updated_at: agora }
}

const VERBO_ACAO: Record<'editar' | AcaoStatus, string> = { editar: 'atualizada', concluir: 'concluída', reabrir: 'reaberta', cancelar: 'cancelada' }
const ACAO_LOG: Record<'editar' | AcaoStatus, 'editar' | 'concluir' | 'reabrir' | 'cancelar'> = { editar: 'editar', concluir: 'concluir', reabrir: 'reabrir', cancelar: 'cancelar' }

// Único caminho que efetivamente grava um UPDATE em `tarefas` — usado tanto
// pela execução direta (ordem explícita) quanto pela confirmação de uma
// proposta pendente, para garantir que o que foi mostrado ao usuário é
// exatamente o que é gravado (WYSIWYG).
async function aplicarPatchTarefa(db: DB, t: Tarefa, patch: Record<string, unknown>, ctx: TarefasAiCtx, acaoLog: 'editar' | 'concluir' | 'reabrir' | 'cancelar', mensagemSucesso: string): Promise<string> {
  const valorAnterior: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) valorAnterior[k] = (t as any)[k]

  const { error } = await db.from('tarefas').update(patch).eq('id', t.id)
  if (error) {
    await logAcao(db, { tarefaId: t.id, acao: acaoLog, ctx, valorAnterior, resultado: 'erro', erro: error.message })
    return `Erro ao alterar tarefa: ${error.message}`
  }
  await logAcao(db, { tarefaId: t.id, acao: acaoLog, ctx, valorAnterior, valorNovo: patch, resultado: 'ok' })
  return mensagemSucesso
}

// ─── Resolução de criação (compartilhada entre create_task direto e
// propose_create_task) — nunca escreve, só resolve nomes e monta o payload
// pronto para INSERT, mais o rótulo de contexto (obra/projeto/geral) para
// mostrar na proposta antes de confirmar. ─────────────────────────────────
async function nomeDe(db: DB, tabela: 'obras' | 'projetos', id: string): Promise<string | null> {
  const { data } = await db.from(tabela).select('nome').eq('id', id).maybeSingle()
  return (data as any)?.nome || null
}

type CriacaoPayload = {
  titulo: string
  descricao: string | null
  obra_id: string | null
  projeto_id: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  prioridade: Tarefa['prioridade']
  data_prazo: string | null
  status: 'pendente'
  concluida: false
}
type CriacaoResultado = { payload: CriacaoPayload; contextoLabel: string } | { erro: string }

async function resolverCriacao(db: DB, args: Args, ctx: TarefasAiCtx): Promise<CriacaoResultado> {
  if (!args.titulo || !String(args.titulo).trim()) return { erro: 'Preciso de um título para criar a tarefa.' }

  let obraId: string | null = ctx.fixedObraId || null
  if (!ctx.fixedObraId && !ctx.fixedProjetoId && args.obra_nome) {
    const obra = await resolveObraPorNome(db, args.obra_nome)
    if (!obra || obra.tipo === 'nao_encontrada') return { erro: `Não encontrei obra "${args.obra_nome}". A tarefa não foi criada — confirme o nome da obra.` }
    if (obra.tipo === 'ambigua') return { erro: formatarAmbiguidade('obras', args.obra_nome, obra.candidatos.map(o => o.nome)) + ' A tarefa não foi criada.' }
    obraId = obra.item.id
  }
  let projetoId: string | null = ctx.fixedProjetoId || null
  if (!ctx.fixedObraId && !ctx.fixedProjetoId && args.projeto_nome) {
    const projeto = await resolveProjetoPorNome(db, args.projeto_nome)
    if (!projeto || projeto.tipo === 'nao_encontrada') return { erro: `Não encontrei projeto "${args.projeto_nome}". A tarefa não foi criada — confirme o nome do projeto.` }
    if (projeto.tipo === 'ambigua') return { erro: formatarAmbiguidade('projetos', args.projeto_nome, projeto.candidatos.map(p => p.nome)) + ' A tarefa não foi criada.' }
    projetoId = projeto.item.id
  }

  // "pra mim"/"minha tarefa": responsável é SEMPRE ctx.profileId (identidade
  // estrutural do remetente) — nunca resolvido por nome, nunca deixado NULL
  // em silêncio. Sem profileId, recusa em vez de criar sem responsável.
  let responsavelId: string | null = null
  let responsavelNome: string | null = null
  if (args.para_mim) {
    if (!ctx.profileId) return { erro: 'Não consegui identificar seu perfil para criar essa tarefa "pra você" com segurança — a tarefa não foi criada. Me diga o nome do responsável, ou peça para um administrador vincular seu perfil.' }
    const { data } = await db.from('profiles').select('id,name').eq('id', ctx.profileId).maybeSingle()
    responsavelId = ctx.profileId
    responsavelNome = (data as { name?: string } | null)?.name || ctx.actor
  } else if (args.responsavel_nome) {
    const resp = await resolveResponsavelPorNome(db, args.responsavel_nome)
    if (!resp || resp.tipo === 'nao_encontrada') return { erro: `Não encontrei ninguém chamado "${args.responsavel_nome}" nos perfis. A tarefa não foi criada — confirme o nome do responsável.` }
    if (resp.tipo === 'ambigua') return { erro: formatarAmbiguidade('responsáveis', args.responsavel_nome, resp.candidatos.map(r => r.name)) + ' A tarefa não foi criada.' }
    responsavelId = resp.item.id
    responsavelNome = resp.item.name
  }

  const payload: CriacaoPayload = {
    titulo: String(args.titulo).trim(),
    descricao: args.descricao || null,
    obra_id: obraId,
    projeto_id: projetoId,
    responsavel_id: responsavelId,
    responsavel_nome: responsavelNome,
    prioridade: ['baixa', 'normal', 'alta', 'urgente'].includes(args.prioridade) ? args.prioridade : 'normal',
    data_prazo: args.data_prazo || null,
    status: 'pendente',
    concluida: false,
  }

  let contextoLabel = 'Geral / sem Projeto ou Obra'
  if (obraId) {
    const nome = await nomeDe(db, 'obras', obraId)
    contextoLabel = nome ? `Obra ${nome}` : 'Obra'
  } else if (projetoId) {
    const nome = await nomeDe(db, 'projetos', projetoId)
    contextoLabel = nome ? `Projeto ${nome}` : 'Projeto'
  }

  return { payload, contextoLabel }
}

// ─── Executor ────────────────────────────────────────────────────────────────
// Retorna string com o resultado, ou null se `name` não for uma tool deste módulo.
export async function execTarefasAiTool(db: DB, name: string, args: Args, ctx: TarefasAiCtx): Promise<string | null> {
  if (!TAREFAS_AI_TOOL_NAMES.includes(name)) return null
  try {
    switch (name) {
      case 'list_tasks': {
        let query = db.from('tarefas').select('*')
        if (ctx.fixedObraId) query = query.eq('obra_id', ctx.fixedObraId)
        else if (ctx.fixedProjetoId) query = query.eq('projeto_id', ctx.fixedProjetoId)

        const semEscopoExplicito = !args.obra_nome && !args.projeto_nome && !args.responsavel_nome
        const temIdentidadePessoal = ctx.origem === 'whatsapp' || ctx.origem === 'floating'

        // "Minhas tarefas": só onde existe identidade real do remetente
        // (WhatsApp via telefone vinculado, floating via currentProfile.id),
        // e só quando o usuário não deu nenhum outro escopo explícito — nunca
        // adivinha por semelhança de nome, exige a identidade estrutural.
        // escopo_geral=true ("no geral", "todas") sempre vence — GERAL != MINHAS,
        // não deve virar escopo pessoal só por faltar um obra/projeto/responsável.
        if (temIdentidadePessoal && semEscopoExplicito && !args.escopo_geral) {
          if (!ctx.profileId) {
            return ctx.origem === 'whatsapp'
              ? 'Seu WhatsApp ainda não está vinculado a um perfil do BuildSmart, então não consigo saber quais são "suas" tarefas com segurança. Peça para um administrador vincular seu número em Configurações > Luiza > Conversas, ou me diga o nome do responsável que você quer consultar (ex.: "o que o Gabriel tem?").'
              : 'Não consegui identificar seu perfil para saber quais são "suas" tarefas. Me diga o nome do responsável que você quer consultar (ex.: "o que o Gabriel tem?").'
          }
          query = query.eq('responsavel_id', ctx.profileId)
        } else {
          if (!ctx.fixedObraId && !ctx.fixedProjetoId) {
            const obra = await resolveObraPorNome(db, args.obra_nome)
            if (obra) {
              if (obra.tipo === 'nao_encontrada') return `Não encontrei obra "${args.obra_nome}".`
              if (obra.tipo === 'ambigua') return formatarAmbiguidade('obras', args.obra_nome, obra.candidatos.map(o => o.nome))
              query = query.eq('obra_id', obra.item.id)
            }
            const projeto = await resolveProjetoPorNome(db, args.projeto_nome)
            if (projeto) {
              if (projeto.tipo === 'nao_encontrada') return `Não encontrei projeto "${args.projeto_nome}".`
              if (projeto.tipo === 'ambigua') return formatarAmbiguidade('projetos', args.projeto_nome, projeto.candidatos.map(p => p.nome))
              query = query.eq('projeto_id', projeto.item.id)
            }
          }
          if (args.responsavel_nome) {
            const resp = await resolveResponsavelPorNome(db, args.responsavel_nome)
            if (!resp || resp.tipo === 'nao_encontrada') return `Não encontrei ninguém chamado "${args.responsavel_nome}" nos perfis.`
            if (resp.tipo === 'ambigua') return formatarAmbiguidade('responsáveis', args.responsavel_nome, resp.candidatos.map(r => r.name))
            query = query.eq('responsavel_id', resp.item.id)
          }
        }

        if (!args.incluir_concluidas) query = query.in('status', TAREFAS_ABERTAS as unknown as string[])

        const hoje = hojeISO()
        const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        const emSeteDias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        if (args.filtro === 'hoje') query = query.lte('data_prazo', hoje).not('data_prazo', 'is', null)
        else if (args.filtro === 'amanha') query = query.eq('data_prazo', amanha)
        else if (args.filtro === 'atrasadas') query = query.lt('data_prazo', hoje).not('data_prazo', 'is', null)
        else if (args.filtro === 'semana') query = query.gte('data_prazo', hoje).lte('data_prazo', emSeteDias)
        else if (args.filtro === 'proximas') query = query.gt('data_prazo', hoje)
        else if (args.filtro === 'aguardando') query = query.eq('status', 'aguardando')

        const { data, error } = await query.order('data_prazo', { ascending: true, nullsFirst: false }).limit(30)
        if (error) return `Erro ao consultar tarefas: ${error.message}`
        const tarefas = ordenarTarefas((data || []) as Tarefa[])
        if (tarefas.length === 0) return 'Nenhuma tarefa encontrada com esses filtros.'

        const linhas = await Promise.all(tarefas.map(async t => formatTarefaLinha(t, await contextoDaTarefa(db, t))))
        return `${tarefas.length} tarefa(s):\n` + linhas.join('\n')
      }

      case 'get_task': {
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId, ctx.fixedProjetoId)
        if (achado.tipo === 'nao_encontrada') return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if (achado.tipo === 'ambigua') return formatarAmbiguidade('tarefas', args.titulo, achado.candidatos.map(t => t.titulo))
        const t = achado.item
        const ctxLabel = await contextoDaTarefa(db, t)
        return formatTarefaLinha(t, ctxLabel) + (t.descricao ? `\nDescrição: ${t.descricao}` : '')
      }

      case 'create_task': {
        const resolvido = await resolverCriacao(db, args, ctx)
        if ('erro' in resolvido) return resolvido.erro
        const { payload } = resolvido

        const { data, error } = await db.from('tarefas').insert(payload).select('*').single()
        if (error) {
          await logAcao(db, { tarefaId: null, acao: 'criar', ctx, valorNovo: payload, resultado: 'erro', erro: error.message })
          return `Erro ao criar tarefa: ${error.message}`
        }
        await logAcao(db, { tarefaId: (data as { id: string }).id, acao: 'criar', ctx, valorNovo: payload, resultado: 'ok' })
        return `Tarefa "${payload.titulo}" criada${payload.responsavel_nome ? ` para ${payload.responsavel_nome}` : ''}${payload.data_prazo ? `, prazo ${formatData(payload.data_prazo)}` : ''}.`
      }

      case 'propose_create_task': {
        const resolvido = await resolverCriacao(db, args, ctx)
        if ('erro' in resolvido) return resolvido.erro
        const { payload, contextoLabel } = resolvido

        const descricao = [
          `Tarefa: ${payload.titulo}`,
          `Responsável: ${payload.responsavel_nome || 'ainda não definido'}`,
          `Prazo: ${payload.data_prazo ? formatData(payload.data_prazo) : 'ainda não definido'}`,
          `Prioridade: ${PRIORIDADE_LABEL[payload.prioridade]}`,
          `Contexto: ${contextoLabel}`,
          '',
          'Confirmar criação?',
        ].join('\n')

        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey,
          profileId: ctx.profileId,
          actor: ctx.actor,
          origem: ctx.origem,
          tool: 'create_task',
          argumentos: payload,
          descricao,
          alvoChave: 'create_task',
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'update_task': {
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId, ctx.fixedProjetoId)
        if (achado.tipo === 'nao_encontrada') return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if (achado.tipo === 'ambigua') return formatarAmbiguidade('tarefas', args.titulo, achado.candidatos.map(t => t.titulo))
        const t = achado.item

        const resultado = await construirPatchEdicao(db, args)
        if ('erro' in resultado) return resultado.erro
        return aplicarPatchTarefa(db, t, resultado.patch, ctx, 'editar', `Tarefa "${t.titulo}" atualizada: ${resultado.mudancas.join('; ')}.`)
      }

      case 'complete_task':
      case 'reopen_task':
      case 'cancel_task': {
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId, ctx.fixedProjetoId)
        if (achado.tipo === 'nao_encontrada') return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if (achado.tipo === 'ambigua') return formatarAmbiguidade('tarefas', args.titulo, achado.candidatos.map(t => t.titulo))
        const t = achado.item

        const acao: AcaoStatus = name === 'complete_task' ? 'concluir' : name === 'reopen_task' ? 'reabrir' : 'cancelar'
        return aplicarPatchTarefa(db, t, patchStatus(acao), ctx, ACAO_LOG[acao], `Tarefa "${t.titulo}" ${VERBO_ACAO[acao]}.`)
      }

      case 'suggest_task_change': {
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId, ctx.fixedProjetoId)
        if (achado.tipo === 'nao_encontrada') return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if (achado.tipo === 'ambigua') return formatarAmbiguidade('tarefas', args.titulo, achado.candidatos.map(t => t.titulo))
        const t = achado.item

        const acao = (args.acao as 'editar' | AcaoStatus) || 'editar'
        let patch: Record<string, unknown>
        let mudancasTexto: string
        if (acao === 'editar') {
          const resultado = await construirPatchEdicao(db, args)
          if ('erro' in resultado) return resultado.erro
          patch = resultado.patch
          mudancasTexto = resultado.mudancas.join('; ')
        } else {
          patch = patchStatus(acao)
          mudancasTexto = VERBO_ACAO[acao]
        }

        const descricao = `Sugestão: ${t.titulo} — ${mudancasTexto}.${args.justificativa ? ` Motivo: ${args.justificativa}` : ''} Posso aplicar essa alteração?`
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey,
          profileId: ctx.profileId,
          actor: ctx.actor,
          origem: ctx.origem,
          tool: TOOL_POR_ACAO[acao],
          argumentos: { tarefaId: t.id, patch, acaoLog: ACAO_LOG[acao], mensagemSucesso: `Tarefa "${t.titulo}" ${VERBO_ACAO[acao]} (conforme sugerido).` },
          descricao,
          alvoChave: `${TOOL_POR_ACAO[acao]}:${t.id}`,
        })
        if (!proposta) return 'Não consegui registrar a sugestão agora. Tente novamente.'
        return descricao
      }

      case 'confirm_pending_action':
      case 'reject_pending_action': {
        const resolvido = await acharPendenteParaResolver(db, ctx.conversationKey, { pendingId: args.pending_id, titulo: args.titulo })
        if (resolvido.tipo === 'nenhuma') return 'Não encontrei nenhuma sugestão minha pendente para confirmar. Se quiser fazer uma alteração agora, é só me dizer diretamente o que mudar.'
        if (resolvido.tipo === 'nao_encontrada') return 'Não encontrei essa sugestão (pode já ter sido resolvida).'
        if (resolvido.tipo === 'expirada') return 'Essa sugestão expirou (mais de 30 minutos sem confirmação). Se ainda quiser fazer a alteração, me diga direto o que mudar.'
        if (resolvido.tipo === 'ambigua') return formatarListaPendentes(resolvido.candidatas)

        const acao = resolvido.acao
        if (name === 'reject_pending_action') {
          await marcarRejeitada(db, acao.id)
          return 'Certo, não vou alterar nada.'
        }

        // Proposta de CRIAÇÃO: argumentos já é o payload pronto para INSERT
        // (montado por resolverCriacao em propose_create_task) — diferente do
        // formato {tarefaId, patch, ...} das propostas de edição/status.
        if (acao.tool === 'create_task') {
          const { __alvoChave, ...payload } = acao.argumentos as CriacaoPayload & { __alvoChave?: string }
          void __alvoChave // só existia para supersessão da proposta — não é coluna de `tarefas`
          const { data, error } = await db.from('tarefas').insert(payload).select('*').single()
          if (error) {
            await logAcao(db, { tarefaId: null, acao: 'criar', ctx, valorNovo: payload, resultado: 'erro', erro: error.message })
            return `Erro ao criar tarefa: ${error.message}`
          }
          await logAcao(db, { tarefaId: (data as { id: string }).id, acao: 'criar', ctx, valorNovo: payload, resultado: 'ok' })
          await marcarExecutada(db, acao.id)
          return `Tarefa "${payload.titulo}" criada${payload.responsavel_nome ? ` para ${payload.responsavel_nome}` : ''}${payload.data_prazo ? `, prazo ${formatData(payload.data_prazo)}` : ''}.`
        }

        const { tarefaId, patch, acaoLog, mensagemSucesso } = acao.argumentos as { tarefaId: string; patch: Record<string, unknown>; acaoLog: 'editar' | 'concluir' | 'reabrir' | 'cancelar'; mensagemSucesso: string }
        const t = await acharTarefaPorId(db, tarefaId)
        if (!t) {
          await marcarRejeitada(db, acao.id)
          await logAcao(db, { tarefaId, acao: acaoLog, ctx, resultado: 'erro', erro: 'tarefa não existe mais' })
          return 'Essa tarefa não existe mais, então não apliquei a sugestão.'
        }
        const resultado = await aplicarPatchTarefa(db, t, patch, ctx, acaoLog, mensagemSucesso)
        await marcarExecutada(db, acao.id)
        return resultado
      }

      default:
        return null
    }
  } catch (err: any) {
    return `Erro ao executar ${name}: ${err?.message || 'desconhecido'}`
  }
}
