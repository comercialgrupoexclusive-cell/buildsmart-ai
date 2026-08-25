// ═══════════════════════════════════════════════════════════════════════════
// Motor de cálculo do Laboratório Investidor (Marco 3 — Calculadora + Cenários).
//
// Reproduz fielmente a lógica de "Calculadora do Leilão.xlsx" (planilha do
// Rodrigo, teste-ouro da especificação). Extraída célula a célula das abas
// "Pagamento à Vista", "Pagamento Financiado", "SAC" e "PRICE" — nenhuma
// fórmula foi inventada. Duas correções pontuais em relação ao arquivo
// original, ambas documentadas no RELATORIO_INVESTIDOR_RODADA_03.md:
//
//   1. Saldo devedor quando a venda ocorre depois de quitado o financiamento
//      (prazo_venda_meses > prazo_financiamento_meses): a planilha retorna
//      "-" (texto) nesse caso — um artefato de fórmula, não uma regra de
//      negócio. Aqui o saldo é 0, como deveria ser matematicamente.
//   2. "% de Lucro" do cenário SAC na aba "Pagamento Financiado": a célula
//      G52 do arquivo original referencia por engano as células da coluna F
//      (PRICE) — bug de copiar/colar. Cada modalidade usa aqui seus próprios
//      totais, como já faz a fórmula de lucro absoluto (F51/G51) ao lado.
//
// Módulo puro (sem I/O) para ser usado igualmente pelo frontend e, nos
// marcos futuros, pela Luiza — ver princípio "não duplicar lógica entre
// frontend e Luiza" da especificação.
// ═══════════════════════════════════════════════════════════════════════════
import type { ProspeccaoCenario } from './types'

export type ModalidadeCenario = ProspeccaoCenario['modalidade']

// Subconjunto de ProspeccaoCenario usado como entrada do motor — os mesmos
// nomes de campo da tabela prospeccao_cenarios.
export type PremissasCenario = Pick<
  ProspeccaoCenario,
  | 'modalidade'
  | 'valor_arrematacao'
  | 'valor_venda_estimado'
  | 'comissao_leiloeiro'
  | 'itbi'
  | 'registro'
  | 'advogado_desocupacao'
  | 'reforma'
  | 'outros_custos'
  | 'prazo_venda_meses'
  | 'iptu'
  | 'condominio'
  | 'corretagem'
  | 'imposto_ganho_capital'
  | 'entrada'
  | 'taxa_juros'
  | 'prazo_financiamento_meses'
>

export type ResultadoCenario = {
  percentual_financiado: number | null
  valor_financiado: number | null
  investimento_total: number
  valor_liquido_venda: number
  lucro: number
  rentabilidade: number
}

function n(v: number | null | undefined): number {
  return v == null || Number.isNaN(v) ? 0 : v
}

// Tabela SAC/PRICE mês a mês (colunas D/E/F/G das abas SAC e PRICE da
// planilha), somando parcelas pagas e apurando o saldo devedor até
// `ateMes` (= prazo_venda_meses). Meses além de prazoFinMeses não geram
// parcela e zeram o saldo devedor (ver correção 1 no cabeçalho do arquivo).
function tabelaAmortizacao(
  modalidade: 'sac' | 'price',
  financiado: number,
  prazoFinMeses: number,
  taxaAnual: number,
  ateMes: number,
): { totalPago: number; saldoDevedorFinal: number } {
  if (financiado <= 0 || prazoFinMeses <= 0 || ateMes <= 0) {
    return { totalPago: 0, saldoDevedorFinal: 0 }
  }
  const taxaMensal = Math.pow(1 + taxaAnual, 1 / 12) - 1
  let totalPago = 0
  let saldoDevedorFinal = 0

  if (modalidade === 'sac') {
    const amortizacao = financiado / prazoFinMeses
    for (let mes = 1; mes <= ateMes; mes++) {
      if (mes > prazoFinMeses) { saldoDevedorFinal = 0; continue }
      const juros = taxaMensal * (financiado - (mes - 1) * amortizacao)
      totalPago += amortizacao + juros
      saldoDevedorFinal = financiado - mes * amortizacao
    }
  } else {
    const pmt = (financiado * Math.pow(1 + taxaMensal, prazoFinMeses) * taxaMensal) /
      (Math.pow(1 + taxaMensal, prazoFinMeses) - 1)
    let saldo = financiado
    for (let mes = 1; mes <= ateMes; mes++) {
      if (mes > prazoFinMeses) { saldoDevedorFinal = 0; continue }
      const juros = taxaMensal * saldo
      const amortizacao = pmt - juros
      saldo -= amortizacao
      totalPago += pmt
      saldoDevedorFinal = saldo
    }
  }
  return { totalPago, saldoDevedorFinal }
}

