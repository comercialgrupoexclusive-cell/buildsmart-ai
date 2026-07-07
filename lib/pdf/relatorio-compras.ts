import { CompraItem, Etapa, Obra } from '@/lib/types'
import { formatCurrency, FORMA_PAGAMENTO_LABEL, STATUS_ETAPA_LABEL } from '@/lib/utils'
import {
  COLORS, CONTENT_W, MARGIN, type Ctx,
  addPage, drawBarChart, drawEmptyNote, drawFooter, drawKpiRow, drawLineChart,
  drawTable, drawCover, ensure, formatDateBR, novoContextoPdf, sectionTitle, truncate,
} from '@/lib/pdf/primitives'

function statusEtapaColor(status: Etapa['status']) {
  if (status === 'concluida') return COLORS.success
  if (status === 'atrasada') return COLORS.danger
  if (status === 'em_andamento') return COLORS.accent
  return COLORS.textSecondary
}

function drawGantt(ctx: Ctx, etapas: Etapa[]) {
  const comDatas = etapas.filter(e => e.data_inicio && e.data_fim)
  if (comDatas.length === 0) {
    drawEmptyNote(ctx, 'Nenhuma etapa com datas de início/fim definidas para exibir o cronograma visual.')
    return
  }
  const datas = comDatas.flatMap(e => [new Date(e.data_inicio!).getTime(), new Date(e.data_fim!).getTime()])
  const min = Math.min(...datas)
  const max = Math.max(...datas)
  const span = max - min || 1
  const rowH = 22
  const labelW = 150
  const barAreaW = CONTENT_W - labelW

  ensure(ctx, rowH + 10)
  comDatas.forEach(e => {
    const newPage = ensure(ctx, rowH)
    if (newPage) ctx.y -= 4
    const label = truncate(ctx.font, e.nome, 8, labelW - 6)
    ctx.page.drawText(label, { x: MARGIN, y: ctx.y - rowH + 8, size: 8, font: ctx.font, color: COLORS.textPrimary })
    const startX = MARGIN + labelW + ((new Date(e.data_inicio!).getTime() - min) / span) * barAreaW
    const endX = MARGIN + labelW + ((new Date(e.data_fim!).getTime() - min) / span) * barAreaW
    ctx.page.drawRectangle({ x: startX, y: ctx.y - rowH + 6, width: Math.max(endX - startX, 3), height: 10, color: statusEtapaColor(e.status) })
    ctx.y -= rowH
  })
  ctx.y -= 14
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function calcularTotais(itens: CompraItem[]) {
  const confirmado = itens.filter(i => i.status_valor === 'confirmado').reduce((s, i) => s + (i.valor_total || 0), 0)
  const estimado = itens.filter(i => i.status_valor === 'estimado').reduce((s, i) => s + (i.valor_total || 0), 0)
  return { confirmado, estimado, teto: confirmado + estimado }
}

function nomeEtapaDoItem(item: CompraItem, nomePorId: Map<string, string>) {
  return item.etapa_id ? (nomePorId.get(item.etapa_id) || 'Sem etapa') : 'Sem etapa'
}

function agruparPorSemana(itens: CompraItem[], etapas: Etapa[]): string[][] {
  const nomePorId = new Map(etapas.map(e => [e.id, e.nome]))
  const semanas = new Map<string, Map<string, { confirmado: number; estimado: number }>>()
  itens.forEach(item => {
    if (!item.data_limite_pagamento) return
    const semana = getWeekStart(item.data_limite_pagamento)
    const etapaNome = nomeEtapaDoItem(item, nomePorId)
    if (!semanas.has(semana)) semanas.set(semana, new Map())
    const porEtapa = semanas.get(semana)!
    if (!porEtapa.has(etapaNome)) porEtapa.set(etapaNome, { confirmado: 0, estimado: 0 })
    const acc = porEtapa.get(etapaNome)!
    if (item.status_valor === 'confirmado') acc.confirmado += item.valor_total
    else acc.estimado += item.valor_total
  })
  const rows: string[][] = []
  Array.from(semanas.keys()).sort().forEach(semana => {
    const porEtapa = semanas.get(semana)!
    Array.from(porEtapa.entries()).forEach(([etapaNome, v]) => {
      rows.push([formatDateBR(semana), etapaNome, formatCurrency(v.confirmado), formatCurrency(v.estimado), formatCurrency(v.confirmado + v.estimado)])
    })
  })
  return rows
}

function calcularDistribuicaoPorEtapa(itens: CompraItem[], etapas: Etapa[]) {
  const nomePorId = new Map(etapas.map(e => [e.id, e.nome]))
  const totals = new Map<string, number>()
  itens.forEach(item => {
    const nome = nomeEtapaDoItem(item, nomePorId)
    totals.set(nome, (totals.get(nome) || 0) + (item.valor_total || 0))
  })
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
}

function calcularFluxoCaixa(itens: CompraItem[]) {
  const totals = new Map<string, number>()
  itens.forEach(item => {
    if (!item.data_limite_pagamento) return
    totals.set(item.data_limite_pagamento, (totals.get(item.data_limite_pagamento) || 0) + (item.valor_total || 0))
  })
  const datas = Array.from(totals.keys()).sort()
  let acumulado = 0
  return datas.map(d => {
    acumulado += totals.get(d)!
    return { label: formatDateBR(d).slice(0, 5), value: acumulado }
  })
}

function calcularRankingFornecedores(itens: CompraItem[]): string[][] {
  const map = new Map<string, { total: number; itens: number; formas: Map<string, number> }>()
  itens.forEach(item => {
    const nome = item.fornecedor?.nome || item.fornecedor_nome || 'Não definido'
    if (!map.has(nome)) map.set(nome, { total: 0, itens: 0, formas: new Map() })
    const acc = map.get(nome)!
    acc.total += item.valor_total || 0
    acc.itens += 1
    if (item.forma_pagamento) acc.formas.set(item.forma_pagamento, (acc.formas.get(item.forma_pagamento) || 0) + 1)
  })
  return Array.from(map.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([nome, v]) => {
      const formaPrincipal = Array.from(v.formas.entries()).sort((a, b) => b[1] - a[1])[0]
      return [
        nome,
        formatCurrency(v.total),
        String(v.itens),
        formaPrincipal ? FORMA_PAGAMENTO_LABEL[formaPrincipal[0]] || formaPrincipal[0] : '—',
      ]
    })
}

function agruparPorDia(itens: CompraItem[]): string[][] {
  const map = new Map<string, { total: number; qtd: number }>()
  itens.forEach(item => {
    if (!item.data_limite_pagamento) return
    const acc = map.get(item.data_limite_pagamento) || { total: 0, qtd: 0 }
    acc.total += item.valor_total || 0
    acc.qtd += 1
    map.set(item.data_limite_pagamento, acc)
  })
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, v]) => [formatDateBR(data), String(v.qtd), formatCurrency(v.total)])
}

