'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { NCForm } from './NCForm'
import { NCList } from './NCList'
import type { NCData } from './NCForm'

const STATUS_COLOR: Record<string, string> = {
  aberto: '#e03131',
  em_andamento: '#f59e0b',
  resolvido: '#16a34a',
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: React.RefObject<any>
  projectId: string
  selectedElementId: string | null
}

export function NCPanel({ api, projectId: _projectId, selectedElementId }: Props) {
  const [refresh, setRefresh] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = api.current?.getSceneElements() ?? []
  const selectedEl = selectedElementId
    ? elements.find(e => e.id === selectedElementId) ?? null
    : null
  const existingNC: NCData | null = selectedEl?.customData?.nc ?? null

  function handleSave(data: NCData) {
    const a = api.current
    if (!a || !selectedElementId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els: any[] = a.getSceneElements()
    const updated = els.map(el =>
      el.id !== selectedElementId
        ? el
        : {
            ...el,
            customData: {
              ...el.customData,
              nc: { ...data, elementId: selectedElementId, updatedAt: Date.now() },
            },
            strokeColor: STATUS_COLOR[data.status] ?? '#e03131',
            strokeWidth: 3,
          }
    )
    a.updateScene({ elements: updated })
    setRefresh(r => r + 1)
  }

  function handleRemove() {
    const a = api.current
    if (!a || !selectedElementId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els: any[] = a.getSceneElements()
    const updated = els.map(el => {
      if (el.id !== selectedElementId) return el
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { nc: _nc, ...restCustomData } = el.customData ?? {}
      return { ...el, customData: restCustomData, strokeColor: '#1e1e2e', strokeWidth: 1 }
    })
    a.updateScene({ elements: updated })
    setRefresh(r => r + 1)
  }

  function handleScrollTo(elementId: string) {
    const a = api.current
    if (!a) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = (a.getSceneElements() as any[]).find(e => e.id === elementId)
    if (target) a.scrollToContent([target], { fitToViewport: false })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#dc2626" />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
            Não-Conformidades
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          {selectedEl
            ? existingNC
              ? 'Editar NC do elemento selecionado'
              : 'Marcar elemento selecionado como NC'
            : 'Selecione um elemento no canvas para marcar como NC'}
        </p>
      </div>

      {/* Form (só quando há elemento selecionado) */}
      {selectedEl && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <NCForm
            key={selectedElementId ?? 'none'}
            initialData={existingNC}
            onSave={handleSave}
            onRemove={existingNC ? handleRemove : undefined}
          />
        </div>
      )}

      {/* Lista de NCs */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <NCList
          api={api}
          refresh={refresh}
          selectedElementId={selectedElementId}
          onScrollTo={handleScrollTo}
        />
      </div>
    </div>
  )
}
