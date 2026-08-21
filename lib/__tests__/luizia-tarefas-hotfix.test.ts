// ═══════════════════════════════════════════════════════════════════════════
// HOTFIX CRÍTICO — LUIZA × TAREFAS, baseado em falha real de produção
// (ver RELATORIO_LUIZA_TAREFAS_HOTFIX_REAL.md para a conversa completa e a
// evidência no banco). GOLDEN REGRESSION CASE: replica a sequência exata de
// 6 mensagens que expôs o bug — vira teste de regressão permanente.
//
// Limitação assumida conscientemente (mesma da rodada anterior): os turnos
// que dependem de interpretar linguagem natural (extrair título/prazo/
// para_mim da frase do usuário) chamam execTarefasAiTool diretamente com os
// argumentos que o modelo extrairia — não montamos aqui um mock completo do
// loop de function-calling da OpenAI. O que É testado ponta a ponta: que a
// escrita real (INSERT em `tarefas`) só acontece depois de confirm_pending_
// action, nunca antes, e nunca mais de uma vez.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { execTarefasAiTool, tarefasAiToolDefs, type TarefasAiCtx } from '../tarefas-ai-tools'
import { tentarFastPath, detectarResumoGeral, detectarPedidoCapabilityInexistente } from '../luizia-tarefas-runtime'
import { askLuizia } from '../luizia-core'

const LUIZ_ID = 'profile-luiz'
const GABRIEL_ID = 'profile-gabriel'

function novoDb() {
  const db = new FakeDB()
  db.seed('profiles', [
    { id: LUIZ_ID, name: 'Luiz' },
    { id: GABRIEL_ID, name: 'Gabriel' },
  ])
  db.seed('obras', [{ id: 'obra-1', nome: 'Resid. Jardim Allegra' }])
  db.seed('projetos', [])
  db.seed('tarefas', [])
  db.seed('luizia_tarefas_log', [])
  db.seed('luizia_pending_task_actions', [])
  return db
}

function ctxLuiz(overrides: Partial<TarefasAiCtx> = {}): TarefasAiCtx {
  return { actor: 'Luiz', origem: 'floating', conversationKey: `floating:${LUIZ_ID}`, profileId: LUIZ_ID, ...overrides }
}

function amanhaISO(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10)
}

