import 'server-only'

import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { loadFinanceiroResumo } from '@/lib/financeiro'
import { sincronizarMateriaisDoOrcamento } from '@/lib/materiais-sync'
import { setItemProgresso } from '@/lib/planejamento-progresso'
import type { LuiziaContext } from '@/lib/luizia-core'
import {
  renderizarDraft,
  type LuiziaDraft,
  type LuiziaDraftCandidate,
  type LuiziaDraftContext,
  type LuiziaExecutionResult,
  type LuiziaOperation,
  type LuiziaPendingOperation,
  type LuiziaResolvedTarget,
  type LuiziaSkillId,
} from '@/lib/luizia-work'

type DbClient = Awaited<ReturnType<typeof createClient>>
type Row = Record<string, unknown>

type ValidatedContext = {
  supabase: DbClient
  obraId: string
  obraNome: string
  orcamentoId: string
  projetoId: string | null
  profileId: string
  pathname: string | null
}

type BudgetItem = {
  id: string
  etapa_id: string
  subetapa: string | null
  tipo_linha: string
  descricao_snapshot: string | null
  quantidade: number
}

type Stage = { id: string; nome: string }

export type LuiziaWorkResponse = {
  message: string
  draft: LuiziaDraft | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONFIRM_RE = /^\s*(confirmar|confirmo|confirma|confirmado|pode confirmar|pode salvar)\s*[.!]?\s*$/i

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function asRow(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
}

function parseNumber(value: string) {
  const cleaned = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  return Number(cleaned)
}

function parseDate(value: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!br) return null
  return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function draftContext(context: ValidatedContext): LuiziaDraftContext {
  return {
    obraId: context.obraId,
    orcamentoId: context.orcamentoId,
    projetoId: context.projetoId,
    pathname: context.pathname,
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter(key => key !== 'signature').sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function draftSecret() {
  const secret = process.env.LUIZIA_DRAFT_SECRET || process.env.OPENAI_API_KEY
  if (!secret) throw new Error('Configure LUIZIA_DRAFT_SECRET para habilitar confirmações do modo Work.')
  return secret
}

function signDraft<T extends LuiziaDraft>(draft: T): T {
  return { ...draft, signature: createHmac('sha256', draftSecret()).update(stableJson(draft)).digest('hex') }
}

function verifyDraft(draft: LuiziaDraft) {
  if (!draft.signature) throw new Error('Este rascunho é de uma versão anterior. Prepare a alteração novamente.')
  const expected = createHmac('sha256', draftSecret()).update(stableJson(draft)).digest('hex')
  const actualBuffer = Buffer.from(draft.signature, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('O rascunho foi alterado fora da Luiza e não pode ser executado. Prepare a alteração novamente.')
  }
}

async function validateContext(raw: LuiziaContext, draft?: LuiziaDraft | null): Promise<ValidatedContext> {
  if (raw.modoLuiza !== 'work') throw new Error('A execução só é permitida no modo Work.')

  const supabase = await createClient()
  const user = asRow(raw.usuario)
  const profileId = typeof user?.id === 'string' ? user.id : ''
  if (!UUID_RE.test(profileId)) throw new Error('Perfil atual não identificado. Entre novamente no BuildSmart.')

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id,tipo').eq('id', profileId).maybeSingle()
  if (profileError || !profile) throw new Error('Perfil atual não é válido.')

  const page = raw.pagina || {}
  const obraId = page.obraId || ''
  if (!UUID_RE.test(obraId)) throw new Error('Abra uma obra antes de usar o modo Work.')

  const { data: obra, error: obraError } = await supabase
    .from('obras').select('id,nome,projeto_id').eq('id', obraId).maybeSingle()
  if (obraError || !obra) throw new Error('A obra da página atual não existe mais.')

  // O MVP ainda usa perfis locais e possui obras antigas sem atribuições.
  // Quando a obra já tem atribuições, a associação é obrigatória; admin
  // mantém o acesso operacional global existente.
  const { data: assignments, error: assignmentError } = await supabase
    .from('obra_usuarios').select('profile_id').eq('obra_id', obraId)
  if (assignmentError) throw assignmentError
  if ((assignments || []).length > 0 && profile.tipo !== 'admin' && !(assignments || []).some((item: { profile_id: string }) => item.profile_id === profileId)) {
    throw new Error('Seu perfil não possui permissão para alterar esta obra.')
  }

  let orcamentoId = page.orcamentoId || ''
  if (!UUID_RE.test(orcamentoId)) {
    const { data: budgets, error } = await supabase
      .from('orcamentos').select('id,is_principal,created_at').eq('obra_id', obraId).order('is_principal', { ascending: false }).order('created_at', { ascending: false }).limit(2)
    if (error) throw error
    if ((budgets || []).length !== 1) throw new Error('Selecione um orçamento específico antes de usar o modo Work.')
    orcamentoId = budgets![0].id
  }

  const { data: budget, error: budgetError } = await supabase
    .from('orcamentos').select('id,obra_id,projeto_id').eq('id', orcamentoId).eq('obra_id', obraId).maybeSingle()
  if (budgetError || !budget) throw new Error('O orçamento selecionado não pertence à obra atual.')

  const validated: ValidatedContext = {
    supabase,
    obraId,
    obraNome: obra.nome,
    orcamentoId,
    projetoId: budget.projeto_id || obra.projeto_id || page.projetoId || null,
    profileId,
    pathname: page.pathname || null,
  }

  if (draft?.context) {
    const current = draftContext(validated)
    if (draft.context.obraId !== current.obraId || draft.context.orcamentoId !== current.orcamentoId) {
      throw new Error('A página mudou desde a criação do rascunho. Revise a alteração na obra atual antes de confirmar.')
    }
  }
  return validated
}

async function loadBudgetTree(context: ValidatedContext) {
  const [{ data: stages, error: stageError }, { data: items, error: itemError }] = await Promise.all([
    context.supabase.from('etapas').select('id,nome').eq('obra_id', context.obraId).eq('orcamento_id', context.orcamentoId).order('ordem'),
    context.supabase.from('orcamento_itens').select('id,etapa_id,subetapa,tipo_linha,descricao_snapshot,quantidade').eq('orcamento_id', context.orcamentoId).order('ordem'),
  ])
  if (stageError) throw stageError
  if (itemError) throw itemError
  return { stages: (stages || []) as Stage[], items: (items || []) as BudgetItem[] }
}

function candidateId(target: LuiziaResolvedTarget) {
  return `${target.scope}:${target.etapaId}:${target.orcamentoItemIds.join(',')}`
}

function resolveTargets(name: string, stages: Stage[], items: BudgetItem[]): LuiziaResolvedTarget[] {
  const wanted = normalize(name.replace(/^(a|o|as|os)\s+/i, ''))
  const leaves = items.filter(item => item.tipo_linha === 'item' && item.etapa_id)

  const exactStages = stages.filter(stage => normalize(stage.nome) === wanted)
  if (exactStages.length === 1) {
    const stage = exactStages[0]
    return [{
      scope: 'etapa', label: stage.nome, etapaId: stage.id, subetapaKey: null,
      orcamentoItemIds: leaves.filter(item => item.etapa_id === stage.id).map(item => item.id),
    }]
  }

  const subNames = new Map<string, { stageId: string; name: string; ids: string[] }>()
  for (const item of leaves) {
    const sub = item.subetapa?.trim()
    if (!sub) continue
    const key = `${item.etapa_id}:${normalize(sub)}`
    const current = subNames.get(key) || { stageId: item.etapa_id, name: sub, ids: [] }
    current.ids.push(item.id)
    subNames.set(key, current)
  }
  const exactSubs = [...subNames.values()].filter(sub => normalize(sub.name) === wanted)
  if (exactSubs.length === 1) {
    const sub = exactSubs[0]
    return [{ scope: 'subetapa', label: sub.name, etapaId: sub.stageId, subetapaKey: sub.name, orcamentoItemIds: sub.ids }]
  }

  const exactItems = leaves.filter(item => normalize(item.descricao_snapshot || '') === wanted)
  const matchedItems = exactItems.length > 0
    ? exactItems
    : leaves.filter(item => normalize(item.descricao_snapshot || '').includes(wanted))
  if (matchedItems.length > 0) {
    return matchedItems.map(item => ({
      scope: 'item', label: item.descricao_snapshot || 'Item', etapaId: item.etapa_id,
      subetapaKey: item.subetapa?.trim() || null, orcamentoItemIds: [item.id],
    }))
  }

  const matchedStages = stages.filter(stage => normalize(stage.nome).includes(wanted))
  return matchedStages.map(stage => ({
    scope: 'etapa', label: stage.nome, etapaId: stage.id, subetapaKey: null,
    orcamentoItemIds: leaves.filter(item => item.etapa_id === stage.id).map(item => item.id),
  }))
}

function itemForOperation(operation: LuiziaOperation) {
  switch (operation.type) {
    case 'set_progress': return { alvo: operation.target.label, campo: 'Avanço', valor: `${operation.percentual}%` }
    case 'set_planning_dates': return { alvo: operation.target.label, campo: 'Planejamento', valor: `${operation.dataInicio} → ${operation.dataFim}` }
    case 'create_rdo': return { alvo: `RDO de ${operation.data}`, campo: operation.target.label, valor: `${operation.percentual}%` }
    case 'create_purchase': return { alvo: operation.descricao, campo: 'Nova compra', valor: operation.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
    case 'set_purchase_paid': return { alvo: operation.descricao, campo: 'Pagamento', valor: 'Pago' }
    case 'set_purchase_received': return { alvo: operation.descricao, campo: 'Recebimento', valor: 'Recebido' }
    case 'sync_materials': return { alvo: 'Materiais do orçamento', campo: 'Sincronização', valor: 'Reconciliar' }
    case 'set_budget_item_quantity': return { alvo: operation.descricao, campo: 'Quantidade', valor: String(operation.quantidade) }
  }
}

function makeDraft(context: ValidatedContext, skill: LuiziaSkillId, operations: LuiziaOperation[]): LuiziaDraft {
  return signDraft({
    id: randomUUID(), revision: 1, skill, status: 'rascunho', context: draftContext(context), operations,
    itens: operations.map(operation => ({ id: operation.id, ...itemForOperation(operation) })),
    candidates: [], pendingOperation: null, results: [], executedAt: null,
  })
}

function makeAmbiguousDraft(
  context: ValidatedContext,
  skill: LuiziaSkillId,
  targets: LuiziaResolvedTarget[],
  pendingOperation: LuiziaPendingOperation,
) {
  const candidates: LuiziaDraftCandidate[] = targets.map(target => ({ ...target, id: candidateId(target) }))
  const draft: LuiziaDraft = signDraft({
    id: randomUUID(), revision: 1, skill, status: 'aguardando_esclarecimento', context: draftContext(context),
    itens: [], operations: [], candidates, pendingOperation, results: [], executedAt: null,
  })
  const options = candidates.map((candidate, index) => `${index + 1}. ${candidate.label}`).join('\n')
  return { draft, message: `Encontrei mais de um item correspondente. Qual deles você quer alterar?\n\n${options}\n\nO rascunho continua aguardando sua escolha.` }
}

function operationFromPending(pending: LuiziaPendingOperation, target: LuiziaResolvedTarget): LuiziaOperation {
  if (pending.type === 'set_progress') return { id: randomUUID(), type: 'set_progress', target, percentual: pending.percentual }
  if (pending.type === 'create_rdo') return { id: randomUUID(), type: 'create_rdo', target, data: pending.data, descricao: pending.descricao, percentual: pending.percentual }
  return { id: randomUUID(), type: 'set_planning_dates', target, dataInicio: pending.dataInicio, dataFim: pending.dataFim }
}

function resolveCandidateAnswer(prompt: string, draft: LuiziaDraft) {
  const candidates = draft.candidates || []
  const indexMatch = /^\s*(\d+)\s*[.!]?\s*$/.exec(prompt)
  if (indexMatch) return candidates[Number(indexMatch[1]) - 1] || null
  const wanted = normalize(prompt)
  const exact = candidates.filter(candidate => normalize(candidate.label) === wanted)
  return exact.length === 1 ? exact[0] : null
}

function lastPurchaseReference(draft: LuiziaDraft | null) {
  if (!draft) return null
  const result = [...(draft.results || [])].reverse().find(item => item.success && item.entityType === 'compra' && item.entityId)
  if (!result?.entityId) return null
  const operation = (draft.operations || []).find(item => item.id === result.operationId)
  const descricao = operation && 'descricao' in operation ? operation.descricao : 'Compra'
  return { id: result.entityId, descricao }
}

async function proposeDraft(prompt: string, currentDraft: LuiziaDraft | null, skill: LuiziaSkillId, context: ValidatedContext): Promise<LuiziaWorkResponse | null> {
  if (currentDraft?.status === 'aguardando_esclarecimento' && currentDraft.pendingOperation) {
    const candidate = resolveCandidateAnswer(prompt, currentDraft)
    if (!candidate) {
      const options = (currentDraft.candidates || []).map((item, index) => `${index + 1}. ${item.label}`).join('\n')
      return { draft: currentDraft, message: `Não consegui identificar a opção. Responda com o número ou nome exato:\n\n${options}` }
    }
    const operation = operationFromPending(currentDraft.pendingOperation, candidate)
    const updated: LuiziaDraft = signDraft({
      ...currentDraft, revision: (currentDraft.revision || 1) + 1, status: 'rascunho', skill,
      operations: [operation], itens: [{ id: operation.id, ...itemForOperation(operation) }],
      candidates: [], pendingOperation: null,
    })
    return { draft: updated, message: renderizarDraft(updated) }
  }

  const refinement = /(?:troque|troca|mude|muda|altere|altera|atualize|atualiza)\s+(?:isso\s+)?para\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i.exec(prompt)
  if (refinement && currentDraft?.status === 'rascunho' && (currentDraft.operations || []).length > 0) {
    const percentual = parseNumber(refinement[1])
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) return { draft: currentDraft, message: 'Informe um percentual entre 0% e 100%.' }
    const operations = (currentDraft.operations || []).map((operation, index, all) => {
      if (index !== all.length - 1) return operation
      if (operation.type === 'set_progress' || operation.type === 'create_rdo') return { ...operation, percentual }
      return operation
    })
    const updated = signDraft({ ...currentDraft, revision: (currentDraft.revision || 1) + 1, skill, operations, itens: operations.map(operation => ({ id: operation.id, ...itemForOperation(operation) })) })
    return { draft: updated, message: renderizarDraft(updated) }
  }

  const { stages, items } = await loadBudgetTree(context)
  const rdo = /(?:registre|crie|adicione).*?rdo(?:\s+de\s+(hoje|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}))?.*?(?:executamos|executado|execu[çc][ãa]o\s+de)\s+(.+?)\s+(?:at[ée]|em)\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i.exec(prompt)
  if (rdo) {
    const data = !rdo[1] || normalize(rdo[1]) === 'hoje' ? todayIso() : parseDate(rdo[1])
    const percentual = parseNumber(rdo[3])
    if (!data || !Number.isFinite(percentual) || percentual < 0 || percentual > 100) return { draft: currentDraft, message: 'Confira a data e informe um percentual entre 0% e 100%.' }
    const targets = resolveTargets(rdo[2], stages, items).filter(target => target.orcamentoItemIds.length > 0)
    if (targets.length === 0) return { draft: currentDraft, message: `Não encontrei "${rdo[2].trim()}" no orçamento atual.` }
    if (targets.length > 1) return makeAmbiguousDraft(context, skill, targets, { type: 'create_rdo', data, descricao: prompt.trim(), percentual })
    const operation: LuiziaOperation = { id: randomUUID(), type: 'create_rdo', data, descricao: prompt.trim(), target: targets[0], percentual }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  const purchase = /(?:registre|crie|adicione|lance).*?(?:uma\s+)?(?:compra|lan[çc]amento)\s+(?:de\s+)?(.+?)\s+(?:por|no valor de)\s+r?\$?\s*([\d.,]+)/i.exec(prompt)
  if (purchase) {
    const valorTotal = parseNumber(purchase[2])
    if (!Number.isFinite(valorTotal) || valorTotal <= 0) return { draft: currentDraft, message: 'Informe um valor de compra maior que zero.' }
    const descricao = purchase[1].trim()
    const matched = resolveTargets(descricao, stages, items)
    const target = matched.length === 1 ? matched[0] : null
    const itemId = target?.scope === 'item' ? target.orcamentoItemIds[0] : null
    const subHeader = target?.subetapaKey
      ? items.find(item => item.tipo_linha === 'subetapa' && item.etapa_id === target.etapaId && normalize(item.subetapa || '') === normalize(target.subetapaKey || ''))
      : null
    const operation: LuiziaOperation = {
      id: randomUUID(), type: 'create_purchase', descricao, valorTotal,
      etapaId: target?.etapaId || null, subetapaOrcamentoItemId: subHeader?.id || null, orcamentoItemId: itemId,
    }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  const paid = /\bmarque\s+(?:essa|esta|a)?\s*compra\s+como\s+paga\b/i.test(prompt)
  const received = /\bmarque\s+(?:essa|esta|a)?\s*compra\s+como\s+recebida\b/i.test(prompt)
  if (paid || received) {
    const reference = lastPurchaseReference(currentDraft)
    if (!reference) return { draft: currentDraft, message: 'Não encontrei uma compra anterior inequívoca nesta conversa. Diga qual compra deseja atualizar.' }
    const operation: LuiziaOperation = paid
      ? { id: randomUUID(), type: 'set_purchase_paid', purchaseId: reference.id, descricao: reference.descricao }
      : { id: randomUUID(), type: 'set_purchase_received', purchaseId: reference.id, descricao: reference.descricao }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  const dates = /(?:altere|mude|defina|coloque).*?datas?\s+(?:de|da|do)\s+(.+?)\s+(?:para|em)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s+(?:a|at[ée]|-)\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/i.exec(prompt)
  if (dates) {
    const dataInicio = parseDate(dates[2]); const dataFim = parseDate(dates[3])
    if (!dataInicio || !dataFim || dataFim < dataInicio) return { draft: currentDraft, message: 'Confira as datas: o fim deve ser igual ou posterior ao início.' }
    const targets = resolveTargets(dates[1], stages, items).filter(target => target.orcamentoItemIds.length > 0)
    if (targets.length === 0) return { draft: currentDraft, message: `Não encontrei "${dates[1].trim()}" no orçamento atual.` }
    if (targets.length > 1) return makeAmbiguousDraft(context, skill, targets, { type: 'set_planning_dates', dataInicio, dataFim })
    const operation: LuiziaOperation = { id: randomUUID(), type: 'set_planning_dates', target: targets[0], dataInicio, dataFim }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  const progress = /(?:coloque|coloca|mude|altere|atualize|marque|defina)\s+(?:o\s+|a\s+)?(.+?)\s+(?:em|para)\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i.exec(prompt)
  if (progress) {
    const percentual = parseNumber(progress[2])
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) return { draft: currentDraft, message: 'Informe um percentual entre 0% e 100%.' }
    const targets = resolveTargets(progress[1], stages, items).filter(target => target.orcamentoItemIds.length > 0)
    if (targets.length === 0) return { draft: currentDraft, message: `Não encontrei "${progress[1].trim()}" no orçamento atual.` }
    if (targets.length > 1) return makeAmbiguousDraft(context, skill, targets, { type: 'set_progress', percentual })
    const operation: LuiziaOperation = { id: randomUUID(), type: 'set_progress', target: targets[0], percentual }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  const quantity = /(?:altere|mude|defina|coloque).*?quantidade\s+(?:de|da|do)\s+(.+?)\s+(?:para|em)\s+([\d.,]+)/i.exec(prompt)
  if (quantity) {
    const value = parseNumber(quantity[2])
    const targets = resolveTargets(quantity[1], stages, items).filter(target => target.scope === 'item')
    if (!Number.isFinite(value) || value < 0) return { draft: currentDraft, message: 'Informe uma quantidade válida.' }
    if (targets.length !== 1) return { draft: currentDraft, message: targets.length ? 'Encontrei mais de um item. Informe o nome completo.' : `Não encontrei "${quantity[1].trim()}" no orçamento atual.` }
    const operation: LuiziaOperation = { id: randomUUID(), type: 'set_budget_item_quantity', orcamentoItemId: targets[0].orcamentoItemIds[0], descricao: targets[0].label, quantidade: value }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  if (/(sincronize|reconcilie|atualize).*materiais/i.test(prompt)) {
    const operation: LuiziaOperation = { id: randomUUID(), type: 'sync_materials' }
    const draft = makeDraft(context, skill, [operation])
    return { draft, message: renderizarDraft(draft) }
  }

  if (/\b(financeiro|planejado atual|comprometido|contratado|a pagar|quanto.*pago)\b/i.test(prompt)) {
    const value = await loadFinanceiroResumo(context.supabase, {
      obraId: context.obraId, orcamentoId: context.orcamentoId, orcamentoIds: [context.orcamentoId],
    })
    const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return {
      draft: currentDraft,
      message: `Financeiro do orçamento atual:\n- Planejado: ${money(value.planejadoAtual)}\n- Comprometido: ${money(value.comprometido)}\n- Pago: ${money(value.pago)}\n- A pagar: ${money(value.aPagar)}\n- Avanço físico: ${value.avancoFisico.toLocaleString('pt-BR')}%`,
    }
  }

  if (/\b(materiais ativos|materiais em aberto|consulte os materiais|listar materiais)\b/i.test(prompt)) {
    const { data, error } = await context.supabase.from('materiais').select('descricao,quantidade_total,unidade,status_compra').eq('obra_id', context.obraId).eq('orcamento_id', context.orcamentoId).eq('ativo', true).order('descricao').limit(20)
    if (error) throw error
    const lines = (data || []).map((item: { descricao: string; quantidade_total: number; unidade: string; status_compra: string }) => `- ${item.descricao}: ${Number(item.quantidade_total || 0).toLocaleString('pt-BR')} ${item.unidade || ''} (${item.status_compra})`)
    return { draft: currentDraft, message: lines.length ? `Materiais ativos do orçamento:\n${lines.join('\n')}` : 'Não há materiais ativos reconciliados neste orçamento.' }
  }

  // Perguntas comuns continuam seguindo o mesmo Chat/IA existente. Retornar
  // null informa ao orquestrador que nenhuma tool de Work foi necessária.
  return null
}

async function validateTarget(context: ValidatedContext, target: LuiziaResolvedTarget) {
  if (!target.orcamentoItemIds.length) throw new Error(`O alvo "${target.label}" não possui itens executáveis.`)
  const { data, error } = await context.supabase
    .from('orcamento_itens').select('id,etapa_id,subetapa').eq('orcamento_id', context.orcamentoId).in('id', target.orcamentoItemIds)
  if (error) throw error
  if ((data || []).length !== target.orcamentoItemIds.length || (data || []).some((item: { etapa_id: string }) => item.etapa_id !== target.etapaId)) {
    throw new Error(`O alvo "${target.label}" mudou desde a criação do rascunho.`)
  }
}

async function upsertPlanningDates(context: ValidatedContext, operation: Extract<LuiziaOperation, { type: 'set_planning_dates' }>) {
  await validateTarget(context, operation.target)
  for (const itemId of operation.target.orcamentoItemIds) {
    const { data: existing, error: findError } = await context.supabase
      .from('planejamento_itens').select('id').eq('orcamento_id', context.orcamentoId).eq('ref_tipo', 'item').eq('orcamento_item_id', itemId).maybeSingle()
    if (findError) throw findError
    const payload = { data_inicio: operation.dataInicio, data_fim: operation.dataFim, updated_at: new Date().toISOString() }
    const response = existing
      ? await context.supabase.from('planejamento_itens').update(payload).eq('id', existing.id)
      : await context.supabase.from('planejamento_itens').insert({
          obra_id: context.obraId, projeto_id: context.projetoId, orcamento_id: context.orcamentoId,
          ref_tipo: 'item', etapa_id: operation.target.etapaId, subetapa_key: operation.target.subetapaKey,
          orcamento_item_id: itemId, ...payload,
        })
    if (response.error) throw response.error
  }
}

async function executeOperation(context: ValidatedContext, operation: LuiziaOperation): Promise<LuiziaExecutionResult> {
  try {
    if (operation.type === 'set_progress') {
      if (!Number.isFinite(operation.percentual) || operation.percentual < 0 || operation.percentual > 100) throw new Error('Percentual inválido no rascunho.')
      await validateTarget(context, operation.target)
      for (const itemId of operation.target.orcamentoItemIds) {
        await setItemProgresso(context.supabase, {
          obraId: context.obraId, orcamentoId: context.orcamentoId, orcamentoItemId: itemId,
          etapaId: operation.target.etapaId, subetapaKey: operation.target.subetapaKey, percentual: operation.percentual,
        })
      }
      return { operationId: operation.id, success: true, entityType: 'planejamento', message: `${operation.target.label}: avanço atualizado para ${operation.percentual}%.` }
    }

    if (operation.type === 'set_planning_dates') {
      if (!parseDate(operation.dataInicio) || !parseDate(operation.dataFim) || operation.dataFim < operation.dataInicio) throw new Error('Datas inválidas no rascunho.')
      await upsertPlanningDates(context, operation)
      return { operationId: operation.id, success: true, entityType: 'planejamento', message: `${operation.target.label}: datas atualizadas para ${operation.dataInicio} a ${operation.dataFim}.` }
    }

    if (operation.type === 'create_rdo') {
      if (!UUID_RE.test(operation.id) || !parseDate(operation.data) || !Number.isFinite(operation.percentual) || operation.percentual < 0 || operation.percentual > 100) throw new Error('Dados inválidos no rascunho do RDO.')
      await validateTarget(context, operation.target)
      const { data: existing } = await context.supabase.from('rdo').select('id').eq('id', operation.id).maybeSingle()
      if (!existing) {
        const { data: latest, error: numberError } = await context.supabase.from('rdo').select('numero').eq('obra_id', context.obraId).order('numero', { ascending: false }).limit(1)
        if (numberError) throw numberError
        const activities = operation.target.orcamentoItemIds.map(itemId => ({ item_tipo: 'orcamento_item', item_id: itemId, nome: operation.target.label, percentual: operation.percentual }))
        const { error } = await context.supabase.from('rdo').insert({
          id: operation.id, obra_id: context.obraId, data: operation.data, autor_id: context.profileId,
          numero: (Number(latest?.[0]?.numero) || 0) + 1, clima_manha: null, clima_tarde: null,
          condicao_trabalho: null, efetivo: [], equipamentos: [], atividades: activities,
          servicos_executados: operation.descricao, fotos: [], updated_at: new Date().toISOString(),
        })
        if (error && error.code !== '23505') throw error
      }
      for (const itemId of operation.target.orcamentoItemIds) {
        await setItemProgresso(context.supabase, {
          obraId: context.obraId, orcamentoId: context.orcamentoId, orcamentoItemId: itemId,
          etapaId: operation.target.etapaId, subetapaKey: operation.target.subetapaKey, percentual: operation.percentual,
        })
      }
      return { operationId: operation.id, success: true, entityType: 'rdo', entityId: operation.id, message: `RDO de ${operation.data} criado; ${operation.target.label} atualizado para ${operation.percentual}%.` }
    }

    if (operation.type === 'create_purchase') {
      if (!UUID_RE.test(operation.id) || !operation.descricao.trim() || !Number.isFinite(operation.valorTotal) || operation.valorTotal <= 0) throw new Error('Dados inválidos no rascunho da compra.')
      if (operation.etapaId) {
        const { data: stage } = await context.supabase.from('etapas').select('id').eq('id', operation.etapaId).eq('obra_id', context.obraId).eq('orcamento_id', context.orcamentoId).maybeSingle()
        if (!stage) throw new Error('A etapa vinculada à compra não pertence mais ao orçamento atual.')
      }
      if (operation.orcamentoItemId) {
        const { data: item } = await context.supabase.from('orcamento_itens').select('id').eq('id', operation.orcamentoItemId).eq('orcamento_id', context.orcamentoId).maybeSingle()
        if (!item) throw new Error('O item vinculado à compra não pertence mais ao orçamento atual.')
      }
      const { data: existing } = await context.supabase.from('compra_itens').select('id').eq('id', operation.id).maybeSingle()
      if (!existing) {
        const { error } = await context.supabase.from('compra_itens').insert({
          id: operation.id, obra_id: context.obraId, orcamento_id: context.orcamentoId,
          etapa_id: operation.etapaId, subetapa_orcamento_item_id: operation.subetapaOrcamentoItemId,
          orcamento_item_id: operation.orcamentoItemId, descricao: operation.descricao,
          valor_total: operation.valorTotal, status_valor: 'confirmado', status_pagamento: 'pendente',
          status_recebimento: 'pendente', origem: 'manual', data_compra: todayIso(), updated_at: new Date().toISOString(),
        })
        if (error && error.code !== '23505') throw error
      }
      return { operationId: operation.id, success: true, entityType: 'compra', entityId: operation.id, message: `${operation.descricao}: compra registrada por ${operation.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` }
    }

    if (operation.type === 'set_purchase_paid' || operation.type === 'set_purchase_received') {
      if (!UUID_RE.test(operation.purchaseId)) throw new Error('Compra inválida no rascunho.')
      const { data: purchase, error: findError } = await context.supabase.from('compra_itens').select('id,descricao').eq('id', operation.purchaseId).eq('obra_id', context.obraId).eq('orcamento_id', context.orcamentoId).maybeSingle()
      if (findError) throw findError
      if (!purchase) throw new Error('A compra não pertence à obra e ao orçamento atuais.')
      const updates = operation.type === 'set_purchase_paid'
        ? { status_pagamento: 'pago', updated_at: new Date().toISOString() }
        : { status_recebimento: 'recebido', data_recebimento: todayIso(), updated_at: new Date().toISOString() }
      const { error } = await context.supabase.from('compra_itens').update(updates).eq('id', purchase.id)
      if (error) throw error
      return { operationId: operation.id, success: true, entityType: 'compra', entityId: purchase.id, message: `${purchase.descricao}: ${operation.type === 'set_purchase_paid' ? 'marcada como paga' : 'marcada como recebida'}.` }
    }

    if (operation.type === 'sync_materials') {
      const result = await sincronizarMateriaisDoOrcamento(context.supabase, { obraId: context.obraId, orcamentoId: context.orcamentoId })
      return { operationId: operation.id, success: true, entityType: 'materiais', message: `Materiais reconciliados: ${result.criados} criados, ${result.atualizados} atualizados e ${result.marcados_obsoletos} obsoletos.` }
    }

    if (operation.type !== 'set_budget_item_quantity') throw new Error('Operação não suportada pelo modo Work.')
    if (!UUID_RE.test(operation.orcamentoItemId) || !Number.isFinite(operation.quantidade) || operation.quantidade < 0) throw new Error('Quantidade inválida no rascunho.')
    const { data: item, error: findError } = await context.supabase.from('orcamento_itens').select('id,descricao_snapshot').eq('id', operation.orcamentoItemId).eq('orcamento_id', context.orcamentoId).eq('tipo_linha', 'item').maybeSingle()
    if (findError) throw findError
    if (!item) throw new Error('O item do orçamento não existe mais no contexto atual.')
    const { error } = await context.supabase.from('orcamento_itens').update({ quantidade: operation.quantidade, updated_at: new Date().toISOString() }).eq('id', item.id)
    if (error) throw error
    return { operationId: operation.id, success: true, entityType: 'orcamento_item', entityId: item.id, message: `${item.descricao_snapshot}: quantidade atualizada para ${operation.quantidade}.` }
  } catch (error) {
    return { operationId: operation.id, success: false, message: error instanceof Error ? error.message : 'Falha desconhecida na operação.' }
  }
}

async function executeDraft(rawContext: LuiziaContext, draft: LuiziaDraft): Promise<LuiziaWorkResponse> {
  if (draft.status === 'concluido') {
    return { draft, message: `Este rascunho já foi executado em ${draft.executedAt || 'uma confirmação anterior'}. Nenhuma ação foi repetida.` }
  }
  if (draft.status === 'aguardando_esclarecimento') return { draft, message: 'Escolha um dos itens encontrados antes de confirmar.' }
  if (!draft.id || !draft.context || !(draft.operations || []).length) return { draft, message: 'O rascunho está incompleto e não pode ser executado. Prepare a alteração novamente.' }

  const context = await validateContext(rawContext, draft)
  const results: LuiziaExecutionResult[] = []
  const previous = new Map((draft.results || []).map(result => [result.operationId, result]))
  for (const operation of draft.operations || []) {
    const done = previous.get(operation.id)
    results.push(done?.success ? done : await executeOperation(context, operation))
  }
  const success = results.every(result => result.success)
  const updated: LuiziaDraft = signDraft({
    ...draft, status: success ? 'concluido' : 'falhou', results,
    executedAt: success ? new Date().toISOString() : draft.executedAt || null,
  })
  const title = success ? 'ALTERAÇÕES CONCLUÍDAS' : 'RESULTADO PARCIAL'
  const lines = results.map((result, index) => `${index + 1}. ${result.success ? 'OK' : 'FALHA'} — ${result.message}`).join('\n')
  return { draft: updated, message: `${title}\n\n${lines}${success ? '' : '\n\nConfirme novamente para tentar apenas as operações que falharam.'}` }
}

export async function processLuiziaWork(params: {
  prompt: string
  context: LuiziaContext
  draft: LuiziaDraft | null
  skill: LuiziaSkillId
}): Promise<LuiziaWorkResponse | null> {
  if (CONFIRM_RE.test(params.prompt)) {
    if (!params.draft) return { draft: null, message: 'Ainda não há nenhum rascunho para confirmar. Peça uma alteração primeiro.' }
    verifyDraft(params.draft)
    return executeDraft(params.context, params.draft)
  }
  if (params.draft) verifyDraft(params.draft)
  const context = await validateContext(params.context, params.draft?.status === 'rascunho' || params.draft?.status === 'aguardando_esclarecimento' ? params.draft : null)
  return proposeDraft(params.prompt, params.draft, params.skill, context)
}

// Consultas compartilhadas pelas skills. São deliberadamente finas: não
// recriam cálculos nem a reconciliação dos módulos canônicos.
export const luiziaTools = {
  async consultarFinanceiro(context: ValidatedContext) {
    return loadFinanceiroResumo(context.supabase, { obraId: context.obraId, orcamentoId: context.orcamentoId, orcamentoIds: [context.orcamentoId] })
  },
  async consultarMateriaisAtivos(context: ValidatedContext) {
    const { data, error } = await context.supabase.from('materiais').select('*').eq('obra_id', context.obraId).eq('orcamento_id', context.orcamentoId).eq('ativo', true)
    if (error) throw error
    return data || []
  },
}
