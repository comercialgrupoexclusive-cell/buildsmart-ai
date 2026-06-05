export type Profile = {
  id: string
  name: string
  photo_url: string | null
  theme_color: string
  dark_mode: boolean
  onboarding_done: boolean
  password_hash: string | null
  created_at: string
}

export type Obra = {
  id: string
  nome: string
  endereco: string
  foto_url: string | null
  status: 'orcamento' | 'ativa' | 'concluida' | 'paralisada'
  data_inicio: string | null
  data_previsao: string | null
  responsavel: string | null
  created_at: string
}

export type Orcamento = {
  id: string
  obra_id: string
  tipo: 'executivo' | 'parametrico'
  bdi_percentual: number
  status: 'rascunho' | 'ativo' | 'finalizado'
  versao: number
  created_at: string
}

export type OrcamentoItem = {
  id: string
  orcamento_id: string
  etapa_id: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  quantidade: number
  preco_unitario_snapshot: number
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  unidade_snapshot: string | null
  updated_at: string
  composicao?: ComposicaoPropria | null
  sinapi_composicao?: SinapiComposicao | null
}

export type SinapiInsumo = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  preco_unitario: number
  estado: string
  mes_referencia: string
  categoria: string
}

export type SinapiComposicao = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  custo_unitario: number
  grupo: string
}

export type ComposicaoPropria = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  grupo: string
  ativo: boolean
  created_at: string
  insumos?: ComposicaoInsumo[]
  custo_calculado?: number
}

export type ComposicaoInsumo = {
  id: string
  composicao_id: string
  insumo_id: string
  coeficiente: number
  insumo?: SinapiInsumo
}

export type Etapa = {
  id: string
  obra_id: string
  nome: string
  data_inicio: string | null
  data_fim: string | null
  status: 'planejada' | 'em_andamento' | 'concluida' | 'atrasada'
  ordem: number
}

export type EtapaComposicao = {
  id: string
  etapa_id: string
  composicao_id: string
  quantidade: number
}

export type Material = {
  id: string
  obra_id: string
  etapa_id: string | null
  insumo_id: string
  quantidade_total: number
  quantidade_comprada: number
  status_compra: 'nao_comprado' | 'parcial' | 'comprado'
  data_necessidade: string | null
  insumo?: SinapiInsumo
  etapa?: Etapa
}

export type Medicao = {
  id: string
  obra_id: string
  etapa_id: string | null
  periodo_inicio: string
  periodo_fim: string
  percentual_executado: number
  observacao: string | null
  created_at: string
}

export type AlertaPreditivo = {
  obra_id: string
  obra_nome: string
  etapa_nome: string
  dias_para_inicio: number
  materiais_pendentes: number
}
