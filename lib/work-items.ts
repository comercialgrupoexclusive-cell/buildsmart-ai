import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tarefa } from './types'
import { listarEntradasCaixa, type EntradaCaixa } from './processo/caixa-entrada'
import { listarTriagens, type TriagemStatus } from './caixa-entrada/triagem'

// WorkItem — visão unificada de "o que precisa de atenção" num Processo (ou na
// organização): Caixa de Entrada + Tarefas, uma fonte só, por referência e não
// por cópia.
//
// A unificação não cria tabela nova (seria camada paralela — ver AGENTS.md §4):
// lê as duas fontes que já existem e as apresenta como um fluxo único. A ponte
// é tarefas.origem_entrada_id (migration 20261002140000): a tarefa que nasceu
// de uma entrada aponta para ela, então entrada e tarefa são o MESMO item de
// trabalho em dois momentos — bruto e acionável —, nunca dois registros soltos.
//
// Regra de exibição: uma entrada que JÁ virou tarefa não aparece duas vezes.
// Ela some da lista como "entrada" e passa a ser representada pela tarefa (que
// carrega a origem). Entradas ainda cruas (não viradas em tarefa) aparecem como
// item próprio, para serem triadas.

export type WorkItemKind = 'tarefa' | 'entrada'

export type WorkItem = {
  kind: WorkItemKind
  id: string
  titulo: string
  // Texto curto de apoio: descrição da tarefa, ou conteúdo/resumo da entrada.
  resumo: string | null
  processo_id: string | null
  created_at: string
  // Só para kind='tarefa':
  tarefa?: Tarefa
  // Só para kind='entrada':
  entrada?: EntradaCaixa
  entradaTriagem?: TriagemStatus
}

function tituloDaEntrada(e: EntradaCaixa): string {
  if (e.tipo === 'texto') {
    const t = (e.conteudo_texto ?? '').trim()
    return t.length > 80 ? `${t.slice(0, 80)}…` : (t || 'Entrada de texto')
  }
  return e.arquivo_nome || (e.tipo === 'imagem' ? 'Imagem' : e.tipo === 'audio' ? 'Áudio' : 'Documento')
}

// Uma consulta por fonte (tarefas, entradas, triagens) — nunca uma por item
// (AGENTS.md §9). processoId nulo = escopo organização (tudo que a RLS deixa).
export async function listarWorkItems(
  supabase: SupabaseClient,
  processoId: string | null,
): Promise<WorkItem[]> {
  let tarefasQuery = supabase.from('tarefas').select('*')
  tarefasQuery = processoId
    ? tarefasQuery.eq('processo_id', processoId)
    : tarefasQuery.not('processo_id', 'is', null)

  const [{ data: tarefasData }, entradas] = await Promise.all([
    tarefasQuery.order('created_at', { ascending: false }),
    listarEntradasCaixa(supabase, processoId),
  ])
  const tarefas = (tarefasData ?? []) as Tarefa[]

  const triagens = await listarTriagens(supabase, entradas.map(e => e.id))
  const triagemPorEntrada = new Map(triagens.map(t => [t.entrada_id, t]))

  // Entradas que já viraram tarefa não aparecem como entrada: a tarefa (com a
  // origem) já as representa. Vale tanto pelo vínculo de triagem quanto pela
  // referência direta na tarefa, cobrindo dados antigos e novos.
  const entradasComTarefa = new Set<string>(
    tarefas.map(t => t.origem_entrada_id).filter((v): v is string => !!v),
  )
  for (const t of triagens) if (t.tarefa_id) entradasComTarefa.add(t.entrada_id)

  const itensTarefa: WorkItem[] = tarefas.map(t => ({
    kind: 'tarefa',
    id: t.id,
    titulo: t.titulo,
    resumo: t.descricao,
    processo_id: t.processo_id,
    created_at: t.created_at,
    tarefa: t,
  }))

  const itensEntrada: WorkItem[] = entradas
    .filter(e => !entradasComTarefa.has(e.id))
    .map(e => ({
      kind: 'entrada',
      id: e.id,
      titulo: tituloDaEntrada(e),
      resumo: null,
      processo_id: e.processo_id,
      created_at: e.created_at,
      entrada: e,
      entradaTriagem: triagemPorEntrada.get(e.id)?.status ?? 'novo',
    }))

  return [...itensTarefa, ...itensEntrada].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )
}
