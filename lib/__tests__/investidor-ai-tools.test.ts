import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { execInvestidorAiTool, type InvestidorAiCtx } from '../investidor-ai-tools'

// Testa lib/investidor-ai-tools.ts sem rede (o sandbox bloqueia
// *.supabase.co), com o mesmo FakeDB em memória já usado por
// tarefas-ai-tools.test.ts. Cobre: resolução segura por nome (única/
// ambígua/não encontrada), o ciclo propor→confirmar/rejeitar (nunca escreve
// direto), e que o motor de cálculo (lib/investidor-calculadora.ts) é
// realmente usado — não uma cópia — ao propor um cenário.

function ctx(overrides: Partial<InvestidorAiCtx> = {}): InvestidorAiCtx {
  return { actor: 'Teste', origem: 'floating', profileId: 'user-1', conversationKey: 'floating:user-1', ...overrides }
}

describe('execInvestidorAiTool — leitura', () => {
  let db: FakeDB
  beforeEach(() => {
    db = new FakeDB()
    db.seed('prospeccoes', [
      { id: 'p1', nome: 'Apto Vila Nova', endereco: 'Rua A', fase: 'em_analise', proxima_acao: null, link_leilao: null, observacao: null, project_id: null, data_leilao: null },
      { id: 'p2', nome: 'Casa Jardim Europa', endereco: 'Rua B', fase: 'adquirida', proxima_acao: null, link_leilao: null, observacao: null, project_id: null, data_leilao: null },
    ])
    db.seed('prospeccao_cenarios', [
      { id: 'c1', prospeccao_id: 'p1', nome: 'Único', modalidade: 'vista', principal: true, valor_arrematacao: 225000, valor_venda_estimado: 400000, investimento_total: 282400, valor_liquido_venda: 358300, lucro: 75900, rentabilidade: 26.88, prazo_venda_meses: 6 },
    ])
    db.seed('projetos', [
      { id: 'ativo1', nome: 'Ex-Prospecção Convertida', endereco: 'Rua C', fase_ciclo: 'em_obra', contexto: 'investimento' },
      { id: 'projnormal', nome: 'Projeto comum', endereco: null, fase_ciclo: 'projeto', contexto: 'projeto' },
    ])
  })

  it('list_prospeccoes lista todas por padrão', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_prospeccoes', {}, ctx())
    expect(r).toContain('Apto Vila Nova')
    expect(r).toContain('Casa Jardim Europa')
  })

  it('list_prospeccoes mostra o resultado do cenário principal quando existe', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_prospeccoes', {}, ctx())
    expect(r).toContain('lucro estimado')
  })

  it('list_prospeccoes filtra por fase', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_prospeccoes', { fase: 'adquirida' }, ctx())
    expect(r).toContain('Casa Jardim Europa')
    expect(r).not.toContain('Apto Vila Nova')
  })

  it('get_prospeccao por nome único traz o cenário', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'get_prospeccao', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toContain('Apto Vila Nova')
    expect(r).toContain('PRINCIPAL')
    expect(r).toContain('R$')
  })

  it('get_prospeccao sem nome nenhum, sem fixedProspeccaoId, pede o nome', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'get_prospeccao', {}, ctx())
    expect(r).toMatch(/nome da prospec/i)
  })

  it('fixedProspeccaoId (usuário dentro da tela da prospecção) resolve sem precisar do nome', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'get_prospeccao', {}, ctx({ fixedProspeccaoId: 'p2' }))
    expect(r).toContain('Casa Jardim Europa')
  })

  it('nome ambíguo nunca escolhe sozinho', async () => {
    db.seed('prospeccoes', [
      ...db.tables.prospeccoes,
      { id: 'p3', nome: 'Apto Vila Nova II', endereco: 'Rua D', fase: 'nova', project_id: null },
    ])
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'get_prospeccao', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toMatch(/qual deles/i)
  })

  it('nome não encontrado diz claramente, não inventa', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'get_prospeccao', { prospeccao_nome: 'Não Existe Nada Assim' }, ctx())
    expect(r).toMatch(/não encontrei/i)
  })

  it('list_ativos só traz contexto=investimento', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_ativos', {}, ctx())
    expect(r).toContain('Ex-Prospecção Convertida')
    expect(r).not.toContain('Projeto comum')
  })

  it('compare_prospeccoes exige pelo menos 2 nomes', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'compare_prospeccoes', { nomes: ['Vila Nova'] }, ctx())
    expect(r).toMatch(/pelo menos 2/i)
  })

  it('compare_prospeccoes mostra os indicadores do cenário principal', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'compare_prospeccoes', { nomes: ['Vila Nova', 'Jardim Europa'] }, ctx())
    expect(r).toContain('Apto Vila Nova')
    expect(r).toContain('Investimento total: R$')
    expect(r).toContain('sem cenário principal') // Jardim Europa não tem cenário
  })
})

