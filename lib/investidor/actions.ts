// Camada pública de Actions do domínio Investidor (Tellus R01 / Seção D).
//
// Contrato único e determinístico do fluxo do template Investidor:
//   Processo → Caixa de Entrada → oportunidade → ficha/evidências →
//   mercado/comparáveis → cenários/viabilidade → decisão.
//
// Regra canônica (Plano 01 / Rodada 01 — Seção D):
//   UI / API / futura IA → Action do domínio dono → Service → Repository → banco.
//
// A IA NÃO escreve no banco arbitrariamente: chama estas Actions. Cada Action
// declara sua CLASSE (ver INVESTIDOR_ACTIONS abaixo) para que a futura camada
// assistiva saiba, sem adivinhar, o que pode executar sozinha, o que precisa de
// aprovação humana e o que é exclusivamente humano. Nesta rodada NENHUMA IA é
// criada — só o contrato. O CRUD manual continua intacto.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProspeccaoAnaliseMercado,
  ProspeccaoCenario,
  ProspeccaoEvidencia,
  ProspeccaoFicha,
  ProspeccaoFase,
} from '@/lib/types'
import type { PremissasCenario, ResultadoCenario } from '@/lib/investidor-calculadora'
import {
  derivarValidacaoFicha,
  planejarCampoManualFicha,
  type ValidacaoFichaEntrada,
} from './service'
import * as repo from './repository'

// ─── Classificação das Actions (contrato para a futura IA) ───────────────────
// leitura                → só lê, nunca muda estado.
// preparacao             → produz rascunho/derivação sem persistir (fica no cliente/servidor).
// escrita_reversivel     → grava algo que pode ser desfeito por outra operação equivalente.
// exige_aprovacao_humana → só deve ser executada após confirmação explícita de um humano.
// exclusivamente_humana  → representa julgamento humano; a IA no máximo PREPARA, nunca executa.
export type ClasseAction =
  | 'leitura'
  | 'preparacao'
  | 'escrita_reversivel'
  | 'exige_aprovacao_humana'
  | 'exclusivamente_humana'

export type ActionMeta = {
  classe: ClasseAction
  descricao: string
}

export const INVESTIDOR_ACTIONS: Record<string, ActionMeta> = {
  obterFicha: { classe: 'leitura', descricao: 'Lê a ficha da oportunidade.' },
  salvarValidacaoFicha: {
    classe: 'escrita_reversivel',
    descricao: 'Persiste dados confirmados/conflitos/status da ficha. Reversível por nova validação.',
  },
  adicionarCampoManualFicha: {
    classe: 'escrita_reversivel',
    descricao: 'Insere/atualiza um campo confirmado da ficha. Reversível por nova edição.',
  },
  listarEvidencias: { classe: 'leitura', descricao: 'Lê as evidências da oportunidade.' },
  criarEvidencia: {
    classe: 'escrita_reversivel',
    descricao: 'Registra uma evidência (append). Reversível por exclusão.',
  },
  excluirEvidencia: {
    classe: 'exige_aprovacao_humana',
    descricao: 'Apaga uma evidência. Destrutivo — exige confirmação humana explícita.',
  },
  alternarSelecaoComparavel: {
    classe: 'escrita_reversivel',
    descricao: 'Marca/desmarca comparável como salvo/favorito. Reversível pelo toggle inverso.',
  },
  encerrarAnaliseMercado: {
    classe: 'escrita_reversivel',
    descricao: 'Grava um snapshot imutável da análise de mercado (histórico append-only).',
  },
  criarCenario: { classe: 'escrita_reversivel', descricao: 'Cria um cenário de viabilidade. Reversível por exclusão.' },
  atualizarCenario: { classe: 'escrita_reversivel', descricao: 'Edita as premissas/resultado de um cenário.' },
  duplicarCenario: { classe: 'escrita_reversivel', descricao: 'Duplica um cenário para comparar. Reversível por exclusão.' },
  excluirCenario: {
    classe: 'exige_aprovacao_humana',
    descricao: 'Apaga um cenário. Destrutivo — exige confirmação humana explícita.',
  },
  definirCenarioPrincipal: {
    classe: 'escrita_reversivel',
    descricao: 'Define qual cenário é o principal (via RPC transacional). Reversível escolhendo outro.',
  },
  registrarDecisao: {
    classe: 'exclusivamente_humana',
    descricao: 'Muda a fase da oportunidade (aprovar/descartar/adquirir). Decisão de negócio — a IA no máximo prepara.',
  },
} as const

// ─── Ficha ────────────────────────────────────────────────────────────────
export function obterFicha(db: SupabaseClient, prospeccaoId: string): Promise<ProspeccaoFicha | null> {
  return repo.obterFicha(db, prospeccaoId)
}

export async function salvarValidacaoFicha(
  db: SupabaseClient,
  input: { fichaId: string } & ValidacaoFichaEntrada,
): Promise<ProspeccaoFicha> {
  const { dados_confirmados, conflitos, status } = derivarValidacaoFicha(input)
  return repo.atualizarFicha(db, input.fichaId, {
    dados_confirmados,
    conflitos,
    status,
    updated_at: new Date().toISOString(),
  })
}

