import * as XLSX from 'xlsx'
import { ConfigImportacao, LinhaImportada, ResultadoLeitura, normalizarTexto, normalizarNumero } from './import-export-templates'

// ─── Importação/exportação tabular de orçamento ──────────────────────────────
// Formato simples — uma linha por item do orçamento: Etapa, Subetapa, Código
// da composição e Quantidade. A composição é localizada pelo código (própria
// ou da base SINAPI) e a etapa é criada automaticamente se não existir.
// Reaproveita o motor genérico de modelo/leitura de lib/import-export-templates.

export const CONFIG_IMPORT_ORCAMENTO: ConfigImportacao = {
  chave: 'orcamento',
  titulo: 'Itens do orçamento',
  nomeAba: 'Orçamento',
  descricaoModelo: 'Planilha tabular com Etapa, Subetapa, Código da composição e Quantidade — uma linha por item do orçamento.',
  descricaoImportacao: 'Cada linha vira um item do orçamento: a composição é localizada pelo código (própria ou da base SINAPI) e a etapa é criada automaticamente se ainda não existir na obra.',
  observacoes: [
    'O Código deve corresponder a uma composição própria ou da base SINAPI já cadastrada no sistema.',
    'Se a Etapa informada não existir nesta obra, ela será criada automaticamente.',
    'As colunas "Descrição" e "Unidade" são apenas referência — não são usadas na importação (vêm sempre da composição localizada pelo código).',
  ],
  colunas: [
    { chave: 'etapa', rotulo: 'Etapa', obrigatoria: true, largura: 28, exemplo: 'Fundações', normalizar: normalizarTexto(true) },
    { chave: 'subetapa', rotulo: 'Subetapa', obrigatoria: false, largura: 22, exemplo: 'Bloco A', normalizar: normalizarTexto(false) },
    { chave: 'codigo', rotulo: 'Código', obrigatoria: true, largura: 14, exemplo: 'COMP-001', normalizar: normalizarTexto(true, true) },
    { chave: 'descricao', rotulo: 'Descrição (referência)', obrigatoria: false, largura: 48, exemplo: 'Alvenaria de vedação em blocos cerâmicos', normalizar: normalizarTexto(false) },
    { chave: 'unidade', rotulo: 'Unidade (referência)', obrigatoria: false, largura: 14, exemplo: 'M2', normalizar: normalizarTexto(false) },
    { chave: 'quantidade', rotulo: 'Quantidade', obrigatoria: true, largura: 14, exemplo: 120, normalizar: normalizarNumero(true) },
  ],
  // Import customizado (etapa + composição) — não é um upsert simples por chave,
  // então `tabela`/`chaveUnica` aqui servem apenas para satisfazer o tipo.
  tabela: 'orcamento_itens',
  chaveUnica: 'codigo',
}

export type LinhaOrcamentoTabular = {
  etapa: string
  subetapa: string | null
  codigo: string
  descricao: string
  unidade: string
  quantidade: number
}

export type InsumoOrcamentoAntigo = {
  codigo: string
  descricao: string
  categoria: string
  tipo: string
  unidade: string
  coeficiente: number
  quantidadeAdotada: number
  precoUnitario: number
  custoTotal: number
}

function numeroFlex(valor: unknown) {
  if (typeof valor === 'number') return valor
  const texto = String(valor ?? '').trim()
  if (!texto) return 0
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

function texto(valor: unknown) {
  return String(valor ?? '').trim()
}

function normalizarCabecalho(chave: string) {
  return chave.trim().toLowerCase()
}

function slugCodigo(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 24)
}

