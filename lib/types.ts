// ─── Perfil ───────────────────────────────────────────────────────────────────
export type Profile = {
  id: string
  name: string
  photo_url: string | null
  theme_color: string
  dark_mode: boolean
  onboarding_done: boolean
  password_hash: string | null
  tipo: 'admin' | 'usuario' | 'cliente' | 'prestador'
  pode_excluir: boolean
  apelido: string | null
  descricao: string | null
  cidade: string | null
  estado: string | null          // CHAR(2) UF — usado para previsão do tempo
  created_at: string
}

// ─── Vínculo Obra ↔ Usuário ───────────────────────────────────────────────────
export type ObraUsuario = {
  obra_id: string
  profile_id: string
  papel: string
  created_at: string
  profile?: Profile
}

// ─── Obra ─────────────────────────────────────────────────────────────────────
export type Obra = {
  id: string
  nome: string
  endereco: string
  foto_url: string | null
  status: 'orcamento' | 'ativa' | 'concluida' | 'paralisada'
  data_inicio: string | null
  data_previsao: string | null
  responsavel: string | null
  area_m2: number | null
  uf: string                   // CHAR(2): AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO
  created_at: string
}

// ─── Orçamento ────────────────────────────────────────────────────────────────
export type Orcamento = {
  id: string
  obra_id: string
  tipo: 'executivo' | 'parametrico'
  bdi_percentual: number
  status: 'rascunho' | 'ativo' | 'finalizado'
  versao: number
  created_at: string
}

// ─── Orçamento — Item ─────────────────────────────────────────────────────────
export type OrcamentoItem = {
  id: string
  orcamento_id: string
  etapa_id: string | null
  subetapa: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  data_inicio: string | null
  data_fim: string | null
  quantidade: number
  preco_unitario_snapshot: number
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  unidade_snapshot: string | null
  updated_at: string
  composicao?: ComposicaoPropria | null
  sinapi_composicao?: SinapiComposicao | null
}

// ─── Orçamento — Insumo por item (override de quantidade) ────────────────────
export type OrcamentoItemInsumo = {
  id: string
  orcamento_item_id: string
  sinapi_codigo: string
  quantidade_calculada: number
  quantidade_adotada: number | null   // null = usar calculada
  preco_unitario_snapshot: number
}

// ─── SINAPI — Insumo (ISE) ────────────────────────────────────────────────────
// precos = mapa UF → preço mediano (R$)
// Ex: {"AC": 302.08, "AL": 195.46, "SP": 198.69, ...}
export type SinapiInsumo = {
  id: string
  codigo: string
  classificacao: string          // SERVIÇOS | MATERIAL | MAO_DE_OBRA | EQUIPAMENTO
  descricao: string
  unidade: string
  origem_preco: string | null    // C | CR
  precos: Record<string, number> // {"AC": 302.08, ...}
  mes_referencia: string         // "04/2026"
  created_at: string
}

// ─── SINAPI — Composição (CSD) ────────────────────────────────────────────────
export type SinapiComposicao = {
  id: string
  codigo: string
  grupo: string
  descricao: string
  unidade: string
  situacao: string               // COM CUSTO | SEM CUSTO
  custos: Record<string, number> // {"AC": 280.81, "SP": 198.69, ...}
  mes_referencia: string
  created_at: string
  itens?: SinapiComposicaoItem[]
}

// ─── SINAPI — Item da Composição (Analítico) ──────────────────────────────────
export type SinapiComposicaoItem = {
  id: string
  composicao_codigo: string
  mes_referencia: string
  tipo: 'INSUMO' | 'COMPOSICAO'
  item_codigo: string
  item_descricao: string
  item_unidade: string
  coeficiente: number
  situacao: string
}

// ─── Composição Própria ───────────────────────────────────────────────────────
export type ComposicaoPropria = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  grupo: string
  ativo: boolean
  created_at: string
  itens?: ComposicaoItem[]
  custo_calculado?: number       // calculado em runtime com UF da obra
}

// ─── Item de Composição Própria ───────────────────────────────────────────────
// Schema real da tabela `composicao_insumos`: design normalizado por FK —
// cada item referencia OU um insumo da base SINAPI (insumo_id) OU um insumo
// próprio da empresa (insumo_proprio_id). Não existe snapshot de
// descrição/unidade/preço: esses dados vêm sempre do embed (join) em runtime.
export type ComposicaoItem = {
  id: string
  composicao_id: string
  insumo_id: string | null
  insumo_proprio_id: string | null
  coeficiente: number
  // join runtime (PostgREST embed):
  insumo?: SinapiInsumo | null
  insumo_proprio?: InsumoProprio | null
}

// ─── Insumo Próprio (cadastrado pela empresa, fora da base SINAPI) ────────────
export type InsumoProprio = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  categoria: 'MATERIAL' | 'MAO_DE_OBRA' | 'EQUIPAMENTO' | 'SERVICO'
  grupo?: string | null          // categoria fina de origem (ex.: "Madeira", "Elétrico") — opcional, livre
  preco_unitario: number
  ativo: boolean
  created_at: string
}

// ─── Etapa ────────────────────────────────────────────────────────────────────
export type Etapa = {
  id: string
  obra_id: string
  nome: string
  data_inicio: string | null
  data_fim: string | null
  status: 'planejada' | 'em_andamento' | 'concluida' | 'atrasada'
  percentual_executado: number
  ordem: number
}