describe('GOLDEN REGRESSION CASE — conversa real de produção (2026-08-21)', () => {
  it('replica os 6 turnos exatos e valida cada comportamento esperado', async () => {
    const dbRaw = novoDb()
    // 5 tarefas abertas pré-existentes: 3 do Luiz, 1 do Gabriel, 1 sem responsável
    // — representa o estado real (havia tarefas de outras pessoas além de Luiz;
    // "no geral" e "minhas" precisam dar números DIFERENTES).
    dbRaw.seed('tarefas', [
      { id: 't1', titulo: 'Revisar planta hidráulica', responsavel_id: LUIZ_ID, status: 'pendente', prioridade: 'normal', data_prazo: null, obra_id: null, projeto_id: null },
      { id: 't2', titulo: 'Confirmar pontos de ar-condicionado', responsavel_id: LUIZ_ID, status: 'pendente', prioridade: 'alta', data_prazo: null, obra_id: null, projeto_id: null },
      { id: 't3', titulo: 'Aprovar orçamento de esquadrias', responsavel_id: LUIZ_ID, status: 'aguardando', prioridade: 'normal', data_prazo: null, obra_id: null, projeto_id: null },
      { id: 't4', titulo: 'Tarefa do Gabriel', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: null, obra_id: null, projeto_id: null },
      { id: 't5', titulo: 'Tarefa sem dono', responsavel_id: null, status: 'pendente', prioridade: 'normal', data_prazo: null, obra_id: null, projeto_id: null },
    ])
    const db = dbRaw as unknown as SupabaseClient
    const ctx = ctxLuiz()

    // Turno 1 — "como estao as coisas?" — resumo real determinístico, nunca
    // uma pergunta genérica de volta.
    const t1 = await tentarFastPath(db, 'como estao as coisas?', ctx)
    expect(t1).not.toBeNull()
    expect(t1).toContain('Hoje temos:')
    expect(t1).toContain('5 tarefa(s) aberta(s)')
    expect(t1).toContain('3 atribuída(s) a você')
    expect(t1?.trim().endsWith('?')).toBe(false)

    // Turno 2 — "no geral o que temos?" — GERAL, não "minhas" (bug real:
    // respondeu "9 tarefas" quando o total era 21/19 abertas). Aqui: total
    // aberto (5) tem que aparecer, não só as 3 do Luiz.
    const t2 = await tentarFastPath(db, 'no geral o que temos?', ctx)
    expect(t2).toContain('5 tarefa(s) aberta(s)')
    expect(t2).toContain('3 atribuída(s) a você')

    // Turno 3 — "manda as tarefas pro meu whats" — nunca promete uma
    // capacidade que não existe (bug real: sugeriu mudar para Work).
    const t3 = await tentarFastPath(db, 'manda as tarefas pro meu whats', ctx)
    expect(t3).toMatch(/ainda não consigo enviar/i)
    expect(t3?.toLowerCase()).not.toContain('work')
    expect(t3?.toLowerCase()).not.toContain('modo')

    // Turno 4 — "crie uma terefa pra mim, orçar esquadrias" — vira PROPOSTA,
    // nunca escreve. responsavel_id tem que ser o profile atual (nunca NULL,
    // nunca por fuzzy-match de nome). Simula o que o modelo extrairia da
    // frase: titulo="Orçar esquadrias", para_mim=true, sem data_prazo ainda.
    const antesDoCreate = (dbRaw.tables['tarefas'] || []).length
    const t4 = await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Orçar esquadrias', para_mim: true }, ctx)
    expect(t4).toContain('Tarefa: Orçar esquadrias')
    expect(t4).toContain('Responsável: Luiz')
    expect(t4).toContain('Prazo: ainda não definido')
    expect(t4).toContain('Confirmar criação?')
    expect((dbRaw.tables['tarefas'] || []).length).toBe(antesDoCreate) // NÃO escreveu
    const pendentesAposT4 = dbRaw.tables['luizia_pending_task_actions'].filter(p => p.status === 'pending')
    expect(pendentesAposT4).toHaveLength(1)
    expect(pendentesAposT4[0].tool).toBe('create_task')
    expect(pendentesAposT4[0].argumentos.responsavel_id).toBe(LUIZ_ID)

    // Turno 5 — "amnah" — interpretado como amanhã, ATUALIZA a proposta
    // (substitui, não acumula), continua SEM escrever.
    const amanha = amanhaISO()
    const t5 = await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Orçar esquadrias', para_mim: true, data_prazo: amanha }, ctx)
    expect(t5).toContain(`Prazo: ${new Date(amanha + 'T12:00').toLocaleDateString('pt-BR')}`)
    expect((dbRaw.tables['tarefas'] || []).length).toBe(antesDoCreate) // ainda NÃO escreveu
    const todasPendentesAposT5 = dbRaw.tables['luizia_pending_task_actions']
    expect(todasPendentesAposT5.filter(p => p.status === 'pending')).toHaveLength(1) // substituiu, não acumulou
    expect(todasPendentesAposT5.filter(p => p.status === 'expired')).toHaveLength(1) // a proposta do turno 4

    // Turno 6 — "sim" — SÓ AGORA escreve, exatamente uma vez, com
    // responsavel_id/prazo corretos, log de auditoria e proposta marcada
    // executada.
    const t6 = await execTarefasAiTool(db, 'confirm_pending_action', {}, ctx)
    expect(t6).toContain('Tarefa "Orçar esquadrias" criada')
    const tarefasFinal = dbRaw.tables['tarefas']
    expect(tarefasFinal).toHaveLength(antesDoCreate + 1)
    const criada = tarefasFinal.find(t => t.titulo === 'Orçar esquadrias')
    expect(criada?.responsavel_id).toBe(LUIZ_ID)
    expect(criada?.data_prazo).toBe(amanha)
    const logsCriacao = dbRaw.tables['luizia_tarefas_log'].filter(l => l.acao === 'criar' && l.resultado === 'ok')
    expect(logsCriacao).toHaveLength(1)
    expect(dbRaw.tables['luizia_pending_task_actions'].filter(p => p.status === 'executed')).toHaveLength(1)

    // Repetir "sim" não duplica — não há mais proposta pendente ativa.
    const t6DeNovo = await execTarefasAiTool(db, 'confirm_pending_action', {}, ctx)
    expect(t6DeNovo).toMatch(/não encontrei nenhuma sugestão/i)
    expect(dbRaw.tables['tarefas']).toHaveLength(antesDoCreate + 1) // sem duplicar
  })
})

