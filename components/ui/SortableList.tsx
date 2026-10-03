'use client'

// Lista com arraste reutilizável — mesmo padrão do motor de orçamento
// (components/obra/ObraOrcamento.tsx): só a alça ⠿ dispara o arraste, o resto da
// linha segue clicável. Reordena dentro do mesmo nível (uma lista por nível).
//
// Mouse e toque têm sensores SEPARADOS de propósito:
// - mouse: arrasta depois de mover 4px;
// - toque: só depois de SEGURAR o dedo ~250ms parado. Antes disso o gesto é
//   rolagem normal da página.
// Não usar PointerSensor aqui: ele também aceita toque e iniciava o arraste na
// hora quando o dedo deslizava sobre a alça para rolar a tela.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type DragSlot = {
  handle: React.ReactNode
  setNodeRef: (el: HTMLElement | null) => void
  style: React.CSSProperties
  isDragging: boolean
}

export function DragHandle({ attributes, listeners, size = 14 }: { attributes: any; listeners: any; size?: number }) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={e => e.stopPropagation()}
      className={
        'flex flex-shrink-0 items-center justify-center rounded size-5 ' +
        '[@media(pointer:coarse)]:size-8 touch-manipulation cursor-grab ' +
        'active:cursor-grabbing hover:bg-[var(--bg-card)]'
      }
      style={{ color: 'var(--text-secondary)' }}
      title="Arrastar para reordenar"
      aria-label="Arrastar para reordenar"
    >
      <GripVertical size={size} />
    </button>
  )
}

export function SortableList<T extends { id: string }>({
  items, onReorder, disabled, children,
}: {
  items: T[]
  onReorder: (novaOrdem: T[]) => void
  disabled?: boolean
  children: (item: T, index: number, drag: DragSlot) => React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  if (disabled) {
    return <>{items.map((item, i) => children(item, i, { handle: null, setNodeRef: () => {}, style: {}, isDragging: false }))}</>
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(it => it.id === active.id)
    const newIndex = items.findIndex(it => it.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ container: typeof document !== 'undefined' ? document.body : undefined }}
    >
      <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => <SortableSlot key={item.id} id={item.id}>{drag => children(item, i, drag)}</SortableSlot>)}
      </SortableContext>
    </DndContext>
  )
}

function SortableSlot({ id, children }: { id: string; children: (drag: DragSlot) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 30 : undefined,
  }
  return <>{children({ handle: <DragHandle attributes={attributes} listeners={listeners} />, setNodeRef, style, isDragging })}</>
}
