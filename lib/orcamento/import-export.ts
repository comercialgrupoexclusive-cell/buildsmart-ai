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
  descricaoModelo: 'Planilha analítica: cada linha repete Etapa, Subetapa e Composição e acrescenta um insumo vinculado à composição.',
  descricaoImportacao: 'As linhas repetidas são agrupadas automaticamente em Etapa → Subetapa → Composição → Insumos. Totais ausentes são calculados e divergências ficam sinalizadas.',
  observacoes: [
    'Para montar uma composição, repita os dados da composição em cada linha e preencha um insumo diferente nas colunas finais.',
    'Serviço com insumos é composição; serviço sem insumos é item livre; linha sem serviço cria somente a subetapa.',
    'A importação cria cópias independentes dentro do orçamento e não altera os catálogos de composições ou insumos.',
    'Quando Valor total estiver vazio, o sistema calcula Quantidade × Valor unitário; para composições com insumos, também pode somar os insumos.',
    'Classifique insumos como Mão de Obra, Material e Serviços ou Equipamento.',
  ],
  colunas: [
    { chave: 'etapa', rotulo: 'Etapa', obrigatoria: true, largura: 28, exemplo: 'Fundações', normalizar: normalizarTexto(true) },
    { chave: 'subetapa', rotulo: 'Subetapa', obrigatoria: false, largura: 22, exemplo: 'Bloco A', normalizar: normalizarTexto(false) },
    { chave: 'valorSubetapa', rotulo: 'Valor subetapa', obrigatoria: false, largura: 18, exemplo: 15000, normalizar: normalizarNumero(false) },
    { chave: 'composicaoDescricao', rotulo: 'Serviço / composição', obrigatoria: false, largura: 42, exemplo: 'Alvenaria de vedação', normalizar: normalizarTexto(false) },
    { chave: 'composicaoGrupo', rotulo: 'Grupo do serviço/item', obrigatoria: false, largura: 22, exemplo: 'Alvenaria', normalizar: normalizarTexto(false) },
    { chave: 'composicaoUnidade', rotulo: 'Unidade composição', obrigatoria: false, largura: 18, exemplo: 'M2', normalizar: normalizarTexto(false) },
    { chave: 'composicaoQuantidade', rotulo: 'Quantidade composição', obrigatoria: false, largura: 20, exemplo: 120, normalizar: normalizarNumero(false) },
    { chave: 'composicaoValorUnitario', rotulo: 'Valor unitário composição', obrigatoria: false, largura: 23, exemplo: 85.5, normalizar: normalizarNumero(false) },
    { chave: 'composicaoValorTotal', rotulo: 'Valor total composição', obrigatoria: false, largura: 22, exemplo: 10260, normalizar: normalizarNumero(false) },
    { chave: 'insumoDescricao', rotulo: 'Insumo', obrigatoria: false, largura: 38, exemplo: 'Bloco cerâmico', normalizar: normalizarTexto(false) },
    { chave: 'insumoClassificacao', rotulo: 'Classificação do insumo', obrigatoria: false, largura: 24, exemplo: 'Material e Serviços', normalizar: normalizarTexto(false, true) },
    { chave: 'insumoGrupo', rotulo: 'Grupo do insumo', obrigatoria: false, largura: 20, exemplo: 'Cerâmicos', normalizar: normalizarTexto(false) },
    { chave: 'insumoUnidade', rotulo: 'Unidade insumo', obrigatoria: false, largura: 16, exemplo: 'UN', normalizar: normalizarTexto(false) },
    { chave: 'insumoCoeficiente', rotulo: 'Coeficiente', obrigatoria: false, largura: 14, exemplo: 13.5, normalizar: normalizarNumero(false) },
    { chave: 'insumoQuantidade', rotulo: 'Quantidade insumo', obrigatoria: false, largura: 18, exemplo: 1620, normalizar: normalizarNumero(false) },
    { chave: 'insumoValorUnitario', rotulo: 'Valor unitário insumo', obrigatoria: false, largura: 20, exemplo: 1.5, normalizar: normalizarNumero(false) },
    { chave: 'insumoValorTotal', rotulo: 'Valor total insumo', obrigatoria: false, largura: 18, exemplo: 2430, normalizar: normalizarNumero(false) },
  ],
  // Import customizado (etapa + composição) — não é um upsert simples por chave,
  // então `tabela`/`chaveUnica` aqui servem apenas para satisfazer o tipo.
  tabela: 'orcamento_itens',
  chaveUnica: 'codigo',
}

