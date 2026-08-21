// ═══════════════════════════════════════════════════════════════════════════
// Ferramentas de IA (function-calling) para AVISOS/DISPAROS
// (luizia_wa_dispatches) a partir do chat flutuante — rodada "Identidade
// única da Luiza x Painel x Avisos".
//
// Reaproveita 100% do motor existente: lib/luizia-dispatch.ts (cálculo de
// próximo envio, resolução de responsável/telefone, resumo de tarefas — o
// MESMO usado pelo cron em app/api/whatsapp/dispatch/route.ts) e o MESMO
// mecanismo de proposta pendente de lib/luizia-pending-actions.ts já usado
// por Tarefas — nenhuma segunda arquitetura de confirmação, nenhum
// dispatcher novo.
//
// ESCOPO desta rodada (decisão consciente, ver relatório): só
// tipo='resumo_tarefas'. resumo_obra/personalizada continuam exclusivos do
// painel admin — configurar por linguagem natural teria que resolver "qual
// obra" e "que mensagem" com a mesma segurança que já existe lá, fora do
// escopo pedido ("preferência desta rodada: configuração de avisos
// primeiro").
//
// SEGURANÇA (ver seção 15 do pedido): o destinatário de um aviso criado por
// aqui é SEMPRE resolvido a partir de ctx.profileId -> luizia_wa_phone_
// rules — nunca um destino_phone vindo dos argumentos do modelo. Isso é a
// trava real: mesmo que o modelo tente, não existe parâmetro para apontar o
// aviso para o telefone de outra pessoa. list_alerts/propose_update_alert
// também sempre restringem a consulta aos telefones vinculados a
// ctx.profileId. `confirm_pending_alert` escreve com o SUPABASE_SERVICE_
// ROLE_KEY (nunca a anon key do browser) — mesma trava já usada por
// tarefas-ai-tools.ts.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'
import { resolverComSeguranca, formatarAmbiguidade } from './ai-resolve'
import { criarPropostaPendente, acharPendenteParaResolver, marcarRejeitada, marcarExecutada, formatarListaPendentes } from './luizia-pending-actions'
import { calcNextRun, resolverTelefoneDoProfile, formatarDiasSemana, formatarHorario } from './luizia-dispatch'

type DB = SupabaseClient
type Args = Record<string, any>

export type AvisosAiCtx = {
  actor: string
  profileId: string | null
  conversationKey: string
}

export const AVISOS_AI_TOOL_NAMES = [
  'list_alerts', 'propose_create_alert', 'propose_update_alert', 'confirm_pending_alert', 'reject_pending_alert',
]

const DIAS_ENUM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const
const DIA_PARA_NUM: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 }

function diasParaTexto(dias: string[]): string | { erro: string } {
  const nums = dias.map(d => DIA_PARA_NUM[d.toLowerCase().slice(0, 3)]).filter(n => n !== undefined)
  if (nums.length === 0) return { erro: 'Preciso saber os dias da semana do aviso (ex.: segunda a sexta, ou todos os dias).' }
  return [...new Set(nums)].sort().join(',')
}

