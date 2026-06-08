import * as XLSX from 'xlsx'

// ─── Modelos de planilha para importação em massa ────────────────────────────
// Define, de forma declarativa, as colunas de uma planilha de importação:
// como gerar o arquivo-modelo (cabeçalho + exemplo + observações) e como ler
// e validar uma planilha preenchida pelo usuário, linha a linha.

export type ColunaModelo = {
  chave: string                // nome da coluna no objeto resultante (= coluna da tabela)
  rotulo: string               // cabeçalho exibido na planilha
  obrigatoria: boolean
  largura?: number
  exemplo: string | number
  // Recebe o valor cru da célula e devolve o valor pronto para gravar no banco,
  // ou um erro de validação (mensagem curta, sem o prefixo "linha N").
  normalizar: (bruto: unknown) => { valor?: unknown; erro?: string }
}

export type ConfigImportacao = {
  chave: string                // identifica o tipo (usado em nomes de arquivo)
  titulo: string               // "Composições próprias"
  nomeAba: string              // nome da aba no Excel
  descricaoModelo: string      // texto exibido acima do botão "Baixar modelo"
  descricaoImportacao: string  // texto exibido acima da área de upload
  observacoes: string[]        // notas gravadas no rodapé da planilha-modelo
  colunas: ColunaModelo[]
  tabela: string               // tabela do Supabase para upsert
  chaveUnica: string           // coluna usada para detectar duplicados (ex.: 'codigo')
}

export type LinhaImportada = {
  numero: number               // número da linha na planilha (para mensagens de erro)
  valores: Record<string, unknown>
}

export type ResultadoLeitura = {
  linhas: LinhaImportada[]
  erros: string[]
}

// ─── Normalizadores reutilizáveis ────────────────────────────────────────────
export function normalizarTexto(obrigatoria: boolean, maiusculas = false) {
  return (bruto: unknown): { valor?: unknown; erro?: string } => {
    const texto = String(bruto ?? '').trim()
    if (!texto) return obrigatoria ? { erro: 'campo obrigatório vazio' } : { valor: null }
    return { valor: maiusculas ? texto.toUpperCase() : texto }
  }
}

export function normalizarOpcao(opcoes: readonly string[], padrao: string) {
  return (bruto: unknown): { valor?: unknown; erro?: string } => {
    const texto = String(bruto ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
    if (!texto) return { valor: padrao }
    if (!opcoes.includes(texto)) {
      return { erro: `valor inválido "${String(bruto)}" — use um de: ${opcoes.join(', ')}` }
    }
    return { valor: texto }
  }
}

export function normalizarNumero(obrigatoria: boolean, padrao = 0) {
  return (bruto: unknown): { valor?: unknown; erro?: string } => {
    if (bruto === '' || bruto == null) {
      return obrigatoria ? { erro: 'campo numérico obrigatório vazio' } : { valor: padrao }
    }
    const num = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(num)) return { erro: `valor numérico inválido "${String(bruto)}"` }
    return { valor: num }
  }
}

const VALORES_VERDADEIROS = ['sim', 'verdadeiro', 'true', '1', 'ativo', 'x']
const VALORES_FALSOS = ['não', 'nao', 'falso', 'false', '0', 'inativo']

export function normalizarBooleano(padrao: boolean) {
  return (bruto: unknown): { valor?: unknown; erro?: string } => {
    if (bruto === '' || bruto == null) return { valor: padrao }
    if (typeof bruto === 'boolean') return { valor: bruto }
    const texto = String(bruto).trim().toLowerCase()
    if (VALORES_VERDADEIROS.includes(texto)) return { valor: true }
    if (VALORES_FALSOS.includes(texto)) return { valor: false }
    return { erro: `valor "${String(bruto)}" não reconhecido — use Sim ou Não` }
  }
}

// ─── Geração do arquivo-modelo (.xlsx) ───────────────────────────────────────
export function baixarModeloXLSX(config: ConfigImportacao) {
  const wb = XLSX.utils.book_new()

  const cabecalho = config.colunas.map(c => `${c.rotulo}${c.obrigatoria ? ' *' : ''}`)
  const exemplo = config.colunas.map(c => c.exemplo)

  const linhas: unknown[][] = [cabecalho, exemplo, []]
  linhas.push(['Observações:'])
  linhas.push(['- Campos marcados com * são obrigatórios.'])
  for (const obs of config.observacoes) linhas.push([`- ${obs}`])
  linhas.push(['- Apague a linha de exemplo antes de importar (ou deixe — ela será sobrescrita pelo código repetido).'])

  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws['!cols'] = config.colunas.map(c => ({ wch: c.largura ?? Math.max(14, c.rotulo.length + 2) }))
  XLSX.utils.book_append_sheet(wb, ws, config.nomeAba)

  XLSX.writeFile(wb, `modelo_${config.chave}_buildsmart.xlsx`)
}

// ─── Leitura e validação da planilha preenchida ──────────────────────────────
export async function lerPlanilhaImportacao(file: File, config: ConfigImportacao): Promise<ResultadoLeitura> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { linhas: [], erros: ['A planilha está vazia ou em formato não reconhecido.'] }

  const registros = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  const erros: string[] = []
  const linhas: LinhaImportada[] = []

  // Mapa rótulo (sem o "*") → chave da coluna, para casar com o cabeçalho da planilha
  const mapaRotulos = new Map(config.colunas.map(c => [c.rotulo.trim().toLowerCase(), c.chave]))

  registros.forEach((registro, idx) => {
    const numero = idx + 2 // +1 cabeçalho, +1 índice 1-based
    const valores: Record<string, unknown> = {}
    let linhaTemDado = false
    let linhaComErro = false

    for (const [rotuloBruto, valorBruto] of Object.entries(registro)) {
      const rotulo = String(rotuloBruto).replace('*', '').trim().toLowerCase()
      const chave = mapaRotulos.get(rotulo)
      if (!chave) continue
      if (String(valorBruto ?? '').trim() !== '') linhaTemDado = true
    }

    if (!linhaTemDado) return // ignora linhas em branco

    for (const coluna of config.colunas) {
      // Localiza o valor na linha pelo rótulo (com ou sem o sufixo " *")
      const entrada = Object.entries(registro).find(([r]) => {
        const limpo = String(r).replace('*', '').trim().toLowerCase()
        return limpo === coluna.rotulo.trim().toLowerCase()
      })
      const bruto = entrada ? entrada[1] : ''
      const { valor, erro } = coluna.normalizar(bruto)
      if (erro) {
        erros.push(`Linha ${numero}, coluna "${coluna.rotulo}": ${erro}`)
        linhaComErro = true
        continue
      }
      valores[coluna.chave] = valor
    }

    if (!linhaComErro) linhas.push({ numero, valores })
  })

  return { linhas, erros }
}
