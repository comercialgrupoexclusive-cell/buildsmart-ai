// Testes isolados (fake Supabase client, sem rede/produção) do runtime
// unificado de Tarefas para o chat flutuante — rodada "Unificação Luiza".
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { normalizarNome } from '../ai-resolve'
import { execTarefasAiTool, type TarefasAiCtx } from '../tarefas-ai-tools'
import {
  detectarFiltroDeterministico, mencionaEntidadeNomeada, tentarFastPath, runTarefasSkill,
} from '../luizia-tarefas-runtime'

const GABRIEL_ID = 'profile-gabriel'

function novoDb() {
  const db = new FakeDB()
  db.seed('profiles', [{ id: GABRIEL_ID, name: 'Gabriel' }])
  db.seed('obras', [])
  db.seed('projetos', [])
  db.seed('tarefas', [])
  db.seed('luizia_tarefas_log', [])
  db.seed('luizia_pending_task_actions', [])
  return db
}

function ctxFloating(overrides: Partial<TarefasAiCtx> = {}): TarefasAiCtx {
  return { actor: 'Gabriel', origem: 'floating', conversationKey: `floating:${GABRIEL_ID}`, profileId: GABRIEL_ID, ...overrides }
}

describe('detectarFiltroDeterministico', () => {
  it('reconhece hoje/amanhã/atrasadas/semana/aguardando/todas', () => {
    expect(detectarFiltroDeterministico(normalizarNome('o que tenho hoje?'))).toBe('hoje')
    expect(detectarFiltroDeterministico(normalizarNome('quais minhas tarefas de amanhã?'))).toBe('amanha')
    expect(detectarFiltroDeterministico(normalizarNome('o que está atrasado?'))).toBe('atrasadas')
    expect(detectarFiltroDeterministico(normalizarNome('o que tenho essa semana?'))).toBe('semana')
    expect(detectarFiltroDeterministico(normalizarNome('o que estou aguardando?'))).toBe('aguardando')
    expect(detectarFiltroDeterministico(normalizarNome('mostra todas'))).toBe('todas')
  })
  it('não reconhece uma pergunta sem sinal de filtro', () => {
    expect(detectarFiltroDeterministico(normalizarNome('quero criar uma tarefa'))).toBeNull()
  })
})

describe('mencionaEntidadeNomeada — TAREFA != PLANEJAMENTO, e nomes vão para o loop com IA', () => {
  it('perguntas pessoais puras não mencionam entidade', () => {
    expect(mencionaEntidadeNomeada(normalizarNome('quais minhas tarefas de amanhã?'))).toBe(false)
    expect(mencionaEntidadeNomeada(normalizarNome('o que tenho hoje?'))).toBe(false)
    expect(mencionaEntidadeNomeada(normalizarNome('o que está atrasado?'))).toBe(false)
    expect(mencionaEntidadeNomeada(normalizarNome('o que estou aguardando?'))).toBe(false)
  })
  it('código de projeto (dígitos) força o loop com IA', () => {
    expect(mencionaEntidadeNomeada(normalizarNome('quais tarefas do R0224?'))).toBe(true)
  })
  it('pergunta por outra pessoa força o loop com IA', () => {
    expect(mencionaEntidadeNomeada(normalizarNome('o que o Gabriel tem?'))).toBe(true)
  })
  it('menção explícita a obra/projeto força o loop com IA (Tarefa != Planejamento não se confunde por engano)', () => {
    expect(mencionaEntidadeNomeada(normalizarNome('quais tarefas da obra Allegra?'))).toBe(true)
  })
})

