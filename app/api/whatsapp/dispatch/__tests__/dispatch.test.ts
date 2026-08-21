// Testes isolados (mock em memória) do resumo diário de tarefas — item #18
// do pedido: resumo pessoal usa o vínculo telefone->profile, nunca nome
// fuzzy; resumo por obra não exige vínculo.
import { describe, it, expect } from 'vitest'
import { FakeDB } from '../../../../../lib/__tests__/fake-supabase'
import { gerarResumoTarefas, resolveResponsavelDispatch } from '../route'

const GABRIEL_ID = 'profile-gabriel'
const PHONE = '5551999999999'

function novoDb() {
  const db = new FakeDB()
  db.seed('profiles', [{ id: GABRIEL_ID, name: 'Gabriel' }])
  db.seed('luizia_wa_phone_rules', [])
  db.seed('tarefas', [])
  db.seed('obras', [])
  db.seed('projetos', [])
  return db
}

describe('resolveResponsavelDispatch', () => {
  it('resumo por obra (exigeResponsavel=false) não precisa de vínculo', async () => {
    const db = novoDb()
    const r = await resolveResponsavelDispatch(db as any, PHONE, false)
    expect(r.tipo).toBe('nenhum')
  })

  it('#18 — resumo pessoal sem telefone vinculado NAO adivinha, retorna nao_vinculado', async () => {
    const db = novoDb()
    const r = await resolveResponsavelDispatch(db as any, PHONE, true)
    expect(r.tipo).toBe('nao_vinculado')
  })

  it('#18 — resumo pessoal com telefone vinculado resolve pelo profile_id, nunca por nome', async () => {
    const db = novoDb()
    db.seed('luizia_wa_phone_rules', [{ phone: PHONE, profile_id: GABRIEL_ID }])
    const r = await resolveResponsavelDispatch(db as any, PHONE, true)
    expect(r.tipo).toBe('resolvido')
    if (r.tipo === 'resolvido') expect(r.id).toBe(GABRIEL_ID)
  })
})

describe('gerarResumoTarefas', () => {
  it('resumo pessoal sem vínculo retorna erro e conteúdo vazio (nada é enviado)', async () => {
    const db = novoDb()
    const r = await gerarResumoTarefas(db as any, PHONE, null)
    expect(r.conteudo).toBe('')
    expect(r.erro).toMatch(/nao esta vinculado/i)
  })

  it('resumo por obra não exige vínculo e lista tarefas atrasadas da obra', async () => {
    const db = novoDb()
    db.seed('obras', [{ id: 'obra-1', nome: 'Jardim Allegra' }])
    db.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa atrasada', obra_id: 'obra-1', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01', updated_at: '2020-01-01T00:00:00Z' },
    ])
    const r = await gerarResumoTarefas(db as any, PHONE, 'obra-1')
    expect(r.erro).toBeUndefined()
    expect(r.conteudo).toContain('Tarefa atrasada')
  })

  it('resumo pessoal com vínculo filtra só tarefas do profile resolvido', async () => {
    const db = novoDb()
    db.seed('luizia_wa_phone_rules', [{ phone: PHONE, profile_id: GABRIEL_ID }])
    db.seed('tarefas', [
      { id: 't1', titulo: 'Tarefa do Gabriel atrasada', responsavel_id: GABRIEL_ID, status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01', updated_at: '2020-01-01T00:00:00Z' },
      { id: 't2', titulo: 'Tarefa de outra pessoa atrasada', responsavel_id: 'outro-id', status: 'pendente', prioridade: 'alta', data_prazo: '2020-01-01', updated_at: '2020-01-01T00:00:00Z' },
    ])
    const r = await gerarResumoTarefas(db as any, PHONE, null)
    expect(r.conteudo).toContain('Tarefa do Gabriel atrasada')
    expect(r.conteudo).not.toContain('Tarefa de outra pessoa atrasada')
  })
})
