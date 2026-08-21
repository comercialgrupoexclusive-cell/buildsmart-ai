// Testes isolados (FakeDB em memória) das tools de Avisos do chat flutuante
// — rodada "Identidade única da Luiza x Painel x Avisos". GOLDEN TEST
// (item 18 do pedido): "me avise das minhas tarefas de segunda a sexta às
// 8" -> preview -> "sim" -> exatamente 1 dispatch criado, com destino_phone
// vindo do vínculo estrutural, nunca inventado.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { execAvisosAiTool, type AvisosAiCtx } from '../luizia-avisos-ai-tools'
import { calcNextRun, formatarDiasSemana, resolverTelefoneDoProfile } from '../luizia-dispatch'

const LUIZ_ID = 'profile-luiz'
const PHONE = '5551999999999'

function novoDb() {
  const db = new FakeDB()
  db.seed('profiles', [{ id: LUIZ_ID, name: 'Luiz' }])
  db.seed('luizia_wa_phone_rules', [])
  db.seed('luizia_wa_dispatches', [])
  db.seed('obras', [{ id: 'obra-1', nome: 'Resid. Jardim Allegra' }])
  db.seed('luizia_pending_task_actions', [])
  return db
}

function ctx(overrides: Partial<AvisosAiCtx> = {}): AvisosAiCtx {
  return { actor: 'Luiz', profileId: LUIZ_ID, conversationKey: `floating:${LUIZ_ID}`, ...overrides }
}

describe('calcNextRun', () => {
  it('calcula o próximo horário futuro dentro dos dias pedidos', () => {
    const next = calcNextRun('1,2,3,4,5', '08:00')
    expect(next).not.toBeNull()
    expect(next!.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('formatarDiasSemana', () => {
  it('reconhece segunda a sexta e todos os dias', () => {
    expect(formatarDiasSemana('1,2,3,4,5')).toBe('segunda a sexta')
    expect(formatarDiasSemana('0,1,2,3,4,5,6')).toBe('todos os dias')
  })
})

describe('GOLDEN — aviso pela Luiza (item 18 do pedido)', () => {
  it('propose_create_alert nunca escreve; confirm cria exatamente 1 dispatch com dados reais', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const c = ctx()

    // "me avise das minhas tarefas de segunda a sexta às 8"
    const preview = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg', 'ter', 'qua', 'qui', 'sex'], horario: '08:00' }, c)
    expect(preview).toContain('Tipo: Resumo de tarefas')
    expect(preview).toContain('Destinatário: Luiz')
    expect(preview).toContain('Dias: segunda a sexta')
    expect(preview).toContain('Horário: 08:00')
    expect(preview).toContain('Confirmar?')
    expect(dbRaw.tables['luizia_wa_dispatches']).toHaveLength(0) // NENHUM dispatch criado ainda

    // "sim"
    const confirmado = await execAvisosAiTool(db, 'confirm_pending_alert', {}, c)
    expect(confirmado).toContain('criado')
    const dispatches = dbRaw.tables['luizia_wa_dispatches']
    expect(dispatches).toHaveLength(1)
    const d = dispatches[0]
    expect(d.tipo).toBe('resumo_tarefas')
    expect(d.destino_phone).toBe(PHONE) // vindo do vínculo, nunca inventado
    expect(d.dias_semana).toBe('1,2,3,4,5')
    expect(d.horario).toBe('08:00:00')
    expect(d.ativo).toBe(true)
    expect(d.recorrente).toBe(true)
    expect(d.next_run_at).not.toBeNull()

    // repetir "sim" não duplica
    const denovo = await execAvisosAiTool(db, 'confirm_pending_alert', {}, c)
    expect(denovo).toMatch(/não encontrei nenhuma proposta/i)
    expect(dbRaw.tables['luizia_wa_dispatches']).toHaveLength(1)
  })
})

describe('propose_create_alert — testes adicionais', () => {
  it('sem WhatsApp vinculado, recusa e não cria proposta', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const r = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg'], horario: '08:00' }, ctx())
    expect(r).toMatch(/ainda não possui um whatsapp pessoal vinculado/i)
    expect(dbRaw.tables['luizia_pending_task_actions']).toHaveLength(0)
  })

  it('dois telefones vinculados ao mesmo perfil — pergunta qual, não escolhe sozinha', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [
      { phone: PHONE, nome: 'Pessoal', profile_id: LUIZ_ID, bloqueado: false, is_group: false },
      { phone: '5551988888888', nome: 'Trabalho', profile_id: LUIZ_ID, bloqueado: false, is_group: false },
    ])
    const db = dbRaw as unknown as SupabaseClient
    const r = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg'], horario: '08:00' }, ctx())
    expect(r).toMatch(/mais de um whatsapp pessoal vinculado/i)
    expect(dbRaw.tables['luizia_pending_task_actions']).toHaveLength(0)
  })

  it('refinar antes de confirmar substitui a proposta (não acumula)', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const c = ctx()
    await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg', 'ter', 'qua', 'qui', 'sex'], horario: '08:00' }, c)
    const r2 = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg', 'ter', 'qua', 'qui', 'sex'], horario: '07:30' }, c)
    expect(r2).toContain('Horário: 07:30')
    const pendentes = dbRaw.tables['luizia_pending_task_actions']
    expect(pendentes.filter(p => p.status === 'pending')).toHaveLength(1)
    expect(pendentes.filter(p => p.status === 'expired')).toHaveLength(1)
    const confirmado = await execAvisosAiTool(db, 'confirm_pending_alert', {}, c)
    expect(confirmado).toContain('criado')
    expect(dbRaw.tables['luizia_wa_dispatches'][0].horario).toBe('07:30:00')
  })

  it('"não" (reject_pending_alert) descarta sem criar', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const c = ctx()
    await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg'], horario: '08:00' }, c)
    const r = await execAvisosAiTool(db, 'reject_pending_alert', {}, c)
    expect(r).toMatch(/não vou alterar/i)
    expect(dbRaw.tables['luizia_wa_dispatches']).toHaveLength(0)
    expect(dbRaw.tables['luizia_pending_task_actions'][0].status).toBe('rejected')
  })

  it('obra inexistente recusa e não cria proposta', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const r = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg'], horario: '08:00', obra_nome: 'Obra que não existe' }, ctx())
    expect(r).toMatch(/não encontrei obra/i)
    expect(dbRaw.tables['luizia_pending_task_actions']).toHaveLength(0)
  })
})

