'use client'

import { useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Etapa, SubetapaCronograma } from '@/lib/types'
import { STATUS_ETAPA_LABEL } from '@/lib/utils'

// Mantido para retrocompatibilidade com qualquer código externo
export type SubetapaGantt = {
  id: string
  etapa_id: string | null
  nome: string
  codigo?: string | null
  quantidade?: number
  unidade?: string | null
  data_inicio?: string | null
  data_fim?: string | null
  percentual_executado?: number
}

type ZoomLevel = '3m' | '6m' | '12m'

type CronogramaGanttProps = {
  etapas: Etapa[]
  subetapas?: SubetapaCronograma[] | SubetapaGantt[]
  titulo?: string
  onEditSubetapa?: (sub: SubetapaGantt) => void
}

const STATUS_BAR_COLOR: Record<string, string> = {
  planejada:    '#3B7BF8',
  em_andamento: '#10B981',
  concluida:    '#6B7280',
  atrasada:     '#F59E0B',
}

function dayDiff(date: Date, start: Date) {
  return Math.ceil((date.getTime() - start.getTime()) / 86400000)
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

function shortDate(value: string | null | undefined) {
  if (!value) return ''
  return parseDate(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const ZOOM_LABELS: Record<ZoomLevel, string> = { '3m': '3 meses', '6m': '6 meses', '12m': '12 meses' }
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const ZOOM_SPAN:  Record<ZoomLevel, number>  = { '3m': 3, '6m': 6, '12m': 12 }

export function CronogramaGantt({
  etapas,
  subetapas = [],
  titulo = 'Gantt de etapas e subetapas',
  onEditSubetapa,
}: CronogramaGanttProps) {
  const [offsetMeses, setOffsetMeses] = useState(0)
  const [zoom, setZoom] = useState<ZoomLevel>('3m')

  const etapasComData = etapas.filter(e => e.data_inicio && e.data_fim)
  const hoje = new Date()
  const span = ZOOM_SPAN[zoom]
  const ganttStart = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses - 1, 1)
  const ganttEnd   = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses + span - 1, 0)
  const totalDias  = Math.max(1, dayDiff(ganttEnd, ganttStart) + 1)

  const meses = useMemo(() => {
    const result: { id: string; label: string; pctStart: number; pctWidth: number }[] = []
    let cursor = new Date(ganttStart.getFullYear(), ganttStart.getMonth(), 1)
    while (cursor <= ganttEnd) {
      const mesStart = Math.max(0, dayDiff(cursor, ganttStart))
      const mesEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const mesFim = Math.min(totalDias - 1, dayDiff(mesEnd, ganttStart))
      result.push({
        id: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: `${MONTH_NAMES[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`,
        pctStart: (mesStart / totalDias) * 100,
        pctWidth: ((mesFim - mesStart + 1) / totalDias) * 100,
      })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganttStart.getTime(), ganttEnd.getTime(), totalDias])

  const subPorEtapa = useMemo(() => {
    const map = new Map<string, (SubetapaCronograma | SubetapaGantt)[]>()
    for (const sub of subetapas) {
      if (!sub.etapa_id) continue
      const list = map.get(sub.etapa_id) ?? []
      list.push(sub)
      map.set(sub.etapa_id, list)
    }
    return map
  }, [subetapas])

  const hojePercent = (dayDiff(hoje, ganttStart) / totalDias) * 100

  if (etapasComData.length === 0) return (
    <div className="card p-8 flex flex-col items-center gap-2 text-center">
      <Calendar size={28} style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa com datas definidas</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Adicione data de início e término nas etapas para visualizar o Gantt.</p>
    </div>
  )

  return (
    <div className="card p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={16} style={{ color: 'var(--accent)' }} />
            {titulo}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Barra sólida = planejado · barra interna = % realizado
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoom */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {(['3m', '6m', '12m'] as ZoomLevel[]).map(z => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className="px-2.5 py-1 text-xs transition-colors"
                style={{
                  background: zoom === z ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: zoom === z ? 'white' : 'var(--text-secondary)',
                }}
              >
                {ZOOM_LABELS[z]}
              </button>
            ))}
          </div>

          {/* Navegar meses */}
          <div className="flex items-center gap-1">
            <button
              aria-label="Mês anterior"
              onClick={() => setOffsetMeses(o => o - ZOOM_SPAN[zoom])}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setOffsetMeses(0)}
              className="px-2 py-1 rounded-lg text-xs hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Hoje
            </button>
            <button
              aria-label="Próximo mês"
              onClick={() => setOffsetMeses(o => o + ZOOM_SPAN[zoom])}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
            {/* Cabeçalho de meses */}
            <div />
            <div className="relative h-7">
              {meses.map(mes => (
                <div
                  key={mes.id}
                  className="absolute top-0 text-xs font-medium text-center"
                  style={{ left: `${mes.pctStart}%`, width: `${mes.pctWidth}%`, color: 'var(--text-secondary)' }}
                >
                  {mes.label}
                </div>
              ))}
            </div>

            {/* Linhas de etapas */}
            {etapasComData.map(etapa => {
              const inicio   = parseDate(etapa.data_inicio!)
              const fim      = parseDate(etapa.data_fim!)
              const startDia = dayDiff(inicio, ganttStart)
              const endDia   = dayDiff(fim, ganttStart)
              const left     = Math.max(0, startDia) / totalDias * 100
              const width    = (Math.min(totalDias, endDia) - Math.max(0, startDia) + 1) / totalDias * 100
              const visW     = Math.max(0, Math.min(width, 100 - left))
              const prog     = etapa.percentual_executado ?? 0
              const subs     = subPorEtapa.get(etapa.id) ?? []

              return (
                <div key={etapa.id} className="contents">
                  {/* Nome da etapa */}
                  <div className="py-1.5 pr-3 self-start">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {shortDate(etapa.data_inicio)} – {shortDate(etapa.data_fim)}
                      {prog > 0 && <span style={{ color: 'var(--accent)' }}> · {prog}%</span>}
                    </p>
                  </div>

                  {/* Barra da etapa */}
                  <div className="relative py-1.5">
                    {/* Linhas verticais de mês */}
                    {meses.slice(1).map(mes => (
                      <div
                        key={`${etapa.id}-${mes.id}`}
                        className="absolute top-0 bottom-0"
                        style={{ left: `${mes.pctStart}%`, width: 1, background: 'var(--border)', opacity: 0.4 }}
                      />
                    ))}

                    {/* Linha "hoje" */}
                    {hojePercent >= 0 && hojePercent <= 100 && (
                      <div
                        className="absolute top-0 bottom-0 z-10"
                        style={{ left: `${hojePercent}%`, width: 2, background: 'var(--accent)', opacity: 0.7 }}
                      />
                    )}

                    {/* Fundo da trilha */}
                    <div className="relative h-8 rounded" style={{ background: 'var(--bg-secondary)' }}>
                      {/* Barra planejada */}
                      {visW > 0 && (
                        <div
                          className="absolute top-1 bottom-1 rounded overflow-hidden"
                          style={{ left: `${left}%`, width: `${visW}%`, background: STATUS_BAR_COLOR[etapa.status] || STATUS_BAR_COLOR.planejada, minWidth: 12 }}
                        >
                          {/* Barra realizado (overlay interno mais escuro) */}
                          {prog > 0 && (
                            <div
                              className="absolute top-0 left-0 bottom-0 rounded"
                              style={{ width: `${prog}%`, background: 'rgba(0,0,0,0.25)' }}
                            />
                          )}
                          <span className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                            <span className="text-white truncate text-[10px] sm:text-xs leading-none z-10">
                              {prog > 0 ? `${prog}% · ` : ''}{STATUS_ETAPA_LABEL[etapa.status]}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Barras de subetapas (nível 2) */}
                    {subs.length > 0 && visW > 0 && (
                      <div className="relative mt-1 h-5 rounded" style={{ background: 'var(--bg-secondary)' }}>
                        {subs.map((sub, idx) => {
                          const hasDate = !!(sub.data_inicio && sub.data_fim)
                          let subLeft: number, subWidth: number
                          if (hasDate) {
                            const sI = parseDate(sub.data_inicio!)
                            const sF = parseDate(sub.data_fim!)
                            const sStart = dayDiff(sI, ganttStart)
                            const sEnd   = dayDiff(sF, ganttStart)
                            const rLeft  = Math.max(0, sStart) / totalDias * 100
                            const rWidth = (Math.min(totalDias, sEnd) - Math.max(0, sStart) + 1) / totalDias * 100
                            subLeft  = Math.max(left, Math.min(rLeft, left + visW))
                            subWidth = Math.max(1.5, Math.min(rWidth, left + visW - subLeft))
                          } else {
                            subWidth = visW / subs.length
                            subLeft  = left + subWidth * idx
                          }

                          const subProg = (sub as SubetapaCronograma).percentual_executado ?? 0
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => onEditSubetapa?.(sub as SubetapaGantt)}
                              disabled={!onEditSubetapa}
                              className="absolute top-0.5 bottom-0.5 rounded overflow-hidden"
                              style={{
                                left: `${subLeft}%`,
                                width: `${Math.max(subWidth, 1.5)}%`,
                                background: hasDate ? 'rgba(59,123,248,0.3)' : 'rgba(255,255,255,0.15)',
                                border: `1px solid ${hasDate ? 'rgba(59,123,248,0.5)' : 'rgba(255,255,255,0.14)'}`,
                                cursor: onEditSubetapa ? 'pointer' : 'default',
                              }}
                              title={`${sub.nome}${hasDate ? ` · ${shortDate(sub.data_inicio)} – ${shortDate(sub.data_fim)}` : ''}${subProg > 0 ? ` · ${subProg}%` : ''}`}
                            >
                              {/* Realizado da subetapa */}
                              {subProg > 0 && (
                                <div
                                  className="absolute top-0 left-0 bottom-0"
                                  style={{ width: `${subProg}%`, background: 'rgba(59,123,248,0.45)' }}
                                />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {Object.entries(STATUS_BAR_COLOR).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{STATUS_ETAPA_LABEL[status] || status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(0,0,0,0.25)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Realizado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3" style={{ background: 'var(--accent)', opacity: 0.7 }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Hoje</span>
        </div>
      </div>
    </div>
  )
}