// Aba "Pagamento à Vista": D31 (Total de Custos), D38 (Valor Real de Venda),
// E41 (lucro absoluto), D41 (rentabilidade).
function calcularVista(p: PremissasCenario): ResultadoCenario {
  const arrematacao = n(p.valor_arrematacao)
  const venda = n(p.valor_venda_estimado)
  const comissaoLeiloeiro = n(p.comissao_leiloeiro) * arrematacao
  const itbi = n(p.itbi) * arrematacao
  const registro = n(p.registro)
  const advogado = n(p.advogado_desocupacao)
  const reforma = n(p.reforma)
  const outros = n(p.outros_custos)
  const prazoVenda = n(p.prazo_venda_meses)
  const iptuTotal = n(p.iptu) * prazoVenda
  const condominioTotal = n(p.condominio) * prazoVenda

  const investimentoTotal = comissaoLeiloeiro + itbi + registro + advogado + reforma + outros +
    iptuTotal + condominioTotal + arrematacao

  const comissaoCorretor = n(p.corretagem) * venda
  // Base do IR sobre ganho de capital exclui "outros custos" e advogado de
  // desocupação — assim está na planilha original (D35).
  const baseGanhoCapital = venda - comissaoCorretor - (arrematacao + comissaoLeiloeiro + itbi + registro + reforma)
  const irGanhoCapital = n(p.imposto_ganho_capital) * baseGanhoCapital
  const valorLiquidoVenda = venda - comissaoCorretor - irGanhoCapital
  const lucro = valorLiquidoVenda - investimentoTotal
  const rentabilidade = investimentoTotal !== 0 ? (lucro / investimentoTotal) * 100 : 0

  return { percentual_financiado: null, valor_financiado: null, investimento_total: investimentoTotal, valor_liquido_venda: valorLiquidoVenda, lucro, rentabilidade }
}

// Abas "Pagamento Financiado" + "SAC"/"PRICE": F39/G39 (Total de Custos),
// F44/G44 (Saldo Devedor), F47/G47 (Valor Real de Venda), F51/G51 (lucro
// absoluto), F52/G52 (rentabilidade, com a correção 2 do cabeçalho).
function calcularFinanciado(modalidade: 'sac' | 'price', p: PremissasCenario): ResultadoCenario {
  const arrematacao = n(p.valor_arrematacao)
  const venda = n(p.valor_venda_estimado)
  const percentualEntrada = n(p.entrada)
  const percentualFinanciado = 1 - percentualEntrada
  const valorEntrada = percentualEntrada * arrematacao
  const valorFinanciado = percentualFinanciado * arrematacao

  const comissaoLeiloeiro = n(p.comissao_leiloeiro) * arrematacao
  const itbi = n(p.itbi) * arrematacao
  const registro = n(p.registro)
  const advogado = n(p.advogado_desocupacao)
  const reforma = n(p.reforma)
  const outros = n(p.outros_custos)
  const prazoVenda = n(p.prazo_venda_meses)
  const iptuTotal = n(p.iptu) * prazoVenda
  const condominioTotal = n(p.condominio) * prazoVenda

  const { totalPago, saldoDevedorFinal } = tabelaAmortizacao(
    modalidade, valorFinanciado, n(p.prazo_financiamento_meses), n(p.taxa_juros), prazoVenda,
  )

  const totalPosArrematacao = iptuTotal + condominioTotal + totalPago
  const investimentoTotal = comissaoLeiloeiro + itbi + registro + advogado + reforma + outros +
    totalPosArrematacao + valorEntrada

  const comissaoCorretor = n(p.corretagem) * venda
  const baseGanhoCapital = venda - comissaoCorretor -
    (valorEntrada + totalPago + saldoDevedorFinal + comissaoLeiloeiro + itbi + registro + reforma)
  const irGanhoCapital = n(p.imposto_ganho_capital) * baseGanhoCapital
  const valorLiquidoVenda = venda - comissaoCorretor - irGanhoCapital - saldoDevedorFinal
  const lucro = valorLiquidoVenda - investimentoTotal
  const rentabilidade = investimentoTotal !== 0 ? (lucro / investimentoTotal) * 100 : 0

  return {
    percentual_financiado: percentualFinanciado,
    valor_financiado: valorFinanciado,
    investimento_total: investimentoTotal,
    valor_liquido_venda: valorLiquidoVenda,
    lucro,
    rentabilidade,
  }
}

export function calcularCenario(p: PremissasCenario): ResultadoCenario {
  if (p.modalidade === 'vista') return calcularVista(p)
  return calcularFinanciado(p.modalidade, p)
}