describe('resolverTelefoneDoProfile — hotfix grupo x individual (item 1)', () => {
  const GRUPO = '120363426123042547-group'

  it('profile vinculado só a grupo -> aviso pessoal recusado (nenhum contato individual)', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: GRUPO, nome: 'Grupo Obra', profile_id: LUIZ_ID, bloqueado: false, is_group: true }])
    const db = dbRaw as unknown as SupabaseClient
    const r = await resolverTelefoneDoProfile(db, LUIZ_ID)
    expect(r.tipo).toBe('nenhum')

    const preview = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg'], horario: '08:00' }, ctx())
    expect(preview).toMatch(/não possui um whatsapp pessoal vinculado/i)
    expect(dbRaw.tables['luizia_pending_task_actions']).toHaveLength(0)
  })

  it('profile com 1 contato individual -> resolve corretamente', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: 'Luiz pessoal', profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const r = await resolverTelefoneDoProfile(db, LUIZ_ID)
    expect(r.tipo).toBe('unico')
    if (r.tipo === 'unico') expect(r.phone).toBe(PHONE)
  })

  it('profile com grupo + individual -> usa só o individual, nunca o grupo', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [
      { phone: GRUPO, nome: 'Grupo Obra', profile_id: LUIZ_ID, bloqueado: false, is_group: true },
      { phone: PHONE, nome: 'Luiz pessoal', profile_id: LUIZ_ID, bloqueado: false, is_group: false },
    ])
    const db = dbRaw as unknown as SupabaseClient
    const r = await resolverTelefoneDoProfile(db, LUIZ_ID)
    expect(r.tipo).toBe('unico')
    if (r.tipo === 'unico') expect(r.phone).toBe(PHONE) // nunca o grupo

    const preview = await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg'], horario: '08:00' }, ctx())
    const pendente = dbRaw.tables['luizia_pending_task_actions'][0]
    expect(pendente.argumentos.destino_phone).toBe(PHONE)
    expect(preview).not.toContain(GRUPO)
  })
})

