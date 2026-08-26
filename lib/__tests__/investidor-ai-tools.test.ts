import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeDB } from './fake-supabase'
import { execInvestidorAiTool, type InvestidorAiCtx } from '../investidor-ai-tools'
import { extrairConteudoDeLink } from '../link-extract'

vi.mock('../link-extract', () => ({ extrairConteudoDeLink: vi.fn() }))

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
      prospeccao_nome: 'Vila Nova', nome_cenario: 'À vista teste', modalidade: 'vista', tipo_aquisicao: 'leilao',
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

  it('propose_create_cenario com tipo_aquisicao=compra_direta não cobra comissão de leiloeiro (Hotfix pré-reunião)', async () => {
    const proposta = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_cenario', {
      prospeccao_nome: 'Vila Nova', nome_cenario: 'Compra direta teste', modalidade: 'vista', tipo_aquisicao: 'compra_direta',
      valor_arrematacao: 225000, valor_venda_estimado: 400000, comissao_leiloeiro: 5, itbi: 3,
      registro: 5000, reforma: 10000, outros_custos: 22000, prazo_venda_meses: 6, condominio: 400,
      corretagem: 6, imposto_ganho_capital: 15,
    }, ctx())
    // 282400 (leilão) - 11250 (5% de comissão sobre 225000, que não se aplica em compra direta)
    expect(proposta).toContain('Investimento total: R$ 271.150,00')
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    const criado = db.tables.prospeccao_cenarios.find(c => c.nome === 'Compra direta teste')!
    expect(criado.tipo_aquisicao).toBe('compra_direta')
    expect(criado.investimento_total).toBeCloseTo(271150, 2)
  })

  it('propose_create_cenario sem tipo_aquisicao usa "compra_direta" como padrão quando a prospecção também não informa (Hotfix R9 — não assumir leilão)', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_cenario', {
      prospeccao_nome: 'Vila Nova', nome_cenario: 'Padrão teste', modalidade: 'vista',
      valor_arrematacao: 100000, valor_venda_estimado: 200000,
    }, ctx())
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    const criado = db.tables.prospeccao_cenarios.find(c => c.nome === 'Padrão teste')!
    expect(criado.tipo_aquisicao).toBe('compra_direta')
  })

  it('propose_create_cenario sem tipo_aquisicao herda o tipo_aquisicao da prospecção-mãe (Hotfix R9)', async () => {
    db.tables.prospeccoes[0].tipo_aquisicao = 'leilao'
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_cenario', {
      prospeccao_nome: 'Vila Nova', nome_cenario: 'Herdado da prospecção', modalidade: 'vista',
      valor_arrematacao: 100000, valor_venda_estimado: 200000,
    }, ctx())
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    const criado = db.tables.prospeccao_cenarios.find(c => c.nome === 'Herdado da prospecção')!
    expect(criado.tipo_aquisicao).toBe('leilao')
  })

  it('propose_update_cenario recalcula ao mudar uma premissa', async () => {
    db.seed('prospeccao_cenarios', [{
      id: 'c1', prospeccao_id: 'p1', nome: 'Original', modalidade: 'vista', tipo_aquisicao: 'leilao',
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

  // A proposta pendente carrega um `__alvoChave` interno (ver
  // lib/luizia-pending-actions.ts) para saber qual rascunho substituir na
  // mesma conversa. As tools que gravam o objeto inteiro (não um `patch`
  // explícito) precisam descartar essa chave antes do insert — senão o
  // Supabase real rejeita a escrita por coluna desconhecida (a FakeDB não
  // valida colunas, então só o teste de conteúdo pega essa regressão).
  it('confirm_pending_action nunca grava a chave interna __alvoChave (create_prospeccao)', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_prospeccao', { nome: 'Sem Chave Interna' }, ctx())
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    const criada = db.tables.prospeccoes.find(p => p.nome === 'Sem Chave Interna')
    expect(criada).toBeDefined()
    expect(criada).not.toHaveProperty('__alvoChave')
  })

  it('confirm_pending_action nunca grava a chave interna __alvoChave (create_cenario)', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_cenario', {
      prospeccao_nome: 'Vila Nova', nome_cenario: 'Sem Chave', modalidade: 'vista',
      valor_arrematacao: 225000, valor_venda_estimado: 400000,
    }, ctx())
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.prospeccao_cenarios[0]).not.toHaveProperty('__alvoChave')
  })
})

