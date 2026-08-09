'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { PortalContextDTO } from '@/lib/portal/types'

type Item = PortalContextDTO['cronograma'][number]
const DAY = 86_400_000
function stamp(value: string | null) { return value ? new Date(`${value}T12:00:00`).getTime() : null }
function shortDate(value: string | null) { return value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T12:00:00`)) : 'Sem data' }

export function PortalGantt({ items }: { items: Item[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [today] = useState(() => {
    const value = new Date()
    value.setUTCHours(12, 0, 0, 0)
    return value.getTime()
  })
  const domain = useMemo(() => {
    const dates = items.flatMap(item => [stamp(item.inicio), stamp(item.fim), ...(item.filhos || []).flatMap(child => [stamp(child.inicio), stamp(child.fim)])]).filter((value): value is number => value !== null)
    return dates.length ? { start: Math.min(...dates, today), end: Math.max(...dates, today) } : { start: today - 7 * DAY, end: today + 30 * DAY }
  }, [items, today])
  const total = Math.max(DAY, domain.end - domain.start)
  const todayLeft = Math.min(100, Math.max(0, ((today - domain.start) / total) * 100))
  const rows = items.flatMap(item => [{ ...item, filhos: item.filhos || [], level: 0 }, ...(expanded.has(item.id) ? (item.filhos || []).map(child => ({ ...child, filhos: [], level: 1 })) : [])])
  const domainStart = new Date(domain.start).toISOString().slice(0, 10)
  const domainEnd = new Date(domain.end).toISOString().slice(0, 10)

  return <div className="card overflow-hidden">
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}><div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Linha do tempo</p><p className="mt-0.5 text-sm font-medium">{shortDate(domainStart)} a {shortDate(domainEnd)}</p></div><span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>Hoje</span></div>
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 z-10 w-px border-l border-dashed" style={{ left: `${todayLeft.toFixed(4)}%`, borderColor: 'var(--accent)' }} />
      {rows.map(row => {
        const start = stamp(row.inicio); const end = stamp(row.fim)
        const left = start === null ? 0 : ((start - domain.start) / total) * 100
        const width = start === null || end === null ? 0 : Math.max(2, ((end - start) / total) * 100)
        const canExpand = row.level === 0 && row.filhos.length > 0
        const open = canExpand && expanded.has(row.id)
        return <div key={`${row.level}-${row.id}`} className="border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'var(--border)', background: row.level ? 'var(--bg-secondary)' : undefined }}>
          <div className="flex min-w-0 items-start gap-2">{canExpand ? <button type="button" onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md" style={{ color: 'var(--text-secondary)' }} aria-label={open ? 'Recolher' : 'Expandir'}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button> : <span className="w-7 shrink-0" />}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className={`truncate text-sm ${row.level ? 'font-medium' : 'font-semibold'}`}>{row.nome}</p><span className="shrink-0 text-xs font-semibold" style={{ color: Number(row.percentual) >= 100 ? 'var(--success)' : 'var(--accent)' }}>{Number(row.percentual).toFixed(0)}%</span></div><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{shortDate(row.inicio)} → {shortDate(row.fim)}</p></div></div>
          <div className="relative mt-3 h-7 overflow-hidden rounded-md" style={{ background: 'color-mix(in srgb, var(--border) 55%, transparent)' }}>{start !== null && end !== null ? <div className="absolute inset-y-1 rounded-sm" style={{ left: `${left}%`, width: `${width}%`, background: row.level ? 'color-mix(in srgb, var(--accent) 68%, white)' : 'var(--accent)' }}><div className="h-full rounded-sm" style={{ width: `${Math.min(100, Number(row.percentual))}%`, background: 'color-mix(in srgb, var(--success) 72%, transparent)' }} /></div> : <span className="absolute inset-0 grid place-items-center text-[11px]" style={{ color: 'var(--text-secondary)' }}>Datas ainda não definidas</span>}</div>
        </div>
      })}
    </div>
  </div>
}
