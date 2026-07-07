// Primitivas compartilhadas de geração de PDF (pdf-lib).
// Extraídas de relatorio-compras.ts para reuso entre os geradores de relatório.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { formatCurrency } from '@/lib/utils'

export const PAGE_W = 595.28
export const PAGE_H = 841.89
export const MARGIN = 40
export const CONTENT_W = PAGE_W - MARGIN * 2

export const COLORS = {
  accent: rgb(0x3b / 255, 0x7b / 255, 0xf8 / 255),
  success: rgb(0x10 / 255, 0xb9 / 255, 0x81 / 255),
  warning: rgb(0xf5 / 255, 0x9e / 255, 0x0b / 255),
  danger: rgb(0xef / 255, 0x44 / 255, 0x44 / 255),
  purple: rgb(0x8b / 255, 0x5c / 255, 0xf6 / 255),
  textPrimary: rgb(0x0f / 255, 0x17 / 255, 0x2a / 255),
  textSecondary: rgb(0x64 / 255, 0x74 / 255, 0x8b / 255),
  border: rgb(0xe2 / 255, 0xe8 / 255, 0xf0 / 255),
  bgSecondary: rgb(0xf1 / 255, 0xf5 / 255, 0xf9 / 255),
  white: rgb(1, 1, 1),
}

export type RgbColor = ReturnType<typeof rgb>

export type Column = { label: string; width: number; align?: 'left' | 'right' }

export type Ctx = {
  doc: PDFDocument
  page: PDFPage
  y: number
  font: PDFFont
  bold: PDFFont
  pageNum: number
  subtitulo: string   // usado no rodapé de cada página
}

export function formatDateBR(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

export function drawFooter(ctx: Ctx) {
  ctx.page.drawText(`BuildSmart AI  ·  ${ctx.subtitulo}  ·  página ${ctx.pageNum}`, {
    x: MARGIN, y: 24, size: 8, font: ctx.font, color: COLORS.textSecondary,
  })
}

export function addPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H])
  ctx.pageNum += 1
  ctx.y = PAGE_H - MARGIN
  drawFooter(ctx)
}

export function ensure(ctx: Ctx, needed: number): boolean {
  if (ctx.y - needed < MARGIN + 20) {
    addPage(ctx)
    return true
  }
  return false
}

export function sectionTitle(ctx: Ctx, text: string) {
  ensure(ctx, 40)
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 12, width: 4, height: 16, color: COLORS.accent })
  ctx.page.drawText(text, { x: MARGIN + 12, y: ctx.y - 9, size: 13, font: ctx.bold, color: COLORS.textPrimary })
  ctx.y -= 30
}

export function drawEmptyNote(ctx: Ctx, text: string) {
  ensure(ctx, 24)
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 9, font: ctx.font, color: COLORS.textSecondary })
  ctx.y -= 24
}

export function drawTableHeader(ctx: Ctx, columns: Column[], rowHeight: number) {
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowHeight, width: CONTENT_W, height: rowHeight, color: COLORS.bgSecondary })
  let x = MARGIN + 6
  columns.forEach(col => {
    ctx.page.drawText(col.label, { x, y: ctx.y - rowHeight + 7, size: 8.5, font: ctx.bold, color: COLORS.textSecondary })
    x += col.width
  })
  ctx.y -= rowHeight
}

export function drawTable(ctx: Ctx, columns: Column[], rows: string[][], rowHeight = 20) {
  if (rows.length === 0) return
  ensure(ctx, rowHeight * 2)
  drawTableHeader(ctx, columns, rowHeight)
  rows.forEach(row => {
    const newPage = ensure(ctx, rowHeight)
    if (newPage) drawTableHeader(ctx, columns, rowHeight)
    let x = MARGIN + 6
    row.forEach((cell, i) => {
      const col = columns[i]
      const text = truncate(ctx.font, cell, 9, col.width - 10)
      const tx = col.align === 'right' ? x + col.width - 12 - ctx.font.widthOfTextAtSize(text, 9) : x
      ctx.page.drawText(text, { x: tx, y: ctx.y - rowHeight + 7, size: 9, font: ctx.font, color: COLORS.textPrimary })
      x += col.width
    })
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y - rowHeight },
      end: { x: MARGIN + CONTENT_W, y: ctx.y - rowHeight },
      thickness: 0.5, color: COLORS.border,
    })
    ctx.y -= rowHeight
  })
  ctx.y -= 14
}

// Linha de total em negrito (usada abaixo de uma drawTable).
export function drawTotalRow(ctx: Ctx, columns: Column[], row: string[], rowHeight = 20) {
  ensure(ctx, rowHeight)
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowHeight, width: CONTENT_W, height: rowHeight, color: COLORS.bgSecondary })
  let x = MARGIN + 6
  row.forEach((cell, i) => {
    const col = columns[i]
    if (!cell) { x += col.width; return }
    const text = truncate(ctx.bold, cell, 9, col.width - 10)
    const tx = col.align === 'right' ? x + col.width - 12 - ctx.bold.widthOfTextAtSize(text, 9) : x
    ctx.page.drawText(text, { x: tx, y: ctx.y - rowHeight + 7, size: 9, font: ctx.bold, color: COLORS.textPrimary })
    x += col.width
  })
  ctx.y -= rowHeight + 14
}

