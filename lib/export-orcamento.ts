import * as XLSX from 'xlsx'

// ─── Tipos internos do export ────────────────────────────────────────────────
export type ItemExportRow = {
  etapaNome: string
  subetapa: string | null
  codigo: string
  descricao: string
  unidade: string
  quantidade: number
  precoUnitario: number    // snapshot (base da composição)
  totalItem: number        // calculado com overrides de insumo
  insumos?: InsumoExportRow[]
}

export type InsumoExportRow = {
  codigo: string
  descricao: string
  unidade: string
  qtdCalculada: number
  qtdAdotada: number
  precoUnit: number
  totalInsumo: number
  isOverride: boolean
}

export type ExportOrcamentoParams = {
  itens: ItemExportRow[]
  bdi: number
  versao: number
  status: string
  obraName: string
  areaM2?: number | null
  incluirInsumos?: boolean
}

// ─── Cores para formatação ───────────────────────────────────────────────────
const ACCENT = '3B7BF8'
const HEADER_BG = '1E2235'
const ETAPA_BG = 'E8EFFE'
const INSUMO_BG = 'F8FAFC'
const TOTAL_BG = 'EFF6FF'

function currency(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pct(v: number) {
  return `${v.toFixed(2)}%`
}

// ─── Função principal ────────────────────────────────────────────────────────
export function exportOrcamentoXLSX({
  itens,
  bdi,
  versao,
  status,
  obraName,
  areaM2,
  incluirInsumos = true,
}: ExportOrcamentoParams) {
  const wb = XLSX.utils.book_new()
  const rows: any[][] = []

  // ── Cabeçalho do documento ────────────────────────────────────────────────
  const dataExport = new Date().toLocaleDateString('pt-BR')
  rows.push(['BuildSmart AI — Orçamento Executivo'])
  rows.push([])
  rows.push(['Obra:', obraName])
  rows.push(['Versão:', `v${versao} — ${status === 'finalizado' ? 'Finalizado' : 'Rascunho'}`])
  rows.push(['BDI:', pct(bdi)])
  if (areaM2) rows.push(['Área construída:', `${areaM2} m²`])
  rows.push(['Exportado em:', dataExport])
  rows.push([])

  // ── Cabeçalho da tabela ───────────────────────────────────────────────────
  const headerRow = [
    'Etapa', 'Subetapa', 'Código', 'Descrição', 'Unid.',
    'Qtd.', 'Unit. R$', 'Total s/BDI R$', 'Total c/BDI R$',
  ]
  rows.push(headerRow)
  const headerRowIdx = rows.length // linha do header (1-indexed no xlsx)

  // ── Agrupar itens por etapa ───────────────────────────────────────────────
  const grupos: Record<string, ItemExportRow[]> = {}
  for (const item of itens) {
    const key = item.etapaNome || 'Sem etapa'
    if (!grupos[key]) grupos[key] = []
    grupos[key].push(item)
  }

  let subtotal = 0
  const etapaSubtotals: { nome: string; total: number; rowIdx: number }[] = []

  for (const [etapaNome, etapaItens] of Object.entries(grupos)) {
    const etapaTotal = etapaItens.reduce((a, i) => a + i.totalItem, 0)
    const etapaTotalComBdi = etapaTotal * (1 + bdi / 100)
    subtotal += etapaTotal

    // Linha de grupo (etapa)
    const etapaRowIdx = rows.length + 1
    rows.push([
      etapaNome, '', '', '', '', '', '',
      currency(etapaTotal),
      currency(etapaTotalComBdi),
    ])
    etapaSubtotals.push({ nome: etapaNome, total: etapaTotal, rowIdx: etapaRowIdx })

    // Itens da etapa
    for (const item of etapaItens) {
      const totalComBdi = item.totalItem * (1 + bdi / 100)
      rows.push([
        '',
        item.subetapa || '',
        item.codigo,
        item.descricao,
        item.unidade,
        item.quantidade,
        item.precoUnitario,
        item.totalItem,
        totalComBdi,
      ])

      // Linhas de insumos (se habilitado e existirem)
      if (incluirInsumos && item.insumos && item.insumos.length > 0) {
        for (const ins of item.insumos) {
          rows.push([
            '', '', `  └ ${ins.codigo}`,
            ins.descricao,
            ins.unidade,
            ins.qtdAdotada,
            ins.precoUnit,
            ins.totalInsumo,
            '',
          ])
        }
      }
    }
  }

  // ── Linha vazia ───────────────────────────────────────────────────────────
  rows.push([])

  // ── Totais finais ─────────────────────────────────────────────────────────
  const totalBdi = subtotal * (bdi / 100)
  const totalGeral = subtotal + totalBdi
  const custoPorM2 = areaM2 && areaM2 > 0 ? totalGeral / areaM2 : null

  rows.push(['', '', '', '', '', '', '', 'SUBTOTAL (s/ BDI)', currency(subtotal)])
  rows.push(['', '', '', '', '', '', '', `BDI (${pct(bdi)})`, currency(totalBdi)])
  rows.push(['', '', '', '', '', '', '', 'TOTAL GERAL', currency(totalGeral)])
  if (custoPorM2 !== null) {
    rows.push(['', '', '', '', '', '', '', `CUSTO / m² (${areaM2} m²)`, currency(custoPorM2)])
  }

  // ── Montar worksheet ──────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Larguras de coluna
  ws['!cols'] = [
    { wch: 28 }, // Etapa
    { wch: 18 }, // Subetapa
    { wch: 12 }, // Código
    { wch: 48 }, // Descrição
    { wch: 7 },  // Unid
    { wch: 10 }, // Qtd
    { wch: 14 }, // Unit R$
    { wch: 18 }, // Total s/BDI
    { wch: 18 }, // Total c/BDI
  ]

  // Formatação de células numéricas (colunas F, G, H, I = índices 5..8)
  const numFmt = '#,##0.00'
  for (let r = headerRowIdx; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 5; c <= 8; c++) {
      const val = row[c]
      if (typeof val === 'number') {
        const cellRef = XLSX.utils.encode_cell({ r, c })
        if (ws[cellRef]) ws[cellRef].z = numFmt
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Orçamento')

  // ── Gerar e baixar ────────────────────────────────────────────────────────
  const dataStr = new Date().toISOString().split('T')[0]
  const nomeArquivo = `orcamento_${obraName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_v${versao}_${dataStr}.xlsx`
  XLSX.writeFile(wb, nomeArquivo)
}