export async function gerarRelatorioComprasPdf({
  obra, etapas, itens,
}: { obra: Obra; etapas: Etapa[]; itens: CompraItem[] }): Promise<Uint8Array> {
  const ctx = await novoContextoPdf('Relatório de Compras')

  const datasPagamento = itens.map(i => i.data_limite_pagamento).filter(Boolean).sort() as string[]
  const periodo = datasPagamento.length
    ? `${formatDateBR(datasPagamento[0])} – ${formatDateBR(datasPagamento[datasPagamento.length - 1])}`
    : 'Período não definido'

  drawCover(ctx, { titulo: 'Relatório de Compras e Previsões', nome: obra.nome, linhas: [`Período: ${periodo}`] })
  drawFooter(ctx)

  // 1. Cronograma de atividades
  addPage(ctx)
  sectionTitle(ctx, '1. Cronograma de Atividades')
  if (etapas.length === 0) {
    drawEmptyNote(ctx, 'Nenhuma etapa cadastrada para esta obra.')
  } else {
    drawTable(ctx, [
      { label: 'Etapa', width: 200 },
      { label: 'Status', width: 90 },
      { label: 'Início', width: 75 },
      { label: 'Fim', width: 75 },
      { label: '% Exec.', width: 70, align: 'right' },
    ], etapas.map(e => [
      e.nome,
      STATUS_ETAPA_LABEL[e.status] || e.status,
      formatDateBR(e.data_inicio),
      formatDateBR(e.data_fim),
      `${e.percentual_executado}%`,
    ]))
  }

  // 2. Gantt simplificado
  sectionTitle(ctx, '2. Cronograma Visual (Gantt Simplificado)')
  drawGantt(ctx, etapas)

  // 3. Resumo financeiro semanal por etapa
  sectionTitle(ctx, '3. Resumo Financeiro Semanal por Etapa')
  const semanas = agruparPorSemana(itens, etapas)
  if (semanas.length === 0) {
    drawEmptyNote(ctx, 'Nenhum item com data limite de pagamento definida.')
  } else {
    drawTable(ctx, [
      { label: 'Semana', width: 80 },
      { label: 'Etapa', width: 160 },
      { label: 'Confirmado', width: 90, align: 'right' },
      { label: 'Estimado', width: 90, align: 'right' },
      { label: 'Total', width: 95, align: 'right' },
    ], semanas)
  }

  // 4. Resumo geral
  sectionTitle(ctx, '4. Resumo Geral')
  const totais = calcularTotais(itens)
  drawKpiRow(ctx, [
    { label: 'Confirmado', value: formatCurrency(totais.confirmado), color: COLORS.success },
    { label: 'Com pré-previsão', value: formatCurrency(totais.estimado), color: COLORS.warning },
    { label: 'Teto máximo', value: formatCurrency(totais.teto), color: COLORS.accent },
  ])

  // 5. Distribuição de investimento por etapa
  sectionTitle(ctx, '5. Distribuição de Investimento por Etapa')
  const distribuicao = calcularDistribuicaoPorEtapa(itens, etapas)
  if (distribuicao.length === 0) drawEmptyNote(ctx, 'Nenhum item de compra cadastrado.')
  else drawBarChart(ctx, distribuicao)

  // 6. Fluxo de caixa por data
  sectionTitle(ctx, '6. Fluxo de Caixa por Data')
  const fluxo = calcularFluxoCaixa(itens)
  if (fluxo.length === 0) drawEmptyNote(ctx, 'Nenhum item com data limite de pagamento definida.')
  else drawLineChart(ctx, fluxo)

  // 7. Gestão de fornecedores
  sectionTitle(ctx, '7. Gestão de Fornecedores')
  const ranking = calcularRankingFornecedores(itens)
  if (ranking.length === 0) {
    drawEmptyNote(ctx, 'Nenhum fornecedor associado a itens de compra.')
  } else {
    drawTable(ctx, [
      { label: 'Fornecedor', width: 200 },
      { label: 'Volume total', width: 100, align: 'right' },
      { label: 'Itens', width: 60, align: 'right' },
      { label: 'Forma de pagto. principal', width: 155 },
    ], ranking)
  }

  // 8. Tabela detalhada
  sectionTitle(ctx, '8. Tabela Detalhada de Itens')
  if (itens.length === 0) {
    drawEmptyNote(ctx, 'Nenhum item de compra cadastrado.')
  } else {
    drawTable(ctx, [
      { label: 'Item', width: 175 },
      { label: 'Fornecedor', width: 115 },
      { label: 'Valor', width: 70, align: 'right' },
      { label: 'Data pagto.', width: 75 },
      { label: 'Forma', width: 80 },
    ], itens.map(item => [
      item.descricao,
      item.fornecedor?.nome || item.fornecedor_nome || '—',
      formatCurrency(item.valor_total),
      formatDateBR(item.data_limite_pagamento),
      item.forma_pagamento ? (FORMA_PAGAMENTO_LABEL[item.forma_pagamento] || item.forma_pagamento) : '—',
    ]))
  }

  // 9. Cronograma diário de pagamentos
  sectionTitle(ctx, '9. Cronograma Diário de Pagamentos')
  const porDia = agruparPorDia(itens)
  if (porDia.length === 0) {
    drawEmptyNote(ctx, 'Nenhum item com data limite de pagamento definida.')
  } else {
    drawTable(ctx, [
      { label: 'Data', width: 150 },
      { label: 'Itens', width: 100, align: 'right' },
      { label: 'Total a pagar', width: 150, align: 'right' },
    ], porDia)
  }

  return ctx.doc.save()
}
