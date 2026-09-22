'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  criarEtapa,
  excluirEtapa,
  listarEtapasDaOperacao,
  reordenarEtapas,
  atualizarEtapa,
  type OperacaoEtapa,
} from '@/lib/operacoes'
import { moverProcessoParaEtapa, reordenarProcessosDaEtapa, type Processo } from '@/lib/processo'
import { colunaDoItem, moverItemEntreColunas, reordenarNaColuna } from './kanban-utils'

const STATUS_ROTULO: Record<string, string> = {
  ACTIVE: 'Ativo', ON_HOLD: 'Em espera', COMPLETED: 'Concluído', ARCHIVED: 'Arquivado',
}

// Coluna fixa para Processos vinculados à Operação mas ainda sem etapa
// definida (ex.: acabou de ser vinculado). Nunca persistida — é só o "balde"
// visual de etapa_operacional_id === null.
const SEM_ETAPA = '__sem_etapa__'

type Colunas = Record<string, string[]>

function montarColunas(etapas: OperacaoEtapa[], processos: Processo[]): Colunas {
  const colunas: Colunas = { [SEM_ETAPA]: [] }
  for (const e of etapas) colunas[e.id] = []
  const porEtapa = [...processos].sort((a, b) => a.ordem_etapa - b.ordem_etapa)
  for (const p of porEtapa) {
    const chave = p.etapa_operacional_id && colunas[p.etapa_operacional_id] ? p.etapa_operacional_id : SEM_ETAPA
    colunas[chave].push(p.id)
  }
  return colunas
}

function Cartao({ processo, onAbrir }: { processo: Processo; onAbrir: (p: Processo) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: processo.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => { if (!isDragging) onAbrir(processo) }}
      className="cursor-grab touch-none rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left outline-none transition active:cursor-grabbing hover:border-cyan-200/30 hover:bg-white/[0.08]"
    >
      <div className="truncate text-[13.5px] font-semibold text-white/92">{processo.nome}</div>
      <div className="mt-0.5 truncate text-[11.5px] text-white/50">
        {[processo.tipo, processo.endereco].filter(Boolean).join(' · ') || STATUS_ROTULO[processo.status]}
      </div>
    </div>
  )
}

