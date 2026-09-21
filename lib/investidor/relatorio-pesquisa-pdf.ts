// Pesquisa Imobiliária — renderização do relatório em PDF (pdf-lib).
//
// Consome o modelo estruturado de relatorio-pesquisa.ts (fonte única) e desenha
// dois modelos de saída de referência do Drive:
//   Modelo A — completo (capa, ficha, tabela, dois gráficos, fontes, ressalvas).
//   Modelo B — enxuto (identificação, conhecido/desconhecido, tabela, gráficos,
//               limite explícito da pesquisa).
// A apresentação varia; os fatos (o modelo) não. Reaproveita as primitivas de
// lib/pdf/primitives.ts (mesmas de relatorio-compras/cliente).
import { formatCurrency } from '@/lib/utils'
import {
  CONTENT_W, MARGIN, COLORS, PAGE_H,
  addPage, drawBarChart, drawCover, drawTable, ensure, novoContextoPdf, sectionTitle,
  type Ctx, type Column,
} from '@/lib/pdf/primitives'
import type { ModeloRelatorio, RelatorioPesquisa, LinhaComparavel } from './relatorio-pesquisa'

function fmtPreco(v: number | null): string {
  return v == null ? '—' : formatCurrency(v)
}
function fmtArea(v: number | null): string {
  return v == null ? 'não informado' : `${v} m²`
}
function fmtM2(v: number | null): string {
  return v == null ? '—' : `${formatCurrency(v)}/m²`
}

// Quebra de parágrafo simples por largura (as primitivas não têm word-wrap).
function drawParagraph(ctx: Ctx, text: string, size = 8.5, color = COLORS.textSecondary) {
  const maxW = CONTENT_W
  const palavras = text.split(/\s+/)
  let linha = ''
  const linhas: string[] = []
  for (const p of palavras) {
    const tentativa = linha ? `${linha} ${p}` : p
    if (ctx.font.widthOfTextAtSize(tentativa, size) > maxW && linha) {
      linhas.push(linha)
      linha = p
    } else {
      linha = tentativa
    }
  }
  if (linha) linhas.push(linha)
  for (const l of linhas) {
    ensure(ctx, 14)
    ctx.page.drawText(l, { x: MARGIN, y: ctx.y, size, font: ctx.font, color })
    ctx.y -= 13
  }
  ctx.y -= 6
}

function tabelaComparaveis(ctx: Ctx, rel: RelatorioPesquisa) {
  const cols: Column[] = [
    { label: 'ID', width: 34 },
    { label: 'Imóvel', width: 206 },
    { label: 'Área', width: 80, align: 'right' },
    { label: 'Preço', width: 100, align: 'right' },
    { label: 'R$/m²', width: 95, align: 'right' },
  ]
  const linhaAlvo: string[] = [
    'A',
    rel.imovelNome,
    fmtArea(rel.imovelArea),
    fmtPreco(rel.imovelPreco),
    fmtM2(rel.imovelPrecoM2),
  ]
  const linhas: string[][] = [
    linhaAlvo,
    ...rel.comparaveis.map(c => [
      c.ref,
      c.rotulo + (c.possivelDuplicado ? ' (possível duplicado)' : ''),
      fmtArea(c.area),
      fmtPreco(c.preco),
      fmtM2(c.precoM2),
    ]),
  ]
  drawTable(ctx, cols, linhas)
}

function graficos(ctx: Ctx, rel: RelatorioPesquisa) {
  if (rel.graficoPreco.length > 0) {
    sectionTitle(ctx, 'Preço anunciado por imóvel')
    drawBarChart(ctx, rel.graficoPreco.map(p => ({ label: p.label, value: p.value })))
  }
  if (rel.graficoM2.length > 0) {
    sectionTitle(ctx, 'Preço por metro quadrado (R$/m²)')
    drawBarChart(ctx, rel.graficoM2.map(p => ({ label: p.label, value: p.value })))
  }
}

function fichaLinhasTexto(ctx: Ctx, rel: RelatorioPesquisa) {
  for (const l of rel.fichaImovel) {
    ensure(ctx, 15)
    ctx.page.drawText(`${l.label}:`, { x: MARGIN, y: ctx.y, size: 9, font: ctx.bold, color: COLORS.textSecondary })
    ctx.page.drawText(l.valor, {
      x: MARGIN + 150, y: ctx.y, size: 9, font: ctx.font,
      color: l.informado ? COLORS.textPrimary : COLORS.warning,
    })
    ctx.y -= 15
  }
  ctx.y -= 8
}