export type LinhaOrcamentoTabular = {
  tipo?: 'subetapa' | 'composicao' | 'item_livre'
  etapa: string
  subetapa: string | null
  categoriaSubetapa?: string
  valorSubetapa?: number
  composicaoDescricao?: string
  composicaoClassificacao?: ClassificacaoOrcamento | null
  composicaoGrupo?: string
  composicaoUnidade?: string
  composicaoQuantidade?: number | null
  composicaoValorUnitario?: number | null
  composicaoValorTotal?: number
  insumoDescricao?: string
  insumoClassificacao?: ClassificacaoOrcamento | null
  insumoGrupo?: string
  insumoUnidade?: string
  insumoCoeficiente?: number
  insumoQuantidade?: number
  insumoValorUnitario?: number
  insumoValorTotal?: number
}

export type ClassificacaoOrcamento = 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS'

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

function chaveCabecalho(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
}

function classificacaoFlex(valor: unknown): ClassificacaoOrcamento | null {
  const normalizada = texto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if (normalizada === 'EQUIPAMENTO') return 'EQUIPAMENTO'
  if (normalizada === 'MAO_DE_OBRA') return 'MAO_DE_OBRA'
  if (['MATERIAL', 'SERVICO', 'SERVICOS', 'MATERIAL_SERVICOS', 'MATERIAL_E_SERVICOS'].includes(normalizada)) return 'MATERIAL_SERVICOS'
  return null
}

function classificacaoParaExcel(valor: ClassificacaoOrcamento | null | undefined) {
  if (valor === 'MAO_DE_OBRA') return 'Mão de Obra'
  if (valor === 'EQUIPAMENTO') return 'Equipamento'
  if (valor === 'MATERIAL_SERVICOS') return 'Material e Serviços'
  return ''
}

function diferente(a: number, b: number) {
  return Math.abs(a - b) > Math.max(0.02, Math.abs(b) * 0.001)
}

const OPCOES_CLASSIFICACAO = ['Mão de Obra', 'Material e Serviços', 'Equipamento']

