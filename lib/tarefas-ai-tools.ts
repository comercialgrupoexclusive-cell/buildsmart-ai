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
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'
import type { Tarefa } from './types'
import { isAtrasada, hojeISO, TAREFAS_ABERTAS, PRIORIDADE_LABEL, STATUS_LABEL, ordenarTarefas } from './tarefas'

type DB = SupabaseClient
type Args = Record<string, any>

export type TarefasAiCtx = {
  actor: string           // nome/telefone de quem está conversando (label livre, sem auth real)
  origem: 'whatsapp' | 'obra_ai'
  fixedObraId?: string    // modo escopado (obra-ai): tarefas restritas a esta obra
}

export const TAREFAS_AI_TOOL_NAMES = ['list_tasks', 'get_task', 'create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task']

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
        description: 'Lista tarefas do motor de Tarefas do BuildSmart. Tarefa é uma ação que uma PESSOA precisa fazer (ex.: "confirmar pontos de ar-condicionado") — não confunda com etapa/serviço do cronograma da obra (isso é Planejamento, outra coisa). Use para responder perguntas como "o que tenho hoje", "o que está atrasado", "o que tenho essa semana", "o que estou aguardando", "quais tarefas são da obra/projeto X", "o que o Fulano precisa fazer". Sempre baseie a resposta no resultado desta função — nunca invente tarefa.',
        parameters: {
          type: 'object',
          properties: {
            filtro: {
              type: 'string',
              enum: ['hoje', 'atrasadas', 'semana', 'proximas', 'aguardando', 'todas'],
              description: 'hoje = vence hoje ou atrasada; atrasadas = só vencidas; semana = prazo nos próximos 7 dias; proximas = qualquer prazo futuro; aguardando = status aguardando; todas = sem filtro de prazo/status (ainda exclui concluída/cancelada por padrão)',
            },
            responsavel_nome: { type: 'string', description: 'Nome ou parte do nome do responsável (opcional, busca por semelhança)' },
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
        description: 'Cria uma nova tarefa (ação de uma pessoa) — diferente de criar uma etapa do cronograma da obra. Use quando o usuário pedir para criar, anotar ou lembrar uma tarefa/pendência.',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Título da tarefa (obrigatório)' },
            descricao: { type: 'string', description: 'Detalhes opcionais' },
            responsavel_nome: { type: 'string', description: 'Nome do responsável (opcional, busca por semelhança nos perfis cadastrados)' },
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
        name: 'update_task',
        description: 'Altera prazo (reprogramação), prioridade, responsável ou status (pendente/em_andamento/aguardando) de uma tarefa existente. Para concluir, reabrir ou cancelar use complete_task/reopen_task/cancel_task, não esta função. IMPORTANTE: só chame update_task quando o usuário der uma ordem explícita para aquela mudança (ex.: "muda para sexta", "passa para o Gabriel", "coloca como aguardando cliente"). Se a mudança for uma sugestão SUA (ex.: reprogramação por conflito de prazo), primeiro descreva a sugestão em texto e peça confirmação — só chame a função depois que o usuário confirmar explicitamente numa mensagem seguinte.',
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
        description: 'Marca uma tarefa como concluída. Só chame quando o usuário confirmar explicitamente que terminou ou pedir para concluir/marcar como feita.',
        parameters: { type: 'object', properties: { titulo: { type: 'string', description: 'Título ou parte do título' } }, required: ['titulo'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reopen_task',
        description: 'Reabre uma tarefa concluída (volta para pendente). Só chame quando o usuário pedir explicitamente.',
        parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'cancel_task',
        description: 'Cancela uma tarefa. Só chame quando o usuário pedir explicitamente para cancelar.',
        parameters: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] },
      },
    },
  ]
}

// ─── Resolução por nome (obra / projeto / responsável) ───────────────────────
// Busca fuzzy (ilike), mesmo padrão de ai-obra-tools.ts/projeto-ai-tools.ts.
// IMPORTANTE: sempre com order by determinístico — sem isso, um nome que bate
// em mais de um registro (ex.: duas obras "Allegra") retorna uma linha
// arbitrária do Postgres, o que pode silenciosamente vincular a tarefa à obra
// errada. Preferimos o registro mais recente (mais provável de ser o atual).
async function resolveObraPorNome(db: DB, nome?: string): Promise<{ id: string; nome: string } | null> {
  if (!nome) return null
  const { data } = await db.from('obras').select('id,nome').ilike('nome', `%${nome}%`).order('created_at', { ascending: false }).limit(1)
  return (data?.[0] as any) || null
}