describe('execInvestidorAiTool — Evidências (Marco 7)', () => {
  let db: FakeDB
  beforeEach(() => {
    db = new FakeDB()
    db.seed('prospeccoes', [
      { id: 'p1', nome: 'Apto Vila Nova', endereco: 'Rua A', fase: 'nova', link_leilao: null, data_leilao: null, responsavel: null, proxima_acao: null, observacao: null, project_id: null },
    ])
  })

  it('list_evidencias diz que não há nenhuma ainda', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_evidencias', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toMatch(/ainda não tem evidências/i)
  })

  it('propose_create_evidencia exige a informação', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_evidencia', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toMatch(/preciso da informação/i)
  })

  it('propose_create_evidencia não grava nada até confirmar, e default de natureza é "observado"', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_evidencia', {
      prospeccao_nome: 'Vila Nova', informacao: 'Edital cita dívida de IPTU de R$ 8.000',
    }, ctx())
    expect(r).toMatch(/observado/i)
    expect(db.tables.prospeccao_evidencias).toBeUndefined()

    const confirm = await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(confirm).toMatch(/registrada/i)
    const criada = db.tables.prospeccao_evidencias[0]
    expect(criada.informacao).toBe('Edital cita dívida de IPTU de R$ 8.000')
    expect(criada.natureza).toBe('observado')
    expect(criada).not.toHaveProperty('__alvoChave')
  })

  it('propose_create_evidencia aceita natureza "estimado" (nunca confunde anúncio com valor observado)', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_evidencia', {
      prospeccao_nome: 'Vila Nova', informacao: 'Valor de mercado estimado em R$ 420.000 por comparáveis',
      natureza: 'estimado', tipo: 'valor de mercado',
    }, ctx())
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.prospeccao_evidencias[0].natureza).toBe('estimado')
  })

  it('get_prospeccao lista as evidências registradas junto dos cenários', async () => {
    db.seed('prospeccao_evidencias', [
      { id: 'e1', prospeccao_id: 'p1', informacao: 'Matrícula sem ônus aparente', tipo: 'matrícula', fonte: null, url: null, data_evidencia: null, natureza: 'observado' },
    ])
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'get_prospeccao', { prospeccao_nome: 'Vila Nova' }, ctx())
    expect(r).toContain('Evidências (1)')
    expect(r).toContain('Matrícula sem ônus aparente')
  })
})

describe('execInvestidorAiTool — extrair_link (Marco 7)', () => {
  const db = new FakeDB()
  const extrairMock = vi.mocked(extrairConteudoDeLink)

  beforeEach(() => {
    extrairMock.mockReset()
  })

  it('pede a URL quando não informada', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'extrair_link', {}, ctx())
    expect(r).toMatch(/preciso da url/i)
    expect(extrairMock).not.toHaveBeenCalled()
  })

  it('retorna o texto extraído quando a extração funciona', async () => {
    extrairMock.mockResolvedValue({ ok: true, texto: 'Edital do leilão: lance mínimo R$ 150.000,00', truncado: false })
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'extrair_link', { url: 'https://exemplo.com/edital' }, ctx())
    expect(extrairMock).toHaveBeenCalledWith('https://exemplo.com/edital')
    expect(r).toContain('https://exemplo.com/edital')
    expect(r).toContain('lance mínimo R$ 150.000,00')
  })

  it('repassa o erro de forma clara quando a extração falha, sem inventar conteúdo', async () => {
    extrairMock.mockResolvedValue({ ok: false, erro: 'A página respondeu com erro 404.' })
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'extrair_link', { url: 'https://exemplo.com/nao-existe' }, ctx())
    expect(r).toMatch(/não consegui acessar/i)
    expect(r).toContain('404')
  })
})

