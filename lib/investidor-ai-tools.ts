// ═══════════════════════════════════════════════════════════════════════════
// Ferramentas de IA (function-calling) do Laboratório Investidor (Marco 6 —
// CRUD total; Marco 7 — Evidências + extração multimodal). Mesmo padrão de
// lib/tarefas-ai-tools.ts e lib/luizia-avisos-ai-tools.ts:
//
// - Resolução de Prospecção/Cenário por nome nunca escolhe sozinha entre
//   duas correspondências reais (lib/ai-resolve.ts).
// - TODA escrita passa por proposta pendente + confirmação explícita
//   (lib/luizia-pending-actions.ts, MESMA tabela genérica já usada por
//   Tarefas/Avisos — nenhuma tabela paralela criada aqui).
// - O motor de cálculo é o MESMO do frontend (lib/investidor-calculadora.ts)
//   — nenhuma fórmula reimplementada aqui, conforme o princípio "não
//   duplicar lógica entre frontend e Luiza" da especificação.
//
// Fora de escopo, documentado em RELATORIO_INVESTIDOR_RODADA_06.md e
// RELATORIO_INVESTIDOR_RODADA_07.md: excluir Prospecção (a própria UI não
// oferece essa ação), operar Board/Arquivos/Comercialização via chat
// (nenhum precedente no app faz isso hoje), duplicar cenário via chat, e
// Web Search (nenhuma integração de busca web existe no app — decisão do
// usuário na Rodada 7 de adiar essa parte específica do Marco 7).
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import type OpenAI from 'openai'
import { resolverComSeguranca, formatarAmbiguidade, type ResolveOutcome } from './ai-resolve'
import { criarPropostaPendente, acharPendenteParaResolver, marcarRejeitada, marcarExecutada, formatarListaPendentes } from './luizia-pending-actions'
import { calcularCenario, type PremissasCenario } from './investidor-calculadora'
import { formatCurrency } from './utils'
import type { Prospeccao, ProspeccaoCenario, ProspeccaoEvidencia, ProspeccaoFase } from './types'

type DB = SupabaseClient
// `any` aqui é deliberado, não uma sobra — mesma convenção de
// lib/tarefas-ai-tools.ts e lib/luizia-avisos-ai-tools.ts (args de tool
// vêm de JSON.parse, formato dinâmico por natureza). O lint acusa
// no-explicit-any nesses 3 arquivos por igual; ver RELATORIO_INVESTIDOR_
// RODADA_06.md seção de TypeScript/lint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>

export type InvestidorAiCtx = {
  actor: string
  origem: 'floating'
  profileId: string | null
  conversationKey: string
  // Quando o usuário está dentro de /investidor/[id], resolve prospecção/
  // cenário desta prospecção sem precisar repetir o nome — mesmo papel de
  // fixedObraId/fixedProjetoId em TarefasAiCtx.
  fixedProspeccaoId?: string | null
}

export const INVESTIDOR_AI_TOOL_NAMES = [
  'list_prospeccoes', 'get_prospeccao', 'list_ativos', 'compare_prospeccoes', 'list_evidencias',
  'propose_create_prospeccao', 'propose_update_prospeccao',
  'propose_create_cenario', 'propose_update_cenario', 'propose_delete_cenario', 'propose_set_cenario_principal',
  'propose_convert_to_ativo', 'propose_create_evidencia',
  'confirm_pending_action', 'reject_pending_action',
]

const FASES: ProspeccaoFase[] = ['nova', 'em_analise', 'aprovada', 'em_disputa', 'adquirida', 'descartada', 'nao_adquirida']
const MODALIDADES: ProspeccaoCenario['modalidade'][] = ['vista', 'sac', 'price']
const MODALIDADE_LABEL: Record<ProspeccaoCenario['modalidade'], string> = { vista: 'À vista', sac: 'Financiado (SAC)', price: 'Financiado (PRICE)' }
const NATUREZAS: ProspeccaoEvidencia['natureza'][] = ['observado', 'inferido', 'estimado']
const NATUREZA_LABEL: Record<ProspeccaoEvidencia['natureza'], string> = { observado: 'Observado', inferido: 'Inferido', estimado: 'Estimado' }

// Campos de premissa de cenário aceitos pelas tools — mesmos nomes de
// lib/investidor-calculadora.ts, com percentuais como número inteiro (5 =
// 5%), igual à convenção já usada na tela (components/investidor/
// ProspeccaoCenarios.tsx) — convertidos para fração só no cálculo/gravação.
const CAMPOS_PERCENTUAL = ['comissao_leiloeiro', 'itbi', 'corretagem', 'imposto_ganho_capital', 'entrada', 'taxa_juros'] as const
const CAMPOS_MONETARIOS = ['valor_arrematacao', 'valor_venda_estimado', 'registro', 'advogado_desocupacao', 'reforma', 'outros_custos', 'iptu', 'condominio'] as const
const CAMPOS_INTEIROS = ['prazo_venda_meses', 'prazo_financiamento_meses'] as const

