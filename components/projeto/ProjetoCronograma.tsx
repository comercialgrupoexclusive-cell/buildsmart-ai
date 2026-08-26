'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CalendarDays, Check, ChevronDown, ChevronRight, Plus, Trash2, Pencil,
  ChevronsUpDown, Filter, MoreVertical, Link2,
} from 'lucide-react'
import type { ProjetoItemNode, ProjetoItemDependencia } from '@/components/projeto/ProjetoCascata'
import { ProjetoPredecessorPicker } from '@/components/projeto/ProjetoCascata'

interface Props {
  projetoId: string
  itens: ProjetoItemNode[]
  tree: ProjetoItemNode[]
  deps: ProjetoItemDependencia[]
  profiles: { id: string; name: string; apelido: string | null }[]
  canEdit: boolean
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, nome: string) => void
  onToggle: (id: string, concluido: boolean) => void
  onUpdateItem: (id: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo' | 'is_marco' | 'status' | 'duracao_dias'>> & { concluido?: boolean }) => void
  onSavePredecessoras: (itemId: string, predecessorIds: string[]) => void
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${String(y).slice(2)}`
}

function isAtrasado(data_prazo: string | null, concluido: boolean) {
  return !!(data_prazo && !concluido && new Date(data_prazo) < new Date())
}

function getItemStatus(item: ProjetoItemNode): 'pendente' | 'em_andamento' | 'atrasado' | 'concluido' {
  if (item.concluido) return 'concluido'
  if (isAtrasado(item.data_prazo, false)) return 'atrasado'
  if (item.data_inicio && new Date(item.data_inicio) <= new Date()) return 'em_andamento'
  return 'pendente'
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ProjetoCronograma({
  projetoId, itens, tree, deps, profiles, canEdit,
  onAdd, onDelete, onRename, onToggle, onUpdateItem, onSavePredecessoras,
}: Props) {
  const [subTab, setSubTab] = useState<'kanban' | 'gantt'>('gantt')
  const [predecessorTarget, setPredecessorTarget] = useState<ProjetoItemNode | null>(null)

  if (itens.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <p className="text-3xl mb-2">📋</p>
        <p className="font-medium text-sm">Estrutura vazia</p>
        <p className="text-xs mt-1 opacity-60">Adicione disciplinas na aba Estrutura para gerenciar o cronograma.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {([
          { key: 'gantt',  label: 'Cronograma' },
          { key: 'kanban', label: 'Kanban' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className="px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
            style={subTab === key
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'kanban' && (
        <KanbanView flat={itens} onToggle={onToggle} onMoveStatus={(item, target) => {
          const today = new Date().toISOString().slice(0, 10)
          if (target === 'concluido') onUpdateItem(item.id, { concluido: true })
          if (target === 'pendente') onUpdateItem(item.id, { concluido: false })
          if (target === 'em_andamento') onUpdateItem(item.id, { concluido: false, data_inicio: item.data_inicio ?? today })
        }} />
      )}
      {subTab === 'gantt' && (
        <GanttView
          flat={itens}
          tree={tree}
          deps={deps}
          profiles={profiles}
          canEdit={canEdit}
          onAdd={onAdd}
          onDelete={onDelete}
          onRename={onRename}
          onToggle={onToggle}
          onUpdateItem={onUpdateItem}
          onEditPredecessoras={setPredecessorTarget}
        />
      )}

      <ProjetoPredecessorPicker
        open={!!predecessorTarget}
        item={predecessorTarget}
        itens={tree}
        dependencias={deps}
        onClose={() => setPredecessorTarget(null)}
        onConfirmar={ids => {
          if (predecessorTarget) onSavePredecessoras(predecessorTarget.id, ids)
          setPredecessorTarget(null)
        }}
      />
    </div>
  )
}

// ─── Kanban ─────────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { key: 'pendente',     label: 'Pendente',     color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  { key: 'em_andamento', label: 'Em andamento', color: '#3B7BF8', bg: 'rgba(59,123,248,0.1)' },
  { key: 'atrasado',    label: 'Atrasado',     color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  { key: 'concluido',   label: 'Concluído',    color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
] as const

function KanbanView({ flat, onToggle, onMoveStatus }: {
  flat: ProjetoItemNode[]
  onToggle: (id: string, v: boolean) => void
  onMoveStatus: (item: ProjetoItemNode, target: 'pendente' | 'em_andamento' | 'concluido') => void
}) {
  const cards = flat.filter(i => i.nivel >= 2)
  const byStatus: Record<string, ProjetoItemNode[]> = { pendente: [], em_andamento: [], atrasado: [], concluido: [] }
  cards.forEach(i => byStatus[getItemStatus(i)].push(i))

  const disciNome: Record<string, string> = {}
  flat.filter(i => i.nivel === 1).forEach(d => disciNome[d.id] = d.nome)
  function getDisci(item: ProjetoItemNode): string {
    if (item.nivel === 2) return disciNome[item.parent_id ?? ''] ?? ''
    const pai = flat.find(i => i.id === item.parent_id)
    if (pai) return disciNome[pai.parent_id ?? ''] ?? ''
    return ''
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
      {KANBAN_COLS.map(col => (
        <div key={col.key} className="flex flex-col gap-2 min-h-[120px] min-w-[78vw] max-w-[78vw] snap-start sm:min-w-0 sm:max-w-none">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: col.bg }}>
            <span className="text-xs font-semibold" style={{ color: col.color }}>{col.label}</span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: col.color, color: '#fff' }}>
              {byStatus[col.key].length}
            </span>
          </div>
          {byStatus[col.key].map(item => {
            const atrasado = isAtrasado(item.data_prazo, item.concluido)
            return (
              <div key={item.id} className="card p-3 flex flex-col gap-2 hover:shadow-md transition-shadow" style={{ opacity: item.concluido ? 0.7 : 1 }}>
                {getDisci(item) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded w-fit" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
                    {getDisci(item)}
                  </span>
                )}
                <div className="flex items-start gap-2">
                  <button
                    className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                    style={item.concluido ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}
                    onClick={() => onToggle(item.id, !item.concluido)}
                  >
                    {item.concluido && <Check size={9} className="text-white" strokeWidth={3} />}
                  </button>
                  <span className="text-sm leading-snug flex-1" style={{ color: 'var(--text-primary)', textDecoration: item.concluido ? 'line-through' : 'none', opacity: item.concluido ? 0.6 : 1 }}>
                    {item.nome}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  {item.responsavel && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>👤 {item.responsavel}</span>}
                  {item.data_prazo && (
                    <span className="text-[10px] font-medium" style={{ color: atrasado ? '#EF4444' : '#10B981' }}>
                      {atrasado ? '⚠ ' : '📅 '}{fmtDate(item.data_prazo)}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                  {(['pendente', 'em_andamento', 'concluido'] as const)
                    .filter(s => s !== (item.concluido ? 'concluido' : isAtrasado(item.data_prazo, false) ? 'atrasado' : item.data_inicio && new Date(item.data_inicio) <= new Date() ? 'em_andamento' : 'pendente'))
                    .map(s => (
                      <button
                        key={s}
                        onClick={e => { e.stopPropagation(); onMoveStatus(item, s) }}
                        className="text-[11px] sm:text-[9px] px-2 py-1.5 sm:px-1.5 sm:py-0.5 rounded border transition-colors hover:opacity-80 flex-1 sm:flex-none text-center"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        → {s === 'pendente' ? 'Pendente' : s === 'em_andamento' ? 'Andamento' : 'Concluído'}
                      </button>
                    ))}
                </div>
              </div>
            )
          })}
          {byStatus[col.key].length === 0 && (
            <div className="flex-1 rounded-lg border-2 border-dashed flex items-center justify-center py-6" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>vazio</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Gantt ──────────────────────────────────────────────────────────────────

const ROW_H = 36
const HDR_H = 44
const LEFT_W = 420
const PAD_DAY = 7
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const GANTT_COLORS = ['#3B7BF8', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16', '#F97316']

const ZOOM_LEVELS = {
  dia:    { label: 'Dia',    pxPerDay: 36 },
  semana: { label: 'Semana', pxPerDay: 18 },
  mes:    { label: 'Mês',    pxPerDay: 6 },
} as const
type ZoomLevel = keyof typeof ZOOM_LEVELS

const STATUS_FILTER_OPTIONS = [
  { key: 'todos',        label: 'Todos' },
  { key: 'pendente',     label: 'Pendente' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'atrasado',     label: 'Atrasado' },
  { key: 'concluido',    label: 'Concluído' },
] as const

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }

/** Duração exibida: usa o campo persistido quando existir; senão deriva das
 * datas (compatibilidade com itens criados antes de duracao_dias existir). */
function effectiveDuracao(item: ProjetoItemNode): number | null {
  if (item.duracao_dias != null) return item.duracao_dias
  if (!item.data_inicio || !item.data_prazo) return null
  const d = daysBetween(new Date(item.data_inicio), new Date(item.data_prazo))
  return d >= 0 ? d : null
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r }

interface GanttRow { item: ProjetoItemNode; depth: number }
type EffDate = { inicio: string | null; fim: string | null }

function rollup(node: ProjetoItemNode, map: Map<string, EffDate>): EffDate {
  let res: EffDate
  if (!node.children || node.children.length === 0) {
    res = { inicio: node.data_inicio, fim: node.data_prazo }
  } else {
    const cs = node.children.map(c => rollup(c, map))
    const ins = cs.map(c => c.inicio).filter(Boolean) as string[]
    const fs  = cs.map(c => c.fim).filter(Boolean) as string[]
    res = {
      inicio: ins.length ? ins.reduce((a, b) => (a < b ? a : b)) : node.data_inicio,
      fim:    fs.length  ? fs.reduce((a, b) => (a > b ? a : b))  : node.data_prazo,
    }
  }
  map.set(node.id, res)
  return res
}

function GanttView({ flat, tree, deps, profiles, canEdit, onAdd, onDelete, onRename, onToggle, onUpdateItem, onEditPredecessoras }: {
  flat: ProjetoItemNode[]
  tree: ProjetoItemNode[]
  deps: ProjetoItemDependencia[]
  profiles: { id: string; name: string; apelido: string | null }[]
  canEdit: boolean
  onAdd: (parentId: string | null, nivel: number, nome: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, nome: string) => void
  onToggle: (id: string, concluido: boolean) => void
  onUpdateItem: (id: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo' | 'is_marco' | 'status' | 'duracao_dias'>> & { concluido?: boolean }) => void
  onEditPredecessoras: (item: ProjetoItemNode) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(flat.filter(i => flat.some(j => j.parent_id === i.id)).map(i => i.id))
  )
  const [zoom, setZoom] = useState<ZoomLevel>('semana')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameVal, setEditNameVal] = useState('')
  const [addingTo, setAddingTo] = useState<{ parentId: string | null; nivel: number } | null>(null)
  const [addName, setAddName] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const today = new Date()
  const PX_PER_DAY = ZOOM_LEVELS[zoom].pxPerDay

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (addingTo && addInputRef.current) addInputRef.current.focus()
  }, [addingTo])

  useEffect(() => {
    if (editingName && editInputRef.current) editInputRef.current.focus()
  }, [editingName])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const effMap = useMemo(() => {
    const m = new Map<string, EffDate>()
    tree.forEach(t => rollup(t, m))
    return m
  }, [tree])

  const rootEffs  = tree.map(t => effMap.get(t.id)!).filter(Boolean)
  const rInicios  = rootEffs.map(e => e.inicio).filter(Boolean) as string[]
  const rFims     = rootEffs.map(e => e.fim).filter(Boolean) as string[]
  const projInicio = rInicios.length ? rInicios.reduce((a, b) => (a < b ? a : b)) : null
  const projFim    = rFims.length    ? rFims.reduce((a, b) => (a > b ? a : b))    : null

  const nodeColorMap = useMemo(() => {
    const m = new Map<string, string>()
    tree.forEach((disc, idx) => {
      const color = GANTT_COLORS[idx % GANTT_COLORS.length]
      function assign(node: ProjetoItemNode) { m.set(node.id, color); node.children?.forEach(assign) }
      assign(disc)
    })
    return m
  }, [tree])

  const allStrs = flat.flatMap(i => [i.data_inicio, i.data_prazo].filter(Boolean) as string[])
  const dateDates = allStrs.length ? allStrs.map(s => new Date(s)) : [today]
  const minDate  = addDays(new Date(Math.min(...dateDates.map(d => d.getTime()))), -PAD_DAY)
  const maxDate  = addDays(new Date(Math.max(...dateDates.map(d => d.getTime()))), PAD_DAY)
  const totalDays = daysBetween(minDate, maxDate)
  const timelineW = Math.max(totalDays * PX_PER_DAY, 560)
  const leftW = isMobile ? 0 : LEFT_W

  function xOf(dateStr: string | null, fallback: Date): number {
    return daysBetween(minDate, dateStr ? new Date(dateStr) : fallback) * PX_PER_DAY
  }

  const todayX = daysBetween(minDate, today) * PX_PER_DAY

  function getVisibleRows(nodes: ProjetoItemNode[], depth = 0): GanttRow[] {
    const rows: GanttRow[] = []
    nodes.forEach(n => {
      // Status filter
      if (statusFilter !== 'todos') {
        const st = getItemStatus(n)
        const match = st === statusFilter ||
          (statusFilter === 'em_andamento' && st === 'em_andamento') ||
          n.children?.some(c => hasMatchingChild(c, statusFilter))
        if (!match && n.nivel >= 2) return
      }
      rows.push({ item: n, depth })
      const hasKids = (n.children?.length ?? 0) > 0
      if (hasKids && !collapsed.has(n.id)) rows.push(...getVisibleRows(n.children!, depth + 1))
    })
    return rows
  }

  function hasMatchingChild(node: ProjetoItemNode, filter: string): boolean {
    if (getItemStatus(node) === filter) return true
    return node.children?.some(c => hasMatchingChild(c, filter)) ?? false
  }

  type DRow = {
    id: string; nome: string; depth: number; inicio: string | null; fim: string | null
    concluido: boolean; hasKids: boolean; isProj: boolean; nivel: number; item?: ProjetoItemNode
  }

  const drows: DRow[] = [
    { id: '__proj__', nome: 'Projeto (total)', depth: 0, inicio: projInicio, fim: projFim, concluido: false, hasKids: false, isProj: true, nivel: 0 },
    ...getVisibleRows(tree).map(({ item, depth }) => {
      const hasKids = flat.some(j => j.parent_id === item.id)
      const eff = effMap.get(item.id)
      return {
        id: item.id, nome: item.nome, depth: depth + 1,
        inicio: hasKids ? (eff?.inicio ?? item.data_inicio) : item.data_inicio,
        fim: hasKids ? (eff?.fim ?? item.data_prazo) : item.data_prazo,
        concluido: item.concluido,
        hasKids, isProj: false, nivel: item.nivel, item,
      }
    }),
  ]

  const svgH = HDR_H + drows.length * ROW_H + 4

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function toggleExpandAll() {
    const allParents = flat.filter(i => flat.some(j => j.parent_id === i.id)).map(i => i.id)
    if (collapsed.size > 0) setCollapsed(new Set())
    else setCollapsed(new Set(allParents))
  }

  function startAdd(parentId: string | null, nivel: number) {
    setAddingTo({ parentId, nivel })
    setAddName('')
    if (parentId) {
      setCollapsed(prev => { const s = new Set(prev); s.delete(parentId); return s })
    }
  }

  function confirmAdd() {
    if (!addingTo || !addName.trim()) { setAddingTo(null); return }
    onAdd(addingTo.parentId, addingTo.nivel, addName.trim())
    setAddingTo(null)
    setAddName('')
  }

  function startRename(id: string, nome: string) {
    setEditingName(id)
    setEditNameVal(nome)
    setContextMenu(null)
  }

  function confirmRename() {
    if (!editingName || !editNameVal.trim()) { setEditingName(null); return }
    onRename(editingName, editNameVal.trim())
    setEditingName(null)
  }

  // Scroll to today on mount
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const frame = requestAnimationFrame(() => {
      const target = Math.max(0, todayX - el.clientWidth * 0.3)
      el.scrollLeft = target
    })
    return () => cancelAnimationFrame(frame)
  }, [todayX, timelineW])

  // Timeline headers based on zoom
  const timeHeaders = useMemo(() => {
    const headers: { label: string; x: number; w: number }[] = []
    if (zoom === 'dia') {
      for (let d = 0; d < totalDays; d++) {
        const dt = addDays(minDate, d)
        const x = d * PX_PER_DAY
        headers.push({ label: `${dt.getDate()}`, x, w: PX_PER_DAY })
      }
    } else if (zoom === 'semana') {
      let cursor = startOfWeek(minDate)
      while (cursor <= maxDate) {
        const nextW = addDays(cursor, 7)
        const x = Math.max(0, daysBetween(minDate, cursor) * PX_PER_DAY)
        const w = Math.min(timelineW - x, 7 * PX_PER_DAY)
        if (w > 0) {
          const d = cursor.getDate()
          const m = MONTH_NAMES[cursor.getMonth()]
          headers.push({ label: `${d} ${m}`, x, w })
        }
        cursor = nextW
      }
    } else {
      let cursor = startOfMonth(minDate)
      while (cursor <= maxDate) {
        const nextM = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        const x = Math.max(0, daysBetween(minDate, cursor) * PX_PER_DAY)
        const w = Math.min(timelineW - x, daysBetween(cursor, nextM) * PX_PER_DAY)
        if (w > 0) headers.push({ label: `${MONTH_NAMES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, x, w })
        cursor = nextM
      }
    }
    return headers
  }, [zoom, totalDays, minDate, maxDate, PX_PER_DAY, timelineW])

  // Month headers for top row (always show months above week/day headers)
  const monthHeaders = useMemo(() => {
    if (zoom === 'mes') return []
    const headers: { label: string; x: number; w: number }[] = []
    let cursor = startOfMonth(minDate)
    while (cursor <= maxDate) {
      const nextM = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const x = Math.max(0, daysBetween(minDate, cursor) * PX_PER_DAY)
      const w = Math.min(timelineW - x, daysBetween(cursor, nextM) * PX_PER_DAY)
      if (w > 0) headers.push({ label: `${MONTH_NAMES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, x, w })
      cursor = nextM
    }
    return headers
  }, [zoom, minDate, maxDate, PX_PER_DAY, timelineW])

  const hasMonthRow = zoom !== 'mes'
  const headerTotalH = hasMonthRow ? HDR_H + 20 : HDR_H
  const svgTotal = headerTotalH + drows.length * ROW_H + 4

  if (allStrs.length === 0) {
    return (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <Toolbar zoom={zoom} setZoom={setZoom} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          onToggleExpand={toggleExpandAll} collapsed={collapsed} canEdit={canEdit} onAddDisc={() => startAdd(null, 1)} />
        <div className="text-center py-16" style={{ color: 'var(--text-secondary)' }}>
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm font-medium">Nenhum período definido</p>
          <p className="text-xs mt-1 opacity-60">Defina início e fim nos itens; o gráfico calcula o resto.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <Toolbar zoom={zoom} setZoom={setZoom} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        onToggleExpand={toggleExpandAll} collapsed={collapsed} canEdit={canEdit} onAddDisc={() => startAdd(null, 1)} />

      {/* Mobile */}
      <div className="sm:hidden">
        <div className="border-b" style={{ borderColor: 'var(--border)' }}>
          {drows.map(({ id, nome, depth, inicio, fim, concluido, hasKids, isProj, nivel, item }) => {
            const isCollapsed = collapsed.has(id)
            const atrasado = !!(fim && !concluido && new Date(fim) < today)
            return (
              <div key={id} className="border-b px-3 py-2" style={{
                borderColor: 'var(--border)',
                paddingLeft: 12 + Math.min(depth, 2) * 12,
                background: isProj ? 'rgba(59,123,248,0.08)' : nivel === 1 ? 'rgba(59,123,248,0.035)' : 'transparent',
              }}>
                <div className="flex min-w-0 items-center gap-2">
                  {hasKids ? (
                    <button type="button" onClick={() => toggleCollapse(id)}
                      className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : !isProj && (
                    <button className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                      style={concluido ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}
                      onClick={() => !isProj && onToggle(id, !concluido)}>
                      {concluido && <Check size={9} className="text-white" strokeWidth={3} />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm leading-5" style={{
                      color: isProj || nivel === 1 ? 'var(--accent)' : 'var(--text-primary)',
                      fontWeight: isProj || nivel === 1 ? 600 : 400,
                      opacity: concluido ? 0.55 : 1,
                      textDecoration: concluido ? 'line-through' : 'none',
                    }}>{nome}</span>
                    {(inicio || fim) && (
                      <p className="text-[10px]" style={{ color: atrasado ? '#EF4444' : 'var(--text-secondary)' }}>
                        {fmtDate(inicio)}{fim ? ` → ${fmtDate(fim)}` : ''}
                      </p>
                    )}
                  </div>
                  {!isProj && canEdit && (
                    <button onClick={e => { e.stopPropagation(); setContextMenu({ id, x: e.clientX, y: e.clientY }) }}
                      className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
                      <MoreVertical size={14} />
                    </button>
                  )}
                  {atrasado && <span className="text-[9px] px-1 rounded" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>Atrasado</span>}
                </div>
                {/* Inline date edit for non-parent items */}
                {!isProj && !hasKids && item && canEdit && (
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 pl-6">
                    <input type="date" value={item.data_inicio ?? ''} className="text-[10px] rounded border px-1 py-0.5"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      onChange={e => {
                        const newInicio = e.target.value || null
                        const patch: Parameters<typeof onUpdateItem>[1] = { data_inicio: newInicio }
                        if (newInicio && !item.is_marco && item.duracao_dias != null) {
                          patch.data_prazo = addDays(new Date(newInicio), item.duracao_dias).toISOString().slice(0, 10)
                        }
                        onUpdateItem(id, patch)
                      }} />
                    <input type="number" min={0} placeholder={item.is_marco ? '—' : 'Dur'} disabled={item.is_marco}
                      value={item.is_marco ? '' : effectiveDuracao(item) ?? ''}
                      className="text-[10px] rounded border px-1 py-0.5 text-center disabled:opacity-40"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      onChange={e => {
                        const dur = parseInt(e.target.value)
                        if (isNaN(dur) || dur < 0) return
                        const patch: Parameters<typeof onUpdateItem>[1] = { duracao_dias: dur }
                        if (item.data_inicio) patch.data_prazo = addDays(new Date(item.data_inicio), dur).toISOString().slice(0, 10)
                        onUpdateItem(id, patch)
                      }} />
                    <input type="date" value={item.data_prazo ?? ''} className="text-[10px] rounded border px-1 py-0.5"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      onChange={e => {
                        const newFim = e.target.value || null
                        const patch: Parameters<typeof onUpdateItem>[1] = { data_prazo: newFim }
                        if (item.data_inicio && newFim) {
                          const d = daysBetween(new Date(item.data_inicio), new Date(newFim))
                          if (d >= 0) patch.duracao_dias = d
                        }
                        onUpdateItem(id, patch)
                      }} />
                  </div>
                )}
              </div>
            )
          })}
          {canEdit && (
            <div className="px-3 py-2">
              {addingTo ? (
                <div className="flex gap-1">
                  <input ref={addInputRef} value={addName} onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') setAddingTo(null) }}
                    placeholder="Nome..." className="flex-1 text-sm px-2 py-1 rounded border"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  <button onClick={confirmAdd} className="px-2 py-1 rounded text-xs text-white" style={{ background: 'var(--accent)' }}>OK</button>
                </div>
              ) : (
                <button onClick={() => startAdd(null, 1)} className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                  <Plus size={12} /> Nova disciplina
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile timeline */}
        <div ref={scrollRef} className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <svg width={timelineW} height={svgTotal} style={{ display: 'block' }}>
            {renderTimeline({ drows, timeHeaders, monthHeaders, headerTotalH, hasMonthRow, ROW_H, timelineW, svgTotal, todayX, nodeColorMap, xOf, today, deps, PX_PER_DAY })}
          </svg>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto sm:block" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex" style={{ width: leftW + timelineW, minWidth: leftW + timelineW }}>
          {/* Left panel — names + CRUD */}
          <div className="sticky left-0 z-20" style={{ width: leftW, minWidth: leftW, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            {/* Header */}
            <div className="flex items-end px-2 pb-1 text-[10px] font-semibold gap-1"
              style={{ height: headerTotalH, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
              <span className="flex-1">Item</span>
              <span style={{ width: 68 }}>Início</span>
              <span style={{ width: 30, textAlign: 'center' }}>Dur</span>
              <span style={{ width: 68 }}>Fim</span>
            </div>

            {drows.map(({ id, nome, depth, inicio, fim, concluido, hasKids, isProj, nivel, item }) => {
              const isCollapsedNode = collapsed.has(id)
              const atrasado = !!(fim && !concluido && new Date(fim) < today)
              const origItem = item
              const isEditing = editingName === id
              const dur = origItem ? effectiveDuracao(origItem) : null

              return (
                <div key={id} className="flex items-center border-b gap-0.5" style={{
                  height: ROW_H,
                  paddingLeft: 4 + Math.min(depth, 3) * 14,
                  paddingRight: 4,
                  borderColor: 'var(--border)',
                  background: isProj ? 'rgba(59,123,248,0.08)' : nivel === 1 ? 'rgba(59,123,248,0.03)' : 'transparent',
                }}>
                  {/* Expand / checkbox */}
                  {hasKids ? (
                    <button onClick={() => toggleCollapse(id)} className="w-4 h-4 flex items-center justify-center flex-shrink-0 rounded text-[10px]"
                      style={{ color: 'var(--text-secondary)' }}>
                      {isCollapsedNode ? '▶' : '▼'}
                    </button>
                  ) : !isProj ? (
                    <button className="w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0"
                      style={concluido ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)' }}
                      onClick={() => onToggle(id, !concluido)}>
                      {concluido && <Check size={8} className="text-white" strokeWidth={3} />}
                    </button>
                  ) : <span className="w-4 flex-shrink-0" />}

                  {/* Name */}
                  <div className="flex-1 min-w-0 px-1">
                    {isEditing ? (
                      <input ref={editInputRef} value={editNameVal} onChange={e => setEditNameVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingName(null) }}
                        onBlur={confirmRename}
                        className="w-full text-[11px] px-1 py-0.5 rounded border"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }} />
                    ) : (
                      <span className="text-[11px] truncate block cursor-default" title={nome}
                        onDoubleClick={() => canEdit && !isProj && startRename(id, nome)}
                        style={{
                          color: isProj || nivel === 1 ? 'var(--accent)' : 'var(--text-primary)',
                          fontWeight: isProj ? 700 : nivel === 1 ? 600 : 400,
                          opacity: concluido ? 0.5 : 1,
                          textDecoration: concluido ? 'line-through' : 'none',
                        }}>
                        {nome}
                      </span>
                    )}
                  </div>

                  {!isProj && canEdit && (
                    <button
                      className="flex-shrink-0 mr-0.5 rounded hover:bg-[var(--bg-secondary)] p-0.5"
                      title={deps.some(d => d.item_id === id) ? 'Editar predecessoras' : 'Adicionar predecessora'}
                      style={{ color: deps.some(d => d.item_id === id) ? 'var(--accent)' : 'var(--text-secondary)', opacity: deps.some(d => d.item_id === id) ? 0.8 : 0.3 }}
                      onClick={() => { const item = flat.find(i => i.id === id); if (item) onEditPredecessoras(item) }}>
                      <Link2 size={11} />
                    </button>
                  )}
                  {atrasado && <span className="text-[8px] flex-shrink-0 mr-0.5" style={{ color: '#EF4444' }}>⚠</span>}

                  {/* Date inputs */}
                  {!isProj && origItem && canEdit && !hasKids ? (
                    <>
                      <input type="date" value={origItem.data_inicio ?? ''} className="text-[10px] rounded border px-0.5 py-0"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 68, height: 22 }}
                        onChange={e => {
                          const newInicio = e.target.value || null
                          const patch: Parameters<typeof onUpdateItem>[1] = { data_inicio: newInicio }
                          if (newInicio && !origItem.is_marco && origItem.duracao_dias != null) {
                            patch.data_prazo = addDays(new Date(newInicio), origItem.duracao_dias).toISOString().slice(0, 10)
                          }
                          onUpdateItem(id, patch)
                        }} />
                      <input type="number" min={0} value={origItem.is_marco ? '' : dur ?? ''} placeholder={origItem.is_marco ? '—' : undefined}
                        disabled={origItem.is_marco}
                        className="text-[10px] rounded border px-0.5 py-0 text-center disabled:opacity-40"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 30, height: 22 }}
                        onChange={e => {
                          const d = parseInt(e.target.value)
                          if (isNaN(d) || d < 0) return
                          const patch: Parameters<typeof onUpdateItem>[1] = { duracao_dias: d }
                          if (origItem.data_inicio) patch.data_prazo = addDays(new Date(origItem.data_inicio), d).toISOString().slice(0, 10)
                          onUpdateItem(id, patch)
                        }} />
                      <input type="date" value={origItem.data_prazo ?? ''} className="text-[10px] rounded border px-0.5 py-0"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 68, height: 22 }}
                        onChange={e => {
                          const newFim = e.target.value || null
                          const patch: Parameters<typeof onUpdateItem>[1] = { data_prazo: newFim }
                          if (origItem.data_inicio && newFim) {
                            const dd = daysBetween(new Date(origItem.data_inicio), new Date(newFim))
                            if (dd >= 0) patch.duracao_dias = dd
                          }
                          onUpdateItem(id, patch)
                        }} />
                    </>
                  ) : (
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-secondary)', width: 166, textAlign: 'center' }}>
                      {inicio || fim ? `${fmtDate(inicio)} → ${fmtDate(fim)}` : ''}
                    </span>
                  )}

                  {/* Context menu trigger */}
                  {!isProj && canEdit && (
                    <button onClick={e => { e.stopPropagation(); setContextMenu({ id, x: e.clientX, y: e.clientY }) }}
                      className="w-5 h-5 flex items-center justify-center rounded opacity-40 hover:opacity-100 flex-shrink-0"
                      style={{ color: 'var(--text-secondary)' }}>
                      <MoreVertical size={12} />
                    </button>
                  )}
                </div>
              )
            })}

            {/* Add discipline button */}
            {canEdit && (
              <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
                {addingTo && addingTo.parentId === null ? (
                  <div className="flex gap-1">
                    <input ref={addInputRef} value={addName} onChange={e => setAddName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') setAddingTo(null) }}
                      placeholder="Nome da disciplina..." className="flex-1 text-[11px] px-2 py-1 rounded border"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                    <button onClick={confirmAdd} className="px-2 py-1 rounded text-[10px] text-white" style={{ background: 'var(--accent)' }}>OK</button>
                  </div>
                ) : (
                  <button onClick={() => startAdd(null, 1)} className="text-[11px] flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    <Plus size={11} /> Nova disciplina
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right panel — SVG timeline */}
          <div ref={scrollRef} style={{ width: timelineW, minWidth: timelineW, flexShrink: 0, overflow: 'auto' }}>
            <svg width={timelineW} height={svgTotal} style={{ display: 'block' }}>
              {renderTimeline({ drows, timeHeaders, monthHeaders, headerTotalH, hasMonthRow, ROW_H, timelineW, svgTotal: svgTotal, todayX, nodeColorMap, xOf, today, deps, PX_PER_DAY })}
            </svg>
          </div>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 rounded-lg border shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y, background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          onClick={e => e.stopPropagation()}>
          {(() => {
            const item = flat.find(i => i.id === contextMenu.id)
            if (!item) return null
            const nivelLabel = item.nivel === 1 ? 'Item' : item.nivel === 2 ? 'Subitem' : null
            return (
              <>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => startRename(item.id, item.nome)}>
                  <Pencil size={12} /> Renomear
                </button>
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => { setContextMenu(null); onEditPredecessoras(item) }}>
                  <Link2 size={12} /> Predecessoras
                </button>
                {nivelLabel && (
                  <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => { setContextMenu(null); startAdd(item.id, item.nivel + 1) }}>
                    <Plus size={12} /> Adicionar {nivelLabel}
                  </button>
                )}
                <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-secondary)] flex items-center gap-2"
                  style={{ color: '#EF4444' }}
                  onClick={() => { setContextMenu(null); onDelete(item.id) }}>
                  <Trash2 size={12} /> Excluir
                </button>
              </>
            )
          })()}
        </div>
      )}

    </div>
  )
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

function Toolbar({ zoom, setZoom, statusFilter, setStatusFilter, onToggleExpand, collapsed, canEdit, onAddDisc }: {
  zoom: ZoomLevel; setZoom: (z: ZoomLevel) => void
  statusFilter: string; setStatusFilter: (f: string) => void
  onToggleExpand: () => void; collapsed: Set<string>
  canEdit: boolean; onAddDisc: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      {/* Zoom */}
      <div className="flex items-center gap-0.5 rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
        {(Object.keys(ZOOM_LEVELS) as ZoomLevel[]).map(z => (
          <button key={z} onClick={() => setZoom(z)}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={zoom === z ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
            {ZOOM_LEVELS[z].label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-0.5 rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
        {STATUS_FILTER_OPTIONS.map(o => (
          <button key={o.key} onClick={() => setStatusFilter(o.key)}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={statusFilter === o.key ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Expand/collapse */}
      <button onClick={onToggleExpand}
        className="flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <ChevronsUpDown size={12} />
        {collapsed.size > 0 ? 'Expandir' : 'Recolher'}
      </button>

      <div className="flex-1" />

      {canEdit && (
        <button onClick={onAddDisc}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium text-white"
          style={{ background: 'var(--accent)' }}>
          <Plus size={12} /> Disciplina
        </button>
      )}
    </div>
  )
}

// ─── Shared SVG rendering ───────────────────────────────────────────────────

function renderTimeline({ drows, timeHeaders, monthHeaders, headerTotalH, hasMonthRow, ROW_H: rowH, timelineW, svgTotal, todayX, nodeColorMap, xOf, today, deps, PX_PER_DAY }: {
  drows: { id: string; nome: string; depth: number; inicio: string | null; fim: string | null; concluido: boolean; hasKids: boolean; isProj: boolean; nivel: number }[]
  timeHeaders: { label: string; x: number; w: number }[]
  monthHeaders: { label: string; x: number; w: number }[]
  headerTotalH: number; hasMonthRow: boolean; ROW_H: number; timelineW: number; svgTotal: number
  todayX: number; nodeColorMap: Map<string, string>
  xOf: (d: string | null, f: Date) => number; today: Date
  deps: ProjetoItemDependencia[]; PX_PER_DAY: number
}) {
  const addDaysLocal = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

  return (
    <>
      {/* Row backgrounds */}
      {drows.map(({ id, isProj, nivel }, idx) => (
        <rect key={id} x={0} y={headerTotalH + idx * rowH} width={timelineW} height={rowH}
          fill={isProj ? 'rgba(59,123,248,0.06)' : nivel === 1 ? 'rgba(59,123,248,0.03)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'} />
      ))}

      {/* Month headers (top row for week/day zoom) */}
      {hasMonthRow && monthHeaders.map((m, i) => (
        <g key={`m-${i}`}>
          <rect x={m.x} y={0} width={m.w} height={20} fill={i % 2 === 0 ? 'rgba(59,123,248,0.04)' : 'transparent'} />
          <text x={m.x + m.w / 2} y={14} textAnchor="middle" fontSize={9} fill="var(--text-secondary)" fontFamily="var(--font-sans)">{m.label}</text>
          <line x1={m.x} y1={0} x2={m.x} y2={20} stroke="var(--border)" strokeWidth={0.5} />
        </g>
      ))}

      {/* Time headers */}
      {timeHeaders.map((h, i) => (
        <g key={`t-${i}`}>
          <rect x={h.x} y={hasMonthRow ? 20 : 0} width={h.w} height={hasMonthRow ? headerTotalH - 20 : headerTotalH}
            fill={i % 2 === 0 ? 'rgba(59,123,248,0.03)' : 'transparent'} />
          <text x={h.x + h.w / 2} y={(hasMonthRow ? 20 : 0) + (hasMonthRow ? headerTotalH - 20 : headerTotalH) / 2 + 4}
            textAnchor="middle" fontSize={PX_PER_DAY >= 30 ? 9 : 8} fill="var(--text-secondary)" fontFamily="var(--font-sans)">{h.label}</text>
          <line x1={h.x} y1={hasMonthRow ? 20 : 0} x2={h.x} y2={svgTotal} stroke="var(--border)" strokeWidth={0.3} />
        </g>
      ))}

      {/* Header separator */}
      <line x1={0} y1={headerTotalH} x2={timelineW} y2={headerTotalH} stroke="var(--border)" strokeWidth={1} />

      {/* Today line */}
      {todayX >= 0 && todayX <= timelineW && (
        <g>
          <line x1={todayX} y1={headerTotalH} x2={todayX} y2={svgTotal} stroke="#3B7BF8" strokeWidth={1.5} strokeDasharray="4 3" />
          <rect x={todayX - 16} y={headerTotalH - 16} width={32} height={14} rx={3} fill="#3B7BF8" />
          <text x={todayX} y={headerTotalH - 6} textAnchor="middle" fontSize={8} fill="white" fontFamily="var(--font-sans)">hoje</text>
        </g>
      )}

      {/* Dependency arrows */}
      {(() => {
        const idxById = new Map(drows.map((r, i) => [r.id, i]))
        const geom = (rid: string) => {
          const i = idxById.get(rid)
          if (i == null) return null
          const r = drows[i]
          if (!r.inicio && !r.fim) return null
          const x1 = xOf(r.inicio, r.fim ? addDaysLocal(new Date(r.fim), -1) : today)
          const x2 = xOf(r.fim, r.inicio ? addDaysLocal(new Date(r.inicio), 1) : today)
          return { x1, x2, cy: headerTotalH + i * rowH + rowH / 2 }
        }
        return deps.map(d => {
          const p = geom(d.predecessor_id)
          const s = geom(d.item_id)
          if (!p || !s) return null
          const midX = p.x2 + 8
          const path = `M ${p.x2} ${p.cy} H ${midX} V ${s.cy} H ${s.x1}`
          return (
            <g key={d.id} opacity={0.5}>
              <path d={path} fill="none" stroke="var(--text-secondary)" strokeWidth={1.2} />
              <path d={`M ${s.x1 - 5} ${s.cy - 2.5} L ${s.x1} ${s.cy} L ${s.x1 - 5} ${s.cy + 2.5} Z`} fill="var(--text-secondary)" />
            </g>
          )
        })
      })()}

      {/* Bars */}
      {drows.map(({ id, nome, inicio, fim, concluido, isProj, nivel }, idx) => {
        const y    = headerTotalH + idx * rowH
        const barH = rowH - 12
        const barY = y + 6
        if (!inicio && !fim) return null
        const x1   = xOf(inicio, fim ? addDaysLocal(new Date(fim), -1) : today)
        const x2   = xOf(fim, inicio ? addDaysLocal(new Date(inicio), 1) : today)
        const barW = Math.max(x2 - x1, 6)
        const atrasado = !!(fim && !concluido && new Date(fim) < today)
        const baseColor = isProj ? '#1D4ED8' : (nodeColorMap.get(id) ?? '#3B7BF8')
        const color = concluido ? '#10B981' : atrasado ? '#EF4444' : baseColor
        const opacity = isProj ? 0.9 : nivel === 1 ? 0.3 : concluido ? 0.6 : nivel === 2 ? 0.7 : 0.9

        return (
          <g key={id} opacity={opacity}>
            <rect x={x1} y={barY} width={barW} height={barH} rx={isProj ? 3 : nivel === 1 ? 2 : barH / 2} fill={color} />
            {isProj && barW > 90 && (
              <text x={x1 + barW / 2} y={barY + barH / 2 + 3} textAnchor="middle" fontSize={8} fill="white" fontFamily="var(--font-sans)">
                {fmtDate(inicio)} → {fmtDate(fim)}
              </text>
            )}
            {!isProj && barW >= 50 && (
              <text x={x1 + 6} y={barY + barH / 2 + 3} fontSize={8} fill="white" fontFamily="var(--font-sans)" style={{ pointerEvents: 'none' }}>
                {nome.length > Math.floor(barW / 6) ? `${nome.slice(0, Math.floor(barW / 6) - 2)}…` : nome}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
}
