import type { PortalVisibility } from './sections'

export type PortalCategoria = 'observacao' | 'duvida' | 'aprovacao' | 'alteracao' | 'pendencia' | 'nao_conformidade'
export type PortalBoardStatus = 'aberto' | 'em_analise' | 'aguardando_cliente' | 'aguardando_equipe' | 'resolvido' | 'arquivado'

export type PortalOrcamentoDTO = {
  id: string
  nome: string
  status: string
  versao: number
}
export type PortalBoardCommentDTO = {
  id: string
  mensagem: string
  autorTipo: 'equipe' | 'cliente' | 'ia'
  createdAt: string
}

export type PortalTourReferenceDTO = {
  hotspotId: string
  nodeId: string
  yaw: number
  pitch: number
}

export type PortalBoardItemDTO = {
  id: string
  titulo: string
  descricao: string | null
  categoria: PortalCategoria
  status: PortalBoardStatus
  ambiente: string | null
  orcamentoId: string | null
  createdByType: 'equipe' | 'cliente' | 'ia'
  createdAt: string
  comments: PortalBoardCommentDTO[]
  tour: PortalTourReferenceDTO | null
}

export type PortalTourHotspotDTO = {
  id: string
  titulo: string
  descricao: string | null
  tipo: PortalCategoria
  yaw: number
  pitch: number
  boardItemId: string | null
}

export type PortalTourLinkDTO = {
  id: string
  nodeDestinoId: string
  yaw: number
  pitch: number
  label: string | null
}

export type PortalTourNodeDTO = {
  id: string
  nome: string
  pavimento: string | null
  ambiente: string | null
  imagemUrl: string
  thumbnailUrl: string | null
  yawInicial: number
  pitchInicial: number
  links: PortalTourLinkDTO[]
  hotspots: PortalTourHotspotDTO[]
}

export type PortalTourDTO = {
  id: string
  nome: string
  tipo: 'projeto' | 'obra'
  descricao: string | null
  nodes: PortalTourNodeDTO[]
}

export type PortalPrevisaoDTO = {
  id: string
  orcamentoId: string | null
  orcamentoNome: string
  etapaNome: string | null
  tipo: 'compra_material' | 'desembolso_financeiro' | 'mao_obra' | 'outro'
  titulo: string
  descricao: string | null
  valorPrevisto: number | null
  dataPrevista: string
  valorRealizado: number | null
  dataRealizada: string | null
  condicaoPagamento: 'pix' | 'boleto' | 'cartao' | 'entrada_saldo' | 'outro' | null
  status: 'prevista' | 'confirmada' | 'realizada'
  origem: string
  baseline: boolean
}

export type PortalContextDTO = {
  access: { id: string; profileId: string | null }
  visibility: PortalVisibility
  obra: {
    id: string
    nome: string
    endereco: string | null
    fotoUrl: string | null
    status: string
    dataInicio: string | null
    dataPrevisao: string | null
  }
  orcamentos: PortalOrcamentoDTO[]
  selectedOrcamentoId: string
  summary: {
    valorOrcado: number
    avancoFisico: number
    realizadoFinanceiro: number
    pago: number
    financiamentoPrevisto: number
    financiamentoRecebido: number
  }
  cronograma: Array<{
    id: string
    nome: string
    status: string
    inicio: string | null
    fim: string | null
    percentual: number
    filhos: Array<{ id: string; nome: string; status: string; inicio: string | null; fim: string | null; percentual: number }>
  }>
  boardItems: PortalBoardItemDTO[]
  tours: PortalTourDTO[]
  previsoes: PortalPrevisaoDTO[]
  documentos: Array<{
    id: string
    nome: string
    tipo: string
    categoria: string
    url: string | null
    createdAt: string
  }>
}

export type PortalTourPosition = {
  nodeId: string
  ambiente?: string | null
  yaw: number
  pitch: number
}
