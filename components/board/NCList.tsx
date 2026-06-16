'use client'

import { useMemo } from 'react'
import { MapPin } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  resolvido: 'Resolvido',
}

const STATUS_COLOR: Record<string, string> = {
  aberto: '#e03131',
  em_andamento: '#f59e0b',
  resolvido: '#16a34a',
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: React.RefObject<any>
  refresh: number
  selectedElementId: string | null
  onScrollTo: (elementId: string) => void
}

export function NCList({ api, refresh, selectedElementId, onScrollTo }: Props) {
  const ncs = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els: any[] = api.current?.getSceneElements() ?? []
    return els
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((el: any) => el.customData?.nc)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((el: any) => ({ elementId: el.id, ...el.customData.nc }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  // refresh é a dependência real — o api ref não muda
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  if (ncs.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', paddingTop: 12 }}>
        Nenhuma NC registrada ainda
      </p>
    )
  }

  return (
    <div>
      <p style={{
        fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 10,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {ncs.length} {ncs.length === 1 ? 'NC' : 'NCs'} no canvas
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {ncs.map((nc: any) => {
          const color = STATUS_COLOR[nc.status] ?? '#e03131'
          const isSelected = nc.elementId === selectedElementId
          return (
            <div
              key={nc.elementId}
              onClick={() => onScrollTo(nc.elementId)}
              style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${isSelected ? color : 'var(--border)'}`,
                background: isSelected ? `${color}12` : 'var(--bg)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--fg)',
                  flex: 1, wordBreak: 'break-word',
                }}>
                  {nc.titulo}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                  background: `${color}22`, color, flexShrink: 0, marginTop: 1,
                }}>
                  {STATUS_LABEL[nc.status] ?? nc.status}
                </span>
              </div>

              {(nc.responsavel || nc.dataPrazo) && (
                <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>
                  {nc.responsavel && `Resp: ${nc.responsavel}`}
                  {nc.responsavel && nc.dataPrazo && ' · '}
                  {nc.dataPrazo && `Prazo: ${nc.dataPrazo}`}
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <MapPin size={11} color="var(--fg-muted)" />
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Clique para ir ao elemento</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
