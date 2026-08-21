// ═══════════════════════════════════════════════════════════════════════════
// Luiza — contratos compartilhados de Chat/Work.
//
// Este módulo define roteamento, intenção e o rascunho estruturado. O CRUD
// canônico e a validação server-side vivem exclusivamente em luizia-tools.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Skills internas ──────────────────────────────────────────────────────
export type LuiziaSkillId =
  | 'geral' | 'orcamento' | 'planejamento' | 'execucao'
  | 'rdo' | 'suprimentos' | 'compras' | 'financeiro' | 'tarefas' | 'avisos'

export const SKILL_LABELS: Record<LuiziaSkillId, string> = {
  geral: 'Geral',
  orcamento: 'Orçamento',
  planejamento: 'Planejamento',
  execucao: 'Execução',
  rdo: 'RDO',
  suprimentos: 'Suprimentos',
  compras: 'Compras',
  financeiro: 'Financeiro',
  tarefas: 'Tarefas',
  avisos: 'Avisos',
}

// ─── Contexto de página (detectado no cliente a partir da URL/estado atual) ─
export type LuiziaPageContext = {
  pathname?: string | null
  projetoId?: string | null
  obraId?: string | null
  orcamentoId?: string | null
  aba?: string | null   // ex.: 'orcamento' | 'planejamento' | 'suprimentos' | 'medicoes' | 'financeiro' | 'projeto'
}

// ─── Rascunho (Work) — nunca é gravado no banco nesta etapa ────────────────
export type LuiziaDraftItem = {
  id: string
  alvo: string    // ex.: "Fundação"
  campo: string   // ex.: "Avanço"
  valor: string   // ex.: "30%"
}

export type LuiziaDraftStatus =
  | 'rascunho'
  | 'aguardando_esclarecimento'
  | 'confirmado_pendente_execucao'
  | 'concluido'
  | 'falhou'

export type LuiziaDraftContext = {
  obraId: string
  orcamentoId: string
  projetoId: string | null
  pathname: string | null
}

export type LuiziaResolvedTarget = {
  scope: 'etapa' | 'subetapa' | 'item'
  label: string
  etapaId: string
  subetapaKey: string | null
  orcamentoItemIds: string[]
}

export type LuiziaOperation =
  | { id: string; type: 'set_progress'; target: LuiziaResolvedTarget; percentual: number }
  | { id: string; type: 'set_planning_dates'; target: LuiziaResolvedTarget; dataInicio: string; dataFim: string }
  | { id: string; type: 'create_rdo'; data: string; descricao: string; target: LuiziaResolvedTarget; percentual: number }
  | { id: string; type: 'create_purchase'; descricao: string; valorTotal: number; etapaId: string | null; subetapaOrcamentoItemId: string | null; orcamentoItemId: string | null }
  | { id: string; type: 'set_purchase_paid'; purchaseId: string; descricao: string }
  | { id: string; type: 'set_purchase_received'; purchaseId: string; descricao: string }
  | { id: string; type: 'sync_materials' }
  | { id: string; type: 'set_budget_item_quantity'; orcamentoItemId: string; descricao: string; quantidade: number }

export type LuiziaDraftCandidate = LuiziaResolvedTarget & { id: string }

export type LuiziaPendingOperation =
  | { type: 'set_progress'; percentual: number }
  | { type: 'create_rdo'; data: string; descricao: string; percentual: number }
  | { type: 'set_planning_dates'; dataInicio: string; dataFim: string }

export type LuiziaExecutionResult = {
  operationId: string
  success: boolean
  message: string
  entityType?: 'planejamento' | 'rdo' | 'compra' | 'materiais' | 'orcamento_item'
  entityId?: string
}

export type LuiziaDraft = {
  id?: string
  signature?: string
  revision?: number
  skill: LuiziaSkillId
  itens: LuiziaDraftItem[]
  status: LuiziaDraftStatus
  context?: LuiziaDraftContext
  operations?: LuiziaOperation[]
  candidates?: LuiziaDraftCandidate[]
  pendingOperation?: LuiziaPendingOperation | null
  results?: LuiziaExecutionResult[]
  executedAt?: string | null
}

