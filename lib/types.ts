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
  valor_contrato: number | null  // VALOR DA OBRA (contrato); null = usar total do orçamento c/ BDI
  uf: string                   // CHAR(2): AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO
  responsavel_tecnico: string | null
  art_numero: string | null
  cliente_nome: string | null
  cliente_contato: string | null
  created_at: string
}

// ─── Orçamento ────────────────────────────────────────────────────────────────
export type Orcamento = {
  id: string
  obra_id: string | null
  projeto_id?: string | null
  tipo: 'executivo' | 'parametrico'
  bdi_percentual: number
  gerenciamento_percentual?: number
  is_principal?: boolean
  travado_em?: string | null
  status: 'em_projeto' | 'ativo' | 'finalizado' | 'arquivado'
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
  // Hotfix pré-reunião (orçamento preliminar): null = "a conferir" —
  // quantidade/preço genuinamente indefinidos, nunca forçados a 0. A
  // coluna Postgres já era nullable; o tipo aqui só passou a refletir isso.
  quantidade: number | null
  preco_unitario_snapshot: number | null
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  unidade_snapshot: string | null
  valor_total_informado_snapshot?: number | null
  valor_total_manual_ativo?: boolean | null
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
  classificacao?: 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS' | null
  grupo?: string | null          // categoria fina de origem (ex.: "Madeira", "Elétrico") — opcional, livre
  preco_unitario: number
  ativo: boolean
  created_at: string
  // Dimensões físicas — opcionais e genéricas (não específicas de material).
  // Uma futura derivação de área/volume pode usar estes campos, mas isso não
  // é implementado ainda.
  comprimento?: number | null
  largura?: number | null
  espessura?: number | null
  diametro?: number | null
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
  percentual_mao_obra?: number
  ordem: number
  is_marco: boolean
  orcamento_id?: string | null
  // Conferência do orçamento (QA/revisão) — não é execução física nem afeta cálculos.
  verificado?: boolean | null
  verificado_por?: string | null
  verificado_em?: string | null
}

// ─── Subetapa de Cronograma (nível 2) ────────────────────────────────────────
export type SubetapaCronograma = {
  id: string
  etapa_id: string
  nome: string
  data_inicio: string | null
  data_fim: string | null
  percentual_executado: number
  percentual_mao_obra?: number
  status: 'planejada' | 'em_andamento' | 'concluida' | 'atrasada'
  responsavel: string | null
  ordem: number
  created_at: string
  is_marco: boolean
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
  percentual_mao_obra?: number
  responsavel: string | null
  ordem: number
  created_at: string
  is_marco: boolean
}

// ─── Dependência de Cronograma (predecessora, Fim→Início) ────────────────────
// 'orcamento_item' referencia diretamente um item do orçamento (fonte única
// de avanço, ver lib/planejamento-progresso.ts) — os demais valores são do
// cronograma legado (etapas/subetapas_cronograma/servicos_cronograma).
export type CronogramaItemTipo = 'etapa' | 'subetapa' | 'servico' | 'orcamento_item'

export type CronogramaDependencia = {
  id: string
  obra_id: string
  item_tipo: CronogramaItemTipo
  item_id: string
  predecessor_tipo: CronogramaItemTipo
  predecessor_id: string
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
  status_compra: 'nao_comprado' | 'solicitado' | 'parcial' | 'comprado'
  data_necessidade: string | null
  data_recebimento: string | null   // preenchido = chegou fisicamente no canteiro
  etapa?: Etapa
}

// ─── Medição / Boletim de Medição ────────────────────────────────────────────
// A medição é um boletim numerado por período. Lê o avanço físico real do
// cronograma (fonte única) e, ao ser fechada, congela um snapshot (medicao_itens)
// do quanto avançou por item — base para saldo, acumulado e Curva S.
export type Medicao = {
  id: string
  obra_id: string
  orcamento_id?: string | null
  eixo?: 'fisico' | 'mao_obra' | 'gerenciamento'
  etapa_id: string | null
  numero: number | null
  status: 'rascunho' | 'fechada'
  nome: string | null
  periodo_inicio: string
  periodo_fim: string
  percentual_executado: number      // legado — avanço acumulado da medição
  avanco_periodo: number | null     // % ponderado avançado só no período
  avanco_acumulado: number | null   // % ponderado acumulado no fechamento
  valor_periodo: number | null      // R$ medido no período
  valor_acumulado: number | null    // R$ acumulado até o fechamento
  observacao: string | null
  fotos: string[]
  created_at: string
  updated_at: string
  itens?: MedicaoItem[]
}

