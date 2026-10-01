'use client'

// Árvore hierárquica reutilizável (padrão "componente" à la SketchUp): uma única
// implementação de hierarquia, níveis, expandir/recolher, seleção, arraste por
// alça (reordena dentro do mesmo nível), numeração automática 1/1.1/1.1.1,
// responsivo (desktop com painel lateral; mobile com detalhe inline). O conteúdo
// da linha, as ações e o painel de detalhes vêm por render-prop — as regras de
// cada domínio ficam FORA daqui. Usado pela EAP de Processos e reutilizável em
// qualquer outra aba que precise de uma árvore.

import { ChevronDown, ChevronRight } from 'lucide-react'
import { SortableList } from './SortableList'

export type HierarchyMeta = { numero: string; nivel: number }

export type HierarchyTreeProps<T> = {
  itens: T[]
  idDe: (t: T) => string
  parentDe: (t: T) => string | null
  ordemDe: (t: T) => number
  selecionadoId: string | null
  expandidos: Set<string>
  onToggle: (id: string) => void
  onSelecionar: (t: T) => void
  onReordenar: (parentId: string | null, idsNaOrdem: string[]) => void
  arrastar?: boolean
  numerar?: boolean
  // Nó "casa" com o filtro atual; ancestrais de um match também aparecem.
  filtroVisivel?: (t: T) => boolean
  cabecalho?: React.ReactNode
  renderConteudo: (t: T, meta: HierarchyMeta) => React.ReactNode
  renderRodapeMobile?: (t: T) => React.ReactNode
  renderAcoes?: (t: T) => React.ReactNode
  renderDetalhe?: (t: T) => React.ReactNode
  placeholderDetalhe?: string
}

export function HierarchyTree<T>(props: HierarchyTreeProps<T>) {
  const {
    itens, idDe, parentDe, ordemDe, selecionadoId, expandidos, onToggle, onSelecionar, onReordenar,
    arrastar = true, numerar = true, filtroVisivel, cabecalho, renderConteudo, renderRodapeMobile,
    renderAcoes, renderDetalhe, placeholderDetalhe = 'Selecione um item para ver os detalhes.',
  } = props

  const filhosDe = (pid: string | null) => itens.filter(t => (parentDe(t) ?? null) === pid).sort((a, b) => ordemDe(a) - ordemDe(b))
  const casa = (t: T): boolean => !filtroVisivel || filtroVisivel(t) || filhosDe(idDe(t)).some(casa)
  const selecionado = itens.find(t => idDe(t) === selecionadoId) || null

  function nivel(parentId: string | null, prefixo: string): React.ReactNode {
    let irmaos = filhosDe(parentId)
    if (filtroVisivel) irmaos = irmaos.filter(casa)
    if (irmaos.length === 0) return null
    const wraps = irmaos.map(t => ({ id: idDe(t), item: t }))
    return (
      <SortableList items={wraps} onReorder={n => onReordenar(parentId, n.map(w => w.id))} disabled={!arrastar}>
        {(w, i, drag) => {
          const t = w.item
          const id = w.id
          const numero = `${prefixo}${i + 1}`
          const nivelNum = prefixo ? prefixo.split('.').filter(Boolean).length : 0
          const temFilhos = filhosDe(id).length > 0
          const aberto = expandidos.has(id)
          const sel = selecionadoId === id
          return (
            <div ref={drag.setNodeRef} style={drag.style}>
              <div style={{
                borderBottom: '1px solid var(--border)',
                background: drag.isDragging ? 'var(--bg-card)' : sel ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined,
                boxShadow: drag.isDragging ? '0 6px 20px rgba(0,0,0,0.25)' : undefined,
                borderRadius: drag.isDragging ? 8 : undefined,
              }}>
                <div onClick={() => onSelecionar(t)} className="flex cursor-pointer items-center gap-2 px-2 py-2 transition-colors hover:bg-[var(--bg-secondary)]">
                  {drag.handle}
                  {temFilhos ? (
                    <button type="button" onClick={e => { e.stopPropagation(); onToggle(id) }} className="grid size-5 flex-shrink-0 place-items-center" style={{ color: 'var(--text-secondary)' }}>
                      {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  ) : <span className="w-5 flex-shrink-0" />}
                  {numerar && <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{numero}</span>}
                  <div className="min-w-0 flex-1">{renderConteudo(t, { numero, nivel: nivelNum })}</div>
                  {renderAcoes && <div className="flex-shrink-0">{renderAcoes(t)}</div>}
                </div>
                {renderRodapeMobile && <div className="sm:hidden">{renderRodapeMobile(t)}</div>}
              </div>

              {sel && renderDetalhe && <div className="lg:hidden">{renderDetalhe(t)}</div>}
              {aberto && temFilhos && (
                <div className="ml-5 border-l" style={{ borderColor: 'var(--border)' }}>
                  {nivel(id, `${numero}.`)}
                </div>
              )}
            </div>
          )
        }}
      </SortableList>
    )
  }

  const arvore = (
    <div className="card overflow-hidden">
      {cabecalho}
      {nivel(null, '')}
    </div>
  )

  if (!renderDetalhe) return arvore

  return (
    <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-4 lg:items-start">
      {arvore}
      <div className="hidden lg:block lg:sticky lg:top-4">
        {selecionado ? renderDetalhe(selecionado) : (
          <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{placeholderDetalhe}</div>
        )}
      </div>
    </div>
  )
}
