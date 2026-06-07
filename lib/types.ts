// ─── Perfil ───────────────────────────────────────────────────────────────────
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
  ordem: number
}

// ─── Material ─────────────────────────────────────────────────────────────────
export type Material = {
  id: string
  obra_id: string
  etapa_id: string | null
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
  periodo_inicio: string
  periodo_fim: string
  percentual_executado: number
  observacao: string | null
  created_at: string
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export type AlertaPreditivo = {
  obra_id: string
  obra_nome: string
  etapa_nome: string
  dias_para_inicio: number
  materiais_pendentes: number
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