export function drawKpiRow(ctx: Ctx, kpis: { label: string; value: string; color: RgbColor }[]) {
  const cardH = 54
  ensure(ctx, cardH + 10)
  const gap = 10
  const cardW = (CONTENT_W - gap * (kpis.length - 1)) / kpis.length
  kpis.forEach((k, i) => {
    const x = MARGIN + i * (cardW + gap)
    ctx.page.drawRectangle({ x, y: ctx.y - cardH, width: cardW, height: cardH, color: COLORS.bgSecondary, borderColor: COLORS.border, borderWidth: 0.5 })
    ctx.page.drawText(k.label, { x: x + 10, y: ctx.y - 20, size: 8.5, font: ctx.font, color: COLORS.textSecondary })
    ctx.page.drawText(k.value, { x: x + 10, y: ctx.y - 40, size: 13, font: ctx.bold, color: k.color })
  })
  ctx.y -= cardH + 16
}

export function drawBarChart(ctx: Ctx, data: { label: string; value: number }[], height = 160) {
  if (data.length === 0) return
  ensure(ctx, height + 40)
  const max = Math.max(...data.map(d => d.value), 1)
  const gap = 14
  const barWidth = Math.min(56, (CONTENT_W - gap * (data.length + 1)) / data.length)
  const usableHeight = height - 36
  const baseline = ctx.y - height + 22
  data.forEach((d, i) => {
    const x = MARGIN + gap + i * (barWidth + gap)
    const barHeight = (d.value / max) * usableHeight
    ctx.page.drawRectangle({ x, y: baseline, width: barWidth, height: barHeight, color: COLORS.accent })
    const valText = formatCurrency(d.value)
    const valTrunc = truncate(ctx.font, valText, 7, barWidth + gap - 2)
    ctx.page.drawText(valTrunc, { x, y: baseline + barHeight + 4, size: 7, font: ctx.font, color: COLORS.textSecondary })
    const label = truncate(ctx.font, d.label, 7, barWidth + gap - 2)
    ctx.page.drawText(label, { x, y: baseline - 12, size: 7, font: ctx.font, color: COLORS.textPrimary })
  })
  ctx.page.drawLine({ start: { x: MARGIN, y: baseline }, end: { x: MARGIN + CONTENT_W, y: baseline }, thickness: 0.5, color: COLORS.border })
  ctx.y -= height + 16
}

export function drawLineChart(ctx: Ctx, points: { label: string; value: number }[], height = 160) {
  if (points.length === 0) return
  ensure(ctx, height + 40)
  const max = Math.max(...points.map(p => p.value), 1)
  const usableHeight = height - 36
  const baseline = ctx.y - height + 22
  const stepX = points.length > 1 ? CONTENT_W / (points.length - 1) : 0
  const coords = points.map((p, i) => ({ x: MARGIN + i * stepX, y: baseline + (p.value / max) * usableHeight }))
  ctx.page.drawLine({ start: { x: MARGIN, y: baseline }, end: { x: MARGIN + CONTENT_W, y: baseline }, thickness: 0.5, color: COLORS.border })
  for (let i = 0; i < coords.length - 1; i++) {
    ctx.page.drawLine({ start: coords[i], end: coords[i + 1], thickness: 1.5, color: COLORS.accent })
  }
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))
  coords.forEach((c, i) => {
    ctx.page.drawCircle({ x: c.x, y: c.y, size: 2.2, color: COLORS.accent })
    if (i % labelEvery === 0 || i === coords.length - 1) {
      ctx.page.drawText(points[i].label, { x: c.x - 12, y: baseline - 12, size: 6.5, font: ctx.font, color: COLORS.textSecondary })
    }
  })
  ctx.y -= height + 16
}

// Capa genérica com faixa de destaque no topo.
export function drawCover(ctx: Ctx, opts: { titulo: string; nome: string; linhas?: string[] }) {
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 220, width: PAGE_W, height: 220, color: COLORS.accent })
  ctx.page.drawText('BuildSmart AI', { x: MARGIN, y: PAGE_H - 70, size: 14, font: ctx.bold, color: COLORS.white })
  ctx.page.drawText(opts.titulo, { x: MARGIN, y: PAGE_H - 125, size: 22, font: ctx.bold, color: COLORS.white })
  ctx.page.drawText(opts.nome, { x: MARGIN, y: PAGE_H - 155, size: 13, font: ctx.font, color: COLORS.white })
  ;(opts.linhas || []).forEach((linha, i) => {
    ctx.page.drawText(linha, { x: MARGIN, y: PAGE_H - 178 - i * 18, size: 10, font: ctx.font, color: COLORS.white })
  })

  ctx.y = PAGE_H - 260
  ctx.page.drawText(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, { x: MARGIN, y: ctx.y, size: 9, font: ctx.font, color: COLORS.textSecondary })
  ctx.y -= 40
}

// Cria um novo documento com fontes embutidas e o contexto inicial.
export async function novoContextoPdf(subtitulo: string): Promise<Ctx> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  return { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN, font, bold, pageNum: 1, subtitulo }
}