async function resolveProjetoPorNome(db: DB, nome?: string): Promise<{ id: string; nome: string } | null> {
  if (!nome) return null
  const { data } = await db.from('projetos').select('id,nome').ilike('nome', `%${nome}%`).order('created_at', { ascending: false }).limit(1)
  return (data?.[0] as any) || null
}

async function resolveResponsavelPorNome(db: DB, nome?: string): Promise<{ id: string; name: string } | null> {
  if (!nome) return null
  const { data } = await db.from('profiles').select('id,name').ilike('name', `%${nome}%`).order('name').limit(1)
  return (data?.[0] as any) || null
}

// Acha uma tarefa pelo título. Retorna a tarefa, um marcador de ambiguidade
// (mais de uma bateu), ou null (nenhuma encontrada).
type AcharTarefaResultado = { tarefa: Tarefa } | { ambiguas: Tarefa[] } | null
async function acharTarefa(db: DB, titulo: string, fixedObraId?: string): Promise<AcharTarefaResultado> {
  let query = db.from('tarefas').select('*').ilike('titulo', `%${titulo}%`).order('created_at', { ascending: false }).limit(6)
  if (fixedObraId) query = query.eq('obra_id', fixedObraId)
  const { data } = await query
  const tarefas = (data || []) as Tarefa[]
  if (tarefas.length === 0) return null
  if (tarefas.length === 1) return { tarefa: tarefas[0] }
  return { ambiguas: tarefas }
}