describe('execInvestidorAiTool — Rotinas e Agentes (Marco 8)', () => {
  let db: FakeDB
  beforeEach(() => {
    db = new FakeDB()
    db.seed('prospeccoes', [
      { id: 'p1', nome: 'Apto Vila Nova', endereco: 'Rua A', fase: 'nova', link_leilao: null, data_leilao: null, responsavel: null, proxima_acao: null, observacao: null, project_id: null },
    ])
  })

  it('list_agentes_investidor e list_rotinas_investidor são leitura', async () => {
    db.seed('investidor_agentes', [{ id: 'ag1', nome: 'Agente de Prospecção', tipo: 'prospeccao', ativo: true, permissoes: ['read', 'propose'] }])
    db.seed('investidor_rotinas', [{ id: 'r1', agente_id: 'ag1', nome: 'Triagem semanal', tipo: 'triagem_prospeccoes', frequencia: 'manual', ativo: true, ultima_execucao: null }])

    const agentes = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_agentes_investidor', {}, ctx())
    const rotinas = await execInvestidorAiTool(db as unknown as SupabaseClient, 'list_rotinas_investidor', {}, ctx())

    expect(agentes).toContain('Agente de Prospecção')
    expect(rotinas).toContain('Triagem semanal')
    expect(db.tables.investidor_rotina_runs).toBeUndefined()
  })

  it('propose_create_rotina_investidor não cria rotina até confirmar', async () => {
    db.seed('investidor_agentes', [{ id: 'ag1', nome: 'Agente de Prospecção', tipo: 'prospeccao', ativo: true, permissoes: ['read', 'propose'] }])

    const proposta = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_create_rotina_investidor', { nome: 'Triagem assistida' }, ctx())
    expect(proposta).toMatch(/confirmar cria/i)
    expect(db.tables.investidor_rotinas).toBeUndefined()

    await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(db.tables.investidor_rotinas[0].nome).toBe('Triagem assistida')
  })

  it('propose_run_rotina_investidor só executa após confirmar e não altera prospecções', async () => {
    db.seed('investidor_agentes', [{ id: 'ag1', nome: 'Agente de Prospecção', tipo: 'prospeccao', ativo: true, permissoes: ['read', 'propose'] }])
    db.seed('investidor_rotinas', [{ id: 'r1', agente_id: 'ag1', nome: 'Triagem semanal', tipo: 'triagem_prospeccoes', frequencia: 'manual', ativo: true, ultima_execucao: null }])
    const antes = JSON.stringify(db.tables.prospeccoes)

    const proposta = await execInvestidorAiTool(db as unknown as SupabaseClient, 'propose_run_rotina_investidor', { rotina_nome: 'Triagem' }, ctx())
    expect(proposta).toMatch(/executar agora/i)
    expect(db.tables.investidor_rotina_runs).toBeUndefined()

    const confirm = await execInvestidorAiTool(db as unknown as SupabaseClient, 'confirm_pending_action', {}, ctx())
    expect(confirm).toMatch(/executada/i)
    expect(db.tables.investidor_rotina_runs.length).toBe(1)
    expect(JSON.stringify(db.tables.prospeccoes)).toBe(antes)
  })
})