export async function lerPlanilhaOrcamentoAntigo(file: File): Promise<ResultadoLeitura> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets['Dados Brutos'] || wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { linhas: [], erros: ['A planilha esta vazia ou em formato nao reconhecido.'] }

  const registrosOriginais = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  const registros = registrosOriginais.map(registro => {
    const normalizado: Record<string, unknown> = {}
    for (const [chave, valor] of Object.entries(registro)) normalizado[normalizarCabecalho(chave)] = valor
    return normalizado
  })

  const obrigatorias = [
    'id_item_orcamento',
    'nome_etapa',
    'codigo_composicao',
    'descricao_composicao',
    'unidade_composicao',
    'quantidade_composicao',
    'codigo_insumo',
    'descricao_insumo',
    'coeficiente',
    'qtd_total_insumo',
    'preco_unit_insumo',
  ]
  const primeira = registros[0] || {}
  const faltantes = obrigatorias.filter(c => !(c in primeira))
  if (faltantes.length) {
    const temModeloResumido = 'etapa' in primeira
      && 'subetapa' in primeira
      && ('serviços' in primeira || 'servicos' in primeira)
      && 'valor' in primeira

    if (!temModeloResumido) {
      return { linhas: [], erros: [`Formato do sistema antigo nao reconhecido. Colunas faltando: ${faltantes.join(', ')}`] }
    }

    const erros: string[] = []
    const linhas = registros.map((r, idx) => {
      const numero = idx + 2
      const etapa = texto(r.etapa)
      const subetapa = texto(r.subetapa) || null
      const descricao = texto(r['serviços'] ?? r.servicos)
      const valor = numeroFlex(r.valor)
      const codigoEtapa = slugCodigo(etapa || 'ETAPA')
      const codigoServico = slugCodigo(descricao || `ITEM-${numero}`)
      const codigo = `LEG-${String(idx + 1).padStart(3, '0')}-${codigoServico}`.slice(0, 36)

      if (!etapa || !descricao || !valor) {
        erros.push(`Linha ${numero}: etapa, servico ou valor vazio.`)
      }

      return {
        numero,
        valores: {
          origem: 'planilha_resumida',
          itemIdAntigo: `RES-${String(idx + 1).padStart(3, '0')}`,
          etapaCodigo: codigoEtapa,
          etapa,
          subetapa,
          codigo,
          descricao,
          unidade: 'UN',
          quantidade: 1,
          custoUnitario: valor,
          custoTotal: valor,
          custoTotalEtapa: 0,
          statusExecucao: texto(r['status execução'] ?? r.status_execucao),
          statusMaterial: texto(r['status material'] ?? r.status_material),
          insumos: [],
        },
      } as LinhaImportada & { valores: Record<string, unknown> & { insumos: InsumoOrcamentoAntigo[] } }
    }).filter(linha => linha.valores.etapa && linha.valores.descricao && linha.valores.custoTotal)

    return { linhas, erros }
  }

  const erros: string[] = []
  const porItem = new Map<string, LinhaImportada & { valores: Record<string, unknown> & { insumos: InsumoOrcamentoAntigo[] } }>()

  registros.forEach((r, idx) => {
    const numero = idx + 2
    const itemId = texto(r.id_item_orcamento)
    const codigo = texto(r.codigo_composicao).toUpperCase()
    const etapa = texto(r.nome_etapa)
    const quantidade = numeroFlex(r.quantidade_composicao)
    const codigoInsumo = texto(r.codigo_insumo).toUpperCase()
    const qtdAdotada = numeroFlex(r.qtd_total_insumo)

    if (!itemId || !codigo || !etapa || !quantidade || !codigoInsumo) {
      erros.push(`Linha ${numero}: item, etapa, composicao, quantidade ou insumo vazio.`)
      return
    }

    if (!porItem.has(itemId)) {
      porItem.set(itemId, {
        numero,
        valores: {
          origem: 'sistema_antigo',
          itemIdAntigo: itemId,
          etapaCodigo: texto(r.etapa_codigo),
          etapa,
          subetapa: texto(r.sub_etapa) || null,
          codigo,
          descricao: texto(r.descricao_composicao),
          unidade: texto(r.unidade_composicao),
          quantidade,
          custoUnitario: numeroFlex(r.custo_unit_composicao),
          custoTotal: numeroFlex(r.custo_total_composicao),
          custoTotalEtapa: numeroFlex(r.custo_total_etapa),
          insumos: [],
        },
      })
    }

    porItem.get(itemId)!.valores.insumos.push({
      codigo: codigoInsumo,
      descricao: texto(r.descricao_insumo),
      categoria: texto(r.categoria_insumo),
      tipo: texto(r.tipo_insumo),
      unidade: texto(r.unidade_insumo),
      coeficiente: numeroFlex(r.coeficiente),
      quantidadeAdotada: qtdAdotada,
      precoUnitario: numeroFlex(r.preco_unit_insumo),
      custoTotal: numeroFlex(r.custo_total_insumo),
    })
  })

  return { linhas: Array.from(porItem.values()), erros }
}

// Exporta os itens atuais do orçamento no mesmo layout tabular do modelo —
// permite baixar, editar (alterar quantidades, adicionar linhas) e reimportar.
export function exportarOrcamentoTabularXLSX(linhas: LinhaOrcamentoTabular[], obraName: string, versao: number) {
  const wb = XLSX.utils.book_new()
  const cabecalho = CONFIG_IMPORT_ORCAMENTO.colunas.map(c => c.rotulo)
  const corpo = linhas.map(l => [l.etapa, l.subetapa ?? '', l.codigo, l.descricao, l.unidade, l.quantidade])
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...corpo])
  ws['!cols'] = CONFIG_IMPORT_ORCAMENTO.colunas.map(c => ({ wch: c.largura ?? 16 }))
  XLSX.utils.book_append_sheet(wb, ws, 'Orçamento')

  const dataStr = new Date().toISOString().split('T')[0]
  const nomeArquivo = `orcamento_tabular_${obraName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_v${versao}_${dataStr}.xlsx`
  XLSX.writeFile(wb, nomeArquivo)
}