function formatAmbiguas(tarefas: Tarefa[]): string {
  return `Encontrei ${tarefas.length} tarefas parecidas: ${tarefas.map(t => `"${t.titulo}"`).join(', ')}. Qual delas você quer dizer?`
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

// ─── Executor ────────────────────────────────────────────────────────────────
// Retorna string com o resultado, ou null se `name` não for uma tool deste módulo.
export async function execTarefasAiTool(db: DB, name: string, args: Args, ctx: TarefasAiCtx): Promise<string | null> {
  if (!TAREFAS_AI_TOOL_NAMES.includes(name)) return null
  try {
    switch (name) {
      case 'list_tasks': {
        let query = db.from('tarefas').select('*')
        if (ctx.fixedObraId) query = query.eq('obra_id', ctx.fixedObraId)

        const obra = !ctx.fixedObraId ? await resolveObraPorNome(db, args.obra_nome) : null
        if (args.obra_nome && !ctx.fixedObraId) {
          if (!obra) return `Não encontrei obra "${args.obra_nome}".`
          query = query.eq('obra_id', obra.id)
        }
        const projeto = !ctx.fixedObraId ? await resolveProjetoPorNome(db, args.projeto_nome) : null
        if (args.projeto_nome && !ctx.fixedObraId) {
          if (!projeto) return `Não encontrei projeto "${args.projeto_nome}".`
          query = query.eq('projeto_id', projeto.id)
        }
        if (args.responsavel_nome) {
          const resp = await resolveResponsavelPorNome(db, args.responsavel_nome)
          if (!resp) return `Não encontrei ninguém chamado "${args.responsavel_nome}" nos perfis.`
          query = query.eq('responsavel_id', resp.id)
        }

        if (!args.incluir_concluidas) query = query.in('status', TAREFAS_ABERTAS as unknown as string[])

        const hoje = hojeISO()
        const emSeteDias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
        if (args.filtro === 'hoje') query = query.lte('data_prazo', hoje).not('data_prazo', 'is', null)
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
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId)
        if (!achado) return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if ('ambiguas' in achado) return formatAmbiguas(achado.ambiguas)
        const t = achado.tarefa
        const ctxLabel = await contextoDaTarefa(db, t)
        return formatTarefaLinha(t, ctxLabel) + (t.descricao ? `\nDescrição: ${t.descricao}` : '')
      }

      case 'create_task': {
        if (!args.titulo || !String(args.titulo).trim()) return 'Preciso de um título para criar a tarefa.'

        let obraId: string | null = ctx.fixedObraId || null
        if (!ctx.fixedObraId && args.obra_nome) {
          const obra = await resolveObraPorNome(db, args.obra_nome)
          if (!obra) return `Não encontrei obra "${args.obra_nome}". A tarefa não foi criada — confirme o nome da obra.`
          obraId = obra.id
        }
        let projetoId: string | null = null
        if (!ctx.fixedObraId && args.projeto_nome) {
          const projeto = await resolveProjetoPorNome(db, args.projeto_nome)
          if (!projeto) return `Não encontrei projeto "${args.projeto_nome}". A tarefa não foi criada — confirme o nome do projeto.`
          projetoId = projeto.id
        }
        let responsavelId: string | null = null
        let responsavelNome: string | null = null
        if (args.responsavel_nome) {
          const resp = await resolveResponsavelPorNome(db, args.responsavel_nome)
          if (!resp) return `Não encontrei ninguém chamado "${args.responsavel_nome}" nos perfis. A tarefa não foi criada — confirme o nome do responsável.`
          responsavelId = resp.id
          responsavelNome = resp.name
        }

        const payload = {
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
        const { data, error } = await db.from('tarefas').insert(payload).select('*').single()
        if (error) {
          await logAcao(db, { tarefaId: null, acao: 'criar', ctx, valorNovo: payload, resultado: 'erro', erro: error.message })
          return `Erro ao criar tarefa: ${error.message}`
        }
        await logAcao(db, { tarefaId: (data as any).id, acao: 'criar', ctx, valorNovo: payload, resultado: 'ok' })
        return `Tarefa "${payload.titulo}" criada${responsavelNome ? ` para ${responsavelNome}` : ''}${payload.data_prazo ? `, prazo ${formatData(payload.data_prazo)}` : ''}.`
      }

      case 'update_task': {
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId)
        if (!achado) return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if ('ambiguas' in achado) return formatAmbiguas(achado.ambiguas)
        const t = achado.tarefa

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
            return `Status "${args.novo_status}" inválido aqui — use complete_task para concluir ou cancel_task para cancelar.`
          }
          patch.status = args.novo_status
          mudancas.push(`status para ${STATUS_LABEL[args.novo_status as Tarefa['status']]}`)
        }
        if (args.novo_responsavel_nome) {
          const resp = await resolveResponsavelPorNome(db, args.novo_responsavel_nome)
          if (!resp) return `Não encontrei ninguém chamado "${args.novo_responsavel_nome}" nos perfis. Nada foi alterado.`
          patch.responsavel_id = resp.id
          patch.responsavel_nome = resp.name
          mudancas.push(`responsável para ${resp.name}`)
        }
        if (Object.keys(patch).length === 0) return 'Não entendi o que alterar — diga prazo, prioridade, responsável ou status.'

        patch.updated_at = new Date().toISOString()
        const valorAnterior = { data_prazo: t.data_prazo, prioridade: t.prioridade, status: t.status, responsavel_nome: t.responsavel_nome }
        const { error } = await db.from('tarefas').update(patch).eq('id', t.id)
        if (error) {
          await logAcao(db, { tarefaId: t.id, acao: 'editar', ctx, valorAnterior, resultado: 'erro', erro: error.message })
          return `Erro ao alterar tarefa: ${error.message}`
        }
        await logAcao(db, { tarefaId: t.id, acao: 'editar', ctx, valorAnterior, valorNovo: patch, resultado: 'ok' })
        return `Tarefa "${t.titulo}" atualizada: ${mudancas.join('; ')}.`
      }

      case 'complete_task':
      case 'reopen_task':
      case 'cancel_task': {
        const achado = await acharTarefa(db, String(args.titulo || ''), ctx.fixedObraId)
        if (!achado) return `Não encontrei nenhuma tarefa com título parecido com "${args.titulo}".`
        if ('ambiguas' in achado) return formatAmbiguas(achado.ambiguas)
        const t = achado.tarefa

        const acao = name === 'complete_task' ? 'concluir' : name === 'reopen_task' ? 'reabrir' : 'cancelar'
        const agora = new Date().toISOString()
        const patch: Record<string, unknown> = acao === 'concluir'
          ? { status: 'concluida', concluida: true, concluida_em: agora, updated_at: agora }
          : acao === 'reabrir'
          ? { status: 'pendente', concluida: false, concluida_em: null, updated_at: agora }
          : { status: 'cancelada', concluida: false, concluida_em: null, updated_at: agora }

        const valorAnterior = { status: t.status, concluida: t.concluida, concluida_em: t.concluida_em }
        const { error } = await db.from('tarefas').update(patch).eq('id', t.id)
        if (error) {
          await logAcao(db, { tarefaId: t.id, acao, ctx, valorAnterior, resultado: 'erro', erro: error.message })
          return `Erro ao ${acao === 'concluir' ? 'concluir' : acao === 'reabrir' ? 'reabrir' : 'cancelar'} tarefa: ${error.message}`
        }
        await logAcao(db, { tarefaId: t.id, acao, ctx, valorAnterior, valorNovo: patch, resultado: 'ok' })
        const verbo = acao === 'concluir' ? 'concluída' : acao === 'reabrir' ? 'reaberta' : 'cancelada'
        return `Tarefa "${t.titulo}" ${verbo}.`
      }

      default:
        return null
    }
  } catch (err: any) {
    return `Erro ao executar ${name}: ${err?.message || 'desconhecido'}`
  }
}
