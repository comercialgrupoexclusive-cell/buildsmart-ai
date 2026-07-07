import { CompraItem, Obra } from '@/lib/types'
import { formatCurrency, TIPO_CUSTO_LABEL_CURTO } from '@/lib/utils'
import {
  COLORS, type Column,
  addPage, drawBarChart, drawCover, drawEmptyNote, drawFooter, drawKpiRow,
  drawTable, drawTotalRow, formatDateBR, novoContextoPdf, sectionTitle,
} from '@/lib/pdf/primitives'

function nomeEtapa(item: CompraItem) {
  return item.etapa?.nome || 'Sem etapa'
}

function nomeFornecedor(item: CompraItem) {
  return item.fornecedor?.nome || item.fornecedor_nome || '—'
}

function tipoLabel(item: CompraItem) {
  return item.tipo_custo ? (TIPO_CUSTO_LABEL_CURTO[item.tipo_custo] || item.tipo_custo) : '—'
}

function distribuicaoPorCentroCusto(itens: CompraItem[]) {
  const totals = new Map<string, number>()
  itens.forEach(i => totals.set(nomeEtapa(i), (totals.get(nomeEtapa(i)) || 0) + (i.valor_total || 0)))
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

function resumoPorTipo(itens: CompraItem[], total: number): string[][] {
  const totals = new Map<string, number>()
  itens.forEach(i => {
    const chave = tipoLabel(i)
    totals.set(chave, (totals.get(chave) || 0) + (i.valor_total || 0))
  })
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, valor]) => [
      label,
      formatCurrency(valor),
      total > 0 ? `${((valor / total) * 100).toFixed(1)}%` : '—',
    ])
}

/**
 * Relatório financeiro para o cliente: lançamentos do período (sem status
 * estimado/confirmado, sem forma de pagamento nem teto — só os gastos reais).
 * Espelha a aba "Relatório por período" da planilha de controle de custos.
 */
export async function gerarRelatorioClientePdf({
  obra, itens, inicio, fim,
}: { obra: Obra; itens: CompraItem[]; inicio: string; fim: string }): Promise<Uint8Array> {
  const ctx = await novoContextoPdf('Relatório do Cliente')
  const total = itens.reduce((s, i) => s + (i.valor_total || 0), 0)
  const periodo = `De ${formatDateBR(inicio)} à ${formatDateBR(fim)}`

  drawCover(ctx, {
    titulo: 'Relatório Financeiro da Obra',
    nome: obra.nome,
    linhas: [
      obra.responsavel ? `Responsável: ${obra.responsavel}` : 'Responsável: —',
      periodo,
    ],
  })
  drawFooter(ctx)

  addPage(ctx)

  // Resumo do período
  sectionTitle(ctx, 'Resumo do período')
  drawKpiRow(ctx, [
    { label: 'Custo no período', value: formatCurrency(total), color: COLORS.accent },
    { label: 'Lançamentos', value: String(itens.length), color: COLORS.textPrimary },
  ])

  // Lançamentos
  sectionTitle(ctx, 'Lançamentos')
  if (itens.length === 0) {
    drawEmptyNote(ctx, 'Nenhum lançamento no período selecionado.')
  } else {
    const columns: Column[] = [
      { label: 'Data', width: 55 },
      { label: 'Descrição', width: 140 },
      { label: 'Fornecedor', width: 90 },
      { label: 'Venc.', width: 55 },
      { label: 'Tipo', width: 65 },
      { label: 'Centro de custo', width: 65 },
      { label: 'Valor', width: 45, align: 'right' },
    ]
    const rows = itens.map(i => [
      formatDateBR(i.data_compra),
      i.descricao,
      nomeFornecedor(i),
      formatDateBR(i.data_limite_pagamento),
      tipoLabel(i),
      nomeEtapa(i),
      formatCurrency(i.valor_total),
    ])
    drawTable(ctx, columns, rows)
    drawTotalRow(ctx, columns, ['TOTAL', '', '', '', '', '', formatCurrency(total)])
  }

  // Resumo por centro de custo
  sectionTitle(ctx, 'Custo por centro de custo')
  const distrib = distribuicaoPorCentroCusto(itens)
  if (distrib.length === 0) drawEmptyNote(ctx, 'Sem lançamentos para exibir.')
  else drawBarChart(ctx, distrib)

  // Resumo por tipo
  sectionTitle(ctx, 'Custo por tipo')
  const porTipo = resumoPorTipo(itens, total)
  if (porTipo.length === 0) {
    drawEmptyNote(ctx, 'Sem lançamentos para exibir.')
  } else {
    drawTable(ctx, [
      { label: 'Tipo', width: 260 },
      { label: 'Valor', width: 130, align: 'right' },
      { label: '% do total', width: 125, align: 'right' },
    ], porTipo)
  }

  return ctx.doc.save()
}