// Snapshot de avanço por item do cronograma no fechamento de uma medição
export type MedicaoItem = {
  id: string
  medicao_id: string
  item_tipo: CronogramaItemTipo
  item_id: string
  orcamento_item_id?: string | null
  nome: string | null
  valor_contratado: number
  pct_anterior: number
  pct_atual: number
  valor_periodo: number
  valor_pago?: number
  created_at: string
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

// ─── Tipo de Custo (coluna TIPO da planilha de controle de custos) ───────────
export type TipoCusto =
  | 'material'        // 01 - MATERIAL
  | 'mao_de_obra'     // 02 - MÃO DE OBRA
  | 'equipamento'     // 03 - EQUIPAMENTO
  | 'custo_indireto'  // 04 - CUSTO INDIRETO
  | 'taxa'            // 05 - TAXA
  | 'servico'         // 06 - SERVIÇO
  | 'outros'          // OUTROS

// ─── Compras — Item de Compra (financeiro, por obra/etapa) ──────────────────
// Hierarquia estável: Orçamento -> Etapa -> Subetapa do orçamento -> Item do
// orçamento (quando aplicável). Não depende mais de subetapas_cronograma/
// servicos_cronograma — subetapa_legado_nome/servico_legado_nome só
// preservam o texto histórico dos 105 lançamentos migrados.
export type CompraItem = {
  id: string
  obra_id: string
  orcamento_id: string | null
  etapa_id: string | null
  subetapa_orcamento_item_id: string | null   // FK orcamento_itens (tipo_linha='subetapa')
  orcamento_item_id: string | null            // FK orcamento_itens (tipo_linha='item'), opcional
  orcamento_item_insumo_id: string | null     // FK orcamento_item_insumos: vinculo exato ao material previsto (nunca por nome)
  subetapa_legado_nome: string | null         // histórico do cronograma legado (pré-migração)
  servico_legado_nome: string | null          // histórico do cronograma legado (pré-migração)
  lista_id: string | null
  descricao: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  quantidade: number | null
  unidade: string | null
  valor_unitario: number | null
  valor_total: number
  tipo_custo: TipoCusto | null
  data_compra: string | null          // DATA do lançamento (data_limite_pagamento = VENCIMENTO)
  status_valor: 'confirmado' | 'estimado'
  forma_pagamento: 'pix' | 'cartao' | 'boleto' | 'dinheiro' | 'reembolso' | 'pix_cartao' | 'cartao_reembolso' | null
  data_limite_pagamento: string | null
  status_pagamento: 'pendente' | 'pago'
  requisicao_id: string | null
  cotacao_id: string | null
  origem: 'manual' | 'requisicao' | 'lista'
  data_recebimento: string | null
  status_recebimento: 'pendente' | 'parcial' | 'recebido'
  observacao: string | null
  created_at: string
  updated_at: string
  etapa?: Etapa | null
  fornecedor?: Fornecedor | null
}

// ─── Caixa por Etapa (teto de reembolso — aba "Orçamento x Reembolso Caixa") ──
export type EtapaCaixa = {
  id: string
  obra_id: string
  etapa_id: string
  valor_caixa: number
  valor_caixa_mao_obra: number | null
  observacao: string | null
  created_at: string
  updated_at: string
  etapa?: Etapa | null
}

export type FonteRecursoTipo = 'recursos_proprios' | 'financiamento' | 'fgts'

export type ObraFonteRecurso = {
  id: string
  obra_id: string
  orcamento_id: string | null
  tipo: FonteRecursoTipo
  valor_previsto: number
  observacao: string | null
  created_at: string
  updated_at: string
}

export type ReembolsoStatus = 'rascunho' | 'solicitado' | 'aprovado' | 'recebido' | 'recusado'

export type ObraReembolso = {
  id: string
  obra_id: string
  orcamento_id: string | null
  fonte_id: string | null
  medicao_id: string | null
  etapa_id: string | null
  descricao: string
  status: ReembolsoStatus
  valor_solicitado: number
  valor_aprovado: number
  valor_recebido: number
  data_solicitacao: string | null
  data_aprovacao: string | null
  data_recebimento: string | null
  observacao: string | null
  created_at: string
  updated_at: string
}

// ─── Financiamento — Árvore + Medições ──────────────────────────────────────
export type FinanciamentoItem = {
  id: string
  obra_id: string
  orcamento_id: string | null
  parent_id: string | null
  codigo: string | null
  nome: string
  valor_financiado: number
  peso: number
  ordem: number
  nivel: 1 | 2 | 3
  origem: 'sistema' | 'manual'
  etapa_ref_id: string | null
  data_inicio: string | null
  data_fim: string | null
  created_at: string
  updated_at: string
  children?: FinanciamentoItem[]
}

export type FinanciamentoCronogramaBanco = {
  id: string
  obra_id: string
  orcamento_id: string | null
  mes: number
  pct_acumulado_previsto: number
  created_at: string
}

export type FinanciamentoMedicao = {
  id: string
  obra_id: string
  orcamento_id: string | null
  numero: number
  data_medicao: string
  status: 'aberta' | 'fechada'
  observacao: string | null
  created_at: string
  updated_at: string
}

export type FinanciamentoMedicaoItem = {
  id: string
  medicao_id: string
  item_id: string
  pct_executado: number
  created_at: string
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
  status: 'pendente' | 'em_andamento' | 'aguardando' | 'concluida' | 'cancelada'
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  data_prazo: string | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
  updated_at: string
  obra?: { nome: string } | null
  projeto?: { nome: string } | null
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export type AlertaPreditivo = {
  obra_id: string
  obra_nome: string
  etapa_nome: string
  dias_para_inicio: number
  materiais_pendentes: number
}

// ─── RDO (Relatório Diário de Obra) — unificado desktop + campo ───────────────
export type Clima = 'sol' | 'nublado' | 'chuva' | 'impraticavel'

export type RdoEfetivo = { funcao: string; empresa?: string; quantidade: number }
export type RdoEquipamento = { nome: string; quantidade: number }
export type RdoAtividade = {
  item_tipo: CronogramaItemTipo
  item_id: string
  nome: string
  percentual?: number   // avanço informado no dia (opcional)
}

export type Rdo = {
  id: string
  obra_id: string
  data: string
  numero: number | null
  autor_id: string | null
  // Clima por turno + condição de trabalho (dias impraticáveis contam no prazo)
  clima_manha: Clima | null
  clima_tarde: Clima | null
  clima_noite: Clima | null
  condicao_trabalho: 'praticavel' | 'parcial' | 'impraticavel' | null
  // Efetivo (mão de obra) e equipamentos em operação
  efetivo: RdoEfetivo[]
  equipamentos: RdoEquipamento[]
  // Atividades ligadas ao cronograma + texto livre (compat)
  atividades: RdoAtividade[]
  servicos_executados: string | null
  equipe_presente: string | null       // legado / texto livre de equipe
  materiais_recebidos: string | null
  ocorrencias: string | null
  observacoes: string | null
  etapa_id: string | null
  fotos: string[]
  created_at: string
  updated_at: string
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

// ─── Planejamento 2.0 ────────────────────────────────────────────────────────
export type PlanejamentoStatus = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'atrasado' | 'suspenso'

export type PlanejamentoItem = {
  id: string
  obra_id: string
  orcamento_id: string
  ref_tipo: 'etapa' | 'subetapa' | 'item'
  etapa_id: string | null
  subetapa_key: string | null
  orcamento_item_id: string | null
  data_inicio: string | null
  data_fim: string | null
  status: PlanejamentoStatus
  progresso_planejado: number
  progresso_executado: number
  created_at: string
  updated_at: string
}

export type PlanejamentoDependencia = {
  id: string
  obra_id: string
  item_id: string
  predecessor_id: string
  tipo: 'FS' | 'FF' | 'SS' | 'SF'
  lag_dias: number
  created_at: string
}

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

// ─── Laboratório Investidor (Marco 1 fundação + Marco 2 Prospecções) ────────
// Ver RELATORIO_INVESTIDOR_RODADA_01.md e RELATORIO_INVESTIDOR_RODADA_02.md.
export type ProspeccaoFase =
  | 'nova' | 'em_analise' | 'aprovada' | 'em_disputa' | 'adquirida' | 'descartada' | 'nao_adquirida'

export type Prospeccao = {
  id: string
  nome: string
  endereco: string | null
  // Núcleo N06.2 — geocoding (Nominatim) do endereço, ver lib/geocoding.ts.
  // Nullable: uma prospecção antiga ou cujo geocoding falhou não tem.
  latitude: number | null
  longitude: number | null
  foto_url: string | null
  link_leilao: string | null
  data_leilao: string | null
  // Hotfix: dimensão de primeira classe na Prospecção (antes só existia em
  // prospeccao_cenarios.tipo_aquisicao, obrigando cada cenário a assumir
  // 'leilao' sem sinal nenhum da prospecção-mãe). Cenários novos herdam
  // este valor (ver ProspeccaoCenarios.tsx e lib/investidor-ai-tools.ts).
  tipo_aquisicao: 'leilao' | 'compra_direta'
  fase: ProspeccaoFase
  responsavel: string | null
  proxima_acao: string | null
  observacao: string | null
  // Vínculo com o Ativo (Project contexto='investimento') — usado tanto por
  // uma Prospecção convertida quanto pela "prospecção-sombra de venda"
  // (is_venda=true) de um Imóvel.
  project_id: string | null
  // true só na linha-sombra criada por lib/investidor-venda.ts para dar a um
  // Imóvel um contêiner de Pesquisa de Mercado/Viabilidade do lado da
  // VENDA, reaproveitando prospeccao_ficha/comparaveis/analises_mercado/
  // cenarios sem duplicar essas tabelas. Nunca aparece na listagem normal
  // de Prospecções (ver app/(app)/investidor/page.tsx, filtro is_venda=false).
  is_venda: boolean
  // Board (Excalidraw) da prospecção — mesmo mecanismo de projetos.board_data.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  board_data?: any
  created_at: string
  updated_at: string
}

// Arquivo anexado a uma Prospecção (Marco 2) — equivalente reduzido de
// obra_files, sem os campos específicos de obra/portal.
export type ProspeccaoArquivo = {
  id: string
  prospeccao_id: string
  nome: string
  tipo: string
  tamanho: number
  categoria: string
  url: string | null
  criado_em: string
}

// Cenário financeiro de uma Prospecção. Premissas e resultados são a
// fundação para o motor de cálculo do Marco 3 — nenhuma fórmula existe
// ainda, então os campos de resultado sempre chegam null nesta rodada.
export type ProspeccaoCenario = {
  id: string
  prospeccao_id: string
  nome: string
  modalidade: 'vista' | 'sac' | 'price'
  // Hotfix pré-reunião: dimensão independente de `modalidade` (que é sobre
  // a forma de pagamento — à vista/financiado). 'leilao' preserva o
  // comportamento anterior (padrão); 'compra_direta' significa que não há
  // leiloeiro — comissão de leiloeiro não se aplica (ver
  // lib/investidor-calculadora.ts).
  tipo_aquisicao: 'leilao' | 'compra_direta'
  principal: boolean
  valor_arrematacao: number | null
  valor_venda_estimado: number | null
  comissao_leiloeiro: number | null
  itbi: number | null
  registro: number | null
  advogado_desocupacao: number | null
  reforma: number | null
  outros_custos: number | null
  prazo_venda_meses: number | null
  iptu: number | null
  condominio: number | null
  corretagem: number | null
  imposto_ganho_capital: number | null
  entrada: number | null
  percentual_financiado: number | null
  valor_financiado: number | null
  taxa_juros: number | null
  prazo_financiamento_meses: number | null
  investimento_total: number | null
  valor_liquido_venda: number | null
  lucro: number | null
  rentabilidade: number | null
  created_at: string
  updated_at: string
}

export type ProspeccaoEvidencia = {
  id: string
  prospeccao_id: string
  informacao: string
  tipo: string | null
  fonte: string | null
  url: string | null
  data_evidencia: string | null
  natureza: 'observado' | 'inferido' | 'estimado'
  created_at: string
  updated_at: string
}

// ─── Skill 1: Pesquisa e Análise de Mercado Imobiliário ───────────────────────
// Fluxo: FONTE → EXTRAÇÃO → VALIDAÇÃO HUMANA → PESQUISA DE COMPARÁVEIS →
// RESULTADOS BRUTOS → SELEÇÃO/FAVORITOS → ANÁLISE IA → ENCERRAR. Orçamento/
// reforma não pertence a esta skill.

// Ficha da Prospecção: fonte é evidência, não verdade — dados_extraidos (o
// que a IA leu) e dados_confirmados (o que o usuário validou) podem divergir
// de propósito (ver conflitos). Atributos do imóvel são abertos (jsonb) por
// variarem por fonte — não travamos num conjunto fixo de campos.
export type ProspeccaoFichaConflito = {
  campo: string
  valor_extraido: unknown
  valor_confirmado: unknown
  nota?: string
}

export type ProspeccaoFicha = {
  id: string
  prospeccao_id: string
  fonte_tipo: 'link' | 'pdf' | 'imagem' | null
  fonte_url: string | null
  fonte_nome_arquivo: string | null
  dados_extraidos: Record<string, unknown>
  dados_confirmados: Record<string, unknown>
  conflitos: ProspeccaoFichaConflito[]
  status: 'pendente' | 'parcial' | 'validada'
  created_at: string
  updated_at: string
}

// Resultado bruto de comparável, persistido ANTES de qualquer interpretação
// da IA. favorito = sinal do usuário ("considero interessante"), não implica
// que a IA deva tratá-lo como melhor comparável.
export type ProspeccaoComparavel = {
  id: string
  prospeccao_id: string
  titulo: string | null
  preco: number | null
  area: number | null
  preco_m2: number | null
  dormitorios: number | null
  banheiros: number | null
  vagas: number | null
  caracteristicas: string[]
  estado_conservacao: string | null
  fonte: string | null
  url: string | null
  url_confirmada: boolean
  identificador_anuncio: string | null
  data_evidencia: string | null
  diferencas: string | null
  similaridade: 'mesmo_predio' | 'mesma_rua' | 'entorno' | 'bairro' | null
  // Núcleo N06.2 — geocoding best-effort do título/endereço do comparável
  // (ver lib/geocoding.ts). Nullable: nem todo anúncio tem endereço
  // específico o bastante para geocodificar.
  latitude: number | null
  longitude: number | null
  salvo: boolean
  favorito: boolean
  created_at: string
}

// Snapshot imutável (por convenção de app — sem update/delete na UI) ao
// encerrar uma Análise de Mercado. faixa_conservadora/base/otimista são
// estimativas da IA, nunca fatos observados. Não muda retroativamente se
// anúncios externos mudarem depois.
export type ProspeccaoAnaliseMercado = {
  id: string
  prospeccao_id: string
  ficha_snapshot: Record<string, unknown>
  evidencias_snapshot: unknown[]
  comparaveis_snapshot: unknown[]
  favoritos_snapshot: unknown[]
  analise_texto: string
  faixa_conservadora: number | null
  faixa_base: number | null
  faixa_otimista: number | null
  pendencias: string | null
  fontes: unknown[]
  criado_por: string | null
  created_at: string
}

// ─── Núcleo N06.3: custos reais de aquisição pós-arrematação de um Ativo ─────
// Categoria + valor + comprovante opcional, vinculado direto ao Projeto
// (não a uma etapa de Orçamento de obra) — compara com o previsto do
// cenário financeiro (ProspeccaoCenario.investimento_total).
export type CategoriaCustoAquisicao =
  | 'comissao_leiloeiro' | 'itbi' | 'registro' | 'escritura'
  | 'advogado_desocupacao' | 'certidoes_outros' | 'iptu_pago' | 'condominio_pago'

export type ProjetoCustoAquisicao = {
  id: string
  projeto_id: string
  categoria: CategoriaCustoAquisicao
  descricao: string | null
  valor: number
  data_pagamento: string | null
  comprovante_url: string | null
  comprovante_nome: string | null
  created_by: string | null
  created_at: string
}

export type InvestidorAgente = {
  id: string
  nome: string
  tipo: 'prospeccao' | 'cenario' | 'mercado' | 'carteira'
  descricao: string | null
  ativo: boolean
  skill: 'investidor'
  permissoes: string[]
  config: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export type InvestidorRotina = {
  id: string
  agente_id: string | null
  nome: string
  descricao: string | null
  tipo: 'triagem_prospeccoes' | 'revisao_cenarios' | 'monitoramento_leilao' | 'pesquisa_mercado'
  frequencia: 'manual' | 'diaria' | 'semanal'
  horario: string | null
  dias_semana: number[]
  ativo: boolean
  parametros: Record<string, unknown>
  proxima_execucao: string | null
  ultima_execucao: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  agente?: InvestidorAgente | null
}

export type InvestidorRotinaRun = {
  id: string
  rotina_id: string
  agente_id: string | null
  status: 'rodando' | 'concluida' | 'erro' | 'cancelada'
  started_at: string
  finished_at: string | null
  resumo: string | null
  resultado: Record<string, unknown>
  erro: string | null
  created_by: string | null
}
