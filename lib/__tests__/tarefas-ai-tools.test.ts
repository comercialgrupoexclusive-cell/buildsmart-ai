// Bateria de testes isolados (mock de banco em memória, sem tocar produção)
// para a regra de autorização e o mecanismo de proposta pendente da rodada
// de hardening — itens 5-13 e 16-17 do pedido.
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { execTarefasAiTool, type TarefasAiCtx } from '../tarefas-ai-tools'

const GABRIEL_ID = 'profile-gabriel'
const LUIZ_ID = 'profile-luiz'

function novoDb() {
  const db = new FakeDB()
  db.seed('profiles', [
    { id: GABRIEL_ID, name: 'Gabriel' },
    { id: LUIZ_ID, name: 'Luiz' },
  ])
  db.seed('obras', [{ id: 'obra-1', nome: 'Resid. Jardim Allegra' }])
  db.seed('tarefas', [])
  db.seed('luizia_tarefas_log', [])
  db.seed('luizia_pending_task_actions', [])
  return db
}

function ctxWhatsapp(overrides: Partial<TarefasAiCtx> = {}): TarefasAiCtx {
  return { actor: '+5551999999999', origem: 'whatsapp', conversationKey: '+5551999999999', profileId: null, ...overrides }
}

describe('list_tasks — minhas tarefas (identidade estrutural)', () => {
  it('#5/#6 — sem profile_id vinculado, pergunta pessoal NAO adivinha pelo nome', async () => {
    const db = novoDb()
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'list_tasks', { filtro: 'todas' }, ctxWhatsapp({ profileId: null }))
    expect(r).toMatch(/não está vinculado a um perfil/i)
  })

  it('#5 — com profile_id vinculado, "minhas tarefas" filtra só as do profile', async () => {
    const db = novoDb()
    db.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa do Gabriel', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
      { id: 't2', titulo: 'Tarefa do Luiz', responsavel_id: LUIZ_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
    ])
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'list_tasks', { filtro: 'todas' }, ctxWhatsapp({ profileId: GABRIEL_ID }))
    expect(r).toContain('Tarefa do Gabriel')
    expect(r).not.toContain('Tarefa do Luiz')
  })

  it('#6 — perguntar por outra pessoa explicitamente usa responsavel_nome, nao profileId', async () => {
    const db = novoDb()
    db.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa do Gabriel', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
      { id: 't2', titulo: 'Tarefa do Luiz', responsavel_id: LUIZ_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
    ])
    // remetente é o profile do Luiz, mas pergunta pelas tarefas do Gabriel
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'list_tasks', { filtro: 'todas', responsavel_nome: 'Gabriel' }, ctxWhatsapp({ profileId: LUIZ_ID }))
    expect(r).toContain('Tarefa do Gabriel')
    expect(r).not.toContain('Tarefa do Luiz')
  })
})