describe('execInvestidorAiTool — propor → confirmar/rejeitar (nunca escreve direto)', () => {
  let db: FakeDB
  beforeEach(() => {
    db = new FakeDB()
    db.seed('prospeccoes', [
      { id: 'p1', nome: 'Apto Vila Nova', endereco: 'Rua A', fase: 'nova', link_leilao: null, data_leilao: null, responsavel: null, proxima_acao: null, observacao: null, project_id: null },
    ])
  })

  it('propose_create_prospeccao não cria nada até confirmar', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_prospeccao', { nome: 'Casa Nova Teste' }, ctx())
    expect(r).toMatch(/confirmar cria/i)
    expect(db.tables.prospeccoes?.some(p => p.nome === 'Casa Nova Teste')).toBeFalsy()

    const confirm = await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(confirm).toMatch(/criada/i)
    expect(db.tables.prospeccoes?.some(p => p.nome === 'Casa Nova Teste')).toBe(true)
  })

  it('reject_pending_action descarta sem escrever', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_prospeccao', { nome: 'Não Deve Existir' }, ctx())
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'reject_pending_action', {}, ctx())
    expect(r).toMatch(/não vou alterar/i)
    expect(db.tables.prospeccoes?.some(p => p.nome === 'Não Deve Existir')).toBeFalsy()
  })

  it('propose_update_prospeccao só altera após confirmar', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_update_prospeccao', { prospeccao_nome: 'Vila Nova', fase: 'adquirida' }, ctx())
    expect(db.tables.prospeccoes[0].fase).toBe('nova')
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.prospeccoes[0].fase).toBe('adquirida')
  })

  it('propose_create_cenario calcula o resultado ANTES de confirmar (mesmo motor do Marco 3) e persiste o mesmo resultado ao confirmar', async () => {
    const proposta = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_cenario', {
      prospeccao_nome: 'Vila Nova', nome_cenario: 'À vista teste', modalidade: 'vista',
      valor_arrematacao: 225000, valor_venda_estimado: 400000, comissao_leiloeiro: 5, itbi: 3,
      registro: 5000, reforma: 10000, outros_custos: 22000, prazo_venda_meses: 6, condominio: 400,
      corretagem: 6, imposto_ganho_capital: 15,
    }, ctx())
    // Mesmos valores-ouro da planilha usados em investidor-calculadora.test.ts
    expect(proposta).toContain('Investimento total: R$ 282.400,00')
    expect(proposta).toContain('Lucro: R$ 75.900,00')

    expect(db.tables.prospeccao_cenarios).toBeUndefined()
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    const criado = db.tables.prospeccao_cenarios[0]
    expect(criado.investimento_total).toBeCloseTo(282400, 2)
    expect(criado.lucro).toBeCloseTo(75900, 2)
  })

  it('propose_update_cenario recalcula ao mudar uma premissa', async () => {
    db.seed('prospeccao_cenarios', [{
      id: 'c1', prospeccao_id: 'p1', nome: 'Original', modalidade: 'vista',
      valor_arrematacao: 225000, valor_venda_estimado: 400000, comissao_leiloeiro: 0.05, itbi: 0.03,
      registro: 5000, advogado_desocupacao: 0, reforma: 10000, outros_custos: 22000,
      prazo_venda_meses: 6, iptu: 0, condominio: 400, corretagem: 0.06, imposto_ganho_capital: 0.15,
      investimento_total: 282400, valor_liquido_venda: 358300, lucro: 75900, rentabilidade: 26.88,
    }])
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_update_cenario', {
      prospeccao_nome: 'Vila Nova', nome_cenario: 'Original', reforma: 0,
    }, ctx())
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    const atualizado = db.tables.prospeccao_cenarios[0]
    expect(atualizado.reforma).toBe(0)
    expect(atualizado.investimento_total).toBeCloseTo(272400, 2) // 282400 - 10000 de reforma
  })

  it('propose_delete_cenario só remove após confirmar', async () => {
    db.seed('prospeccao_cenarios', [{ id: 'c1', prospeccao_id: 'p1', nome: 'Para Excluir', modalidade: 'vista' }])
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_delete_cenario', { prospeccao_nome: 'Vila Nova', nome_cenario: 'Para Excluir' }, ctx())
    expect(db.tables.prospeccao_cenarios.length).toBe(1)
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.prospeccao_cenarios.length).toBe(0)
  })

  it('propose_set_cenario_principal troca o principal via RPC só ao confirmar', async () => {
    db.seed('prospeccao_cenarios', [
      { id: 'c1', prospeccao_id: 'p1', nome: 'A', modalidade: 'vista', principal: true },
      { id: 'c2', prospeccao_id: 'p1', nome: 'B', modalidade: 'sac', principal: false },
    ])
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_set_cenario_principal', { prospeccao_nome: 'Vila Nova', nome_cenario: 'B' }, ctx())
    expect(db.tables.prospeccao_cenarios.find(c => c.id === 'c2')!.principal).toBe(false)
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.prospeccao_cenarios.find(c => c.id === 'c1')!.principal).toBe(false)
    expect(db.tables.prospeccao_cenarios.find(c => c.id === 'c2')!.principal).toBe(true)
  })

  it('propose_convert_to_ativo recusa se a fase não é "adquirida"', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_convert_to_ativo', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toMatch(/precisa estar com fase/i)
  })

  it('propose_convert_to_ativo cria o Project e vincula project_id só ao confirmar', async () => {
    db.tables.prospeccoes[0].fase = 'adquirida'
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_convert_to_ativo', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(db.tables.projetos).toBeUndefined()
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.projetos.length).toBe(1)
    expect(db.tables.projetos[0].contexto).toBe('investimento')
    expect(db.tables.prospeccoes[0].project_id).toBe(db.tables.projetos[0].id)
  })

  it('propose_convert_to_ativo recusa se já foi convertida', async () => {
    db.tables.prospeccoes[0].fase = 'adquirida'
    db.tables.prospeccoes[0].project_id = 'ja-convertida'
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_convert_to_ativo', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toMatch(/já foi convertida/i)
  })
})
