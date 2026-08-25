import { describe, it, expect } from 'vitest'
import { calcularCenario, type PremissasCenario } from '../investidor-calculadora'

// Valores-ouro extraídos/derivados de "Calculadora do Leilão.xlsx" (anexo do
// usuário, teste-ouro da especificação do Investidor). O caso "à vista" usa
// os valores já calculados e salvos no próprio arquivo (aba "Pagamento à
// Vista", células D31/D38/E41/D41). Os casos SAC/PRICE foram derivados
// executando em Python as mesmas fórmulas literais das abas "Pagamento
// Financiado"+"SAC"/"PRICE" do arquivo — necessário porque, no arquivo
// original, as abas de exemplo "_SAC"/"_PRICE" estão desconectadas (a
// tabela de amortização que elas leem é alimentada pela aba "Pagamento
// Financiado", que fica zerada) — ver RELATORIO_INVESTIDOR_RODADA_03.md.

describe('calcularCenario — à vista (valores nativos da planilha)', () => {
  const premissas: PremissasCenario = {
    modalidade: 'vista',
    valor_arrematacao: 225000,
    valor_venda_estimado: 400000,
    comissao_leiloeiro: 0.05,
    itbi: 0.03,
    registro: 5000,
    advogado_desocupacao: 0,
    reforma: 10000,
    outros_custos: 22000,
    prazo_venda_meses: 6,
    iptu: 0,
    condominio: 400,
    corretagem: 0.06,
    imposto_ganho_capital: 0.15,
    entrada: null,
    taxa_juros: null,
    prazo_financiamento_meses: null,
  }

  it('reproduz D31 (Total de Custos) = 282400', () => {
    expect(calcularCenario(premissas).investimento_total).toBeCloseTo(282400, 2)
  })

  it('reproduz D38 (Valor Real de Venda) = 358300', () => {
    expect(calcularCenario(premissas).valor_liquido_venda).toBeCloseTo(358300, 2)
  })

  it('reproduz E41 (lucro absoluto) = 75900', () => {
    expect(calcularCenario(premissas).lucro).toBeCloseTo(75900, 2)
  })

  it('reproduz D41 (rentabilidade) = 26,87677054%', () => {
    expect(calcularCenario(premissas).rentabilidade).toBeCloseTo(26.87677054, 4)
  })
})

describe('calcularCenario — SAC (derivado das fórmulas literais da planilha)', () => {
  const premissas: PremissasCenario = {
    modalidade: 'sac',
    valor_arrematacao: 100000,
    valor_venda_estimado: 200000,
    entrada: 0.2,
    taxa_juros: 0.06,
    prazo_financiamento_meses: 12,
    comissao_leiloeiro: 0.05,
    itbi: 0.03,
    registro: 1800,
    advogado_desocupacao: 0,
    reforma: 1000,
    outros_custos: 0,
    prazo_venda_meses: 12,
    iptu: 100,
    condominio: 400,
    corretagem: 0.06,
    imposto_ganho_capital: 0.15,
  }

  it('percentual/valor financiado automáticos (D19/E19 da planilha)', () => {
    const r = calcularCenario(premissas)
    expect(r.percentual_financiado).toBeCloseTo(0.8, 6)
    expect(r.valor_financiado).toBeCloseTo(80000, 2)
  })

  it('investimento_total ≈ 119331,13 (F39/G39)', () => {
    expect(calcularCenario(premissas).investimento_total).toBeCloseTo(119331.13, 1)
  })

  it('valor_liquido_venda ≈ 176799,67 (G47)', () => {
    expect(calcularCenario(premissas).valor_liquido_venda).toBeCloseTo(176799.67, 1)
  })

  it('lucro ≈ 57468,54 (G51)', () => {
    expect(calcularCenario(premissas).lucro).toBeCloseTo(57468.54, 1)
  })

  it('rentabilidade ≈ 48,1589% (G52, corrigido o bug de cópia da planilha original)', () => {
    expect(calcularCenario(premissas).rentabilidade).toBeCloseTo(48.1589, 2)
  })
})

describe('calcularCenario — PRICE (derivado das fórmulas literais da planilha)', () => {
  const premissas: PremissasCenario = {
    modalidade: 'price',
    valor_arrematacao: 100000,
    valor_venda_estimado: 200000,
    entrada: 0.2,
    taxa_juros: 0.06,
    prazo_financiamento_meses: 12,
    comissao_leiloeiro: 0.05,
    itbi: 0.03,
    registro: 1800,
    advogado_desocupacao: 0,
    reforma: 1000,
    outros_custos: 0,
    prazo_venda_meses: 12,
    iptu: 100,
    condominio: 400,
    corretagem: 0.06,
    imposto_ganho_capital: 0.15,
  }

  it('investimento_total ≈ 119353,66 (F39)', () => {
    expect(calcularCenario(premissas).investimento_total).toBeCloseTo(119353.66, 1)
  })

  it('valor_liquido_venda ≈ 176803,05 (F47)', () => {
    expect(calcularCenario(premissas).valor_liquido_venda).toBeCloseTo(176803.05, 1)
  })

  it('lucro ≈ 57449,39 (F51)', () => {
    expect(calcularCenario(premissas).lucro).toBeCloseTo(57449.39, 1)
  })

  it('rentabilidade ≈ 48,1337% (F52)', () => {
    expect(calcularCenario(premissas).rentabilidade).toBeCloseTo(48.1337, 2)
  })

  it('SAC e PRICE não empatam por acaso (evita regressão do bug de cópia G52=F52 do arquivo original)', () => {
    const sac = calcularCenario({ ...premissas, modalidade: 'sac' })
    const price = calcularCenario(premissas)
    expect(sac.rentabilidade).not.toBeCloseTo(price.rentabilidade, 3)
  })
})

describe('calcularCenario — casos de borda', () => {
  it('financiamento quitado antes da venda: saldo devedor tratado como 0, não "-"', () => {
    const r = calcularCenario({
      modalidade: 'sac',
      valor_arrematacao: 100000,
      valor_venda_estimado: 200000,
      entrada: 0.5,
      taxa_juros: 0.06,
      prazo_financiamento_meses: 6,
      prazo_venda_meses: 24, // vende bem depois de quitar o financiamento de 6 meses
      comissao_leiloeiro: 0,
      itbi: 0,
      registro: 0,
      advogado_desocupacao: 0,
      reforma: 0,
      outros_custos: 0,
      iptu: 0,
      condominio: 0,
      corretagem: 0,
      imposto_ganho_capital: 0,
    })
    expect(Number.isFinite(r.lucro)).toBe(true)
    expect(r.valor_liquido_venda).toBeCloseTo(200000, 6) // sem saldo devedor a abater
  })

  it('cenário 100% vazio não gera NaN/Infinity (guarda contra divisão por zero)', () => {
    const r = calcularCenario({
      modalidade: 'vista',
      valor_arrematacao: null,
      valor_venda_estimado: null,
      comissao_leiloeiro: null,
      itbi: null,
      registro: null,
      advogado_desocupacao: null,
      reforma: null,
      outros_custos: null,
      prazo_venda_meses: null,
      iptu: null,
      condominio: null,
      corretagem: null,
      imposto_ganho_capital: null,
      entrada: null,
      taxa_juros: null,
      prazo_financiamento_meses: null,
    })
    expect(r.investimento_total).toBe(0)
    expect(r.rentabilidade).toBe(0)
    expect(Number.isFinite(r.lucro)).toBe(true)
  })
})