function Coluna({
  id, titulo, processoIds, processosPorId, onAbrir, podeExcluir, onRenomear, onExcluir, onMoverEsquerda, onMoverDireita,
}: {
  id: string
  titulo: string
  processoIds: string[]
  processosPorId: Record<string, Processo>
  onAbrir: (p: Processo) => void
  podeExcluir: boolean
  onRenomear?: (nome: string) => void
  onExcluir?: () => void
  onMoverEsquerda?: () => void
  onMoverDireita?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState(titulo)

  return (
    <div className="flex w-[260px] shrink-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 px-0.5">
        {onMoverEsquerda && (
          <button type="button" onClick={onMoverEsquerda} className="grid size-5 shrink-0 place-items-center rounded text-white/35 outline-none hover:text-white/70" title="Mover coluna para a esquerda" aria-label="Mover coluna para a esquerda">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        {editando && onRenomear ? (
          <input
            autoFocus
            value={nomeEdit}
            onChange={e => setNomeEdit(e.target.value)}
            onBlur={() => { setEditando(false); const n = nomeEdit.trim(); if (n && n !== titulo) onRenomear(n); else setNomeEdit(titulo) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setNomeEdit(titulo); setEditando(false) } }}
            className="min-w-0 flex-1 rounded-lg border border-cyan-200/40 bg-black/30 px-2 py-1 text-[12.5px] font-semibold text-white outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onRenomear && setEditando(true)}
            disabled={!onRenomear}
            className="min-w-0 flex-1 truncate rounded-lg px-1.5 py-1 text-left text-[12.5px] font-semibold uppercase tracking-[0.06em] text-white/75 outline-none hover:bg-white/5 disabled:hover:bg-transparent"
          >
            {titulo} <span className="text-white/35">· {processoIds.length}</span>
          </button>
        )}
        {onMoverDireita && (
          <button type="button" onClick={onMoverDireita} className="grid size-5 shrink-0 place-items-center rounded text-white/35 outline-none hover:text-white/70" title="Mover coluna para a direita" aria-label="Mover coluna para a direita">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
        {onExcluir && (
          <button type="button" onClick={onExcluir} disabled={!podeExcluir} title={podeExcluir ? 'Excluir etapa' : 'Mova os Processos para outra etapa antes de excluir'} className="grid size-5 shrink-0 place-items-center rounded text-white/35 outline-none hover:text-red-300/85 disabled:opacity-30 disabled:hover:text-white/35">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={
          'flex min-h-[80px] flex-col gap-2 rounded-2xl border p-2 transition ' +
          (isOver ? 'border-cyan-200/40 bg-cyan-300/[0.06]' : 'border-white/8 bg-white/[0.02]')
        }
      >
        <SortableContext items={processoIds} strategy={verticalListSortingStrategy}>
          {processoIds.map(id => {
            const p = processosPorId[id]
            return p ? <Cartao key={id} processo={p} onAbrir={onAbrir} /> : null
          })}
        </SortableContext>
        {processoIds.length === 0 && (
          <div className="grid min-h-[56px] place-items-center rounded-xl border border-dashed border-white/10 text-[11.5px] text-white/30">
            Arraste um Processo aqui
          </div>
        )}
      </div>
    </div>
  )
}

// Kanban de uma Operação: colunas = etapas configuráveis (+ "Sem etapa").
// Drag-and-drop entre colunas persiste etapa_operacional_id + ordem_etapa;
// CRUD/listagem plana de Processos continua disponível em TelaProcessos como
// fallback — este componente só cobre a visão por etapas.
export function OperacaoKanban({
  supabase, operacaoId, processos, onAbrir, onProcessosMudaram,
}: {
  supabase: SupabaseClient
  operacaoId: string
  processos: Processo[]
  onAbrir: (p: Processo) => void
  onProcessosMudaram: () => void
}) {
  const [etapas, setEtapas] = useState<OperacaoEtapa[] | null>(null)
  const [colunas, setColunas] = useState<Colunas>({ [SEM_ETAPA]: [] })
  const [erro, setErro] = useState('')
  const [criandoEtapa, setCriandoEtapa] = useState(false)
  const [nomeEtapaNova, setNomeEtapaNova] = useState('')
  const origemArrasteRef = useRef<string | null>(null)

  const processosPorId = useMemo(() => {
    const m: Record<string, Processo> = {}
    for (const p of processos) m[p.id] = p
    return m
  }, [processos])

  const carregarEtapas = async () => {
    const lista = await listarEtapasDaOperacao(supabase, operacaoId)
    setEtapas(lista)
    setColunas(montarColunas(lista, processos))
  }

  useEffect(() => {
    let vivo = true
    void (async () => {
      const lista = await listarEtapasDaOperacao(supabase, operacaoId)
      if (!vivo) return
      setEtapas(lista)
      setColunas(montarColunas(lista, processos))
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operacaoId])

  // `processos` muda quando o pai recarrega após um drop — reconstrói as
  // colunas a partir da verdade do servidor. Ajuste durante a renderização
  // (não em effect) para não empilhar um segundo ciclo de render.
  const [processosSincronizados, setProcessosSincronizados] = useState(processos)
  if (processos !== processosSincronizados) {
    setProcessosSincronizados(processos)
    if (etapas) setColunas(montarColunas(etapas, processos))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  function encontrarColuna(id: string): string | null {
    if (id in colunas) return id
    return colunaDoItem(colunas, id)
  }

  function handleDragStart(event: { active: { id: string | number } }) {
    origemArrasteRef.current = encontrarColuna(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const ativoId = String(active.id)
    const sobreId = String(over.id)
    const colunaAtiva = encontrarColuna(ativoId)
    const colunaSobre = encontrarColuna(sobreId)
    if (!colunaAtiva || !colunaSobre || colunaAtiva === colunaSobre) return
    setColunas(prev => {
      const indiceSobre = prev[colunaSobre].indexOf(sobreId)
      const posicao = indiceSobre >= 0 ? indiceSobre : prev[colunaSobre].length
      return moverItemEntreColunas(prev, colunaAtiva, colunaSobre, ativoId, posicao)
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const origem = origemArrasteRef.current
    origemArrasteRef.current = null
    if (!over) return
    const ativoId = String(active.id)
    const sobreId = String(over.id)
    const colunaAtiva = encontrarColuna(ativoId)
    const colunaSobre = encontrarColuna(sobreId)
    if (!colunaAtiva || !colunaSobre) return

    let colunasFinais = colunas
    if (colunaAtiva === colunaSobre) {
      const indiceAtual = colunas[colunaAtiva].indexOf(ativoId)
      const indiceDestino = colunas[colunaSobre].indexOf(sobreId)
      if (indiceAtual !== -1 && indiceDestino !== -1 && indiceAtual !== indiceDestino) {
        colunasFinais = reordenarNaColuna(colunas, colunaAtiva, indiceAtual, indiceDestino)
        setColunas(colunasFinais)
      }
    }

    const destino = colunaAtiva
    try {
      if (origem && origem !== destino) {
        await moverProcessoParaEtapa(supabase, ativoId, destino === SEM_ETAPA ? null : destino)
      }
      await reordenarProcessosDaEtapa(supabase, colunasFinais[destino])
      if (origem && origem !== destino && colunasFinais[origem]?.length) {
        await reordenarProcessosDaEtapa(supabase, colunasFinais[origem])
      }
      onProcessosMudaram()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mover o Processo.')
      await carregarEtapas()
      onProcessosMudaram()
    }
  }

  async function criarNovaEtapa() {
    const nome = nomeEtapaNova.trim()
    if (!nome) return
    try {
      await criarEtapa(supabase, { operacao_id: operacaoId, nome })
      setNomeEtapaNova('')
      setCriandoEtapa(false)
      await carregarEtapas()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a etapa.')
    }
  }

  async function renomearEtapa(id: string, nome: string) {
    try {
      await atualizarEtapa(supabase, id, { nome })
      await carregarEtapas()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível renomear a etapa.')
    }
  }

  async function excluirEtapaSegura(id: string) {
    try {
      await excluirEtapa(supabase, id)
      await carregarEtapas()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir a etapa.')
    }
  }

  async function moverEtapa(indice: number, direcao: -1 | 1) {
    if (!etapas) return
    const alvo = indice + direcao
    if (alvo < 0 || alvo >= etapas.length) return
    const nova = [...etapas]
    ;[nova[indice], nova[alvo]] = [nova[alvo], nova[indice]]
    setEtapas(nova)
    try {
      await reordenarEtapas(supabase, nova.map(e => e.id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível reordenar as etapas.')
      await carregarEtapas()
    }
  }

  if (!etapas) {
    return <div className="py-8 text-center text-[13px] text-cyan-100/60">Carregando etapas…</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-300/25 bg-red-300/[0.06] px-3 py-2 text-[12.5px] text-red-200/90">
          {erro}
          <button type="button" onClick={() => setErro('')} className="shrink-0 text-red-200/60 hover:text-red-200">✕</button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          <Coluna
            id={SEM_ETAPA}
            titulo="Sem etapa"
            processoIds={colunas[SEM_ETAPA] ?? []}
            processosPorId={processosPorId}
            onAbrir={onAbrir}
            podeExcluir={false}
          />
          {etapas.map((e, i) => (
            <Coluna
              key={e.id}
              id={e.id}
              titulo={e.nome}
              processoIds={colunas[e.id] ?? []}
              processosPorId={processosPorId}
              onAbrir={onAbrir}
              podeExcluir={(colunas[e.id] ?? []).length === 0}
              onRenomear={nome => renomearEtapa(e.id, nome)}
              onExcluir={() => excluirEtapaSegura(e.id)}
              onMoverEsquerda={i > 0 ? () => moverEtapa(i, -1) : undefined}
              onMoverDireita={i < etapas.length - 1 ? () => moverEtapa(i, 1) : undefined}
            />
          ))}
          <div className="flex w-[220px] shrink-0 flex-col gap-2">
            {criandoEtapa ? (
              <div className="rounded-2xl border border-cyan-200/20 bg-cyan-300/[0.06] p-2.5">
                <input
                  autoFocus
                  value={nomeEtapaNova}
                  onChange={e => setNomeEtapaNova(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') criarNovaEtapa(); if (e.key === 'Escape') { setCriandoEtapa(false); setNomeEtapaNova('') } }}
                  placeholder="Nome da etapa"
                  className="w-full rounded-lg border border-white/12 bg-black/25 px-2.5 py-1.5 text-[12.5px] text-white/92 outline-none placeholder:text-white/35 focus:border-cyan-200/40"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" onClick={criarNovaEtapa} className="rounded-full bg-cyan-300/90 px-3 py-1 text-[12px] font-medium text-slate-950 hover:bg-cyan-200">Criar</button>
                  <button type="button" onClick={() => { setCriandoEtapa(false); setNomeEtapaNova('') }} className="rounded-full px-2.5 py-1 text-[12px] text-white/55 hover:text-white/85">Cancelar</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCriandoEtapa(true)}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-[12.5px] font-medium text-cyan-100/80 outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.05] hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                Nova etapa
              </button>
            )}
          </div>
        </div>
      </DndContext>
    </div>
  )
}
