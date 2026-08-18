import type { PortalContentVisibility, PortalVisibility } from './sections'

export type PortalCategoria = 'observacao' | 'duvida' | 'aprovacao' | 'alteracao' | 'pendencia' | 'nao_conformidade'
export type PortalBoardStatus = 'aberto' | 'em_analise' | 'aguardando_cliente' | 'aguardando_equipe' | 'resolvido' | 'arquivado'

export type PortalFeedCommentDTO = {
  id: string
  texto: string
  authorType: 'equipe' | 'cliente' | 'ia'
  autor: string
  createdAt: string
}

export type PortalFeedItemDTO = {
  id: string
  obraId: string
  orcamentoId: string | null
  sourceType: 'manual' | 'diario' | 'comunicado' | 'board' | 'relatorio' | 'album' | 'etapa'
  sourceId: string | null
  titulo: string
  conteudo: string | null
  visibility: 'internal' | 'client' | 'shared'
  isStory: boolean
  storySeen: boolean
  storyViewedAt: string | null
  albumNome: string | null
  publicadoEm: string
  archivedAt: string | null
  autor: string
  files: Array<{ id: string; nome: string; tipo: string; url: string | null; editedAt?: string | null; storyViewedAt?: string | null }>
  likes: number
  likedByMe: boolean
  comments: PortalFeedCommentDTO[]
}

export type PortalMessageDTO = {
  id: string
  authorType: 'equipe' | 'cliente'
  texto: string
  autor: string
  destinatario: string
  createdAt: string
}

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
  dataPrevista: string | null
  valorRealizado: number | null
  dataRealizada: string | null
  condicaoPagamento: 'pix' | 'boleto' | 'cartao' | 'entrada_saldo' | 'outro' | null
  status: 'prevista' | 'confirmada' | 'realizada'
  origem: string
  baseline: boolean
  fornecedorNome?: string | null
}

export type PortalPresentationDTO = {
  overview: {
    payments: {
      materials: { planned: number; paid: number }
      labor: { planned: number; paid: number }
      management: { planned: number; paid: number }
      total: { planned: number; paid: number }
      otherEquipmentPaid: number
    }
    physical: {
      current: number
      next: number
      caixaTotal: number
    }
    monthlyEvolution: Array<{
      month: string
      physical: number
      value: number
      kind: 'realized' | 'forecast'
    }>
  }
  axes: {
    physical: number
    labor: number
    financial: number
    financing: number
  }
  stages: Array<{
    id: string
    name: string
    status: string
    start: string | null
    end: string | null
    physical: number
    labor: number
    budget: number
  }>
  financial: {
    budget: number
    realized: number
    paid: number
    balance: number
    timeline: Array<{ month: string; realized: number; paid: number }>
    entries: Array<{
      id: string
      title: string
      data: string
      value: number
      stage: string
      budget_name: string
      payment_status: string
      supplier: string | null
      payment_method: string | null
    }>
  }
  financing: {
    expected: number
    requested: number
    approved: number
    received: number
    balance: number
    sources: Array<{
      id: string
      type: 'recursos_proprios' | 'financiamento' | 'fgts'
      value: number
      note: string | null
      budgetName: string
    }>
    reimbursements: Array<{
      id: string
      title: string
      status: string
      requested: number
      approved: number
      received: number
      date: string | null
    }>
  }
}

export type PortalContextDTO = {
  access: { id: string; profileId: string | null }
  visibility: PortalVisibility
  contentVisibility: PortalContentVisibility
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
  feed: PortalFeedItemDTO[]
  messages: PortalMessageDTO[]
  previsoes: PortalPrevisaoDTO[]
  presentation: PortalPresentationDTO
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