export async function adicionarCampoManualFicha(
  db: SupabaseClient,
  input: {
    prospeccaoId: string
    fichaExistente: Pick<ProspeccaoFicha, 'id' | 'status' | 'dados_confirmados'> | null
    chave: string
    valor: string
  },
): Promise<ProspeccaoFicha | null> {
  const plano = planejarCampoManualFicha({
    fichaExistente: input.fichaExistente,
    chave: input.chave,
    valor: input.valor,
  })
  if (!plano) return null

  if (plano.tipo === 'inserir') {
    return repo.inserirFicha(db, {
      prospeccao_id: input.prospeccaoId,
      dados_extraidos: {},
      dados_confirmados: plano.dados_confirmados,
      status: 'parcial',
    })
  }
  return repo.atualizarFicha(db, plano.fichaId, {
    dados_confirmados: plano.dados_confirmados,
    status: plano.status,
    updated_at: new Date().toISOString(),
  })
}

// ─── Evidências ─────────────────────────────────────────────────────────────
export function listarEvidencias(db: SupabaseClient, prospeccaoId: string): Promise<ProspeccaoEvidencia[]> {
  return repo.listarEvidencias(db, prospeccaoId)
}

export function criarEvidencia(
  db: SupabaseClient,
  input: {
    prospeccaoId: string
    informacao: string
    tipo?: string | null
    fonte?: string | null
    url?: string | null
    data_evidencia?: string | null
    natureza: ProspeccaoEvidencia['natureza']
  },
): Promise<ProspeccaoEvidencia> {
  return repo.inserirEvidencia(db, {
    prospeccao_id: input.prospeccaoId,
    informacao: input.informacao.trim(),
    tipo: input.tipo?.trim() || null,
    fonte: input.fonte?.trim() || null,
    url: input.url?.trim() || null,
    data_evidencia: input.data_evidencia || null,
    natureza: input.natureza,
  })
}

// Destrutivo: a confirmação humana acontece na UI (confirm) antes de chamar.
export function excluirEvidencia(db: SupabaseClient, id: string): Promise<void> {
  return repo.excluirEvidencia(db, id)
}

// ─── Mercado / comparáveis ───────────────────────────────────────────────────
export function alternarSelecaoComparavel(
  db: SupabaseClient,
  input: { id: string; campo: 'salvo' | 'favorito'; valorAtual: boolean },
): Promise<void> {
  return repo.atualizarSelecaoComparavel(db, input.id, input.campo, !input.valorAtual)
}

export function encerrarAnaliseMercado(
  db: SupabaseClient,
  payload: Partial<ProspeccaoAnaliseMercado> & { prospeccao_id: string },
): Promise<ProspeccaoAnaliseMercado> {
  return repo.inserirAnaliseMercado(db, payload)
}

// ─── Cenários / viabilidade ──────────────────────────────────────────────────
export function criarCenario(
  db: SupabaseClient,
  input: {
    prospeccaoId: string
    nome: string
    premissas: PremissasCenario
    resultado: ResultadoCenario
    // Usado só pelo cenário "Base" auto-criado (primeiro da oportunidade),
    // que já nasce principal. Omitido nos demais → default false no banco.
    principal?: boolean
  },
): Promise<ProspeccaoCenario> {
  return repo.inserirCenario(db, {
    prospeccao_id: input.prospeccaoId,
    nome: input.nome.trim(),
    ...(input.principal !== undefined ? { principal: input.principal } : {}),
    ...input.premissas,
    ...input.resultado,
  })
}

export function atualizarCenario(
  db: SupabaseClient,
  input: { id: string; prospeccaoId: string; nome: string; premissas: PremissasCenario; resultado: ResultadoCenario },
): Promise<ProspeccaoCenario> {
  return repo.atualizarCenario(db, input.id, {
    prospeccao_id: input.prospeccaoId,
    nome: input.nome.trim(),
    ...input.premissas,
    ...input.resultado,
  })
}

// Duplica preservando as premissas/resultado, mas nunca o principal nem os
// timestamps/id — mesma semântica de "Duplicar para comparar".
export function duplicarCenario(db: SupabaseClient, cenario: ProspeccaoCenario): Promise<ProspeccaoCenario> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, principal, ...resto } = cenario
  return repo.inserirCenario(db, { ...resto, nome: `${cenario.nome} (cópia)`, principal: false })
}

// Destrutivo: confirmação humana na UI antes de chamar.
export function excluirCenario(db: SupabaseClient, id: string): Promise<void> {
  return repo.excluirCenario(db, id)
}

export function definirCenarioPrincipal(
  db: SupabaseClient,
  input: { prospeccaoId: string; cenarioId: string },
): Promise<void> {
  return repo.definirCenarioPrincipal(db, input.prospeccaoId, input.cenarioId)
}

// ─── Decisão ─────────────────────────────────────────────────────────────────
// Muda a fase da oportunidade — é a decisão de negócio do fluxo. Classe
// exclusivamente_humana: a IA no máximo prepara/sugere; o registro da decisão
// parte de um humano.
export function registrarDecisao(
  db: SupabaseClient,
  input: { prospeccaoId: string; fase: ProspeccaoFase },
): Promise<void> {
  return repo.atualizarFaseProspeccao(db, input.prospeccaoId, input.fase)
}