const CENARIO_PROPS: Record<string, { type: string; description: string }> = {
  valor_arrematacao: { type: 'number', description: 'Valor da arrematação, em R$' },
  valor_venda_estimado: { type: 'number', description: 'Valor de venda estimado, em R$' },
  comissao_leiloeiro: { type: 'number', description: 'Comissão do leiloeiro, em % (ex.: 5 para 5%)' },
  itbi: { type: 'number', description: 'ITBI, em %' },
  registro: { type: 'number', description: 'Registro, em R$' },
  advogado_desocupacao: { type: 'number', description: 'Advogado/desocupação, em R$' },
  reforma: { type: 'number', description: 'Reforma, em R$' },
  outros_custos: { type: 'number', description: 'Outros custos, em R$' },
  prazo_venda_meses: { type: 'integer', description: 'Prazo até a venda, em meses' },
  iptu: { type: 'number', description: 'IPTU mensal, em R$' },
  condominio: { type: 'number', description: 'Condomínio mensal, em R$' },
  corretagem: { type: 'number', description: 'Comissão do corretor na venda, em %' },
  imposto_ganho_capital: { type: 'number', description: 'Imposto sobre ganho de capital, em % (padrão de mercado: 15)' },
  entrada: { type: 'number', description: 'Só para modalidade sac/price: % de entrada sobre a arrematação' },
  taxa_juros: { type: 'number', description: 'Só para modalidade sac/price: taxa de juros anual, em %' },
  prazo_financiamento_meses: { type: 'integer', description: 'Só para modalidade sac/price: prazo do financiamento, em meses' },
}

function ctxProps(scoped: boolean) {
  return scoped ? {} : { prospeccao_nome: { type: 'string', description: 'Nome ou parte do nome da prospecção' } }
}