// ─── Roteamento de skill: aba atual tem prioridade sobre o texto do pedido,
// mas uma palavra-chave forte e inequívoca no pedido pode sobrepor a aba
// (ex.: usuário em Suprimentos perguntando sobre saldo financeiro). ────────
const ABA_PARA_SKILL: Record<string, LuiziaSkillId> = {
  orcamento: 'orcamento',
  planejamento: 'planejamento',
  suprimentos: 'suprimentos',
  medicoes: 'rdo',
  financeiro: 'financeiro',
  tarefas: 'tarefas',
  projeto: 'geral',
}

const PATH_PARA_SKILL: { padrao: RegExp; skill: LuiziaSkillId }[] = [
  { padrao: /^\/tarefas/, skill: 'tarefas' },
  { padrao: /\/orcamentos/, skill: 'orcamento' },
  { padrao: /\/materiais/, skill: 'suprimentos' },
  { padrao: /\/cronograma/, skill: 'planejamento' },
  { padrao: /\/relatorios/, skill: 'financeiro' },
]

// TAREFA != PLANEJAMENTO: de propósito não uso palavras genéricas como
// "hoje"/"amanhã"/"atrasada" aqui (colidiriam com perguntas sobre etapa do
// cronograma, ex. "essa etapa está atrasada?"). Só palavras que só fazem
// sentido para o motor de Tarefas — o contexto de página (/tarefas ou aba
// Tarefas de Obra/Projeto) é o sinal primário; isto é o reforço por texto,
// utilizável de qualquer página.
const PALAVRAS_CHAVE_SKILL: { padrao: RegExp; skill: LuiziaSkillId }[] = [
  // Avisos ANTES de tarefas de propósito: "me avise das minhas tarefas..."
  // menciona "tarefas", mas a intenção é configurar um aviso recorrente —
  // se o regex de tarefas viesse primeiro, "avise" nunca seria alcançado.
  { padrao: /\bavis[eo]s?\b|\blembrete\b|\bnotifica(r|ç[ãa]o)?\b|\bresumo\b[^.?!]*\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|todo dia|todos os dias)\b/i, skill: 'avisos' },
  { padrao: /\btarefas?\b|\bpend[êe]ncias?\b|\bagenda\b|\baguardando\b/i, skill: 'tarefas' },
  { padrao: /\borcamento|orçamento|composi[çc][ãa]o|insumo|bdi\b/i, skill: 'orcamento' },
  { padrao: /\bavan[çc]o f[íi]sico|planejamento|cronograma\b/i, skill: 'planejamento' },
  { padrao: /\brdo\b|di[áa]rio de obra|boletim/i, skill: 'rdo' },
  { padrao: /\bfornecedor|cota[çc][ãa]o|pedido de compra\b/i, skill: 'compras' },
  { padrao: /\bcompra|comprar\b/i, skill: 'compras' },
  { padrao: /\bmaterial|materiais|estoque|necessidade de insumo\b/i, skill: 'suprimentos' },
  { padrao: /\bfinanceiro|saldo|planejado|comprometido|pago|a pagar\b/i, skill: 'financeiro' },
  { padrao: /\bexecu[çc][ãa]o\b/i, skill: 'execucao' },
]

export function detectSkill(pageContext: LuiziaPageContext | null | undefined, prompt: string): LuiziaSkillId {
  const texto = prompt || ''
  for (const { padrao, skill } of PALAVRAS_CHAVE_SKILL) {
    if (padrao.test(texto)) return skill
  }
  const aba = pageContext?.aba
  if (aba && ABA_PARA_SKILL[aba]) return ABA_PARA_SKILL[aba]
  const pathname = pageContext?.pathname || ''
  for (const { padrao, skill } of PATH_PARA_SKILL) {
    if (padrao.test(pathname)) return skill
  }
  return 'geral'
}

