import { describe, expect, it } from 'vitest'
import { agruparPorEtapa, calcularGerenciamento, calcularTotal, calcularTotalOperacional, type LinhaArvore } from '../orcamento/arvore'

function linha(overrides: Partial<LinhaArvore>): LinhaArvore {
  return {
    orcamento_id: 'orc-1',
    etapa_id: 'etapa-1',
    etapa_nome: 'Etapa 1',
    etapa_ordem: 1,
    grupo_id: null,
    grupo_nome: null,
    item_id: 'item-1',
    tipo_linha: 'item',
    tipo_item_snapshot: 'ITEM_LIVRE',
    item_descricao: 'Item',
    item_codigo: null,
    quantidade: 1,
    unidade: 'UN',
    classificacao: 'MATERIAL_SERVICOS',
    ordem: null,
    composicao_id: null,
    sinapi_composicao_id: null,
    subetapa_valor_manual_ativo: null,
    valor_total_manual_ativo: null,
    preco_unitario_snapshot: null,
    valor: 0,
    ...overrides,
  }
}

// P4.4: financeiro.ts e planejamento-progresso.ts passaram a somar `valor`
// (já canônico, vindo de orcamento_arvore_valores) em vez de recalcular
// quantidade × preço em paralelo — calcularTotal é a mesma função usada
// pelos três lugares agora.
describe('calcularTotal', () => {
  it('soma os itens-folha e ignora o header de subetapa sem valor manual', () => {
    const linhas = [
      linha({ item_id: 'i1', valor: 100 }),
      linha({ item_id: 'i2', valor: 200, grupo_id: 'sub-1' }),
      linha({ item_id: 'sub-1', tipo_linha: 'subetapa', valor: 0, subetapa_valor_manual_ativo: false }),
    ]
    expect(calcularTotal(linhas)).toBe(300)
  })

  it('substitui o valor calculado dos itens do grupo pelo valor manual da subetapa (não soma)', () => {
    const linhas = [
      linha({ item_id: 'i1', valor: 100, grupo_id: 'sub-1' }),
      linha({ item_id: 'i2', valor: 200, grupo_id: 'sub-1' }),
      linha({ item_id: 'sub-1', tipo_linha: 'subetapa', valor: 500, subetapa_valor_manual_ativo: true }),
      linha({ item_id: 'i3', valor: 50 }),
    ]
    // 500 (manual, substitui os 300 calculados do grupo) + 50 (item solto)
    expect(calcularTotal(linhas)).toBe(550)
  })

  it('respeita valor_total_manual_ativo de um item individual (já resolvido em `valor` pela RPC)', () => {
    // orcamento_item_valor() já devolve o valor informado quando
    // valor_total_manual_ativo está ativo — aqui só confirmamos que
    // calcularTotal não reprocessa isso, apenas soma o que veio.
    const linhas = [linha({ item_id: 'i1', valor: 5000, valor_total_manual_ativo: true, preco_unitario_snapshot: 620, quantidade: 7 })]
    expect(calcularTotal(linhas)).toBe(5000)
  })
})

describe('agruparPorEtapa', () => {
  it('agrupa por etapa e não conta duas vezes item de subetapa manual', () => {
    const linhas = [
      linha({ item_id: 'i1', valor: 100, grupo_id: 'sub-1', etapa_id: 'e1', etapa_nome: 'Fundação' }),
      linha({ item_id: 'sub-1', tipo_linha: 'subetapa', valor: 300, subetapa_valor_manual_ativo: true, etapa_id: 'e1', etapa_nome: 'Fundação' }),
      linha({ item_id: 'i2', valor: 50, etapa_id: 'e2', etapa_nome: 'Alvenaria', etapa_ordem: 2 }),
    ]
    const etapas = agruparPorEtapa(linhas)
    expect(etapas.find(e => e.id === 'e1')?.valor).toBe(300)
    expect(etapas.find(e => e.id === 'e2')?.valor).toBe(50)
  })
})

// P4.4 P1: gerenciamento_valor_fixo vence o percentual quando definido —
// corrige o arredondamento de converter R$123.100,00 sobre R$500.250,00 em
// percentual (24,6077% não fecha exato na volta).
describe('calcularGerenciamento', () => {
  it('usa o valor fixo quando definido, ignorando o percentual', () => {
    expect(calcularGerenciamento(500250, 24.6077, 123100)).toBe(123100)
  })

  it('cai no percentual quando o valor fixo é null', () => {
    expect(calcularGerenciamento(500250, 10, null)).toBeCloseTo(50025, 6)
  })
})

describe('calcularTotalOperacional', () => {
  it('reproduz o caso real Allegra: custo direto + gerenciamento fixo, sem BDI', () => {
    const r = calcularTotalOperacional({
      custoDireto: 500250,
      bdiPercentual: 0,
      gerenciamentoPercentual: 0,
      gerenciamentoValorFixo: 123100,
    })
    expect(r.custoDireto).toBe(500250)
    expect(r.bdi).toBe(0)
    expect(r.gerenciamento).toBe(123100)
    expect(r.total).toBe(623350)
  })

  it('sem valor fixo, mantém o comportamento anterior (BDI + gerenciamento % somados sobre o direto)', () => {
    const r = calcularTotalOperacional({
      custoDireto: 1000,
      bdiPercentual: 25,
      gerenciamentoPercentual: 10,
      gerenciamentoValorFixo: null,
    })
    expect(r.total).toBe(1350) // 1000 + 250 (bdi) + 100 (gerenciamento)
  })
})