describe('propose_update_alert — pausar/reativar/reprogramar', () => {
  async function criarAvisoConfirmado(dbRaw: FakeDB, db: SupabaseClient, c: AvisosAiCtx) {
    await execAvisosAiTool(db, 'propose_create_alert', { dias: ['seg', 'ter', 'qua', 'qui', 'sex'], horario: '08:00' }, c)
    await execAvisosAiTool(db, 'confirm_pending_alert', {}, c)
    return dbRaw.tables['luizia_wa_dispatches'][0].id as string
  }

  it('"pausa meu aviso" -> ativo:false, sem next_run_at, exige confirmação', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const c = ctx()
    await criarAvisoConfirmado(dbRaw, db, c)

    const preview = await execAvisosAiTool(db, 'propose_update_alert', { ativo: false }, c)
    expect(preview).toContain('pausado')
    expect(dbRaw.tables['luizia_wa_dispatches'][0].ativo).toBe(true) // ainda não aplicou

    const confirmado = await execAvisosAiTool(db, 'confirm_pending_alert', {}, c)
    expect(confirmado).toMatch(/atualizado/i)
    expect(dbRaw.tables['luizia_wa_dispatches'][0].ativo).toBe(false)
    expect(dbRaw.tables['luizia_wa_dispatches'][0].next_run_at).toBeNull()
  })

  it('"muda meu aviso para 7h30" reprograma o next_run_at', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('luizia_wa_phone_rules', [{ phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false }])
    const db = dbRaw as unknown as SupabaseClient
    const c = ctx()
    await criarAvisoConfirmado(dbRaw, db, c)

    await execAvisosAiTool(db, 'propose_update_alert', { novo_horario: '07:30' }, c)
    await execAvisosAiTool(db, 'confirm_pending_alert', {}, c)
    expect(dbRaw.tables['luizia_wa_dispatches'][0].horario).toBe('07:30:00')
    expect(dbRaw.tables['luizia_wa_dispatches'][0].next_run_at).not.toBeNull()
  })
})

describe('list_alerts', () => {
  it('sem avisos ainda', async () => {
    const dbRaw = novoDb()
    const db = dbRaw as unknown as SupabaseClient
    const r = await execAvisosAiTool(db, 'list_alerts', {}, ctx())
    expect(r).toMatch(/não tem nenhum aviso/i)
  })

  it('lista só os avisos do próprio perfil (telefone vinculado), nunca de outro', async () => {
    const dbRaw = novoDb()
    dbRaw.seed('profiles', [{ id: LUIZ_ID, name: 'Luiz' }, { id: 'profile-gabriel', name: 'Gabriel' }])
    dbRaw.seed('luizia_wa_phone_rules', [
      { phone: PHONE, nome: null, profile_id: LUIZ_ID, bloqueado: false, is_group: false },
      { phone: '5551977777777', nome: null, profile_id: 'profile-gabriel', bloqueado: false },
    ])
    dbRaw.seed('luizia_wa_dispatches', [
      { id: 'd1', nome: 'Resumo do Luiz', tipo: 'resumo_tarefas', obra_id: null, destino_phone: PHONE, dias_semana: '1,2,3,4,5', horario: '08:00:00', recorrente: true, ativo: true, last_sent_at: null },
      { id: 'd2', nome: 'Resumo do Gabriel', tipo: 'resumo_tarefas', obra_id: null, destino_phone: '5551977777777', dias_semana: '1,2,3,4,5', horario: '08:00:00', recorrente: true, ativo: true, last_sent_at: null },
    ])
    const db = dbRaw as unknown as SupabaseClient
    const r = await execAvisosAiTool(db, 'list_alerts', {}, ctx())
    expect(r).toContain('Resumo do Luiz')
    expect(r).not.toContain('Resumo do Gabriel')
  })
})