describe('autorização — ordem explícita executa, sugestão não', () => {
  let db: FakeDB
  let ctx: TarefasAiCtx

  beforeEach(() => {
    db = novoDb()
    ctx = ctxWhatsapp({ profileId: GABRIEL_ID })
  })

  it('#7 — create_task grava direto e loga', async () => {
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'create_task', { titulo: 'Confirmar ar-condicionado', prioridade: 'alta' }, ctx)
    expect(r).toContain('criada')
    expect(db.tables['tarefas']).toHaveLength(1)
    expect(db.tables['luizia_tarefas_log']).toHaveLength(1)
    expect(db.tables['luizia_tarefas_log'][0].acao).toBe('criar')
  })

  it('#7 — update_task com ordem explícita altera a tarefa imediatamente', async () => {
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa X', status: 'pendente', prioridade: 'normal', data_prazo: '2026-01-01', responsavel_nome: null }])
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'update_task', { titulo: 'Tarefa X', novo_prazo: '2026-02-02' }, ctx)
    expect(r).toContain('atualizada')
    expect(db.tables['tarefas'][0].data_prazo).toBe('2026-02-02')
    expect(db.tables['luizia_tarefas_log']).toHaveLength(1)
  })

  it('#8 — suggest_task_change NAO altera a tarefa, só grava proposta pendente', async () => {
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa Atrasada', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01' }])
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'suggest_task_change', {
      titulo: 'Tarefa Atrasada', acao: 'editar', novo_prazo: '2026-03-03', justificativa: 'está atrasada',
    }, ctx)
    expect(r).toMatch(/Posso aplicar/i)
    expect(db.tables['tarefas'][0].data_prazo).toBe('2020-01-01') // inalterada
    expect(db.tables['luizia_tarefas_log']).toHaveLength(0) // não escreveu, não loga
    expect(db.tables['luizia_pending_task_actions']).toHaveLength(1)
    expect(db.tables['luizia_pending_task_actions'][0].status).toBe('pending')
  })

  it('#9 — confirm_pending_action (sem id, uma pendente) executa exatamente a proposta e loga', async () => {
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa Atrasada', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01' }])
    await execTarefasAiTool(db as unknown as SupabaseClient, 'suggest_task_change', {
      titulo: 'Tarefa Atrasada', acao: 'editar', novo_prazo: '2026-03-03',
    }, ctx)
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx)
    expect(r).toContain('atualizada')
    expect(db.tables['tarefas'][0].data_prazo).toBe('2026-03-03')
    expect(db.tables['luizia_tarefas_log']).toHaveLength(1)
    expect(db.tables['luizia_pending_task_actions'][0].status).toBe('executed')
  })

  it('#10 — reject_pending_action nunca escreve na tarefa', async () => {
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa Atrasada', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01' }])
    await execTarefasAiTool(db as unknown as SupabaseClient, 'suggest_task_change', {
      titulo: 'Tarefa Atrasada', acao: 'editar', novo_prazo: '2026-03-03',
    }, ctx)
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'reject_pending_action', {}, ctx)
    expect(r).toMatch(/não vou alterar/i)
    expect(db.tables['tarefas'][0].data_prazo).toBe('2020-01-01')
    expect(db.tables['luizia_tarefas_log']).toHaveLength(0)
    expect(db.tables['luizia_pending_task_actions'][0].status).toBe('rejected')
  })

  it('#11 — proposta expirada não executa', async () => {
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa Atrasada', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01' }])
    await execTarefasAiTool(db as unknown as SupabaseClient, 'suggest_task_change', {
      titulo: 'Tarefa Atrasada', acao: 'editar', novo_prazo: '2026-03-03',
    }, ctx)
    // força expiração manualmente (simula 31 minutos depois)
    db.tables['luizia_pending_task_actions'][0].expires_at = new Date(Date.now() - 60000).toISOString()
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx)
    expect(r).toMatch(/expirou/i)
    expect(db.tables['tarefas'][0].data_prazo).toBe('2020-01-01')
  })

  it('#12 — duas propostas pendentes exigem desambiguação (nenhuma executa sozinha)', async () => {
    db.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa A', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01' },
      { id: 't2', titulo: 'Tarefa B', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-02' },
    ])
    await execTarefasAiTool(db as unknown as SupabaseClient, 'suggest_task_change', { titulo: 'Tarefa A', acao: 'editar', novo_prazo: '2026-01-01' }, ctx)
    await execTarefasAiTool(db as unknown as SupabaseClient, 'suggest_task_change', { titulo: 'Tarefa B', acao: 'editar', novo_prazo: '2026-01-02' }, ctx)
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx)
    expect(r).toMatch(/qual del/i)
    expect(db.tables['tarefas'][0].data_prazo).toBe('2020-01-01')
    expect(db.tables['tarefas'][1].data_prazo).toBe('2020-01-02')
  })

  it('#13 — toda escrita (criar/editar/concluir/reabrir/cancelar) grava luizia_tarefas_log', async () => {
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa Y', status: 'pendente', concluida: false, concluida_em: null, prioridade: 'normal', data_prazo: null }])
    await execTarefasAiTool(db as unknown as SupabaseClient, 'complete_task', { titulo: 'Tarefa Y' }, ctx)
    await execTarefasAiTool(db as unknown as SupabaseClient, 'reopen_task', { titulo: 'Tarefa Y' }, ctx)
    await execTarefasAiTool(db as unknown as SupabaseClient, 'cancel_task', { titulo: 'Tarefa Y' }, ctx)
    const acoes = db.tables['luizia_tarefas_log'].map(l => l.acao)
    expect(acoes).toEqual(['concluir', 'reabrir', 'cancelar'])
    for (const l of db.tables['luizia_tarefas_log']) {
      expect(l.resultado).toBe('ok')
      expect(l.tarefa_id).toBe('t1')
    }
  })
})

describe('desambiguação de tarefa por título', () => {
  it('#16 — título ambíguo (bate em 2) pergunta qual, não escolhe nem escreve', async () => {
    const db = novoDb()
    db.seed('tarefas', [
      { id: 't1', titulo: 'Confirmar ponto A', status: 'pendente', prioridade: 'normal', data_prazo: null },
      { id: 't2', titulo: 'Confirmar ponto B', status: 'pendente', prioridade: 'normal', data_prazo: null },
    ])
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'update_task', { titulo: 'Confirmar ponto', novo_prazo: '2026-01-01' }, ctxWhatsapp())
    expect(r).toMatch(/qual del/i)
    expect(db.tables['tarefas'][0].data_prazo).toBeNull()
    expect(db.tables['tarefas'][1].data_prazo).toBeNull()
  })

  it('#17 — título inexistente retorna "não encontrei"', async () => {
    const db = novoDb()
    const r = await execTarefasAiTool(db as unknown as SupabaseClient, 'get_task', { titulo: 'Tarefa que nao existe de jeito nenhum' }, ctxWhatsapp())
    expect(r).toMatch(/não encontrei/i)
  })
})

describe('#19 — reprogramação de tarefa nunca toca outras tabelas (Tarefa != Planejamento)', () => {
  it('update_task só grava em `tarefas` e `luizia_tarefas_log`', async () => {
    const db = novoDb()
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa Z', status: 'pendente', prioridade: 'normal', data_prazo: '2026-01-01' }])
    await execTarefasAiTool(db as unknown as SupabaseClient, 'update_task', { titulo: 'Tarefa Z', novo_prazo: '2026-05-05' }, ctxWhatsapp())
    // nenhuma tabela de planejamento/etapas foi criada pelo fake db (ele só
    // materializa tabelas que o código efetivamente usa via `.from(...)`)
    expect(Object.keys(db.tables).sort()).toEqual(['luizia_tarefas_log', 'luizia_pending_task_actions', 'obras', 'profiles', 'tarefas'].sort())
  })
})