async function salvarPlanilhaComListas(wbXlsx: XLSX.WorkBook, nomeArquivo: string, abasComValidacao: string[]) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const origem = XLSX.write(wbXlsx, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  await workbook.xlsx.load(origem)

  const listas = workbook.addWorksheet('_Listas')
  OPCOES_CLASSIFICACAO.forEach((opcao, indice) => { listas.getCell(indice + 1, 1).value = opcao })
  listas.state = 'veryHidden'

  workbook.worksheets.forEach(worksheet => {
    worksheet.properties.defaultRowHeight = worksheet.properties.defaultRowHeight || 15
  })

  for (const nomeAba of abasComValidacao) {
    const worksheet = workbook.getWorksheet(nomeAba)
    if (!worksheet) continue
    const validations = (worksheet as unknown as {
      dataValidations: { add: (range: string, validation: Record<string, unknown>) => void }
    }).dataValidations
    validations.add('K2:K5000', {
      type: 'list', allowBlank: true, formulae: ["'_Listas'!$A$1:$A$3"],
      showErrorMessage: true, errorTitle: 'Classificação inválida', error: 'Escolha uma opção da lista.',
    })
  }

  const destino = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([destino as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  link.click()
  URL.revokeObjectURL(url)
}

export async function baixarModeloOrcamentoAnaliticoXLSX() {
  const wb = XLSX.utils.book_new()
  const cabecalho = CONFIG_IMPORT_ORCAMENTO.colunas.map(coluna => coluna.rotulo)
  const ws = XLSX.utils.aoa_to_sheet([cabecalho])
  ws['!cols'] = CONFIG_IMPORT_ORCAMENTO.colunas.map(coluna => ({ wch: coluna.largura ?? 16 }))
  ws['!autofilter'] = { ref: 'A1:Q1' }
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }
  XLSX.utils.book_append_sheet(wb, ws, 'Orçamento')

  const exemplo = [
    cabecalho,
    ['Fundações', 'Bloco A', 15000, 'Alvenaria de vedação', 'Alvenaria', 'M2', 120, 85.5, 10260, 'Bloco cerâmico', 'Material e Serviços', 'Cerâmicos', 'UN', 13.5, 1620, 1.5, 2430],
    ['Fundações', 'Bloco A', 15000, 'Alvenaria de vedação', 'Alvenaria', 'M2', 120, 85.5, 10260, 'Argamassa', 'Material e Serviços', 'Argamassas', 'KG', 18, 2160, 3.625, 7830],
    ['Fundações', 'Bloco A', 15000, 'Frete local', 'Fretes', 'VB', 1, 4740, 4740, '', '', '', '', '', '', '', ''],
  ]
  const wsExemplo = XLSX.utils.aoa_to_sheet(exemplo)
  wsExemplo['!cols'] = CONFIG_IMPORT_ORCAMENTO.colunas.map(coluna => ({ wch: coluna.largura ?? 16 }))
  for (let linha = 2; linha <= exemplo.length; linha++) {
    for (const coluna of ['C', 'H', 'I', 'P', 'Q']) {
      if (wsExemplo[`${coluna}${linha}`]) wsExemplo[`${coluna}${linha}`].z = 'R$ #,##0.00'
    }
  }
  XLSX.utils.book_append_sheet(wb, wsExemplo, 'Exemplo')

  const instrucoes = [
    ['Como preencher'],
    ['1. Preencha somente a aba Orçamento. A aba Exemplo não é importada.'],
    ['2. Repita Etapa, Subetapa e todos os dados da composição para cada insumo que pertence a ela.'],
    ['3. O sistema agrupa pela Etapa, Subetapa e descrição da composição. Use a mesma descrição nas linhas dos seus insumos.'],
    ['4. Em linhas consecutivas de insumos da mesma composição, campos de hierarquia vazios herdam os dados da linha anterior.'],
    ['5. Totais vazios são calculados por Quantidade × Valor unitário.'],
    ['6. Serviço com insumos é composição; serviço sem insumos é item livre; linha sem serviço cria somente a subetapa.'],
    ['7. Se total informado divergir do cálculo ou da soma dos insumos, o valor é preservado e sinalizado em vermelho.'],
    ['8. Classifique os insumos como Mão de Obra, Material e Serviços ou Equipamento usando a lista suspensa.'],
    ['9. A importação não cadastra itens nos catálogos mestres.'],
  ]
  const wsInstrucoes = XLSX.utils.aoa_to_sheet(instrucoes)
  wsInstrucoes['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções')
  await salvarPlanilhaComListas(wb, 'modelo_orcamento_analitico.xlsx', ['Orçamento', 'Exemplo'])
}

export async function lerPlanilhaOrcamentoAnalitico(file: File): Promise<ResultadoLeitura> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets['Orçamento'] || wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { linhas: [], erros: ['A planilha está vazia.'], avisos: [] }

  const registros = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  const rotuloPorChave = new Map(CONFIG_IMPORT_ORCAMENTO.colunas.map(coluna => [chaveCabecalho(coluna.rotulo), coluna.chave]))
  const erros: string[] = []
  const avisos: string[] = []
  const invalidas = new Set<number>()
  const linhas: LinhaImportada[] = []
  let contextoAnterior: Record<string, unknown> | null = null

  registros.forEach((registro, indice) => {
    const numero = indice + 2
    const valoresBrutos: Record<string, unknown> = {}
    for (const [cabecalho, valor] of Object.entries(registro)) {
      const chave = rotuloPorChave.get(chaveCabecalho(cabecalho))
      if (chave) valoresBrutos[chave] = valor
    }
    if (!Object.values(valoresBrutos).some(valor => texto(valor))) return

    const etapaFoiInformada = Boolean(texto(valoresBrutos.etapa))
    if (!etapaFoiInformada && contextoAnterior) {
      valoresBrutos.etapa = contextoAnterior.etapa
      valoresBrutos.subetapa = contextoAnterior.subetapa
      valoresBrutos.valorSubetapa = contextoAnterior.valorSubetapa
    }

    const temInsumo = Boolean(texto(valoresBrutos.insumoDescricao))
    const descricaoAtual = texto(valoresBrutos.composicaoDescricao).toLowerCase()
    const mesmaComposicaoAnterior = Boolean(contextoAnterior && temInsumo && (
      !descricaoAtual
      || (descricaoAtual && descricaoAtual === texto(contextoAnterior.composicaoDescricao).toLowerCase())
    ))
    if (mesmaComposicaoAnterior && contextoAnterior) {
      for (const chave of [
        'composicaoDescricao', 'composicaoGrupo', 'composicaoUnidade', 'composicaoQuantidade',
        'composicaoValorUnitario', 'composicaoValorTotal',
      ]) {
        if (!texto(valoresBrutos[chave])) valoresBrutos[chave] = contextoAnterior[chave]
      }
    }

    const etapa = texto(valoresBrutos.etapa)
    const subetapa = texto(valoresBrutos.subetapa) || null
    const descricao = texto(valoresBrutos.composicaoDescricao)
    const insumoDescricao = texto(valoresBrutos.insumoDescricao)
    const tipo = descricao ? (insumoDescricao ? 'COMPOSICAO' : 'ITEM_LIVRE') : subetapa ? 'SUBETAPA' : ''
    if (!etapa) { erros.push(`Linha ${numero}: Etapa é obrigatória.`); invalidas.add(numero) }
    if (!['COMPOSICAO', 'ITEM_LIVRE', 'SUBETAPA'].includes(tipo)) { erros.push(`Linha ${numero}: Tipo inválido.`); invalidas.add(numero) }
    if (tipo !== 'SUBETAPA' && !descricao) { erros.push(`Linha ${numero}: Serviço / composição é obrigatório.`); invalidas.add(numero) }

    const qtdComposicao = numeroFlex(valoresBrutos.composicaoQuantidade) || 1
    let unitComposicao = numeroFlex(valoresBrutos.composicaoValorUnitario)
    let totalComposicao = numeroFlex(valoresBrutos.composicaoValorTotal)
    if (qtdComposicao <= 0 || unitComposicao < 0 || totalComposicao < 0) { erros.push(`Linha ${numero}: quantidades e valores da composição não podem ser negativos ou nulos.`); invalidas.add(numero) }
    if (!totalComposicao && unitComposicao) totalComposicao = qtdComposicao * unitComposicao
    if (!unitComposicao && totalComposicao && qtdComposicao) unitComposicao = totalComposicao / qtdComposicao
    if (totalComposicao && unitComposicao && diferente(totalComposicao, qtdComposicao * unitComposicao)) {
      avisos.push(`Linha ${numero}: total da composição diverge de quantidade × valor unitário.`)
    }

    const insumoClassificacao = classificacaoFlex(valoresBrutos.insumoClassificacao)
    const insumoUnidade = texto(valoresBrutos.insumoUnidade)
    let insumoCoeficiente = numeroFlex(valoresBrutos.insumoCoeficiente)
    let insumoQuantidade = numeroFlex(valoresBrutos.insumoQuantidade)
    let insumoValorUnitario = numeroFlex(valoresBrutos.insumoValorUnitario)
    let insumoValorTotal = numeroFlex(valoresBrutos.insumoValorTotal)
    if (insumoDescricao) {
      if (!insumoClassificacao) { erros.push(`Linha ${numero}: Classificação do insumo é obrigatória e inválida.`); invalidas.add(numero) }
      if (!insumoUnidade) { erros.push(`Linha ${numero}: Unidade do insumo é obrigatória.`); invalidas.add(numero) }
      if (!insumoQuantidade && insumoCoeficiente) insumoQuantidade = insumoCoeficiente * qtdComposicao
      if (!insumoCoeficiente && insumoQuantidade && qtdComposicao) insumoCoeficiente = insumoQuantidade / qtdComposicao
      if (!insumoQuantidade) { erros.push(`Linha ${numero}: informe Quantidade insumo ou Coeficiente.`); invalidas.add(numero) }
      if (!insumoValorTotal && insumoValorUnitario) insumoValorTotal = insumoQuantidade * insumoValorUnitario
      if (!insumoValorUnitario && insumoValorTotal && insumoQuantidade) insumoValorUnitario = insumoValorTotal / insumoQuantidade
      if (!insumoValorUnitario && !insumoValorTotal) avisos.push(`Linha ${numero}: insumo sem valor; será importado com R$ 0,00.`)
      if (insumoValorTotal && insumoValorUnitario && diferente(insumoValorTotal, insumoQuantidade * insumoValorUnitario)) {
        avisos.push(`Linha ${numero}: total do insumo diverge de quantidade × valor unitário.`)
      }
    }
    if (tipo !== 'SUBETAPA' && !texto(valoresBrutos.composicaoUnidade)) { erros.push(`Linha ${numero}: Unidade da composição é obrigatória.`); invalidas.add(numero) }
    if (tipo !== 'SUBETAPA' && !texto(valoresBrutos.composicaoGrupo)) avisos.push(`Linha ${numero}: composição sem grupo.`)
    if (insumoDescricao && !texto(valoresBrutos.insumoGrupo)) avisos.push(`Linha ${numero}: insumo sem grupo.`)

    linhas.push({
      numero,
      valores: {
        origem: 'orcamento_analitico', etapa, subetapa,
        valorSubetapa: numeroFlex(valoresBrutos.valorSubetapa),
        categoriaSubetapa: '', tipo,
        composicaoDescricao: descricao,
        composicaoClassificacao: null,
        composicaoGrupo: texto(valoresBrutos.composicaoGrupo),
        composicaoUnidade: texto(valoresBrutos.composicaoUnidade) || 'UN',
        composicaoQuantidade: qtdComposicao,
        composicaoValorUnitario: unitComposicao,
        composicaoValorTotal: totalComposicao,
        insumoDescricao, insumoClassificacao,
        insumoGrupo: texto(valoresBrutos.insumoGrupo), insumoUnidade,
        insumoCoeficiente, insumoQuantidade, insumoValorUnitario, insumoValorTotal,
      },
    })
    contextoAnterior = { ...valoresBrutos }
  })

  const validas = linhas.filter(linha => !invalidas.has(linha.numero))
  const grupos = new Map<string, LinhaImportada[]>()
  for (const linha of validas.filter(linha => linha.valores.tipo !== 'SUBETAPA')) {
    const chave = [linha.valores.etapa, linha.valores.subetapa, linha.valores.composicaoDescricao].map(valor => texto(valor).toLowerCase()).join('|')
    grupos.set(chave, [...(grupos.get(chave) || []), linha])
  }
  for (const grupo of grupos.values()) {
    const primeira = grupo[0]
    const tipoGrupo = grupo.some(linha => texto(linha.valores.insumoDescricao)) ? 'COMPOSICAO' : 'ITEM_LIVRE'
    grupo.forEach(linha => { linha.valores.tipo = tipoGrupo })
    const qtd = grupo.map(linha => Number(linha.valores.composicaoQuantidade || 0)).find(valor => valor > 0) || 1
    const unit = grupo.map(linha => Number(linha.valores.composicaoValorUnitario || 0)).find(valor => valor > 0) || 0
    let total = grupo.map(linha => Number(linha.valores.composicaoValorTotal || 0)).find(valor => valor > 0) || 0
    const somaInsumos = grupo.reduce((soma, linha) => soma + Number(linha.valores.insumoValorTotal || 0), 0)
    const somaInsumosCalculada = grupo.reduce((soma, linha) => soma + Number(linha.valores.insumoQuantidade || 0) * Number(linha.valores.insumoValorUnitario || 0), 0)
    const insumosVistos = new Set<string>()
    for (const linha of grupo.filter(item => item.valores.insumoDescricao)) {
      const chaveInsumo = texto(linha.valores.insumoDescricao).toLowerCase()
      if (insumosVistos.has(chaveInsumo)) { erros.push(`Linha ${linha.numero}: insumo repetido dentro da mesma composição.`); grupo.forEach(item => invalidas.add(item.numero)) }
      insumosVistos.add(chaveInsumo)
    }
    for (const linha of grupo.slice(1)) {
      if (texto(linha.valores.composicaoDescricao).toLowerCase() !== texto(primeira.valores.composicaoDescricao).toLowerCase()) { erros.push(`Linha ${linha.numero}: descrição da composição difere das outras linhas com o mesmo código.`); grupo.forEach(item => invalidas.add(item.numero)) }
      if (Number(linha.valores.composicaoQuantidade || 0) > 0 && diferente(Number(linha.valores.composicaoQuantidade), qtd)) { erros.push(`Linha ${linha.numero}: quantidade da composição difere das outras linhas do mesmo serviço.`); grupo.forEach(item => invalidas.add(item.numero)) }
      if (unit && Number(linha.valores.composicaoValorUnitario || 0) && diferente(Number(linha.valores.composicaoValorUnitario), unit)) { erros.push(`Linha ${linha.numero}: valor unitário da composição difere das outras linhas do mesmo serviço.`); grupo.forEach(item => invalidas.add(item.numero)) }
      if (total && Number(linha.valores.composicaoValorTotal || 0) && diferente(Number(linha.valores.composicaoValorTotal), total)) { erros.push(`Linha ${linha.numero}: valor total da composição difere das outras linhas do mesmo serviço.`); grupo.forEach(item => invalidas.add(item.numero)) }
      if (texto(linha.valores.composicaoGrupo) && texto(linha.valores.composicaoGrupo).toLowerCase() !== texto(primeira.valores.composicaoGrupo).toLowerCase()) { erros.push(`Linha ${linha.numero}: grupo da composição difere das outras linhas do mesmo serviço.`); grupo.forEach(item => invalidas.add(item.numero)) }
      if (texto(linha.valores.composicaoUnidade) && texto(linha.valores.composicaoUnidade).toLowerCase() !== texto(primeira.valores.composicaoUnidade).toLowerCase()) { erros.push(`Linha ${linha.numero}: unidade da composição difere das outras linhas do mesmo serviço.`); grupo.forEach(item => invalidas.add(item.numero)) }
    }
    if (!total && somaInsumos) total = somaInsumos
    if (!total && !somaInsumos) avisos.push(`Composição "${primeira.valores.composicaoDescricao}": nenhum valor informado; será importada com R$ 0,00.`)
    if (!primeira.valores.composicaoValorUnitario && total && qtd) primeira.valores.composicaoValorUnitario = total / qtd
    if (somaInsumos && total && diferente(total, somaInsumos)) avisos.push(`Composição "${primeira.valores.composicaoDescricao}": total informado diverge da soma dos insumos.`)
    for (const linha of grupo) {
      linha.valores.composicaoQuantidade = qtd
      linha.valores.composicaoValorTotal = total
      linha.valores.composicaoValorUnitario = primeira.valores.composicaoValorUnitario || unit || (total && qtd ? total / qtd : 0)
      linha.valores._somaInsumos = somaInsumos
      linha.valores._somaInsumosCalculada = somaInsumosCalculada
      linha.valores._divergenciaComposicao = Boolean(somaInsumos && total && diferente(total, somaInsumos))
        || Boolean(total && unit && diferente(total, qtd * unit))
        || grupo.some(item => Number(item.valores.insumoValorTotal || 0) > 0 && diferente(Number(item.valores.insumoValorTotal), Number(item.valores.insumoQuantidade || 0) * Number(item.valores.insumoValorUnitario || 0)))
    }
  }

  const totaisSubetapa = new Map<string, number>()
  for (const grupo of grupos.values()) {
    if (grupo.some(linha => invalidas.has(linha.numero))) continue
    const primeira = grupo[0]
    const chave = [primeira.valores.etapa, primeira.valores.subetapa].map(valor => texto(valor).toLowerCase()).join('|')
    totaisSubetapa.set(chave, (totaisSubetapa.get(chave) || 0) + Number(primeira.valores.composicaoValorTotal || 0))
  }
  const valoresSubetapa = new Map<string, number>()
  for (const linha of validas.filter(item => item.valores.subetapa)) {
    const chave = [linha.valores.etapa, linha.valores.subetapa].map(valor => texto(valor).toLowerCase()).join('|')
    const valor = Number(linha.valores.valorSubetapa || 0)
    if (valoresSubetapa.has(chave) && valor && diferente(valor, valoresSubetapa.get(chave)!)) { erros.push(`Linha ${linha.numero}: Valor subetapa difere das outras linhas da mesma subetapa.`); validas.filter(item => [item.valores.etapa, item.valores.subetapa].map(v => texto(v).toLowerCase()).join('|') === chave).forEach(item => invalidas.add(item.numero)) }
    else if (valor) valoresSubetapa.set(chave, valor)
  }
  for (const [chave, valor] of valoresSubetapa) {
    const calculado = totaisSubetapa.get(chave) || 0
    if (diferente(valor, calculado)) avisos.push(`Subetapa "${chave.split('|')[1]}": valor informado diverge da soma das composições.`)
  }

  return { linhas: validas.filter(linha => !invalidas.has(linha.numero)), erros, avisos: [...new Set(avisos)] }
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
          statusExecucao: texto(r.status_execucao_origem ?? r.status_execucao),
          statusMaterial: texto(r.status_material_origem ?? r.status_material),
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
export async function exportarOrcamentoTabularXLSX(linhas: LinhaOrcamentoTabular[], obraName: string, versao: number) {
  const wb = XLSX.utils.book_new()
  const cabecalho = CONFIG_IMPORT_ORCAMENTO.colunas.map(c => c.rotulo)
  const corpo = linhas.map(l => [
    l.etapa,
    l.subetapa ?? '',
    l.valorSubetapa ?? '',
    l.composicaoDescricao ?? '',
    l.composicaoGrupo ?? '',
    l.composicaoUnidade ?? '',
    l.composicaoQuantidade ?? '',
    l.composicaoValorUnitario ?? '',
    l.composicaoValorTotal ?? '',
    l.insumoDescricao ?? '',
    classificacaoParaExcel(l.insumoClassificacao),
    l.insumoGrupo ?? '',
    l.insumoUnidade ?? '',
    l.insumoCoeficiente ?? '',
    l.insumoQuantidade ?? '',
    l.insumoValorUnitario ?? '',
    l.insumoValorTotal ?? '',
  ])
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...corpo])
  ws['!cols'] = CONFIG_IMPORT_ORCAMENTO.colunas.map(c => ({ wch: c.largura ?? 16 }))
  ws['!autofilter'] = { ref: `A1:Q${Math.max(corpo.length + 1, 2)}` }
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }
  for (let row = 2; row <= corpo.length + 1; row++) {
    for (const column of ['C', 'H', 'I', 'P', 'Q']) {
      const cell = ws[`${column}${row}`]
      if (cell && typeof cell.v === 'number') cell.z = 'R$ #,##0.00'
    }
    for (const column of ['G', 'N', 'O']) {
      const cell = ws[`${column}${row}`]
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.000'
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Orçamento')

  const dataStr = new Date().toISOString().split('T')[0]
  const nomeArquivo = `orcamento_tabular_${obraName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_v${versao}_${dataStr}.xlsx`
  await salvarPlanilhaComListas(wb, nomeArquivo, ['Orçamento'])
}
