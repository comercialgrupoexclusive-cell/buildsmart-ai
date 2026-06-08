'use client'

import { useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Etapa } from '@/lib/types'
import { STATUS_ETAPA_LABEL } from '@/lib/utils'

type SubetapaGantt = {
  id: string
  etapa_id: string | null
  nome: string
  codigo?: string | null
  quantidade?: number
  unidade?: string | null
}

type CronogramaGanttProps = {
  etapas: Etapa[]
  subetapas?: SubetapaGantt[]
  titulo?: string
}

const STATUS_BAR_COLOR: Record<string, string> = {
  planejada: '#3B7BF8',
  em_andamento: '#10B981',
  concluida: '#6B7280',
  atrasada: '#F59E0B',
}

const SUB_BAR_COLOR = 'rgba(255,255,255,0.22)'

function dayDiff(date: Date, start: Date) {
  return Math.ceil((date.getTime() - start.getTime()) / 86400000)
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

function shortDate(value: string | null) {
  if (!value) return ''
  return parseDate(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function CronogramaGantt({ etapas, subetapas = [], titulo = 'Gantt de etapas e subetapas' }: CronogramaGanttProps) {
  const [offsetMeses, setOffsetMeses] = useState(0)

  const etapasComData = etapas.filter(e => e.data_inicio && e.data_fim)
  const hoje = new Date()
  const ganttStart = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses - 1, 1)
  const ganttEnd = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses + 3, 0)
  const totalDias = Math.max(1, dayDiff(ganttEnd, ganttStart) + 1)

  const meses = useMemo(() => {
    const result: { id: string; label: string; pctStart: number; pctWidth: number }[] = []
    let cursor = new Date(ganttStart.getFullYear(), ganttStart.getMonth(), 1)

    while (cursor <= ganttEnd) {
      const mesStart = Math.max(0, dayDiff(cursor, ganttStart))
      const mesEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const mesFim = Math.min(totalDias - 1, dayDiff(mesEnd, ganttStart))
      result.push({
        id: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
        pctStart: (mesStart / totalDias) * 100,
        pctWidth: ((mesFim - mesStart + 1) / totalDias) * 100,
      })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }

    return result
  }, [ganttEnd, ganttStart, totalDias])

  const subPorEtapa = useMemo(() => {
    const map = new Map<string, SubetapaGantt[]>()
    for (const sub of subetapas) {
      if (!sub.etapa_id) continue
      const list = map.get(sub.etapa_id) || []
      list.push(sub)
      map.set(sub.etapa_id, list)
    }
    return map
  }, [subetapas])

  const hojePercent = (dayDiff(hoje, ganttStart) / totalDias) * 100

  if (etapasComData.length === 0) return null

  return (
    <div className="card p-5 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Calendar size={16} style={{ color: 'var(--accent)' }} />
            {titulo}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Subetapas vêm dos itens do orçamento e são distribuídas dentro do período da etapa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Mes anterior" onClick={() => setOffsetMeses(o => o - 1)} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors" style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setOffsetMeses(0)} className="px-2 py-1 rounded-lg text-xs transition-colors hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}>
            Hoje
          </button>
          <button aria-label="Proximo mes" onClick={() => setOffsetMeses(o => o + 1)} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors" style={{ color: 'var(--text-secondary)' }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
            <div />
            <div className="relative h-7">
              {meses.map(mes => (
                <div
                  key={mes.id}
                  className="absolute top-0 text-xs font-medium"
                  style={{ left: `${mes.pctStart}%`, width: `${mes.pctWidth}%`, color: 'var(--text-secondary)', textAlign: 'center' }}
                >
                  {mes.label}
                </div>
              ))}
            </div>

            {etapasComData.map(etapa => {
              const inicio = parseDate(etapa.data_inicio!)
              const fim = parseDate(etapa.data_fim!)
              const startDia = dayDiff(inicio, ganttStart)
              const endDia = dayDiff(fim, ganttStart)
              const left = Math.max(0, startDia) / totalDias * 100
              const width = (Math.min(totalDias, endDia) - Math.max(0, startDia) + 1) / totalDias * 100
              const visibleWidth = Math.max(0, Math.min(width, 100 - left))
              const subs = subPorEtapa.get(etapa.id) || []

              return (
                <div key={etapa.id} className="contents">
                  <div className="py-2 pr-3">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {shortDate(etapa.data_inicio)} - {shortDate(etapa.data_fim)}
                    </p>
                  </div>
                  <div className="relative py-2">
                    {meses.slice(1).map(mes => (
                      <div key={`${etapa.id}-${mes.id}`} className="absolute top-0 bottom-0" style={{ left: `${mes.pctStart}%`, width: 1, background: 'var(--border)', opacity: 0.55 }} />
                    ))}
                    {hojePercent >= 0 && hojePercent <= 100 && (
                      <div className="absolute top-0 bottom-0 z-10" style={{ left: `${hojePercent}%`, width: 2, background: 'var(--accent)', opacity: 0.75 }} />
                    )}
                    <div className="relative h-8 rounded" style={{ background: 'var(--bg-secondary)' }}>
                      {visibleWidth > 0 && (
                        <div
                          className="absolute top-1 bottom-1 rounded px-1.5 flex items-center overflow-hidden"
                          style={{ left: `${left}%`, width: `${visibleWidth}%`, background: STATUS_BAR_COLOR[etapa.status] || STATUS_BAR_COLOR.planejada, minWidth: 12 }}
                          title={`${etapa.nome} - ${STATUS_ETAPA_LABEL[etapa.status]}`}
                        >
                          <span className="text-white truncate text-[10px] sm:text-xs leading-none">{STATUS_ETAPA_LABEL[etapa.status]}</span>
                        </div>
                      )}
                    </div>
                    {subs.length > 0 && visibleWidth > 0 && (
                      <div className="relative mt-1 h-7 rounded" style={{ background: 'var(--bg-secondary)' }}>
                        {subs.map((sub, index) => {
                          const subWidth = visibleWidth / subs.length
                          const subLeft = left + subWidth * index
                          return (
                            <div
                              key={`${etapa.id}-${sub.id}-${index}`}
                              className="absolute top-1 bottom-1 rounded px-1.5 flex items-center"
                              style={{ left: `${subLeft}%`, width: `${Math.max(subWidth, 2)}%`, background: SUB_BAR_COLOR, border: '1px solid rgba(255,255,255,0.16)' }}
                              title={`${sub.codigo ? `${sub.codigo} - ` : ''}${sub.nome}`}
                            >
                              <span className="text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>
                                {sub.codigo ? `${sub.codigo} ` : ''}{sub.nome}
                              </span>
                            </div>
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

      <div className="flex gap-4 mt-4 flex-wrap">
        {Object.entries(STATUS_BAR_COLOR).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{STATUS_ETAPA_LABEL[status] || status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: SUB_BAR_COLOR, border: '1px solid rgba(255,255,255,0.16)' }} />
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Subetapa</span>
        </div>
      </div>
    </div>
  )
}
