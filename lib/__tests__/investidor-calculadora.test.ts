import { describe, it, expect } from 'vitest'
import { calcularCenario, pendenciasCenario, resultadoCenarioValido, type PremissasCenario } from '../investidor-calculadora'

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
    tipo_aquisicao: 'leilao',
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
    tipo_aquisicao: 'leilao',
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
    tipo_aquisicao: 'leilao',
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
    expect(sac.rentabilidade!).not.toBeCloseTo(price.rentabilidade!, 3)
  })
})

describe('calcularCenario — casos de borda', () => {
  it('financiamento quitado antes da venda: saldo devedor tratado como 0, não "-"', () => {
    const r = calcularCenario({
      modalidade: 'sac',
      tipo_aquisicao: 'leilao',
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

  it('cenário 100% vazio não gera NaN/Infinity, e sem valor de aquisição/venda o resultado é null (não 0)', () => {
    const r = calcularCenario({
      modalidade: 'vista',
      tipo_aquisicao: 'leilao',
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
    expect(r.investimento_total).toBeNull()
    expect(r.rentabilidade).toBeNull()
    expect(r.lucro).toBeNull()
    expect(r.valor_liquido_venda).toBeNull()
  })
})

// Hotfix (Ajuste de fluxo do Investidor): sem valor de aquisição e/ou de
// venda estimado, lucro/rentabilidade não podem ser exibidos como um
// resultado válido — caso real que motivou a correção: "Bella teste
// pesquisa" tinha valor_arrematacao=379900 e valor_venda_estimado=null, e o
// motor antigo (via n() tratando null como 0) calculava rentabilidade=-85%.
describe('calcularCenario — resultado incompleto quando falta valor de aquisição/venda', () => {
  const base: PremissasCenario = {
    modalidade: 'vista',
    tipo_aquisicao: 'leilao',
    valor_arrematacao: 379900,
    valor_venda_estimado: null,
    comissao_leiloeiro: 0.05,
    itbi: 0.03,
    registro: 0,
    advogado_desocupacao: 0,
    reforma: 0,
    outros_custos: 0,
    prazo_venda_meses: 0,
    iptu: 0,
    condominio: 0,
    corretagem: 0.06,
    imposto_ganho_capital: 0.15,
    entrada: null,
    taxa_juros: null,
    prazo_financiamento_meses: null,
  }

  it('sem valor de venda estimado: investimento_total continua válido, mas lucro/rentabilidade/valor_liquido_venda ficam null (não -85%)', () => {
    const r = calcularCenario(base)
    expect(r.investimento_total).toBeCloseTo(379900 + 0.05 * 379900 + 0.03 * 379900, 2)
    expect(r.valor_liquido_venda).toBeNull()
    expect(r.lucro).toBeNull()
    expect(r.rentabilidade).toBeNull()
  })

  it('sem valor de aquisição: investimento_total também fica null (depende da arrematação)', () => {
    const r = calcularCenario({ ...base, valor_arrematacao: null, valor_venda_estimado: 400000 })
    expect(r.investimento_total).toBeNull()
    expect(r.valor_liquido_venda).toBeNull()
    expect(r.lucro).toBeNull()
    expect(r.rentabilidade).toBeNull()
  })

  it('com os dois valores presentes, o resultado volta a ser numérico normalmente', () => {
    const r = calcularCenario({ ...base, valor_venda_estimado: 500000 })
    expect(r.lucro).not.toBeNull()
    expect(r.rentabilidade).not.toBeNull()
  })
})

// Base do IR sobre ganho de capital nunca pode ser negativa — uma venda
// abaixo do custo de aquisição+custos não pode gerar "imposto negativo" que
// infla artificialmente o valor líquido de venda.
describe('calcularCenario — base de ganho de capital nunca é negativa', () => {
  it('venda estimada abaixo do custo total: base de IR é 0, não negativa', () => {
    const r = calcularCenario({
      modalidade: 'vista',
      tipo_aquisicao: 'compra_direta',
      valor_arrematacao: 300000,
      valor_venda_estimado: 250000, // venda abaixo do custo de aquisição
      comissao_leiloeiro: 0,
      itbi: 0.03,
      registro: 0,
      advogado_desocupacao: 0,
      reforma: 0,
      outros_custos: 0,
      prazo_venda_meses: 0,
      iptu: 0,
      condominio: 0,
      corretagem: 0.06,
      imposto_ganho_capital: 0.15,
      entrada: null,
      taxa_juros: null,
      prazo_financiamento_meses: null,
    })
    // Sem o clamp, a base ficaria negativa e o IR "negativo" infiaria o
    // valor líquido de venda para além de venda - comissão do corretor.
    const comissaoCorretor = 0.06 * 250000
    expect(r.valor_liquido_venda).toBeCloseTo(250000 - comissaoCorretor, 2)
    expect(r.lucro).toBeLessThan(0) // prejuízo real, mas sem IR negativo mascarando
  })
})

describe('pendenciasCenario / resultadoCenarioValido', () => {
  it('sem pendências quando os dois valores estão presentes', () => {
    expect(pendenciasCenario({ valor_arrematacao: 100000, valor_venda_estimado: 200000 })).toEqual([])
  })

  it('aponta os campos que faltam', () => {
    expect(pendenciasCenario({ valor_arrematacao: null, valor_venda_estimado: 200000 })).toEqual(['valor_arrematacao'])
    expect(pendenciasCenario({ valor_arrematacao: 100000, valor_venda_estimado: null })).toEqual(['valor_venda_estimado'])
    expect(pendenciasCenario({ valor_arrematacao: null, valor_venda_estimado: null })).toEqual(['valor_arrematacao', 'valor_venda_estimado'])
  })

  it('resultadoCenarioValido é true só quando não há pendência e lucro/rentabilidade estão preenchidos', () => {
    expect(resultadoCenarioValido({ valor_arrematacao: 100000, valor_venda_estimado: 200000, lucro: 50000, rentabilidade: 10 })).toBe(true)
  })

  it('resultadoCenarioValido rejeita dado legado corrompido: lucro/rentabilidade numéricos mas premissa ausente', () => {
    // Formato real de uma linha gravada pelo motor antigo (bug): venda null
    // mas lucro/rentabilidade não-nulos porque null virou 0 no cálculo.
    expect(resultadoCenarioValido({
      valor_arrematacao: 379900,
      valor_venda_estimado: null,
      lucro: -332602.45,
      rentabilidade: -85,
    })).toBe(false)
  })

  it('resultadoCenarioValido rejeita quando lucro/rentabilidade ainda não foram calculados', () => {
    expect(resultadoCenarioValido({ valor_arrematacao: 100000, valor_venda_estimado: 200000, lucro: null, rentabilidade: null })).toBe(false)
  })
})

// Hotfix pré-reunião: `tipo_aquisicao` é uma dimensão independente de
// `modalidade` — compra direta não tem leiloeiro, então comissão de
// leiloeiro nunca entra na conta, mesmo que o campo venha preenchido por
// engano. Mesmo motor, nenhuma fórmula nova.
describe('calcularCenario — compra_direta não aplica comissão de leiloeiro', () => {
  const base: PremissasCenario = {
    modalidade: 'vista',
    tipo_aquisicao: 'leilao',
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

  it('leilao (padrão) cobra a comissão do leiloeiro normalmente', () => {
    expect(calcularCenario(base).investimento_total).toBeCloseTo(282400, 2)
  })

  it('compra_direta ignora a comissão de leiloeiro mesmo com o campo preenchido', () => {
    const r = calcularCenario({ ...base, tipo_aquisicao: 'compra_direta' })
    // 282400 (leilão) menos a comissão de 5% sobre 225000 = 11250
    expect(r.investimento_total).toBeCloseTo(282400 - 11250, 2)
  })

  it('compra_direta com comissao_leiloeiro null/undefined também não quebra (já era 0)', () => {
    const r = calcularCenario({ ...base, tipo_aquisicao: 'compra_direta', comissao_leiloeiro: null })
    expect(r.investimento_total).toBeCloseTo(282400 - 11250, 2)
  })

  it('funciona igual em modalidade financiada (sac)', () => {
    const financiado: PremissasCenario = {
      modalidade: 'sac', tipo_aquisicao: 'leilao',
      valor_arrematacao: 100000, valor_venda_estimado: 200000,
      entrada: 0.2, taxa_juros: 0.06, prazo_financiamento_meses: 12,
      comissao_leiloeiro: 0.05, itbi: 0.03, registro: 1800, advogado_desocupacao: 0,
      reforma: 1000, outros_custos: 0, prazo_venda_meses: 12, iptu: 100, condominio: 400,
      corretagem: 0.06, imposto_ganho_capital: 0.15,
    }
    const comDireta = calcularCenario({ ...financiado, tipo_aquisicao: 'compra_direta' })
    const comLeilao = calcularCenario(financiado)
    // Sem a comissão de 5% sobre 100000 = 5000 a menos de investimento
    expect(comLeilao.investimento_total! - comDireta.investimento_total!).toBeCloseTo(5000, 2)
  })
})