// ─── Definições das tools ────────────────────────────────────────────────────
export function investidorAiToolDefs(scoped: boolean): OpenAI.Chat.ChatCompletionTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_prospeccoes',
        description: 'Lista Prospecções (oportunidades de leilão ainda não adquiridas, ou já adquiridas/descartadas). Use para "quais prospecções eu tenho", "o que está em análise", "prospecções adquiridas", etc.',
        parameters: {
          type: 'object',
          properties: {
            fase: { type: 'string', enum: FASES, description: 'Filtra por fase (opcional)' },
            busca: { type: 'string', description: 'Busca por nome/endereço (opcional)' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_prospeccao',
        description: 'Busca uma Prospecção específica pelo nome, com todos os seus cenários financeiros (premissas e resultados, quando já calculados). Use antes de editar/comparar/converter para confirmar de qual prospecção o usuário está falando.',
        parameters: { type: 'object', properties: ctxProps(scoped), required: scoped ? [] : [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_ativos',
        description: 'Lista os Ativos — Projects que nasceram da conversão de uma Prospecção adquirida (contexto de investimento). Use para "quais imóveis já são ativos", "o que já foi adquirido e virou obra".',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'compare_prospeccoes',
        description: 'Compara 2 ou mais Prospecções lado a lado pelo cenário principal de cada uma (avaliação, aquisição, investimento total, venda líquida, lucro, rentabilidade, prazo) — mesmos indicadores do Comparador da tela. Use quando o usuário pedir para comparar, ver qual é melhor, ou perguntar diferenças entre oportunidades.',
        parameters: {
          type: 'object',
          properties: {
            nomes: { type: 'array', items: { type: 'string' }, description: 'Nomes (ou partes) de 2 ou mais prospecções a comparar' },
          },
          required: ['nomes'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_evidencias',
        description: 'Lista as evidências já registradas de uma Prospecção (informação, tipo, fonte, URL, data, natureza observado/inferido/estimado). Use antes de registrar uma nova para não duplicar, ou quando o usuário perguntar o que já se sabe sobre a oportunidade.',
        parameters: { type: 'object', properties: ctxProps(scoped), required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_create_prospeccao',
        description: 'Prepara (SEM CRIAR) uma nova Prospecção para o usuário confirmar. Só o nome é obrigatório — os outros campos podem ficar de fora se o usuário não informou (cadastro rápido). NUNCA cria sozinha — só confirm_pending_action grava, depois de confirmação explícita.',
        parameters: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Nome/apelido da prospecção (obrigatório)' },
            endereco: { type: 'string' },
            link_leilao: { type: 'string' },
            data_leilao: { type: 'string', description: 'YYYY-MM-DD' },
            fase: { type: 'string', enum: FASES, description: 'Padrão: nova' },
            responsavel: { type: 'string' },
            proxima_acao: { type: 'string' },
            observacao: { type: 'string' },
          },
          required: ['nome'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_update_prospeccao',
        description: 'Prepara (SEM SALVAR) uma alteração numa Prospecção existente (fase, responsável, próxima ação, observação, endereço, link, data do leilão). Só confirm_pending_action grava.',
        parameters: {
          type: 'object',
          properties: {
            ...ctxProps(scoped),
            fase: { type: 'string', enum: FASES },
            endereco: { type: 'string' },
            link_leilao: { type: 'string' },
            data_leilao: { type: 'string', description: 'YYYY-MM-DD' },
            responsavel: { type: 'string' },
            proxima_acao: { type: 'string' },
            observacao: { type: 'string' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_create_cenario',
        description: 'Prepara (SEM CRIAR) um novo cenário financeiro (À vista/SAC/PRICE) para uma Prospecção — mesmo motor de cálculo da tela (Marco 3): já calcula e mostra investimento total, venda líquida, lucro e rentabilidade na proposta, antes de confirmar. Só confirm_pending_action grava.',
        parameters: {
          type: 'object',
          properties: {
            ...ctxProps(scoped),
            nome_cenario: { type: 'string', description: 'Nome do cenário (ex.: "Financiado SAC 20%")' },
            modalidade: { type: 'string', enum: MODALIDADES, description: 'vista, sac ou price' },
            ...CENARIO_PROPS,
          },
          required: ['nome_cenario', 'modalidade'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_update_cenario',
        description: 'Prepara (SEM SALVAR) uma alteração nas premissas de um cenário já existente — recalcula automaticamente o resultado com os novos valores antes de mostrar a proposta. Informe só os campos que devem mudar. Só confirm_pending_action grava.',
        parameters: {
          type: 'object',
          properties: {
            ...ctxProps(scoped),
            nome_cenario: { type: 'string', description: 'Nome (ou parte) do cenário a alterar' },
            ...CENARIO_PROPS,
          },
          required: ['nome_cenario'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_delete_cenario',
        description: 'Prepara (SEM EXCLUIR) a exclusão de um cenário de uma Prospecção. Só confirm_pending_action executa.',
        parameters: {
          type: 'object',
          properties: { ...ctxProps(scoped), nome_cenario: { type: 'string' } },
          required: ['nome_cenario'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_set_cenario_principal',
        description: 'Prepara (SEM APLICAR) marcar um cenário como principal da Prospecção (desmarca o principal anterior, se houver). Só confirm_pending_action executa.',
        parameters: {
          type: 'object',
          properties: { ...ctxProps(scoped), nome_cenario: { type: 'string' } },
          required: ['nome_cenario'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_convert_to_ativo',
        description: 'Prepara (SEM CONVERTER) transformar uma Prospecção adquirida em Ativo — cria um Project (contexto de investimento) reaproveitando Estrutura/Orçamento/Cronograma/Board/Tarefas, e vincula a prospecção a ele. Exige que a prospecção esteja com fase "adquirida" e ainda não tenha um Ativo vinculado. Só confirm_pending_action executa.',
        parameters: { type: 'object', properties: ctxProps(scoped), required: [] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'propose_create_evidencia',
        description: 'Prepara (SEM GRAVAR) uma nova evidência para a Prospecção — informação encontrada em um documento (edital, matrícula), print, link ou observação. Sempre classifique a natureza: "observado" quando a informação está literalmente no documento/fonte anexada; "inferido" quando você concluiu algo a partir do que leu, sem estar escrito explicitamente; "estimado" para uma suposição sua (ex.: valor de mercado calculado, nunca um preço anunciado tratado como valor real de venda). Só confirm_pending_action grava.',
        parameters: {
          type: 'object',
          properties: {
            ...ctxProps(scoped),
            informacao: { type: 'string', description: 'A informação encontrada, em texto claro (obrigatório)' },
            tipo: { type: 'string', description: 'Classificação livre, ex.: "edital", "matrícula", "anúncio", "valor de mercado" (opcional)' },
            fonte: { type: 'string', description: 'De onde veio (ex.: "Edital do leilão", "Print enviado pelo usuário", "Link do anúncio") (opcional)' },
            url: { type: 'string', description: 'URL de origem, se houver (opcional)' },
            data_evidencia: { type: 'string', description: 'YYYY-MM-DD — data do documento/pesquisa, se souber (opcional)' },
            natureza: { type: 'string', enum: NATUREZAS, description: 'observado (padrão) | inferido | estimado' },
          },
          required: ['informacao'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'confirm_pending_action',
        description: 'Executa a proposta pendente que o usuário acabou de confirmar (ex.: "sim", "pode confirmar", "cria"). Não use para uma ordem nova — isso é uma das tools propose_*.',
        parameters: {
          type: 'object',
          properties: {
            pending_id: { type: 'string', description: 'Id da proposta, se já souber (opcional)' },
            titulo: { type: 'string', description: 'Trecho que identifica a proposta, se houver mais de uma pendente (opcional)' },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reject_pending_action',
        description: 'Descarta a proposta pendente que o usuário recusou. Nunca escreve nada.',
        parameters: {
          type: 'object',
          properties: {
            pending_id: { type: 'string' },
            titulo: { type: 'string' },
          },
          required: [],
        },
      },
    },
  ]
}

// ─── Resolução segura por nome ────────────────────────────────────────────
async function resolveProspeccao(db: DB, ctx: InvestidorAiCtx, nome?: string): Promise<ResolveOutcome<Prospeccao> | { tipo: 'sem_referencia' }> {
  if (ctx.fixedProspeccaoId) {
    const { data } = await db.from('prospeccoes').select('*').eq('id', ctx.fixedProspeccaoId).maybeSingle()
    return data ? { tipo: 'unica', item: data as Prospeccao } : { tipo: 'nao_encontrada' }
  }
  if (!nome) return { tipo: 'sem_referencia' }
  const { data } = await db.from('prospeccoes').select('*').ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as Prospeccao[], p => p.nome)
}

async function acharCenario(db: DB, prospeccaoId: string, nome: string): Promise<ResolveOutcome<ProspeccaoCenario>> {
  const { data } = await db.from('prospeccao_cenarios').select('*').eq('prospeccao_id', prospeccaoId).ilike('nome', `%${nome}%`).limit(8)
  return resolverComSeguranca(nome, (data || []) as ProspeccaoCenario[], c => c.nome)
}

function mensagemProspeccaoNaoResolvida(resolvido: { tipo: string; candidatos?: Prospeccao[] }, nome?: string): string {
  if (resolvido.tipo === 'sem_referencia') return 'Me diga o nome da prospecção.'
  if (resolvido.tipo === 'nao_encontrada') return `Não encontrei nenhuma prospecção parecida com "${nome}".`
  return formatarAmbiguidade('prospecções', nome || '', (resolvido.candidatos || []).map(p => p.nome))
}

// ─── Formatação ────────────────────────────────────────────────────────────
function fmtData(iso: string | null): string {
  if (!iso) return 'sem data'
  return new Date(iso + 'T12:00').toLocaleDateString('pt-BR')
}

const FASE_LABEL: Record<ProspeccaoFase, string> = {
  nova: 'Nova', em_analise: 'Em análise', aprovada: 'Aprovada', em_disputa: 'Em disputa',
  adquirida: 'Adquirida', descartada: 'Descartada', nao_adquirida: 'Não adquirida',
}

function resumoProspeccao(p: Prospeccao, principal?: ProspeccaoCenario | null): string {
  const partes = [`"${p.nome}"`, `fase ${FASE_LABEL[p.fase]}`]
  if (p.endereco) partes.push(p.endereco)
  if (p.data_leilao) partes.push(`leilão em ${fmtData(p.data_leilao)}`)
  if (principal?.lucro != null && principal?.rentabilidade != null) {
    partes.push(`lucro estimado ${formatCurrency(principal.lucro)} (${principal.rentabilidade.toFixed(1)}%)`)
  }
  if (p.proxima_acao) partes.push(`próxima ação: ${p.proxima_acao}`)
  return '- ' + partes.join(', ')
}

function resumoCenario(c: ProspeccaoCenario): string {
  const partes = [`"${c.nome}"`, MODALIDADE_LABEL[c.modalidade], c.principal ? 'PRINCIPAL' : null]
  if (c.investimento_total != null) partes.push(`investimento ${formatCurrency(c.investimento_total)}`)
  if (c.lucro != null && c.rentabilidade != null) partes.push(`lucro ${formatCurrency(c.lucro)} (${c.rentabilidade.toFixed(1)}%)`)
  else partes.push('resultado ainda não calculado')
  return '- ' + partes.filter(Boolean).join(', ')
}

function resumoEvidencia(e: ProspeccaoEvidencia): string {
  const partes = [`[${NATUREZA_LABEL[e.natureza]}] ${e.informacao}`]
  if (e.tipo) partes.push(`tipo: ${e.tipo}`)
  if (e.fonte) partes.push(`fonte: ${e.fonte}`)
  if (e.data_evidencia) partes.push(`data: ${fmtData(e.data_evidencia)}`)
  return '- ' + partes.join(' — ')
}

// ─── Premissas: monta PremissasCenario a partir dos args da tool (percentual
// número inteiro -> fração), preenchendo com o cenário existente quando é
// uma edição parcial. ────────────────────────────────────────────────────
function montarPremissas(args: Args, modalidade: ProspeccaoCenario['modalidade'], base?: ProspeccaoCenario | null): PremissasCenario {
  const doBase = (campo: string): number | null => (base ? (base[campo as keyof ProspeccaoCenario] as number | null) ?? null : null)
  const pct = (campo: string): number | null => {
    if (args[campo] !== undefined) return args[campo] == null ? null : Number(args[campo]) / 100
    return doBase(campo)
  }
  const num = (campo: string): number | null => {
    if (args[campo] !== undefined) return args[campo] == null ? null : Number(args[campo])
    return doBase(campo)
  }
  const premissas = { modalidade } as unknown as Record<string, unknown>
  for (const c of CAMPOS_PERCENTUAL) premissas[c] = pct(c)
  for (const c of CAMPOS_MONETARIOS) premissas[c] = num(c)
  for (const c of CAMPOS_INTEIROS) premissas[c] = num(c)
  return premissas as unknown as PremissasCenario
}

function descricaoResultado(r: ReturnType<typeof calcularCenario>): string {
  return [
    `Investimento total: ${formatCurrency(r.investimento_total)}`,
    `Venda líquida estimada: ${formatCurrency(r.valor_liquido_venda)}`,
    `Lucro: ${formatCurrency(r.lucro)}`,
    `Rentabilidade: ${r.rentabilidade.toFixed(1)}%`,
  ].join('\n')
}

// `criarPropostaPendente` grava um `__alvoChave` interno dentro de
// `argumentos` (ver lib/luizia-pending-actions.ts) para saber qual rascunho
// substituir numa mesma conversa — nunca deve ir para uma tabela de domínio.
// As tools que gravam com um `patch`/campos explícitos (update_*, delete_*,
// convert_to_ativo) já não repassam `argumentos` inteiro, mas as que
// inserem o objeto completo (create_prospeccao, create_cenario,
// create_evidencia) precisam descartá-lo antes do insert.
function semChaveInterna(argumentos: Record<string, unknown>): Record<string, unknown> {
  const { __alvoChave, ...resto } = argumentos
  void __alvoChave
  return resto
}

// ─── Executor ────────────────────────────────────────────────────────────────
export async function execInvestidorAiTool(db: DB, name: string, args: Args, ctx: InvestidorAiCtx): Promise<string | null> {
  if (!INVESTIDOR_AI_TOOL_NAMES.includes(name)) return null
  try {
    switch (name) {
      case 'list_prospeccoes': {
        let query = db.from('prospeccoes').select('*')
        if (args.fase) query = query.eq('fase', args.fase)
        if (args.busca) query = query.or(`nome.ilike.%${args.busca}%,endereco.ilike.%${args.busca}%`)
        const { data, error } = await query.order('created_at', { ascending: false }).limit(30)
        if (error) return `Erro ao consultar prospecções: ${error.message}`
        const lista = (data || []) as Prospeccao[]
        if (lista.length === 0) return 'Nenhuma prospecção encontrada com esses filtros.'
        const { data: cenariosDasListadas } = await db.from('prospeccao_cenarios').select('*').in('prospeccao_id', lista.map(p => p.id))
        const principalPorProspeccao = new Map((cenariosDasListadas || []).filter((c: ProspeccaoCenario) => c.principal).map((c: ProspeccaoCenario) => [c.prospeccao_id, c]))
        return `${lista.length} prospecção(ões):\n` + lista.map(p => resumoProspeccao(p, principalPorProspeccao.get(p.id))).join('\n')
      }

      case 'get_prospeccao': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        const p = resolvido.item
        const [{ data: cenarios }, { data: evidencias }] = await Promise.all([
          db.from('prospeccao_cenarios').select('*').eq('prospeccao_id', p.id).order('created_at'),
          db.from('prospeccao_evidencias').select('*').eq('prospeccao_id', p.id).order('created_at'),
        ])
        const linhas = [
          resumoProspeccao(p),
          p.observacao ? `Observação: ${p.observacao}` : null,
          p.link_leilao ? `Link: ${p.link_leilao}` : null,
          '',
          cenarios?.length ? `Cenários (${cenarios.length}):` : 'Nenhum cenário financeiro ainda.',
          ...(cenarios || []).map((c: ProspeccaoCenario) => resumoCenario(c)),
          '',
          evidencias?.length ? `Evidências (${evidencias.length}):` : 'Nenhuma evidência registrada ainda.',
          ...(evidencias || []).map((e: ProspeccaoEvidencia) => resumoEvidencia(e)),
        ].filter((l): l is string => l !== null)
        return linhas.join('\n')
      }

      case 'list_evidencias': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        const p = resolvido.item
        const { data: evidencias, error } = await db.from('prospeccao_evidencias').select('*').eq('prospeccao_id', p.id).order('created_at')
        if (error) return `Erro ao consultar evidências: ${error.message}`
        const lista = (evidencias || []) as ProspeccaoEvidencia[]
        if (lista.length === 0) return `"${p.nome}" ainda não tem evidências registradas.`
        return `${lista.length} evidência(s) de "${p.nome}":\n` + lista.map(resumoEvidencia).join('\n')
      }

      case 'list_ativos': {
        const { data, error } = await db.from('projetos').select('id,nome,endereco,fase_ciclo').eq('contexto', 'investimento').order('created_at', { ascending: false }).limit(30)
        if (error) return `Erro ao consultar ativos: ${error.message}`
        const lista = (data || []) as { id: string; nome: string; endereco: string | null; fase_ciclo: string }[]
        if (lista.length === 0) return 'Nenhum ativo ainda — quando uma prospecção adquirida for convertida, ela aparece aqui.'
        const FASE_ATIVO: Record<string, string> = { projeto: 'Adquirido', em_obra: 'Em reforma', entregue: 'Pronto' }
        return `${lista.length} ativo(s):\n` + lista.map(a => `- "${a.nome}"${a.endereco ? `, ${a.endereco}` : ''}, ${FASE_ATIVO[a.fase_ciclo] || a.fase_ciclo}`).join('\n')
      }

      case 'compare_prospeccoes': {
        const nomes: string[] = Array.isArray(args.nomes) ? args.nomes : []
        if (nomes.length < 2) return 'Preciso de pelo menos 2 nomes de prospecções para comparar.'
        const linhas: string[] = []
        for (const nome of nomes) {
          const { data } = await db.from('prospeccoes').select('*').ilike('nome', `%${nome}%`).limit(8)
          const resolvido = resolverComSeguranca(nome, (data || []) as Prospeccao[], p => p.nome)
          if (resolvido.tipo === 'nao_encontrada') return `Não encontrei prospecção parecida com "${nome}". Comparação cancelada.`
          if (resolvido.tipo === 'ambigua') return formatarAmbiguidade('prospecções', nome, resolvido.candidatos.map(p => p.nome)) + ' Comparação cancelada.'
          const p = resolvido.item
          const { data: cenariosDaP } = await db.from('prospeccao_cenarios').select('*').eq('prospeccao_id', p.id)
          const principal = ((cenariosDaP || []) as ProspeccaoCenario[]).find(c => c.principal)
          if (!principal) { linhas.push(`"${p.nome}": sem cenário principal definido — não entra na comparação.`); continue }
          linhas.push([
            `"${p.nome}" (${MODALIDADE_LABEL[principal.modalidade]}):`,
            `  Avaliação: ${principal.valor_venda_estimado != null ? formatCurrency(principal.valor_venda_estimado) : '—'}`,
            `  Aquisição: ${principal.valor_arrematacao != null ? formatCurrency(principal.valor_arrematacao) : '—'}`,
            `  Investimento total: ${principal.investimento_total != null ? formatCurrency(principal.investimento_total) : '—'}`,
            `  Venda estimada líquida: ${principal.valor_liquido_venda != null ? formatCurrency(principal.valor_liquido_venda) : '—'}`,
            `  Lucro: ${principal.lucro != null ? formatCurrency(principal.lucro) : '—'}`,
            `  Rentabilidade: ${principal.rentabilidade != null ? `${principal.rentabilidade.toFixed(1)}%` : '—'}`,
            `  Prazo até a venda: ${principal.prazo_venda_meses != null ? `${principal.prazo_venda_meses} meses` : '—'}`,
          ].join('\n'))
        }
        return linhas.join('\n\n')
      }

      case 'propose_create_prospeccao': {
        if (!args.nome || !String(args.nome).trim()) return 'Preciso pelo menos do nome/apelido da prospecção.'
        const payload = {
          nome: String(args.nome).trim(),
          endereco: args.endereco || null,
          link_leilao: args.link_leilao || null,
          data_leilao: args.data_leilao || null,
          fase: FASES.includes(args.fase) ? args.fase : 'nova',
          responsavel: args.responsavel || null,
          proxima_acao: args.proxima_acao || null,
          observacao: args.observacao || null,
        }
        const descricao = [
          `Nova prospecção: ${payload.nome}`,
          payload.endereco ? `Endereço: ${payload.endereco}` : null,
          `Fase: ${FASE_LABEL[payload.fase as ProspeccaoFase]}`,
          payload.data_leilao ? `Data do leilão: ${fmtData(payload.data_leilao)}` : null,
          '', 'Confirmar criação?',
        ].filter((l): l is string => l !== null).join('\n')
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'create_prospeccao', argumentos: payload, descricao, alvoChave: 'create_prospeccao',
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_update_prospeccao': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        const p = resolvido.item
        const patch: Record<string, unknown> = {}
        const mudancas: string[] = []
        if (args.fase && FASES.includes(args.fase)) { patch.fase = args.fase; mudancas.push(`fase para ${FASE_LABEL[args.fase as ProspeccaoFase]}`) }
        if (args.endereco !== undefined) { patch.endereco = args.endereco || null; mudancas.push('endereço') }
        if (args.link_leilao !== undefined) { patch.link_leilao = args.link_leilao || null; mudancas.push('link do leilão') }
        if (args.data_leilao !== undefined) { patch.data_leilao = args.data_leilao || null; mudancas.push('data do leilão') }
        if (args.responsavel !== undefined) { patch.responsavel = args.responsavel || null; mudancas.push('responsável') }
        if (args.proxima_acao !== undefined) { patch.proxima_acao = args.proxima_acao || null; mudancas.push('próxima ação') }
        if (args.observacao !== undefined) { patch.observacao = args.observacao || null; mudancas.push('observação') }
        if (Object.keys(patch).length === 0) return 'Não entendi o que alterar na prospecção.'
        const descricao = `Alterar "${p.nome}": ${mudancas.join(', ')}. Confirmar?`
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'update_prospeccao', argumentos: { prospeccaoId: p.id, patch, nome: p.nome }, descricao,
          alvoChave: `update_prospeccao:${p.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_create_cenario': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        if (!args.nome_cenario) return 'Preciso do nome do cenário.'
        if (!MODALIDADES.includes(args.modalidade)) return 'Modalidade precisa ser vista, sac ou price.'
        const p = resolvido.item
        const premissas = montarPremissas(args, args.modalidade)
        const resultado = calcularCenario(premissas)
        const payload = { prospeccao_id: p.id, nome: String(args.nome_cenario).trim(), ...premissas, ...resultado }
        const descricao = [
          `Novo cenário "${payload.nome}" (${MODALIDADE_LABEL[payload.modalidade]}) em "${p.nome}":`,
          descricaoResultado(resultado),
          '', 'Confirmar criação?',
        ].join('\n')
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'create_cenario', argumentos: payload, descricao, alvoChave: `create_cenario:${p.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_update_cenario': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        if (!args.nome_cenario) return 'Preciso do nome do cenário a alterar.'
        const p = resolvido.item
        const cenario = await acharCenario(db, p.id, args.nome_cenario)
        if (cenario.tipo === 'nao_encontrada') return `Não encontrei nenhum cenário parecido com "${args.nome_cenario}" em "${p.nome}".`
        if (cenario.tipo === 'ambigua') return formatarAmbiguidade('cenários', args.nome_cenario, cenario.candidatos.map(c => c.nome))
        const c = cenario.item
        const premissas = montarPremissas(args, c.modalidade, c)
        const resultado = calcularCenario(premissas)
        const payload = { cenarioId: c.id, patch: { ...premissas, ...resultado } }
        const descricao = [
          `Alterar cenário "${c.nome}" de "${p.nome}" — novo resultado:`,
          descricaoResultado(resultado),
          '', 'Confirmar alteração?',
        ].join('\n')
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'update_cenario', argumentos: { ...payload, nome: c.nome }, descricao, alvoChave: `update_cenario:${c.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_delete_cenario': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        if (!args.nome_cenario) return 'Preciso do nome do cenário a excluir.'
        const p = resolvido.item
        const cenario = await acharCenario(db, p.id, args.nome_cenario)
        if (cenario.tipo === 'nao_encontrada') return `Não encontrei nenhum cenário parecido com "${args.nome_cenario}" em "${p.nome}".`
        if (cenario.tipo === 'ambigua') return formatarAmbiguidade('cenários', args.nome_cenario, cenario.candidatos.map(c => c.nome))
        const c = cenario.item
        const descricao = `Excluir o cenário "${c.nome}" de "${p.nome}"? Essa ação não pode ser desfeita.`
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'delete_cenario', argumentos: { cenarioId: c.id, nome: c.nome }, descricao, alvoChave: `delete_cenario:${c.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_set_cenario_principal': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        if (!args.nome_cenario) return 'Preciso do nome do cenário a marcar como principal.'
        const p = resolvido.item
        const cenario = await acharCenario(db, p.id, args.nome_cenario)
        if (cenario.tipo === 'nao_encontrada') return `Não encontrei nenhum cenário parecido com "${args.nome_cenario}" em "${p.nome}".`
        if (cenario.tipo === 'ambigua') return formatarAmbiguidade('cenários', args.nome_cenario, cenario.candidatos.map(c => c.nome))
        const c = cenario.item
        if (c.principal) return `"${c.nome}" já é o cenário principal de "${p.nome}".`
        const descricao = `Marcar "${c.nome}" como cenário principal de "${p.nome}" (o principal atual deixa de ser)? Confirmar?`
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'set_cenario_principal', argumentos: { prospeccaoId: p.id, cenarioId: c.id, nome: c.nome }, descricao,
          alvoChave: `set_cenario_principal:${p.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_convert_to_ativo': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        const p = resolvido.item
        if (p.fase !== 'adquirida') return `"${p.nome}" precisa estar com fase "Adquirida" antes de virar Ativo (fase atual: ${FASE_LABEL[p.fase]}).`
        if (p.project_id) return `"${p.nome}" já foi convertida em Ativo.`
        const descricao = `Converter "${p.nome}" em Ativo — cria um Projeto (contexto de investimento) reaproveitando Estrutura/Orçamento/Cronograma/Board/Tarefas, e mantém a prospecção vinculada para histórico. Confirmar?`
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'convert_to_ativo', argumentos: { prospeccaoId: p.id, nome: p.nome, endereco: p.endereco, fotoUrl: p.foto_url }, descricao,
          alvoChave: `convert_to_ativo:${p.id}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'propose_create_evidencia': {
        const resolvido = await resolveProspeccao(db, ctx, args.prospeccao_nome)
        if (resolvido.tipo !== 'unica') return mensagemProspeccaoNaoResolvida(resolvido, args.prospeccao_nome)
        if (!args.informacao || !String(args.informacao).trim()) return 'Preciso da informação encontrada para registrar a evidência.'
        const p = resolvido.item
        const natureza: ProspeccaoEvidencia['natureza'] = NATUREZAS.includes(args.natureza) ? args.natureza : 'observado'
        const payload = {
          prospeccao_id: p.id,
          informacao: String(args.informacao).trim(),
          tipo: args.tipo || null,
          fonte: args.fonte || null,
          url: args.url || null,
          data_evidencia: args.data_evidencia || null,
          natureza,
        }
        const descricao = [
          `Nova evidência em "${p.nome}" [${NATUREZA_LABEL[natureza]}]:`,
          `"${payload.informacao}"`,
          payload.fonte ? `Fonte: ${payload.fonte}` : null,
          payload.data_evidencia ? `Data: ${fmtData(payload.data_evidencia)}` : null,
          '', 'Confirmar registro?',
        ].filter((l): l is string => l !== null).join('\n')
        const proposta = await criarPropostaPendente(db, {
          conversationKey: ctx.conversationKey, profileId: ctx.profileId, actor: ctx.actor, origem: ctx.origem,
          tool: 'create_evidencia', argumentos: payload, descricao, alvoChave: `create_evidencia:${p.id}:${Date.now()}`,
        })
        if (!proposta) return 'Não consegui preparar a proposta agora. Tente novamente.'
        return descricao
      }

      case 'confirm_pending_action':
      case 'reject_pending_action': {
        const resolvido = await acharPendenteParaResolver(db, ctx.conversationKey, { pendingId: args.pending_id, titulo: args.titulo })
        if (resolvido.tipo === 'nenhuma') return 'Não encontrei nenhuma proposta minha pendente para confirmar. Se quiser fazer algo agora, é só me dizer diretamente.'
        if (resolvido.tipo === 'nao_encontrada') return 'Não encontrei essa proposta (pode já ter sido resolvida).'
        if (resolvido.tipo === 'expirada') return 'Essa proposta expirou (mais de 30 minutos sem confirmação). Se ainda quiser, me diga de novo o que fazer.'
        if (resolvido.tipo === 'ambigua') return formatarListaPendentes(resolvido.candidatas)

        const acao = resolvido.acao
        if (name === 'reject_pending_action') {
          await marcarRejeitada(db, acao.id)
          return 'Certo, não vou alterar nada.'
        }

        switch (acao.tool) {
          case 'create_prospeccao': {
            const payload = semChaveInterna(acao.argumentos as Record<string, unknown>)
            const { data, error } = await db.from('prospeccoes').insert(payload).select('id,nome').single()
            if (error) return `Erro ao criar prospecção: ${error.message}`
            await marcarExecutada(db, acao.id)
            return `Prospecção "${(data as { nome: string }).nome}" criada.`
          }
          case 'update_prospeccao': {
            const { prospeccaoId, patch, nome } = acao.argumentos as { prospeccaoId: string; patch: Record<string, unknown>; nome: string }
            const { error } = await db.from('prospeccoes').update(patch).eq('id', prospeccaoId)
            if (error) return `Erro ao alterar prospecção: ${error.message}`
            await marcarExecutada(db, acao.id)
            return `Prospecção "${nome}" atualizada.`
          }
          case 'create_cenario': {
            const payload = semChaveInterna(acao.argumentos as Record<string, unknown>)
            const { error } = await db.from('prospeccao_cenarios').insert(payload)
            if (error) return `Erro ao criar cenário: ${error.message}`
            await marcarExecutada(db, acao.id)
            return `Cenário "${payload.nome}" criado.`
          }
          case 'update_cenario': {
            const { cenarioId, patch, nome } = acao.argumentos as { cenarioId: string; patch: Record<string, unknown>; nome: string }
            const { error } = await db.from('prospeccao_cenarios').update(patch).eq('id', cenarioId)
            if (error) return `Erro ao alterar cenário: ${error.message}`
            await marcarExecutada(db, acao.id)
            return `Cenário "${nome}" atualizado.`
          }
          case 'delete_cenario': {
            const { cenarioId, nome } = acao.argumentos as { cenarioId: string; nome: string }
            const { error } = await db.from('prospeccao_cenarios').delete().eq('id', cenarioId)
            if (error) return `Erro ao excluir cenário: ${error.message}`
            await marcarExecutada(db, acao.id)
            return `Cenário "${nome}" excluído.`
          }
          case 'set_cenario_principal': {
            const { prospeccaoId, cenarioId, nome } = acao.argumentos as { prospeccaoId: string; cenarioId: string; nome: string }
            const { error } = await db.rpc('prospeccao_cenario_definir_principal', { p_prospeccao_id: prospeccaoId, p_cenario_id: cenarioId })
            if (error) return `Erro ao marcar principal: ${error.message}`
            await marcarExecutada(db, acao.id)
            return `"${nome}" agora é o cenário principal.`
          }
          case 'convert_to_ativo': {
            const { prospeccaoId, nome, endereco, fotoUrl } = acao.argumentos as { prospeccaoId: string; nome: string; endereco: string | null; fotoUrl: string | null }
            const { data: novoProjeto, error } = await db.from('projetos').insert({
              nome, endereco, foto_url: fotoUrl, contexto: 'investimento', status: 'em_andamento',
            }).select('id').single()
            if (error || !novoProjeto) return `Erro ao criar o Ativo: ${error?.message}`
            const { error: linkError } = await db.from('prospeccoes').update({ project_id: (novoProjeto as { id: string }).id }).eq('id', prospeccaoId)
            if (linkError) return `Ativo criado, mas não consegui vincular à prospecção: ${linkError.message}.`
            await marcarExecutada(db, acao.id)
            return `"${nome}" convertida em Ativo.`
          }
          case 'create_evidencia': {
            const payload = semChaveInterna(acao.argumentos as Record<string, unknown>)
            const { error } = await db.from('prospeccao_evidencias').insert(payload)
            if (error) return `Erro ao registrar evidência: ${error.message}`
            await marcarExecutada(db, acao.id)
            return 'Evidência registrada.'
          }
          default:
            return 'Essa proposta pendente não é do Investidor — não consigo confirmar por aqui.'
        }
      }

      default:
        return null
    }
  } catch (err) {
    return `Erro ao executar ${name}: ${err instanceof Error ? err.message : 'desconhecido'}`
  }
}
