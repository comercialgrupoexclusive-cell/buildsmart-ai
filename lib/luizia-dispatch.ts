// ═══════════════════════════════════════════════════════════════════════════
// Motor de Avisos/Disparos (luizia_wa_dispatches) — lógica compartilhada
// entre o cron/dispatcher (app/api/whatsapp/dispatch/route.ts), o painel
// admin (app/(app)/admin-luiza/page.tsx) e as novas tools de Avisos do chat
// flutuante (lib/luizia-avisos-ai-tools.ts).
//
// Extraído de app/api/whatsapp/dispatch/route.ts (rodada "Identidade única
// da Luiza x Painel x Avisos") para não duplicar a regra de cálculo de
// próximo envio nem a resolução de responsável — "reutilizar o motor atual,
// não criar um novo dispatcher". app/api/whatsapp/dispatch/route.ts
// reexporta os símbolos que já eram usados por fora (inclusive pelo teste
// existente) para não quebrar nenhum import.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

type DB = SupabaseClient

export type Dispatch = {
  id: string
  nome: string
  tipo: 'resumo_obra' | 'personalizada' | 'resumo_tarefas'
  obra_id: string | null
  destino_phone: string
  destino_nome: string | null
  mensagem: string | null
  dias_semana: string        // "0,1,2..." 0=domingo
  horario: string            // "HH:MM:SS"
  recorrente: boolean
  ativo: boolean
  last_sent_at?: string | null
  next_run_at?: string | null
}

// ─── Cálculo do próximo envio (fuso America/Sao_Paulo = UTC-3 fixo) ──────────
// Inclui jitter aleatório de 0 a 120 segundos para humanizar o horário.
export function calcNextRun(diasSemana: string, horario: string, after: Date = new Date()): Date | null {
  const dias = diasSemana.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d >= 0 && d <= 6)
  if (dias.length === 0) return null
  const hhmm = horario.slice(0, 5) // "HH:MM"

  for (let i = 0; i < 8; i++) {
    const spNow = new Date(after.getTime() - 3 * 3600 * 1000)
    const candidate = new Date(spNow)
    candidate.setUTCDate(candidate.getUTCDate() + i)
    const dow = candidate.getUTCDay()
    if (!dias.includes(dow)) continue

    const dateStr = candidate.toISOString().split('T')[0]
    const runAt = new Date(`${dateStr}T${hhmm}:00-03:00`)
    if (runAt.getTime() > after.getTime()) {
      const jitterMs = Math.floor(Math.random() * 120 * 1000)
      return new Date(runAt.getTime() + jitterMs)
    }
  }
  return null
}

// ─── Resolução de responsável para resumo pessoal ────────────────────────────
// SEMPRE pelo vínculo estrutural destino_phone -> luizia_wa_phone_rules.
// profile_id, nunca por semelhança de nome (mesmo risco de vincular a
// pessoa errada que motivou a correção em lib/tarefas-ai-tools.ts). Um
// resumo por OBRA não precisa de responsável — filtra só por obra_id.
export type ResolucaoResponsavelDispatch =
  | { tipo: 'nenhum' }               // resumo por obra, sem filtro pessoal
  | { tipo: 'resolvido'; id: string; nome: string }
  | { tipo: 'nao_vinculado' }        // resumo pessoal, mas telefone sem profile_id — não adivinha

export async function resolveResponsavelDispatch(db: DB, destinoPhone: string, exigeResponsavel: boolean): Promise<ResolucaoResponsavelDispatch> {
  if (!exigeResponsavel) return { tipo: 'nenhum' }
  const { data } = await db.from('luizia_wa_phone_rules').select('profile_id').eq('phone', destinoPhone).maybeSingle()
  const profileId = (data as any)?.profile_id as string | null
  if (!profileId) return { tipo: 'nao_vinculado' }
  const { data: profile } = await db.from('profiles').select('id,name').eq('id', profileId).maybeSingle()
  if (!profile) return { tipo: 'nao_vinculado' }
  return { tipo: 'resolvido', id: (profile as any).id, nome: (profile as any).name }
}

/**
 * Telefone WhatsApp PESSOAL vinculado a um profile — "meu WhatsApp"/avisos
 * pessoais resolvem por aqui, nunca perguntando o número quando dá pra
 * resolver pelo Painel. SÓ considera contatos individuais (is_group=false)
 * — um grupo nunca pode representar "meu WhatsApp": um aviso pessoal
 * ("me avise das minhas tarefas") indo parar num grupo de obra/equipe seria
 * um vazamento de informação pessoal para todo mundo do grupo. `is_group` é
 * populado a partir de evidência real do provider (body.isGroup no webhook
 * — ver app/api/whatsapp/webhook/route.ts), nunca inferido só pelo nome do
 * contato. `nenhum` = profile sem nenhum contato INDIVIDUAL vinculado
 * (mesmo que tenha grupos); `multiplos` = mais de um contato individual —
 * não escolhe sozinho, precisa perguntar qual. Grupo continua existindo
 * normalmente para contexto de obra/equipe (resumo_obra/resumo_tarefas por
 * obra) — só fica de fora deste resolvedor específico.
 */
export type TelefoneDoProfile =
  | { tipo: 'nenhum' }
  | { tipo: 'unico'; phone: string; nome: string | null }
  | { tipo: 'multiplos'; candidatos: { phone: string; nome: string | null }[] }