describe('execInvestidorAiTool — Skill 1: Pesquisa e Análise de Mercado', () => {
  let db: FakeDB
  beforeEach(() => {
    db = new FakeDB()
    db.seed('prospeccoes', [
      { id: 'p1', nome: 'São Manoel — Edifício Princesa', endereco: 'Rua São Manoel, 1340', fase: 'em_analise', proxima_acao: null, link_leilao: null, observacao: null, project_id: null, data_leilao: null },
    ])
  })

  it('preencher_ficha_extraida cria a ficha na primeira extração (sem propor/confirmar)', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'preencher_ficha_extraida', {
      prospeccao_nome: 'São Manoel',
      fonte_tipo: 'link',
      fonte_url: 'https://exemplo.com/anuncio',
      dados: { tipo: 'cobertura', area: 140, dormitorios: 3, estado_conservacao: 'reformado' },
    }, ctx())
    expect(r).toMatch(/ficha.*atualizada/i)
    expect(db.tables.prospeccao_ficha.length).toBe(1)
    expect(db.tables.prospeccao_ficha[0].dados_extraidos).toEqual({ tipo: 'cobertura', area: 140, dormitorios: 3, estado_conservacao: 'reformado' })
    expect(db.tables.prospeccao_ficha[0].status).toBe('parcial')
  })

  it('preencher_ficha_extraida faz merge com a ficha existente, sem sobrescrever o que não veio nesta chamada', async () => {
    db.seed('prospeccao_ficha', [{ id: 'f1', prospeccao_id: 'p1', fonte_tipo: 'link', fonte_url: 'https://exemplo.com/1', dados_extraidos: { area: 140, dormitorios: 3 }, dados_confirmados: {}, conflitos: [], status: 'parcial' }])
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'preencher_ficha_extraida', {
      prospeccao_nome: 'São Manoel', dados: { preco_anunciado: 355000 },
    }, ctx())
    expect(db.tables.prospeccao_ficha.length).toBe(1)
    expect(db.tables.prospeccao_ficha[0].dados_extraidos).toEqual({ area: 140, dormitorios: 3, preco_anunciado: 355000 })
  })

  it('preencher_ficha_extraida nunca rebaixa uma ficha já validada de volta para parcial', async () => {
    db.seed('prospeccao_ficha', [{ id: 'f1', prospeccao_id: 'p1', fonte_tipo: 'link', fonte_url: null, dados_extraidos: { area: 140 }, dados_confirmados: { area: 140 }, conflitos: [], status: 'validada' }])
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'preencher_ficha_extraida', {
      prospeccao_nome: 'São Manoel', dados: { vagas: 0 },
    }, ctx())
    expect(db.tables.prospeccao_ficha[0].status).toBe('validada')
  })

  it('registrar_comparaveis_brutos grava direto (sem propor/confirmar) e preserva url_confirmada=false quando o link individual não foi achado', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'registrar_comparaveis_brutos', {
      prospeccao_nome: 'São Manoel',
      comparaveis: [
        { titulo: 'Cobertura 171m² mesmo prédio', preco: 750000, area: 171, dormitorios: 3, vagas: 1, fonte: 'Foxter', url: 'https://exemplo.com/empreendimento/3872', url_confirmada: false, similaridade: 'mesmo_predio', diferencas: 'Tem vaga, padrão superior' },
        { preco: 399000, area: 144 },
      ],
    }, ctx())
    expect(r).toMatch(/2 comparável/i)
    expect(db.tables.prospeccao_comparaveis.length).toBe(2)
    expect(db.tables.prospeccao_comparaveis[0].url_confirmada).toBe(false)
    expect(db.tables.prospeccao_comparaveis[0].similaridade).toBe('mesmo_predio')
    expect(db.tables.prospeccao_comparaveis[0].salvo).toBe(false)
    expect(db.tables.prospeccao_comparaveis[0].favorito).toBe(false)
  })

  it('registrar_comparaveis_brutos nunca inventa similaridade fora do enum', async () => {
    await execInvestidorAiTool(db as unknown as SupabaseClient, 'registrar_comparaveis_brutos', {
      prospeccao_nome: 'São Manoel',
      comparaveis: [{ preco: 500000, similaridade: 'planeta_marte' }],
    }, ctx())
    expect(db.tables.prospeccao_comparaveis[0].similaridade).toBeNull()
  })

  it('registrar_analise_mercado não grava nada — só formata a entrega para a tela (snapshot só acontece ao Encerrar, feito pela UI)', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'registrar_analise_mercado', {
      resumo: 'Comparáveis do mesmo prédio pesaram mais. Faixa considera necessidade de reforma.',
      faixa_conservadora: 380000,
      faixa_base: 420000,
      faixa_otimista: 460000,
      pendencias: 'Confirmar estado da cobertura vizinha.',
    }, ctx())
    expect(r).toMatch(/aba mercado/i)
    expect(db.tables.prospeccao_analises_mercado).toBeUndefined()
    expect(db.tables.prospeccao_comparaveis).toBeUndefined()
  })

  it('registrar_analise_mercado exige o resumo', async () => {
    const r = await execInvestidorAiTool(db as unknown as SupabaseClient, 'registrar_analise_mercado', {}, ctx())
    expect(r).toMatch(/preciso do texto/i)
  })
})