// ─── Subetapa de Cronograma (nível 2) ────────────────────────────────────────
export type SubetapaCronograma = {
  id: string
  etapa_id: string
  nome: string
  data_inicio: string | null
  data_fim: string | null
  percentual_executado: number
  status: 'planejada' | 'em_andamento' | 'concluida' | 'atrasada'
  responsavel: string | null
  ordem: number
  created_at: string
  servicos?: ServicoCronograma[]
}

// ─── Serviço de Cronograma (nível 3) ─────────────────────────────────────────
export type ServicoCronograma = {
  id: string
  subetapa_id: string
  nome: string
  data_inicio: string | null
  data_fim: string | null
  percentual_executado: number
  responsavel: string | null
  ordem: number
  created_at: string
}

// ─── Material ─────────────────────────────────────────────────────────────────
export type Material = {
  id: string
  obra_id: string
  etapa_id: string | null
  subetapa: string | null
  sinapi_codigo: string
  descricao: string
  unidade: string
  quantidade_total: number
  quantidade_comprada: number
  status_compra: 'nao_comprado' | 'parcial' | 'comprado'
  data_necessidade: string | null
  etapa?: Etapa
}

// ─── Medição ──────────────────────────────────────────────────────────────────
export type Medicao = {
  id: string
  obra_id: string
  etapa_id: string | null
  nome: string | null
  periodo_inicio: string
  periodo_fim: string
  percentual_executado: number
  observacao: string | null
  fotos: string[]
  created_at: string
  updated_at: string
}

// ─── Fornecedor ───────────────────────────────────────────────────────────────
export type Fornecedor = {
  id: string
  obra_id: string | null   // null = fornecedor geral da empresa, disponível para todas as obras
  nome: string
  apelido: string | null
  categoria: 'MATERIAL' | 'MAO_DE_OBRA' | 'EQUIPAMENTO' | 'SERVICO' | 'MISTO'
  tipo: 'material' | 'servico' | 'locacao' | 'ambos'
  contato: string | null
  telefone: string | null
  email: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
}

// ─── Vínculo Obra ↔ Fornecedor ────────────────────────────────────────────────
// grupo: separa o vínculo em "mão de obra" (equipes/serviços de execução) e
// "demais" (materiais, equipamentos e outros fornecedores da obra).
export type ObraFornecedor = {
  id: string
  obra_id: string
  fornecedor_id: string
  grupo: 'mao_de_obra' | 'demais'
  created_at: string
  fornecedor?: Fornecedor | null
}

// ─── Compras — Item de Compra (financeiro, por obra/etapa) ──────────────────
export type CompraItem = {
  id: string
  obra_id: string
  etapa_id: string | null
  lista_id: string | null
  descricao: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  quantidade: number | null
  unidade: string | null
  valor_unitario: number | null
  valor_total: number
  status_valor: 'confirmado' | 'estimado'
  forma_pagamento: 'pix' | 'cartao' | 'boleto' | 'dinheiro' | 'reembolso' | 'pix_cartao' | 'cartao_reembolso' | null
  data_limite_pagamento: string | null
  status_pagamento: 'pendente' | 'pago'
  observacao: string | null
  created_at: string
  updated_at: string
  etapa?: Etapa | null
  fornecedor?: Fornecedor | null
}

// ─── Tarefa ───────────────────────────────────────────────────────────────────
export type Tarefa = {
  id: string
  titulo: string
  descricao: string | null
  obra_id: string | null
  projeto_id: string | null
  responsavel_id: string | null
  responsavel_nome: string | null
  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada'
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  data_prazo: string | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
  updated_at: string
  obra?: { nome: string } | null
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export type AlertaPreditivo = {
  obra_id: string
  obra_nome: string
  etapa_nome: string
  dias_para_inicio: number
  materiais_pendentes: number
}

// ─── RDO (Relatório Diário de Obra) ──────────────────────────────────────────
export type Rdo = {
  id: string
  obra_id: string
  data: string
  autor_id: string | null
  equipe_presente: string | null
  servicos_executados: string | null
  ocorrencias: string | null
  fotos: string[]
  created_at: string
}

// ─── Comunicado de Obra ───────────────────────────────────────────────────────
export type ComunicadoObra = {
  id: string
  obra_id: string
  autor_id: string | null
  titulo: string
  conteudo: string
  fixado: boolean
  created_at: string
  autor?: { name: string; apelido: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Retorna o preço do insumo para a UF da obra, ou 0 se não disponível.
export function getPrecoInsumo(insumo: SinapiInsumo, uf: string): number {
  return insumo.precos?.[uf] ?? 0
}

// Lista de UFs brasileiras (mesma ordem do SINAPI ISE)
export const SINAPI_UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO',
  'MA','MG','MS','MT','PA','PB','PE','PI','PR',
  'RJ','RN','RO','RR','RS','SC','SE','SP','TO',
] as const

export type SINAPI_UF = typeof SINAPI_UFS[number]

// ─── Proprietário ─────────────────────────────────────────────────────────────
export type Proprietario = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

// ─── Responsável Técnico ──────────────────────────────────────────────────────
export type Responsavel = {
  id: string
  name: string
  drive_folder_url: string | null
}