function horarioValido(h: string): string | null {
  const m = /^(\d{1,2}):?(\d{2})?$/.exec((h || '').trim())
  if (!m) return null
  const hh = parseInt(m[1])
  const mm = m[2] ? parseInt(m[2]) : 0
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function avisosAiToolDefs(): OpenAI.Chat.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_alerts',
        description: 'Lista os avisos automáticos (mensagens recorrentes por WhatsApp) do remetente atual — resolvido pelo perfil, nunca por nome. Use para "quais avisos eu tenho?", "qual foi o último aviso enviado?".',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_create_alert',
        description: 'Prepara (SEM CRIAR) um aviso recorrente de resumo de tarefas por WhatsApp para o próprio remetente. Sempre para "mim" — não existe parâmetro para apontar para outra pessoa. Devolve um preview (tipo/destinatário/dias/horário) para o usuário confirmar. NUNCA escreve — só confirm_pending_alert escreve, depois que o usuário confirmar explicitamente.',
        parameters: {
          type: 'object',
          properties: {
            dias: { type: 'array', items: { type: 'string', enum: [...DIAS_ENUM] }, description: 'Dias da semana (dom..sab). Ex.: ["seg","ter","qua","qui","sex"] para "segunda a sexta".' },
            horario: { type: 'string', description: 'Horário HH:MM (24h), ex.: "08:00"' },
            obra_nome: { type: 'string', description: 'Nome da obra, se o usuário quiser o resumo restrito a uma obra específica (opcional — padrão é todas as tarefas do usuário)' },
          },
          required: ['dias', 'horario'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_update_alert',
        description: 'Prepara (SEM APLICAR) uma alteração num aviso existente do remetente atual: mudar dias, horário, ou pausar/reativar ("pausa meu aviso" = ativo:false, "reativa"/"volta a enviar" = ativo:true). NUNCA aplica sozinha — só confirm_pending_alert aplica, depois de confirmação explícita.',
        parameters: {
          type: 'object',
          properties: {
            titulo: { type: 'string', description: 'Nome ou parte do nome do aviso, só necessário se o usuário tiver mais de um' },
            novos_dias: { type: 'array', items: { type: 'string', enum: [...DIAS_ENUM] }, description: 'Novos dias, se estiver mudando' },
            novo_horario: { type: 'string', description: 'Novo horário HH:MM, se estiver mudando' },
            ativo: { type: 'boolean', description: 'false para pausar, true para reativar' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'confirm_pending_alert',
        description: 'Aplica a proposta de aviso pendente que o usuário acabou de confirmar (ex.: ele respondeu "sim", "confirmo", "pode criar"). Não use para um pedido novo — isso é propose_create_alert/propose_update_alert.',
        parameters: {
          type: 'object',
          properties: {
            pending_id: { type: 'string', description: 'Id da proposta, se já souber qual (opcional)' },
            titulo: { type: 'string', description: 'Nome do aviso da proposta, se precisar desambiguar entre várias pendentes (opcional)' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reject_pending_alert',
        description: 'Descarta a proposta de aviso pendente que o usuário recusou (ex.: "não", "deixa"). Nunca escreve.',
        parameters: {
          type: 'object',
          properties: {
            pending_id: { type: 'string' },
            titulo: { type: 'string' },
          },
          required: [],
        },
      },
    },
  ]
}

async function resolveObraPorNome(db: DB, nome?: string) {
  if (!nome) return null
  const { data } = await db.from('obras').select('id,nome').ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as { id: string; nome: string }[], o => o.nome)
}

type AlertaRow = {
  id: string
  nome: string
  tipo: string
  obra_id: string | null
  destino_phone: string
  dias_semana: string
  horario: string
  recorrente: boolean
  ativo: boolean
  last_sent_at: string | null
}

// Sempre restringe a consulta aos telefones vinculados ao remetente atual —
// nunca um aviso de outra pessoa, mesmo que o título bata.
async function acharAlertasDoProfile(db: DB, profileId: string | null): Promise<AlertaRow[] | { erro: string }> {
  if (!profileId) return { erro: 'Não consegui identificar seu perfil para consultar seus avisos.' }
  const { data: rules } = await db.from('luizia_wa_phone_rules').select('phone').eq('profile_id', profileId)
  const phones = ((rules || []) as { phone: string }[]).map(r => r.phone)
  if (phones.length === 0) return []
  const { data } = await db.from('luizia_wa_dispatches').select('*').in('destino_phone', phones)
  return (data || []) as AlertaRow[]
}

function formatarAlerta(a: AlertaRow): string {
  const partes = [
    `"${a.nome}"`,
    a.tipo === 'resumo_tarefas' ? 'resumo de tarefas' : a.tipo,
    formatarDiasSemana(a.dias_semana),
    `às ${formatarHorario(a.horario)}`,
    a.ativo ? 'ativo' : 'pausado',
  ]
  if (a.last_sent_at) partes.push(`último envio ${new Date(a.last_sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`)
  else partes.push('nunca enviado ainda')
  return '- ' + partes.join(', ')
}

type CriacaoAlertaPayload = {
  nome: string
  tipo: 'resumo_tarefas'
  obra_id: string | null
  destino_phone: string
  destino_nome: string | null
  mensagem: null
  dias_semana: string
  horario: string
  recorrente: true
  ativo: true
}

export async function execAvisosAiTool(db: DB, name: string, args: Args, ctx: AvisosAiCtx): Promise<string | null> {
  if (!AVISOS_AI_TOOL_NAMES.includes(name)) return null
  try {
    switch (name) {
      case 'list_alerts': {
        const alertas = await acharAlertasDoProfile(db, ctx.profileId)
        if ('erro' in alertas) return alertas.erro
        if (alertas.length === 0) return 'Você ainda não tem nenhum aviso configurado.'
        return `${alertas.length} aviso(s):\n` + alertas.map(formatarAlerta).join('\n')
      }

      case 'propose_create_alert': {
        if (!ctx.profileId) return 'Não consegui identificar seu perfil para criar esse aviso.'
        const telefone = await resolverTelefoneDoProfile(db, ctx.profileId)
        if (telefone.tipo === 'nenhum') return 'Seu perfil ainda não possui um WhatsApp pessoal vinculado no Painel Luiza (um grupo não conta — aviso pessoal nunca vai para um grupo). Peça para um administrador vincular seu número em Configurações > Luiza > Usuários — depois disso eu consigo criar o aviso.'
        if (telefone.tipo === 'multiplos') return `Você tem mais de um WhatsApp pessoal vinculado (${telefone.candidatos.map(c => c.nome || c.phone).join(', ')}). Qual deles deve receber o aviso?`

        const diasStr = diasParaTexto(Array.isArray(args.dias) ? args.dias : [])
        if (typeof diasStr !== 'string') return diasStr.erro
        const horario = horarioValido(String(args.horario || ''))
        if (!horario) return 'Não entendi o horário do aviso — me diga um horário no formato HH:MM (ex.: 08:00).'

        let obraId: string | null = null
        let obraLabel = ''
        if (args.obra_nome) {
          const obra = await resolveObraPorNome(db, args.obra_nome)
          if (!obra || obra.tipo === 'nao_encontrada') return `Não encontrei obra "${args.obra_nome}". O aviso não foi criado — confirme o nome da obra.`
          if (obra.tipo === 'ambigua') return formatarAmbiguidade('obras', args.obra_nome, obra.candidatos.map(o => o.nome)) + ' O aviso não foi criado.'
          obraId = obra.item.id
          obraLabel = ` (obra ${obra.item.nome})`
        }

        const { data: profile } = await db.from('profiles').select('name').eq('id', ctx.profileId).maybeSingle()
        const nomePerfil = (profile as any)?.name || ctx.actor

        const payload: CriacaoAlertaPayload = {
          nome: `Resumo de tarefas — ${nomePerfil}${obraLabel}`,
          tipo: 'resumo_tarefas',
          obra_id: obraId,
          destino_phone: telefone.phone,
          destino_nome: telefone.nome || nomePerfil,
          mensagem: null,
          dias_semana: diasStr,
          horario: `${horario}:00`,
          recorrente: true,
          ativo: true,
        }

        const descricao = [
          'Vou criar este aviso:',
          '',
          'Tipo: Resumo de tarefas',
          `Destinatário: ${nomePerfil}`,
          'WhatsApp: contato vinculado ao seu perfil',
          `Dias: ${formatarDiasSemana(diasStr)}`,
          `Horário: ${horario}`,
          'Recorrente: sim',
          obraId ? `Obra: ${args.obra_nome}` : '',
          '',
          'Confirmar?',
        ].filter(Boolean).join('\n')

        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey,
          profileId: ctx.profileId,
          actor: ctx.actor,
          origem: 'floating',
          tool: 'create_alert',
          argumentos: payload,
          descricao,
          alvoChave: 'create_alert',
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_update_alert': {
        const alertas = await acharAlertasDoProfile(db, ctx.profileId)
        if ('erro' in alertas) return alertas.erro
        if (alertas.length === 0) return 'Você ainda não tem nenhum aviso configurado.'

        let alvo: AlertaRow
        if (alertas.length === 1) {
          alvo = alertas[0]
        } else {
          const resolvido = resolverComSeguranca(String(args.titulo || ''), alertas, a => a.nome)
          if (resolvido.tipo === 'nao_encontrada') return `Não encontrei nenhum aviso seu parecido com "${args.titulo}".`
          if (resolvido.tipo === 'ambigua') return formatarAmbiguidade('avisos', args.titulo, resolvido.candidatos.map(a => a.nome))
          alvo = resolvido.item
        }

        const patch: Record<string, unknown> = {}
        const mudancas: string[] = []
        if (Array.isArray(args.novos_dias) && args.novos_dias.length > 0) {
          const diasStr = diasParaTexto(args.novos_dias)
          if (typeof diasStr !== 'string') return diasStr.erro
          patch.dias_semana = diasStr
          mudancas.push(`dias para ${formatarDiasSemana(diasStr)}`)
        }
        if (args.novo_horario) {
          const horario = horarioValido(String(args.novo_horario))
          if (!horario) return 'Não entendi o novo horário — use o formato HH:MM (ex.: 07:30).'
          patch.horario = `${horario}:00`
          mudancas.push(`horário para ${horario}`)
        }
        if (typeof args.ativo === 'boolean') {
          patch.ativo = args.ativo
          mudancas.push(args.ativo ? 'reativado' : 'pausado')
        }
        if (Object.keys(patch).length === 0) return 'Não entendi o que mudar no aviso — diga dias, horário, ou se é para pausar/reativar.'

        const descricao = `Vou alterar o aviso "${alvo.nome}": ${mudancas.join('; ')}. Confirmar?`
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey,
          profileId: ctx.profileId,
          actor: ctx.actor,
          origem: 'floating',
          tool: 'update_alert',
          argumentos: { dispatchId: alvo.id, patch, mensagemSucesso: `Aviso "${alvo.nome}" atualizado: ${mudancas.join('; ')}.` },
          descricao,
          alvoChave: `update_alert:${alvo.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'confirm_pending_alert':
      case 'reject_pending_alert': {
        const resolvido = await acharPendenteParaResolver(db, ctx.conversationKey, { pendingId: args.pending_id, titulo: args.titulo })
        if (resolvido.tipo === 'nenhuma') return 'Não encontrei nenhuma proposta minha de aviso pendente. Se quiser criar ou mudar um aviso agora, é só me dizer.'
        if (resolvido.tipo === 'nao_encontrada') return 'Não encontrei essa proposta (pode já ter sido resolvida).'
        if (resolvido.tipo === 'expirada') return 'Essa proposta expirou (mais de 30 minutos sem confirmação). Se ainda quiser, me diga direto o que configurar.'
        if (resolvido.tipo === 'ambigua') return formatarListaPendentes(resolvido.candidatas)

        const acao = resolvido.acao
        if (name === 'reject_pending_alert') {
          await marcarRejeitada(db, acao.id)
          return 'Certo, não vou alterar nada.'
        }
        if (acao.tool !== 'create_alert' && acao.tool !== 'update_alert') {
          return 'Essa proposta pendente não é de um aviso — não consigo confirmar por aqui.'
        }

        if (acao.tool === 'create_alert') {
          const { __alvoChave, ...payload } = acao.argumentos as CriacaoAlertaPayload & { __alvoChave?: string }
          void __alvoChave
          const next = calcNextRun(payload.dias_semana, payload.horario)
          const { error } = await db.from('luizia_wa_dispatches').insert({ ...payload, next_run_at: next ? next.toISOString() : null })
          if (error) return `Erro ao criar o aviso: ${error.message}`
          await marcarExecutada(db, acao.id)
          return `Aviso "${payload.nome}" criado — próximo envio ${next ? next.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'a calcular'}.`
        }

        const { dispatchId, patch, mensagemSucesso } = acao.argumentos as { dispatchId: string; patch: Record<string, unknown>; mensagemSucesso: string }
        const { data: atual } = await db.from('luizia_wa_dispatches').select('*').eq('id', dispatchId).maybeSingle()
        if (!atual) {
          await marcarRejeitada(db, acao.id)
          return 'Esse aviso não existe mais, então não apliquei a alteração.'
        }
        const alertaAtual = atual as AlertaRow
        const patchFinal: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() }
        // Reagenda se dias/horário mudaram, ou se está reativando.
        if (patch.dias_semana || patch.horario || patch.ativo === true) {
          const diasFinal = (patch.dias_semana as string) || alertaAtual.dias_semana
          const horarioFinal = (patch.horario as string) || alertaAtual.horario
          const next = calcNextRun(diasFinal, horarioFinal)
          patchFinal.next_run_at = next ? next.toISOString() : null
        }
        if (patch.ativo === false) patchFinal.next_run_at = null
        const { error } = await db.from('luizia_wa_dispatches').update(patchFinal).eq('id', dispatchId)
        if (error) return `Erro ao alterar o aviso: ${error.message}`
        await marcarExecutada(db, acao.id)
        return mensagemSucesso
      }

      default:
        return null
    }
  } catch (err: any) {
    return `Erro ao executar ${name}: ${err?.message || 'desconhecido'}`
  }
}