export async function resolverTelefoneDoProfile(db: DB, profileId: string): Promise<TelefoneDoProfile> {
  const { data } = await db.from('luizia_wa_phone_rules').select('phone,nome').eq('profile_id', profileId).eq('is_group', false)
  const rows = (data || []) as { phone: string; nome: string | null }[]
  if (rows.length === 0) return { tipo: 'nenhum' }
  if (rows.length === 1) return { tipo: 'unico', phone: rows[0].phone, nome: rows[0].nome }
  return { tipo: 'multiplos', candidatos: rows }
}

export type ResumoTarefasResultado = { conteudo: string; erro?: string }

// ─── Resumo diário de Tarefas (determinístico, sem IA) ───────────────────────
// Junta atrasadas + vencem hoje + próximas relevantes (urgente/alta nos
// próximos 3 dias) + aguardando há mais de 2 dias. Retorna '' quando não há
// nada relevante (silêncio proposital, não é erro).
export async function gerarResumoTarefas(db: DB, destinoPhone: string, obraIdFiltro: string | null): Promise<ResumoTarefasResultado> {
  const resolucao = await resolveResponsavelDispatch(db, destinoPhone, !obraIdFiltro)
  if (resolucao.tipo === 'nao_vinculado') {
    return { conteudo: '', erro: 'Telefone de destino nao esta vinculado a um perfil do BuildSmart (configure em Conversas, no admin da Luiza) — resumo pessoal de tarefas nao enviado para nao arriscar mostrar tarefas de outra pessoa.' }
  }
  const resp = resolucao.tipo === 'resolvido' ? resolucao : null
  let query = db.from('tarefas').select('*').in('status', ['pendente', 'em_andamento', 'aguardando'])
  if (resp) query = query.eq('responsavel_id', resp.id)
  if (obraIdFiltro) query = query.eq('obra_id', obraIdFiltro)
  const { data } = await query
  const tarefas = (data || []) as any[]
  if (tarefas.length === 0) return { conteudo: '' }

  const hoje = new Date().toISOString().slice(0, 10)
  const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const doisDiasAtras = new Date(Date.now() - 2 * 86400000).toISOString()

  const atrasadas = tarefas.filter(t => t.data_prazo && t.data_prazo < hoje)
  const vencemHoje = tarefas.filter(t => t.data_prazo === hoje)
  const proximasRelevantes = tarefas.filter(t => t.data_prazo && t.data_prazo > hoje && t.data_prazo <= em3dias && ['urgente', 'alta'].includes(t.prioridade))
  const aguardandoRelevante = tarefas.filter(t => t.status === 'aguardando' && t.updated_at && t.updated_at < doisDiasAtras)

  if (!atrasadas.length && !vencemHoje.length && !proximasRelevantes.length && !aguardandoRelevante.length) return { conteudo: '' }

  const obraIds = [...new Set(tarefas.map(t => t.obra_id).filter(Boolean))]
  const projetoIds = [...new Set(tarefas.map(t => t.projeto_id).filter(Boolean))]
  const [obrasRes, projetosRes] = await Promise.all([
    obraIds.length ? db.from('obras').select('id,nome').in('id', obraIds) : Promise.resolve({ data: [] as any[] }),
    projetoIds.length ? db.from('projetos').select('id,nome').in('id', projetoIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const obraNomeMap: Record<string, string> = Object.fromEntries((obrasRes.data || []).map((o: any) => [o.id, o.nome]))
  const projetoNomeMap: Record<string, string> = Object.fromEntries((projetosRes.data || []).map((p: any) => [p.id, p.nome]))
  const ctxDe = (t: any) => t.obra_id ? (obraNomeMap[t.obra_id] || null) : t.projeto_id ? (projetoNomeMap[t.projeto_id] || null) : null

  const linhas: string[] = []
  for (const t of atrasadas) linhas.push(`🔴 ${t.titulo}${ctxDe(t) ? ` — ${ctxDe(t)}` : ''} — vencida`)
  for (const t of vencemHoje) linhas.push(`${t.titulo}${ctxDe(t) ? ` — ${ctxDe(t)}` : ''} — hoje`)
  for (const t of proximasRelevantes) linhas.push(`${t.titulo}${ctxDe(t) ? ` — ${ctxDe(t)}` : ''} — ${new Date(t.data_prazo + 'T12:00').toLocaleDateString('pt-BR')}`)
  for (const t of aguardandoRelevante) linhas.push(`${t.titulo}${ctxDe(t) ? ` — ${ctxDe(t)}` : ''}`)

  const titulo = resp ? `Tarefas de hoje — ${resp.nome}:` : 'Tarefas de hoje:'
  return { conteudo: titulo + '\n' + linhas.slice(0, 10).map(l => `• ${l}`).join('\n') }
}

const DIAS_LABEL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function formatarDiasSemana(diasSemana: string): string {
  const dias = diasSemana.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d)).sort()
  if (dias.length === 7) return 'todos os dias'
  if (dias.length === 5 && [1, 2, 3, 4, 5].every(d => dias.includes(d))) return 'segunda a sexta'
  return dias.map(d => DIAS_LABEL[d]).join(', ')
}

export function formatarHorario(horario: string): string {
  return horario.slice(0, 5)
}