describe('tentarFastPath — 0 chamadas de LLM para perguntas estruturadas', () => {
  it('#1 — "quais minhas tarefas de amanhã?" responde via list_tasks direto', async () => {
    const db = novoDb()
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    db.seed('tarefas', [{ id: 't1', titulo: 'Revisar planta', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: amanha }])
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'quais minhas tarefas de amanhã?', ctxFloating())
    expect(r).not.toBeNull()
    expect(r).toContain('Revisar planta')
  })

  it('#2 — "o que tenho hoje?" responde via list_tasks direto', async () => {
    const db = novoDb()
    const hoje = new Date().toISOString().slice(0, 10)
    db.seed('tarefas', [{ id: 't1', titulo: 'Confirmar entrega', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: hoje }])
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'o que tenho hoje?', ctxFloating())
    expect(r).toContain('Confirmar entrega')
  })

  it('#3 — atrasadas', async () => {
    const db = novoDb()
    db.seed('tarefas', [{ id: 't1', titulo: 'Pagar boleto', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01' }])
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'o que está atrasado?', ctxFloating())
    expect(r).toContain('Pagar boleto')
  })

  it('#4 — aguardando', async () => {
    const db = novoDb()
    db.seed('tarefas', [{ id: 't1', titulo: 'Aguardando prefeitura', responsavel_id: GABRIEL_ID, status: 'aguardando', prioridade: 'normal', data_prazo: null }])
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'o que estou aguardando?', ctxFloating())
    expect(r).toContain('Aguardando prefeitura')
  })

  it('#15 — ausência de tarefas retorna "não encontrei", sem invenção', async () => {
    const db = novoDb()
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'o que tenho hoje?', ctxFloating())
    expect(r).toMatch(/nenhuma tarefa encontrada/i)
  })

  it('#5 — menção a projeto (R0224) NÃO usa fast path (precisa resolver nome)', async () => {
    const db = novoDb()
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'quais tarefas do R0224?', ctxFloating())
    expect(r).toBeNull()
  })

  it('#6 — pergunta por outra pessoa NÃO usa fast path', async () => {
    const db = novoDb()
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'o que o Gabriel tem?', ctxFloating())
    expect(r).toBeNull()
  })

  it('ordem de CRUD (change-intent) nunca usa fast path', async () => {
    const db = novoDb()
    db.seed('tarefas', [{ id: 't1', titulo: 'Tarefa X', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: null }])
    const r = await tentarFastPath(db as unknown as SupabaseClient, 'marca a tarefa X como concluída', ctxFloating())
    expect(r).toBeNull()
  })
})

describe('runTarefasSkill — Chat não executa alteração (item 12)', () => {
  it('modo chat + intenção de alteração é bloqueado ANTES de tocar IA/banco', async () => {
    const resultado = await runTarefasSkill({
      prompt: 'muda a tarefa X para sexta',
      history: [],
      modo: 'chat',
      profileId: GABRIEL_ID,
      actor: 'Gabriel',
    })
    expect(resultado.blocked).toBe(true)
    expect(resultado.usedLLM).toBe(false)
  })

  it('modo chat + pergunta de consulta pura usa fast path (usedLLM=false)', async () => {
    // OPENAI_API_KEY não configurada neste teste — se caísse no loop de IA,
    // a mensagem seria de erro de configuração, não a resposta real.
    const resultado = await runTarefasSkill({
      prompt: 'o que tenho hoje?',
      history: [],
      modo: 'chat',
      profileId: null,
      actor: 'Gabriel',
    })
    expect(resultado.usedLLM).toBe(false)
    expect(resultado.blocked).toBe(false)
  })
})

describe('#14 — mesma consulta WhatsApp × floating retorna os mesmos registros', () => {
  it('list_tasks com o mesmo profileId via origem whatsapp e floating dá o mesmo resultado', async () => {
    const db = novoDb()
    db.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa comum', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'normal', data_prazo: null },
    ])
    const ctxWa: TarefasAiCtx = { actor: '+5551999999999', origem: 'whatsapp', conversationKey: '+5551999999999', profileId: GABRIEL_ID }
    const ctxFl: TarefasAiCtx = { actor: 'Gabriel', origem: 'floating', conversationKey: `floating:${GABRIEL_ID}`, profileId: GABRIEL_ID }
    const rWa = await execTarefasAiTool(db as unknown as SupabaseClient, 'list_tasks', { filtro: 'todas' }, ctxWa)
    const rFl = await execTarefasAiTool(db as unknown as SupabaseClient, 'list_tasks', { filtro: 'todas' }, ctxFl)
    expect(rWa).toBe(rFl)
    expect(rWa).toContain('Tarefa comum')
  })
})
