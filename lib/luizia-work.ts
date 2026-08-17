// ═══════════════════════════════════════════════════════════════════════════
// Luiza — Etapa 1: preparação de interface e roteamento para Chat/Work.
//
// Este módulo é só INFRAESTRUTURA de preparação: interpreta intenção de
// alteração de forma heurística (não é NLU completa), decide a skill pelo
// contexto da página + palavras do pedido, e monta/atualiza um rascunho em
// memória (nunca grava nada no banco). A próxima etapa é que vai plugar
// ferramentas CRUD reais no lugar de `interpretarPedidoDeAlteracao`.
// ═══════════════════════════════════════════════════════════════════════════
import { randomUUID } from 'crypto'

// ─── Skills internas ──────────────────────────────────────────────────────
export type LuiziaSkillId =
  | 'geral' | 'orcamento' | 'planejamento' | 'execucao'
  | 'rdo' | 'suprimentos' | 'compras' | 'financeiro'

export const SKILL_LABELS: Record<LuiziaSkillId, string> = {
  geral: 'Geral',
  orcamento: 'Orçamento',
  planejamento: 'Planejamento',
  execucao: 'Execução',
  rdo: 'RDO',
  suprimentos: 'Suprimentos',
  compras: 'Compras',
  financeiro: 'Financeiro',
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

export type LuiziaDraftStatus = 'rascunho' | 'confirmado_pendente_execucao'

export type LuiziaDraft = {
  skill: LuiziaSkillId
  itens: LuiziaDraftItem[]
  status: LuiziaDraftStatus
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
  projeto: 'geral',
}

const PATH_PARA_SKILL: { padrao: RegExp; skill: LuiziaSkillId }[] = [
  { padrao: /\/orcamentos/, skill: 'orcamento' },
  { padrao: /\/materiais/, skill: 'suprimentos' },
  { padrao: /\/cronograma/, skill: 'planejamento' },
  { padrao: /\/relatorios/, skill: 'financeiro' },
]

const PALAVRAS_CHAVE_SKILL: { padrao: RegExp; skill: LuiziaSkillId }[] = [
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
const VERBOS_ALTERACAO = /\b(coloque|coloca|mude|mudar|altere|alterar|atualize|atualizar|marque|marcar|defina|definir|troque|trocar|exclua|excluir|delete|deletar|remova|remover|crie|criar|adicione|adicionar|cadastre|cadastrar|registre|registrar|lance|lan[çc]ar|pague|pagar|edite|editar)\b/i

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

/** Aplica a interpretação sobre o rascunho atual (ou cria um novo). Nunca
 * toca no banco — só ajusta o objeto em memória que roda de ida e volta
 * entre cliente e servidor durante a conversa. */
export function aplicarInterpretacaoNoDraft(
  interpretacao: Interpretacao,
  draftAtual: LuiziaDraft | null,
  skill: LuiziaSkillId,
): LuiziaDraft | null {
  if (interpretacao.tipo === 'novo_item') {
    const base: LuiziaDraft = draftAtual && draftAtual.status === 'rascunho'
      ? draftAtual
      : { skill, itens: [], status: 'rascunho' }
    const existente = base.itens.find(i => i.alvo.toLowerCase() === interpretacao.alvo.toLowerCase())
    const itens = existente
      ? base.itens.map(i => i === existente ? { ...i, campo: interpretacao.campo, valor: interpretacao.valor } : i)
      : [...base.itens, { id: randomUUID(), alvo: interpretacao.alvo, campo: interpretacao.campo, valor: interpretacao.valor }]
    return { skill, itens, status: 'rascunho' }
  }

  if (interpretacao.tipo === 'refinamento') {
    if (!draftAtual || draftAtual.itens.length === 0) return draftAtual
    const ultimo = draftAtual.itens[draftAtual.itens.length - 1]
    const itens = draftAtual.itens.map(i => i === ultimo ? { ...i, valor: interpretacao.valor } : i)
    return { ...draftAtual, itens, status: 'rascunho' }
  }

  if (interpretacao.tipo === 'confirmacao') {
    if (!draftAtual || draftAtual.itens.length === 0) return draftAtual
    return { ...draftAtual, status: 'confirmado_pendente_execucao' }
  }

  return draftAtual
}

export function renderizarDraft(draft: LuiziaDraft): string {
  const linhas = draft.itens.map((item, i) => `${i + 1}. ${item.alvo}\n${item.campo}: ${item.valor}`).join('\n\n')
  const rodape = draft.status === 'confirmado_pendente_execucao'
    ? 'Confirmado. A execução real (gravar essa alteração no banco) será habilitada na próxima etapa — por enquanto nada foi alterado.'
    : 'Aguardando confirmação.'
  return `ALTERAÇÕES PROPOSTAS\n\n${linhas}\n\n${rodape}`
}

export function comSkillTag(mensagem: string, skill: LuiziaSkillId): string {
  return `${mensagem}\n\n_Usando skill: ${SKILL_LABELS[skill]}_`
}

export const MENSAGEM_BLOQUEIO_CHAT = 'Você está no modo Chat. Mude para Work para eu preparar essa alteração.'
