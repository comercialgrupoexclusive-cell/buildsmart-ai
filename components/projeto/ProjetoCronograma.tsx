'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check } from 'lucide-react'

interface ItemRow {
  id: string
  projeto_id: string
  parent_id: string | null
  nome: string
  nivel: number
  concluido: boolean
  ordem: number
  responsavel: string | null
  data_inicio: string | null
  data_prazo: string | null
  children?: ItemRow[]
}

interface Props {
  projetoId: string
  profiles?: { id: string; name: string; apelido: string | null }[]
}

function buildTree(items: ItemRow[]): ItemRow[] {
  const map = new Map<string, ItemRow>()
  const roots: ItemRow[] = []
  items.forEach(i => map.set(i.id, { ...i, children: [] }))
  items.forEach(i => {
    const node = map.get(i.id)!
    if (i.parent_id && map.has(i.parent_id)) map.get(i.parent_id)!.children!.push(node)
    else roots.push(node)
  })
  return roots
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${String(y).slice(2)}`
}

function isAtrasado(data_prazo: string | null, concluido: boolean) {
  return !!(data_prazo && !concluido && new Date(data_prazo) < new Date())
}

function getKanbanStatus(item: ItemRow): 'pendente' | 'em_andamento' | 'atrasado' | 'concluido' {
  if (item.concluido) return 'concluido'
  if (isAtrasado(item.data_prazo, false)) return 'atrasado'
  if (item.data_inicio && new Date(item.data_inicio) <= new Date()) return 'em_andamento'
  return 'pendente'
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ProjetoCronograma({ projetoId, profiles = [] }: Props) {
  const supabase = createClient()
  const [flat, setFlat]     = useState<ItemRow[]>([])
  const [tree, setTree]     = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'kanban' | 'gantt'>('kanban')

  useEffect(() => { load() }, [projetoId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('projeto_itens')
      .select('id, projeto_id, parent_id, nome, nivel, concluido, ordem, responsavel, data_inicio, data_prazo')
      .eq('projeto_id', projetoId)
      .order('nivel').order('ordem')
    const items = (data ?? []) as ItemRow[]
    setFlat(items)
    setTree(buildTree(items))
    setLoading(false)
  }

  async function updateItem(id: string, fields: Partial<ItemRow>) {
    // Otimista: atualiza UI imediatamente
    setFlat(prev => {
      const upd = prev.map(i => i.id === id ? { ...i, ...fields } : i)
      setTree(buildTree(upd))
      return upd
    })
    const { error } = await supabase.from('projeto_itens').update(fields).eq('id', id)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  function toggleConcluido(id: string, concluido: boolean) {
    updateItem(id, { concluido })
  }

  function moveStatus(item: ItemRow, target: 'pendente' | 'em_andamento' | 'concluido') {
    const today = new Date().toISOString().slice(0, 10)
    if (target === 'concluido')    updateItem(item.id, { concluido: true })
    if (target === 'pendente')     updateItem(item.id, { concluido: false })
    if (target === 'em_andamento') updateItem(item.id, { concluido: false, data_inicio: item.data_inicio ?? today })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (flat.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <p className="text-3xl mb-2">📋</p>
        <p className="font-medium text-sm">Estrutura vazia</p>
        <p className="text-xs mt-1 opacity-60">Adicione disciplinas na aba Estrutura para gerenciar o cronograma.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {([
          { key: 'kanban', label: '🗂 Kanban' },
          { key: 'gantt',  label: '📊 Gantt' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            style={subTab === key
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'kanban' && (
        <KanbanView flat={flat} tree={tree} onToggle={toggleConcluido} onMoveStatus={moveStatus} />
      )}
      {subTab === 'gantt' && (
        <GanttView flat={flat} tree={tree} onUpdateItem={updateItem} />
      )}
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

function KanbanView({ flat, tree, onToggle, onMoveStatus }: {
  flat: ItemRow[]
  tree: ItemRow[]
  onToggle: (id: string, v: boolean) => void
  onMoveStatus: (item: ItemRow, target: 'pendente' | 'em_andamento' | 'concluido') => void
}) {
  // Apenas itens nivel 2 e 3 (não disciplinas)
  const cards = flat.filter(i => i.nivel >= 2)

  const byStatus: Record<string, ItemRow[]> = {
    pendente: [], em_andamento: [], atrasado: [], concluido: []
  }
  cards.forEach(i => byStatus[getKanbanStatus(i)].push(i))

  // Nome da disciplina pai
  const disciNome: Record<string, string> = {}
  flat.filter(i => i.nivel === 1).forEach(d => disciNome[d.id] = d.nome)
  function getDisci(item: ItemRow): string {
    if (item.nivel === 2) return disciNome[item.parent_id ?? ''] ?? ''
    // nivel 3 — encontra pai nivel 2, depois disciplina
    const pai = flat.find(i => i.id === item.parent_id)
    if (pai) return disciNome[pai.parent_id ?? ''] ?? ''
    return ''
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {KANBAN_COLS.map(col => (
        <div key={col.key} className="flex flex-col gap-2 min-h-[120px]">
          {/* Header da coluna */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: col.bg }}
          >
            <span className="text-xs font-semibold" style={{ color: col.color }}>{col.label}</span>
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: col.color, color: '#fff' }}
            >
              {byStatus[col.key].length}
            </span>
          </div>

          {/* Cards */}
          {byStatus[col.key].map(item => (
            <KanbanCard key={item.id} item={item} disciplina={getDisci(item)} onToggle={onToggle} onMoveStatus={onMoveStatus} />
          ))}

          {byStatus[col.key].length === 0 && (
            <div
              className="flex-1 rounded-lg border-2 border-dashed flex items-center justify-center py-6"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>vazio</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function KanbanCard({ item, disciplina, onToggle, onMoveStatus }: {
  item: ItemRow
  disciplina: string
  onToggle: (id: string, v: boolean) => void
  onMoveStatus: (item: ItemRow, target: 'pendente' | 'em_andamento' | 'concluido') => void
}) {
  const atrasado = isAtrasado(item.data_prazo, item.concluido)

  return (
    <div
      className="card p-3 flex flex-col gap-2 hover:shadow-md transition-shadow"
      style={{ opacity: item.concluido ? 0.7 : 1 }}
    >
      {/* Disciplina tag */}
      {disciplina && (
        <span className="text-[10px] px-1.5 py-0.5 rounded w-fit" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
          {disciplina}
        </span>
      )}

      {/* Nome + checkbox */}
      <div className="flex items-start gap-2">
        <button
          className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
          style={item.concluido
            ? { background: 'var(--accent)', borderColor: 'var(--accent)' }
            : { borderColor: 'var(--border)' }}
          onClick={() => onToggle(item.id, !item.concluido)}
        >
          {item.concluido && <Check size={9} className="text-white" strokeWidth={3} />}
        </button>
        <span
          className="text-sm leading-snug flex-1"
          style={{
            color: 'var(--text-primary)',
            textDecoration: item.concluido ? 'line-through' : 'none',
            opacity: item.concluido ? 0.6 : 1,
          }}
        >
          {item.nome}
        </span>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between gap-1 flex-wrap">
        {item.responsavel && (
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            👤 {item.responsavel}
          </span>
        )}
        {item.data_prazo && (
          <span
            className="text-[10px] font-medium"
            style={{ color: atrasado ? '#EF4444' : '#10B981' }}
          >
            {atrasado ? '⚠ ' : '📅 '}{fmtDate(item.data_prazo)}
          </span>
        )}
      </div>

      {/* Mover para outro status */}
      <div className="flex gap-1 flex-wrap border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
        {([
          { key: 'pendente',     label: 'Pendente'  },
          { key: 'em_andamento', label: 'Andamento' },
          { key: 'concluido',    label: 'Concluído' },
        ] as const).filter(s => s.key !== getKanbanStatus(item)).map(s => (
          <button
            key={s.key}
            onClick={e => { e.stopPropagation(); onMoveStatus(item, s.key) }}
            className="text-[9px] px-1.5 py-0.5 rounded border transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            → {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Gantt ──────────────────────────────────────────────────────────────────

const ROW_H   = 48
const HDR_H   = 48
const LEFT_W  = 220
const PAD_DAY = 12
const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const GANTT_COLORS = ['#3B7BF8', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16', '#F97316']

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

interface GanttRow { item: ItemRow; depth: number }
type EffDate = { inicio: string | null; fim: string | null }

/** menor início → maior fim dos filhos (folha = próprias datas) */
function rollup(node: ItemRow, map: Map<string, EffDate>): EffDate {
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

function GanttView({ flat, tree, onUpdateItem }: { flat: ItemRow[]; tree: ItemRow[]; onUpdateItem: (id: string, f: Partial<ItemRow>) => void }) {
  // Cascata inicia fechada: colapsa todo nó que tem filhos
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(flat.filter(i => flat.some(j => j.parent_id === i.id)).map(i => i.id))
  )

  const today = new Date()

  // Datas efetivas (rollup) de cada nó
  const effMap = new Map<string, EffDate>()
  tree.forEach(t => rollup(t, effMap))

  // Total do projeto = menor início e maior fim entre as disciplinas (raízes)
  const rootEffs  = tree.map(t => effMap.get(t.id)!).filter(Boolean)
  const rInicios  = rootEffs.map(e => e.inicio).filter(Boolean) as string[]
  const rFims     = rootEffs.map(e => e.fim).filter(Boolean) as string[]
  const projInicio = rInicios.length ? rInicios.reduce((a, b) => (a < b ? a : b)) : null
  const projFim    = rFims.length    ? rFims.reduce((a, b) => (a > b ? a : b))    : null

  // Mapa de cor por disciplina (e todos os seus descendentes)
  const nodeColorMap = new Map<string, string>()
  tree.forEach((disc, idx) => {
    const color = GANTT_COLORS[idx % GANTT_COLORS.length]
    function assignColor(node: ItemRow) {
      nodeColorMap.set(node.id, color)
      node.children?.forEach(assignColor)
    }
    assignColor(disc)
  })

  const allStrs = flat.flatMap(i => [i.data_inicio, i.data_prazo].filter(Boolean) as string[])

  if (allStrs.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <p className="text-2xl mb-2">📅</p>
        <p className="text-sm font-medium">Nenhum período definido</p>
        <p className="text-xs mt-1 opacity-60">Defina início e fim nos itens da aba Estrutura — o gráfico calcula o resto.</p>
      </div>
    )
  }

  const dateDates = allStrs.map(s => new Date(s))
  const minDate  = addDays(new Date(Math.min(...dateDates.map(d => d.getTime()))), -PAD_DAY)
  const maxDate  = addDays(new Date(Math.max(...dateDates.map(d => d.getTime()))), PAD_DAY)
  const totalDays = daysBetween(minDate, maxDate)
  const PX_PER_DAY = 18
  const timelineW = totalDays * PX_PER_DAY

  function xOf(dateStr: string | null, fallback: Date): number {
    return daysBetween(minDate, dateStr ? new Date(dateStr) : fallback) * PX_PER_DAY
  }

  const todayX = daysBetween(minDate, today) * PX_PER_DAY

  // Meses
  const months: { label: string; x: number; w: number }[] = []
  let cursor = startOfMonth(minDate)
  while (cursor <= maxDate) {
    const nextM = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    const x = Math.max(0, daysBetween(minDate, cursor) * PX_PER_DAY)
    const w = Math.min(timelineW - x, daysBetween(cursor, nextM) * PX_PER_DAY)
    if (w > 0) months.push({ label: `${MONTH_NAMES[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, x, w })
    cursor = nextM
  }

  function getVisibleRows(nodes: ItemRow[], depth = 0): GanttRow[] {
    const rows: GanttRow[] = []
    nodes.forEach(n => {
      rows.push({ item: n, depth })
      const hasKids = (n.children?.length ?? 0) > 0
      if (hasKids && !collapsed.has(n.id)) rows.push(...getVisibleRows(n.children!, depth + 1))
    })
    return rows
  }

  // Linha 0 = Projeto (total); demais = árvore visível, indentada +1
  type DRow = { id: string; nome: string; depth: number; inicio: string | null; fim: string | null; concluido: boolean; hasKids: boolean; isProj: boolean; nivel: number }
  const drows: DRow[] = [
    { id: '__proj__', nome: 'Projeto (total)', depth: 0, inicio: projInicio, fim: projFim, concluido: false, hasKids: false, isProj: true, nivel: 0 },
    ...getVisibleRows(tree).map(({ item, depth }) => ({
      id: item.id, nome: item.nome, depth: depth + 1,
      inicio: item.data_inicio, fim: item.data_prazo, concluido: item.concluido,
      hasKids: flat.some(j => j.parent_id === item.id), isProj: false, nivel: item.nivel,
    })),
  ]
  const svgH = HDR_H + drows.length * ROW_H + 4

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  }

  function canEditDates(_id: string, nivel: number): boolean {
    return nivel <= 2
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="flex" style={{ overflowX: 'auto' }}>
        {/* Painel esquerdo — nomes */}
        <div style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
          <div
            className="flex items-end px-3 pb-2 text-xs font-semibold"
            style={{ height: HDR_H, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}
          >
            Item
          </div>
          {drows.map(({ id, nome, depth, inicio, fim, concluido, hasKids, isProj, nivel }) => {
            const isCollapsed = collapsed.has(id)
            const atrasado = !!(fim && !concluido && new Date(fim) < today)
            const editable = !isProj && canEditDates(id, nivel)
            // Dados originais do item para inputs (não rollup)
            const origItem = flat.find(i => i.id === id)
            return (
              <div
                key={id}
                className="flex flex-col justify-center border-b"
                style={{
                  height: ROW_H,
                  paddingLeft: 8 + depth * 16,
                  paddingRight: 8,
                  borderColor: 'var(--border)',
                  background: isProj ? 'rgba(59,123,248,0.08)' : nivel === 1 ? 'rgba(59,123,248,0.04)' : 'transparent',
                }}
              >
                {/* Linha 1: expand + nome */}
                <div className="flex items-center gap-1">
                  {hasKids ? (
                    <button
                      onClick={() => toggleCollapse(id)}
                      className="text-[10px] w-4 h-4 flex items-center justify-center flex-shrink-0 rounded"
                      style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
                    >
                      {isCollapsed ? '▶' : '▼'}
                    </button>
                  ) : (
                    <span className="w-4 flex-shrink-0" />
                  )}
                  <span
                    className="text-xs truncate flex-1"
                    style={{
                      color: isProj || nivel === 1 ? 'var(--accent)' : 'var(--text-primary)',
                      fontWeight: isProj ? 700 : nivel === 1 ? 600 : 400,
                      opacity: concluido ? 0.5 : 1,
                      textDecoration: concluido ? 'line-through' : 'none',
                    }}
                    title={nome}
                  >
                    {nome}
                  </span>
                  {atrasado && <span className="text-[9px] flex-shrink-0" style={{ color: '#EF4444' }}>⚠</span>}
                </div>

                {/* Linha 2: datas */}
                <div className="flex items-center gap-1 pl-5">
                  {editable && origItem ? (
                    <>
                      <input
                        type="date"
                        value={origItem.data_inicio ?? ''}
                        className="text-[10px] rounded border px-1 py-0.5"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 78 }}
                        onChange={e => onUpdateItem(id, { data_inicio: e.target.value || null })}
                      />
                      <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>→</span>
                      <input
                        type="date"
                        value={origItem.data_prazo ?? ''}
                        className="text-[10px] rounded border px-1 py-0.5"
                        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 78 }}
                        onChange={e => onUpdateItem(id, { data_prazo: e.target.value || null })}
                      />
                    </>
                  ) : (inicio || fim) ? (
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      {fmtDate(inicio)}{fim ? ` → ${fmtDate(fim)}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {/* Painel direito — SVG timeline */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <svg width={timelineW} height={svgH} style={{ display: 'block' }}>
            {/* Fundo alternado */}
            {drows.map(({ id, isProj, nivel }, idx) => (
              <rect key={id}
                x={0} y={HDR_H + idx * ROW_H} width={timelineW} height={ROW_H}
                fill={isProj ? 'rgba(59,123,248,0.06)' : nivel === 1 ? 'rgba(59,123,248,0.04)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
              />
            ))}

            {/* Meses */}
            {months.map((m, i) => (
              <g key={i}>
                <rect x={m.x} y={0} width={m.w} height={HDR_H} fill={i % 2 === 0 ? 'rgba(59,123,248,0.04)' : 'transparent'} />
                <text x={m.x + m.w / 2} y={HDR_H / 2 + 5} textAnchor="middle" fontSize={10} fill="var(--text-secondary)" fontFamily="var(--font-sans)">{m.label}</text>
                <line x1={m.x} y1={0} x2={m.x} y2={svgH} stroke="var(--border)" strokeWidth={0.5} />
              </g>
            ))}

            {/* Separador header */}
            <line x1={0} y1={HDR_H} x2={timelineW} y2={HDR_H} stroke="var(--border)" strokeWidth={1} />

            {/* Hoje */}
            {todayX >= 0 && todayX <= timelineW && (
              <g>
                <line x1={todayX} y1={HDR_H} x2={todayX} y2={svgH} stroke="#3B7BF8" strokeWidth={1.5} strokeDasharray="4 3" />
                <rect x={todayX - 18} y={HDR_H - 18} width={36} height={15} rx={4} fill="#3B7BF8" />
                <text x={todayX} y={HDR_H - 7} textAnchor="middle" fontSize={8} fill="white" fontFamily="var(--font-sans)">hoje</text>
              </g>
            )}

            {/* Barras */}
            {drows.map(({ id, inicio, fim, concluido, isProj, nivel }, idx) => {
              const y    = HDR_H + idx * ROW_H
              const barH = ROW_H - 16
              const barY = y + 8
              if (!inicio && !fim) return null
              const x1   = xOf(inicio, fim ? addDays(new Date(fim), -1) : today)
              const x2   = xOf(fim, inicio ? addDays(new Date(inicio), 1) : today)
              const barW = Math.max(x2 - x1, 8)
              const atrasado = !!(fim && !concluido && new Date(fim) < today)
              const baseColor = isProj ? '#1D4ED8' : (nodeColorMap.get(id) ?? '#3B7BF8')
              const colorOpacity = nivel === 1 ? 1 : 0.65
              const color = concluido ? '#10B981' : atrasado ? '#EF4444' : baseColor

              return (
                <g key={id} opacity={concluido ? 0.6 : colorOpacity}>
                  <rect x={x1} y={barY} width={barW} height={barH} rx={isProj ? 3 : barH / 2} fill={color} />
                  {isProj && barW > 90 ? (
                    <text x={x1 + barW / 2} y={barY + barH / 2 + 3.5} textAnchor="middle" fontSize={9} fill="white" fontFamily="var(--font-sans)" style={{ pointerEvents: 'none' }}>
                      {fmtDate(inicio)} → {fmtDate(fim)}
                    </text>
                  ) : fim && (
                    <text x={x2 + 4} y={barY + barH / 2 + 3.5} fontSize={8}
                      fill={atrasado ? '#EF4444' : 'var(--text-secondary)'} fontFamily="var(--font-sans)">
                      {fmtDate(fim)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}
