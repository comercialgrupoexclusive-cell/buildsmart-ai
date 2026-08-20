export type PrevisaoTipo = 'compra_material' | 'desembolso_financeiro' | 'mao_obra' | 'outro'
export type PrevisaoStatus = 'prevista' | 'confirmada' | 'realizada' | 'substituida' | 'cancelada'
export type PrevisaoOrigem = 'manual' | 'orcamento' | 'cronograma' | 'material' | 'compra' | 'ia' | 'baseline_importado'
export type CondicaoPagamento = 'pix' | 'boleto' | 'cartao' | 'entrada_saldo' | 'outro'

export type ObraPrevisao = {
  id: string
  serieId: string
  versao: number
  obraId: string
  orcamentoId: string | null
  orcamentoNome: string
  etapaId: string | null
  etapaNome: string | null
  subetapaId: string | null
  subetapaNome: string | null
  servicoId: string | null
  servicoNome: string | null
  tipo: PrevisaoTipo
  titulo: string
  descricao: string | null
  tituloCliente: string | null
  descricaoCliente: string | null
  valorPrevisto: number | null
  dataPrevista: string | null
  valorRealizado: number | null
  dataRealizada: string | null
  condicaoPagamento: CondicaoPagamento | null
  status: PrevisaoStatus
  origem: PrevisaoOrigem
  baseline: boolean
  publicadoCliente: boolean
  observacaoInterna: string | null
  fornecedorNome: string | null
  externalKey: string | null
  createdAt: string
  updatedAt: string
  // Prazo de fornecimento por material (V1): guardados em obra_previsoes.metadados,
  // presentes apenas quando a previsao veio de uma sugestao de compra de material.
  prazoFornecimentoDias: number | null
  dataNecessidade: string | null
  // true quando a data de inicio no cronograma (planejamento_itens) mudou
  // desde que esta previsao foi criada a partir de uma sugestao do orcamento.
  cronogramaAlterado: boolean
  // Estado de compra, sempre por vinculo estrutural (compra_itens.orcamento_item_id /
  // subetapa_orcamento_item_id) -- nunca por nome. null = sem vinculo estrutural
  // gravado (previsao manual/baseline, ou anterior a esta funcionalidade): não
  // significa "não comprado", significa "não sabemos".
  vinculoEstruturalId: string | null
  compraVinculada: boolean | null
  compraRecebida: boolean
}

export const PREVISAO_TIPO_LABEL: Record<PrevisaoTipo, string> = {
  compra_material: 'Compra de material',
  desembolso_financeiro: 'Desembolso financeiro',
  mao_obra: 'Mão de obra',
  outro: 'Outro compromisso',
}

export const PREVISAO_STATUS_LABEL: Record<PrevisaoStatus, string> = {
  prevista: 'Prevista',
  confirmada: 'Confirmada',
  realizada: 'Realizada',
  substituida: 'Substituída',
  cancelada: 'Cancelada',
}

export const PREVISAO_ORIGEM_LABEL: Record<PrevisaoOrigem, string> = {
  manual: 'Manual',
  orcamento: 'Orçamento',
  cronograma: 'Cronograma',
  material: 'Material',
  compra: 'Compra',
  ia: 'IA',
  baseline_importado: 'Baseline importado',
}

export const CONDICAO_PAGAMENTO_LABEL: Record<CondicaoPagamento, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  cartao: 'Cartão',
  entrada_saldo: 'Entrada + saldo',
  outro: 'Outra condição',
}

export function previsaoTone(status: PrevisaoStatus, dataPrevista: string | null) {
  if (status === 'realizada') return 'success' as const
  if (status === 'cancelada') return 'neutral' as const
  if (!dataPrevista) return 'neutral' as const
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${dataPrevista}T00:00:00`)
  if (due.getTime() < today.getTime()) return 'danger' as const
  if ((due.getTime() - today.getTime()) / 86400000 <= 7) return 'warning' as const
  return 'accent' as const
}

export function previsaoPrazo(dataPrevista: string | null, status: PrevisaoStatus) {
  if (status === 'realizada') return 'Realizada'
  if (status === 'cancelada') return 'Cancelada'
  if (!dataPrevista) return 'Data a definir'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${dataPrevista}T00:00:00`)
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  if (days > 1) return `Em ${days} dias`
  return `${Math.abs(days)} dias em atraso`
}
