import * as XLSX from 'xlsx'
import { ConfigImportacao, normalizarTexto, normalizarNumero } from './import-export-templates'

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