// ─── Intenção de alteração (heurística — não é a ferramenta CRUD real) ─────
const VERBOS_ALTERACAO = /\b(coloque|coloca|mude|muda|mudar|altere|alterar|atualize|atualizar|marque|marcar|defina|definir|troque|trocar|exclua|excluir|delete|deletar|remova|remover|crie|criar|adicione|adicionar|cadastre|cadastrar|registre|registrar|lance|lan[çc]ar|pague|pagar|edite|editar|passa|passe|avise|avisar|notifique|notificar|pausa|pausar|reativ[ae])\b/i

const REGEX_CONFIRMACAO = /\b(confirmar|confirmo|confirma(do)?|pode confirmar|pode salvar)\b/i

// "coloque a fundação em 30%" / "mude fundação para 30%"
const REGEX_ITEM_COM_ALVO = /(?:coloque|coloca|mude|mudar|altere|alterar|atualize|atualizar|marque|marcar|defina|definir|troque|trocar)\s+(?:o\s+|a\s+)?(.+?)\s+(?:em|para)\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i

// "troque para 40%" — sem alvo explícito, refina o último item do rascunho
const REGEX_REFINAMENTO_VALOR = /(?:troque|troca|mude|muda|altere|altera|atualize|atualiza)\s+(?:isso\s+)?para\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i

export function isChangeIntent(prompt: string): boolean {
  return VERBOS_ALTERACAO.test(prompt || '') || REGEX_CONFIRMACAO.test(prompt || '')
}

function capitalizar(texto: string) {
  const limpo = texto.trim().replace(/\s+/g, ' ')
  if (!limpo) return limpo
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

export type Interpretacao =
  | { tipo: 'novo_item'; alvo: string; campo: string; valor: string }
  | { tipo: 'refinamento'; valor: string }
  | { tipo: 'confirmacao' }
  | { tipo: 'alteracao_sem_detalhe' }
  | { tipo: 'nenhuma' }

/** Interpretação heurística do pedido — o parser real (com ferramentas CRUD
 * de verdade) entra na próxima etapa. Aqui só extraímos padrões simples de
 * "alvo em/para valor%" para conseguir montar o rascunho de demonstração. */
export function interpretarPedidoDeAlteracao(prompt: string): Interpretacao {
  const texto = prompt || ''
  if (REGEX_CONFIRMACAO.test(texto)) return { tipo: 'confirmacao' }

  const comAlvo = REGEX_ITEM_COM_ALVO.exec(texto)
  if (comAlvo) {
    return { tipo: 'novo_item', alvo: capitalizar(comAlvo[1]), campo: 'Avanço', valor: `${comAlvo[2].replace(',', '.')}%` }
  }

  const refinamento = REGEX_REFINAMENTO_VALOR.exec(texto)
  if (refinamento) {
    return { tipo: 'refinamento', valor: `${refinamento[1].replace(',', '.')}%` }
  }

  if (isChangeIntent(texto)) return { tipo: 'alteracao_sem_detalhe' }
  return { tipo: 'nenhuma' }
}

export function renderizarDraft(draft: LuiziaDraft): string {
  const linhas = draft.itens.map((item, i) => `${i + 1}. ${item.alvo}\n${item.campo}: ${item.valor}`).join('\n\n')
  const rodape = draft.status === 'concluido'
    ? 'Concluído.'
    : draft.status === 'falhou'
      ? 'A execução teve falhas. Você pode confirmar novamente para tentar apenas o que ficou pendente.'
      : draft.status === 'aguardando_esclarecimento'
        ? 'Preciso que você escolha uma das opções antes de confirmar.'
        : draft.status === 'confirmado_pendente_execucao'
          ? 'Confirmação recebida. Executando exatamente este rascunho.'
          : 'Aguardando confirmação.'
  return `ALTERAÇÕES PROPOSTAS\n\n${linhas}\n\n${rodape}`
}

export function comSkillTag(mensagem: string, skill: LuiziaSkillId): string {
  return `${mensagem}\n\n_Usando skill: ${SKILL_LABELS[skill]}_`
}

export const MENSAGEM_BLOQUEIO_CHAT = 'Você está no modo Chat. Mude para Work para eu preparar essa alteração.'