function fontesTexto(ctx: Ctx, comps: LinhaComparavel[]) {
  for (const c of comps) {
    const partes = [c.fonte, c.area != null ? `${c.area} m²` : null, c.preco != null ? formatCurrency(c.preco) : null,
      c.dataConsulta ? `consulta ${c.dataConsulta}` : null, c.disponibilidade].filter(Boolean).join(' • ')
    ensure(ctx, 26)
    ctx.page.drawText(`[${c.ref}] ${c.rotulo}`, { x: MARGIN, y: ctx.y, size: 9, font: ctx.bold, color: COLORS.textPrimary })
    ctx.y -= 12
    if (partes) { ctx.page.drawText(partes, { x: MARGIN, y: ctx.y, size: 8, font: ctx.font, color: COLORS.textSecondary }); ctx.y -= 11 }
    if (c.url) { ctx.page.drawText(c.url, { x: MARGIN, y: ctx.y, size: 7.5, font: ctx.font, color: COLORS.accent }); ctx.y -= 12 }
    ctx.y -= 4
  }
}

function alertasEObservacoes(ctx: Ctx, rel: RelatorioPesquisa) {
  if (rel.alertas.length > 0) {
    sectionTitle(ctx, 'Alertas de identidade e evidência')
    for (const a of rel.alertas) drawParagraph(ctx, `• ${a}`, 8.5, COLORS.warning)
  }
  sectionTitle(ctx, 'Observações técnicas e limites da pesquisa')
  for (const o of rel.observacoes) drawParagraph(ctx, `• ${o}`)
}

async function renderModeloA(rel: RelatorioPesquisa): Promise<Uint8Array> {
  const ctx = await novoContextoPdf('Pesquisa imobiliária — Modelo A')
  drawCover(ctx, {
    titulo: rel.titulo,
    nome: rel.imovelNome,
    linhas: [rel.imovelEndereco || 'Endereço não informado', `Data da pesquisa: ${rel.dataPesquisa}`],
  })
  sectionTitle(ctx, 'Ficha do imóvel analisado')
  fichaLinhasTexto(ctx, rel)
  sectionTitle(ctx, 'Comparativo bruto — preços e áreas publicados')
  tabelaComparaveis(ctx, rel)
  graficos(ctx, rel)
  addPage(ctx)
  sectionTitle(ctx, 'Fontes e links')
  fontesTexto(ctx, rel.fontes)
  alertasEObservacoes(ctx, rel)
  return ctx.doc.save()
}

async function renderModeloB(rel: RelatorioPesquisa): Promise<Uint8Array> {
  const ctx = await novoContextoPdf('Pesquisa imobiliária — Modelo B')
  // Cabeçalho enxuto, sem capa.
  ctx.page.drawText('PESQUISA IMOBILIÁRIA — PRELIMINAR', { x: MARGIN, y: PAGE_H - MARGIN, size: 12, font: ctx.bold, color: COLORS.textPrimary })
  ctx.y = PAGE_H - MARGIN - 22
  ctx.page.drawText(rel.imovelNome, { x: MARGIN, y: ctx.y, size: 11, font: ctx.bold, color: COLORS.accent })
  ctx.y -= 15
  ctx.page.drawText(`${rel.imovelEndereco || 'Endereço não informado'}  ·  ${rel.dataPesquisa}`, { x: MARGIN, y: ctx.y, size: 9, font: ctx.font, color: COLORS.textSecondary })
  ctx.y -= 24

  sectionTitle(ctx, 'Imóvel de referência — conhecido e desconhecido')
  fichaLinhasTexto(ctx, rel)
  sectionTitle(ctx, 'Referências comparáveis')
  tabelaComparaveis(ctx, rel)
  graficos(ctx, rel)
  alertasEObservacoes(ctx, rel)
  return ctx.doc.save()
}

export function gerarRelatorioPesquisaPdf(rel: RelatorioPesquisa, modelo: ModeloRelatorio): Promise<Uint8Array> {
  return modelo === 'A' ? renderModeloA(rel) : renderModeloB(rel)
}