describe('propose_create_task — testes adicionais (itens 1-19 do pedido)', () => {
  it('#3 — "crie tarefa X para Gabriel" resolve o responsável com segurança', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const r = await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Tarefa X', responsavel_nome: 'Gabriel' }, ctxLuiz())
    expect(r).toContain('Responsável: Gabriel')
    const pendente = dbRaw.tables['luizia_pending_task_actions'][0]
    expect(pendente.argumentos.responsavel_id).toBe(GABRIEL_ID)
    expect(dbRaw.tables['tarefas']).toHaveLength(0)
  })

  it('#8 — "não" (reject_pending_action) descarta a proposta sem escrever', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const ctx = ctxLuiz()
    await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Tarefa Y', para_mim: true }, ctx)
    const r = await execTarefasAiTool(db, 'reject_pending_action', {}, ctx)
    expect(r).toMatch(/não vou alterar/i)
    expect(dbRaw.tables['tarefas']).toHaveLength(0)
    expect(dbRaw.tables['luizia_pending_task_actions'][0].status).toBe('rejected')
  })

  it('#9 — proposta de criação expirada não escreve', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const ctx = ctxLuiz()
    await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Tarefa Z', para_mim: true }, ctx)
    dbRaw.tables['luizia_pending_task_actions'][0].expires_at = new Date(Date.now() - 60000).toISOString()
    const r = await execTarefasAiTool(db, 'confirm_pending_action', {}, ctx)
    expect(r).toMatch(/expirou/i)
    expect(dbRaw.tables['tarefas']).toHaveLength(0)
  })

  it('#17 — dentro de Obra>Tarefas, herda obra_id e revela o contexto na proposta', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const ctx = ctxLuiz({ fixedObraId: 'obra-1' })
    const r = await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Tarefa da obra', para_mim: true }, ctx)
    expect(r).toContain('Contexto: Obra Resid. Jardim Allegra')
    expect(dbRaw.tables['luizia_pending_task_actions'][0].argumentos.obra_id).toBe('obra-1')
  })

  it('#18 — "pra mim" sem profileId identificável recusa e não cria proposta', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const r = await execTarefasAiTool(db, 'propose_create_task', { titulo: 'Tarefa sem dono', para_mim: true }, ctxLuiz({ profileId: null }))
    expect(r).toMatch(/não consegui identificar seu perfil/i)
    expect(dbRaw.tables['luizia_pending_task_actions']).toHaveLength(0)
  })

  it('#11 — escopo_geral=true nunca filtra por responsável, mesmo sem outro escopo', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa do Luiz', responsavel_id: LUIZ_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
      { id: 't2', titulo: 'Tarefa do Gabriel', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
    ])
    const db = dbRaw as unknown as SupabaseClient
    const geral = await execTarefasAiTool(db, 'list_tasks', { filtro: 'todas', escopo_geral: true }, ctxLuiz())
    expect(geral).toContain('Tarefa do Luiz')
    expect(geral).toContain('Tarefa do Gabriel')
    const pessoal = await execTarefasAiTool(db, 'list_tasks', { filtro: 'todas' }, ctxLuiz())
    expect(pessoal).toContain('Tarefa do Luiz')
    expect(pessoal).not.toContain('Tarefa do Gabriel')
  })

  it('#12 — detectarResumoGeral reconhece as frases da conversa real, sem falso-positivo em "minhas"', () => {
    expect(detectarResumoGeral('como estao as coisas')).toBe(true)
    expect(detectarResumoGeral('no geral o que temos')).toBe(true)
    expect(detectarResumoGeral('como estao as tarefas')).toBe(true)
    expect(detectarResumoGeral('visao geral')).toBe(true)
    expect(detectarResumoGeral('o que temos')).toBe(true)
    expect(detectarResumoGeral('minhas tarefas')).toBe(false)
    expect(detectarResumoGeral('o que eu tenho hoje')).toBe(false)
  })

  it('#15 — detectarPedidoCapabilityInexistente só dispara com alvo externo real', () => {
    expect(detectarPedidoCapabilityInexistente('manda as tarefas pro meu whats')).toBe(true)
    expect(detectarPedidoCapabilityInexistente('envia por email a lista')).toBe(true)
    expect(detectarPedidoCapabilityInexistente('quero mandar bem no orcamento')).toBe(false)
    expect(detectarPedidoCapabilityInexistente('pode listar aqui mesmo')).toBe(false)
  })

  it('propose_create_task está definido nas tools compartilhadas', () => {
    const defs = tarefasAiToolDefs(false)
    const nomes = defs.filter(t => t.type === 'function').map(t => t.function.name)
    expect(nomes).toContain('propose_create_task')
  })
})

describe('askLuizia — "modo work"/"modo chat" nunca é comando de UI (item 9)', () => {
  it('pede "modo work" ainda em Chat — avisa o estado real, não finge ter mudado', async () => {
    const r = await askLuizia({
      messages: [{ role: 'user', content: 'modo work' }],
      context: { modoLuiza: 'chat' },
    })
    expect(r.message).toMatch(/ainda está em Chat/i)
    expect(r.message).toMatch(/Work/)
    expect(r.blocked).toBe(true)
  })

  it('pede "modo work" já estando em Work — não manda trocar de novo', async () => {
    const r = await askLuizia({
      messages: [{ role: 'user', content: 'modo work' }],
      context: { modoLuiza: 'work' },
    })
    expect(r.message).toMatch(/você já está em work/i)
  })

  it('pede "modo chat" estando em Work', async () => {
    const r = await askLuizia({
      messages: [{ role: 'user', content: 'modo chat' }],
      context: { modoLuiza: 'work' },
    })
    expect(r.message).toMatch(/ainda está em Work/i)
    expect(r.message).toMatch(/Chat/)
  })
})
