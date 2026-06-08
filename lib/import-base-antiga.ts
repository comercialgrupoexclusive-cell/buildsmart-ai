import * as XLSX from 'xlsx'

export type BaseAntigaInsumo = {
  idAntigo: string
  codigo: string
  descricao: string
  unidade: string
  precoUnitario: number
  tipo: string
  categoria: 'MATERIAL' | 'MAO_DE_OBRA' | 'EQUIPAMENTO' | 'SERVICO'
  grupo: string | null
  ativo: boolean
}

export type BaseAntigaComposicao = {
  idAntigo: string
  codigo: string
  descricao: string
  unidade: string
  ativo: boolean
}

export type BaseAntigaVinculo = {
  idAntigo: string
  composicaoIdAntigo: string
  insumoIdAntigo: string
  insumoDescricao: string
  coeficiente: number
  unidade: string
}

export type BaseAntigaDados = {
  insumos: BaseAntigaInsumo[]
  composicoes: BaseAntigaComposicao[]
  vinculos: BaseAntigaVinculo[]
  erros: string[]
}

function texto(valor: unknown) {
  return String(valor ?? '').trim()
}

function numero(valor: unknown) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const raw = texto(valor)
  if (!raw) return 0
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function ativo(valor: unknown) {
  const raw = texto(valor).toLowerCase()
  if (!raw) return true
  return !['inativo', 'nao', 'false', '0'].includes(raw)
}

function categoriaPorTipo(tipo: string): BaseAntigaInsumo['categoria'] {
  const t = tipo.trim().toUpperCase()
  if (t === 'MO' || t === 'MAO_DE_OBRA') return 'MAO_DE_OBRA'
  if (t === 'E' || t === 'EQ' || t === 'EQUIPAMENTO') return 'EQUIPAMENTO'
  if (t === 'S' || t === 'SERVICO') return 'SERVICO'
  return 'MATERIAL'
}

function linhasDaAba(wb: XLSX.WorkBook, nomes: string[], fallbackIndex: number) {
  const nomeEncontrado = nomes.find(nome => wb.Sheets[nome])
  const ws = nomeEncontrado ? wb.Sheets[nomeEncontrado] : wb.Sheets[wb.SheetNames[fallbackIndex]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }).slice(1)
}

export async function lerBaseAntiga(file: File): Promise<BaseAntigaDados> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const erros: string[] = []

  const insumosRows = linhasDaAba(wb, ['Insumos'], 0)
  const composicoesRows = linhasDaAba(wb, ['Composicoes', 'Composições'], 1)
  const vinculosRows = linhasDaAba(wb, ['Itens_Composicao', 'Itens_Composição'], 2)

  if (!insumosRows.length) erros.push('Aba "Insumos" nao encontrada ou sem dados.')
  if (!composicoesRows.length) erros.push('Aba "Composições" nao encontrada ou sem dados.')
  if (!vinculosRows.length) erros.push('Aba "Itens_Composição" nao encontrada ou sem dados.')

  const insumos = insumosRows.flatMap((row, index) => {
    const idAntigo = texto(row[0])
    const codigo = texto(row[1]).toUpperCase()
    const descricao = texto(row[2])
    const unidade = texto(row[3]).toUpperCase()
    const tipo = texto(row[5]).toUpperCase()
    if (!idAntigo || !codigo || !descricao || !unidade) {
      erros.push(`Insumos linha ${index + 2}: ID, codigo, descricao ou unidade vazio.`)
      return []
    }
    return [{
      idAntigo,
      codigo,
      descricao,
      unidade,
      precoUnitario: numero(row[4]),
      tipo,
      categoria: categoriaPorTipo(tipo),
      grupo: texto(row[6]) || null,
      ativo: ativo(row[7]),
    }]
  })

  const composicoes = composicoesRows.flatMap((row, index) => {
    const idAntigo = texto(row[0])
    const codigo = texto(row[1]).toUpperCase()
    const descricao = texto(row[2])
    const unidade = texto(row[3]).toUpperCase()
    if (!idAntigo || !codigo || !descricao || !unidade) {
      erros.push(`Composições linha ${index + 2}: ID, codigo, descricao ou unidade vazio.`)
      return []
    }
    return [{
      idAntigo,
      codigo,
      descricao,
      unidade,
      ativo: ativo(row[4]),
    }]
  })

  const vinculos = vinculosRows.flatMap((row, index) => {
    const idAntigo = texto(row[0])
    const composicaoIdAntigo = texto(row[1])
    const insumoIdAntigo = texto(row[2])
    const coeficiente = numero(row[4])
    if (!idAntigo || !composicaoIdAntigo || !insumoIdAntigo || coeficiente <= 0) {
      erros.push(`Itens_Composição linha ${index + 2}: ID, composicao, insumo ou coeficiente invalido.`)
      return []
    }
    return [{
      idAntigo,
      composicaoIdAntigo,
      insumoIdAntigo,
      insumoDescricao: texto(row[3]),
      coeficiente,
      unidade: texto(row[5]).toUpperCase(),
    }]
  })

  return { insumos, composicoes, vinculos, erros }
}
