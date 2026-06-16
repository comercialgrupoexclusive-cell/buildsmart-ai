'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MousePointer2, MessageSquare, Network, FileText,
  Link2, ZoomIn, ZoomOut, Trash2, Tag,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'sticky' | 'mindmap' | 'pdf' | 'connect'

interface BoardItemBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  tags: string[]
  assignedToName?: string
}

interface StickyItem extends BoardItemBase { type: 'sticky';   content: { text: string; color: string } }
interface MindmapItem extends BoardItemBase { type: 'mindmap'; content: { text: string; color: string } }
interface PdfItem extends BoardItemBase     { type: 'pdf';     content: { name: string; url: string } }
interface ConnectorItem extends BoardItemBase { type: 'connector'; content: { fromId: string; toId: string } }
type BoardItem = StickyItem | MindmapItem | PdfItem | ConnectorItem

// ─── Constants ────────────────────────────────────────────────────────────────

const STICKY_COLORS   = ['#FDE68A','#BBF7D0','#BFDBFE','#FCA5A5','#DDD6FE','#FED7AA','#E5E7EB']
const MINDMAP_COLORS  = ['#6366F1','#10B981','#3B82F6','#EF4444','#8B5CF6','#F59E0B','#64748B']

function uid() { return Math.random().toString(36).slice(2, 11) }
function parseTags(text: string)    { return [...new Set((text.match(/#\w+/g) ?? []).map(t => t.toLowerCase()))] }
function parseAssigned(text: string) { const m = text.match(/@(\w+)/); return m ? m[1] : undefined }
function rndColor(arr: string[])    { return arr[Math.floor(Math.random() * arr.length)] }

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectBoard({ projectId }: { projectId: string }) {
  const [items,       setItems]       = useState<BoardItem[]>([])
  const [boardId,     setBoardId]     = useState<string | null>(null)
  const [dbError,     setDbError]     = useState(false)
  const [pan,         setPan]         = useState({ x: 60, y: 60 })
  const [zoom,        setZoom]        = useState(1)
  const [tool,        setTool]        = useState<Tool>('select')
  const [activeId,    setActiveId]    = useState<string | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editText,    setEditText]    = useState('')
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [tagFilter,   setTagFilter]   = useState('')
  const [saving,      setSaving]      = useState(false)

  // Stable refs so mouse handlers don't go stale
  const panRef      = useRef(pan)
  const zoomRef     = useRef(zoom)
  const itemsRef    = useRef<BoardItem[]>(items)
  const boardIdRef  = useRef<string | null>(null)
  const dragging    = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const isPanning   = useRef(false)
  const panStart    = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  panRef.current   = pan
  zoomRef.current  = zoom
  itemsRef.current = items

  // ── Load / create board ────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        let { data: board, error } = await supabase
          .from('boards')
          .select('id')
          .eq('project_id', projectId)
          .maybeSingle()

        if (error) { setDbError(true); return }

        if (!board) {
          const { data: created, error: ce } = await supabase
            .from('boards')
            .insert({ project_id: projectId, name: 'Board' })
            .select('id')
            .single()
          if (ce) { setDbError(true); return }
          board = created
        }

        if (!board) return
        setBoardId(board.id)
        boardIdRef.current = board.id

        const { data: its } = await supabase
          .from('board_items')
          .select('*')
          .eq('board_id', board.id)

        if (its && its.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setItems(its.map((r: any) => ({
            id: r.id, type: r.type,
            x: r.x, y: r.y, width: r.width, height: r.height,
            tags: r.tags ?? [],
            assignedToName: r.assigned_to_name ?? undefined,
            content: r.content,
          })) as BoardItem[])
        }
      } catch {
        setDbError(true)
      }
    }
    load()
  }, [projectId])

  // ── Save ───────────────────────────────────────────────────────────────────

  function scheduleSave(its: BoardItem[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(its), 700)
  }

  async function persist(its: BoardItem[]) {
    const bid = boardIdRef.current
    if (!bid || its.length === 0) return
    setSaving(true)
    try {
      const supabase = createClient()
      await supabase.from('board_items').upsert(
        its.map(it => ({
          id: it.id, board_id: bid, type: it.type,
          x: it.x, y: it.y, width: it.width, height: it.height,
          content: it.content, tags: it.tags,
          assigned_to_name: it.assignedToName ?? null,
        })),
        { onConflict: 'id' },
      )
    } finally {
      setSaving(false)
    }
  }

  function commit(newItems: BoardItem[]) {
    setItems(newItems)
    scheduleSave(newItems)
  }

  // ── Canvas helpers ─────────────────────────────────────────────────────────

  function toCanvas(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top  - panRef.current.y) / zoomRef.current,
    }
  }

  // ── Wheel zoom ─────────────────────────────────────────────────────────────

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const factor  = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.max(0.15, Math.min(3, zoomRef.current * factor))
    const rect    = viewportRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const ratio = newZoom / zoomRef.current
    setPan(p => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }))
    setZoom(newZoom)
    zoomRef.current = newZoom
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // ── Mouse ──────────────────────────────────────────────────────────────────

  function onBgDown(e: React.MouseEvent) {
    // Only fires when clicking the viewport background, not items
    if (e.target !== viewportRef.current &&
        !(e.target as HTMLElement).dataset.bg) return

    if (tool !== 'select') {
      const pos = toCanvas(e.clientX, e.clientY)
      createItem(pos.x, pos.y)
      return
    }
    setActiveId(null)
    isPanning.current = true
    panStart.current = { mx: e.clientX, my: e.clientY, px: panRef.current.x, py: panRef.current.y }
  }

  function onBgMove(e: React.MouseEvent) {
    if (isPanning.current) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      })
      return
    }
    if (dragging.current) {
      const { id, sx, sy, ox, oy } = dragging.current
      const dx = (e.clientX - sx) / zoomRef.current
      const dy = (e.clientY - sy) / zoomRef.current
      setItems(prev => prev.map(it => it.id === id ? { ...it, x: ox + dx, y: oy + dy } : it))
    }
  }

  function onBgUp(e: React.MouseEvent) {
    if (dragging.current) {
      const { id, sx, sy, ox, oy } = dragging.current
      const dx = (e.clientX - sx) / zoomRef.current
      const dy = (e.clientY - sy) / zoomRef.current
      const next = itemsRef.current.map(it => it.id === id ? { ...it, x: ox + dx, y: oy + dy } : it)
      dragging.current = null
      commit(next)
    }
    isPanning.current = false
  }

  // ── Create items ───────────────────────────────────────────────────────────

  function createItem(x: number, y: number) {
    const id = uid()
    let newItem: BoardItem

    if (tool === 'sticky') {
      newItem = { id, type: 'sticky', x, y, width: 200, height: 180,
        content: { text: '', color: rndColor(STICKY_COLORS) }, tags: [] }
    } else if (tool === 'mindmap') {
      newItem = { id, type: 'mindmap', x, y, width: 160, height: 72,
        content: { text: '', color: rndColor(MINDMAP_COLORS) }, tags: [] }
    } else if (tool === 'pdf') {
      const url = window.prompt('Cole a URL do PDF:')
      if (!url?.trim()) return
      const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? 'Documento.pdf')
      newItem = { id, type: 'pdf', x, y, width: 220, height: 110,
        content: { name, url }, tags: [] }
    } else {
      return
    }

    const next = [...itemsRef.current, newItem]
    commit(next)
    setActiveId(id)
    if (tool === 'sticky' || tool === 'mindmap') {
      setEditingId(id)
      setEditText('')
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function deleteItem(id: string) {
    const bid = boardIdRef.current
    // IDs to remove: the item + any connectors referencing it
    const toRemove = new Set([id])
    itemsRef.current.forEach(it => {
      if (it.type === 'connector') {
        const c = it.content as { fromId: string; toId: string }
        if (c.fromId === id || c.toId === id) toRemove.add(it.id)
      }
    })
    const next = itemsRef.current.filter(it => !toRemove.has(it.id))
    setItems(next)
    setActiveId(null)
    if (bid) {
      const supabase = createClient()
      await supabase.from('board_items').delete().in('id', [...toRemove])
    }
    // Cancel pending save since we deleted manually
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (next.length > 0) scheduleSave(next)
  }

  // ── Connect ────────────────────────────────────────────────────────────────

  function handleConnectClick(id: string) {
    if (!connectFrom) { setConnectFrom(id); return }
    if (connectFrom === id) { setConnectFrom(null); return }
    const exists = itemsRef.current.some(it => {
      if (it.type !== 'connector') return false
      const c = it.content as { fromId: string; toId: string }
      return (c.fromId === connectFrom && c.toId === id) ||
             (c.fromId === id && c.toId === connectFrom)
    })
    if (!exists) {
      const conn: ConnectorItem = {
        id: uid(), type: 'connector', x: 0, y: 0, width: 0, height: 0,
        content: { fromId: connectFrom, toId: id }, tags: [],
      }
      commit([...itemsRef.current, conn])
    }
    setConnectFrom(null)
    setTool('select')
  }

  // ── Edit ───────────────────────────────────────────────────────────────────

  function finishEdit(id: string, text: string) {
    setEditingId(null)
    const tags    = parseTags(text)
    const assigned = parseAssigned(text)
    commit(itemsRef.current.map(it => {
      if (it.id !== id) return it
      if (it.type === 'sticky' || it.type === 'mindmap') {
        return { ...it, content: { ...it.content, text }, tags, assignedToName: assigned }
      }
      return it
    }))
  }

  // ── Connector positions ────────────────────────────────────────────────────

  function center(id: string) {
    const it = items.find(i => i.id === id)
    if (!it) return null
    return { x: it.x + it.width / 2, y: it.y + it.height / 2 }
  }

  // ── Zoom helpers ───────────────────────────────────────────────────────────

  function zoomBy(factor: number) {
    const nz = Math.max(0.15, Math.min(3, zoomRef.current * factor))
    const rect = viewportRef.current!.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const ratio = nz / zoomRef.current
    setPan(p => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }))
    setZoom(nz)
    zoomRef.current = nz
  }

  // ── DB error fallback ──────────────────────────────────────────────────────

  if (dbError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: 320, gap: 12, color: 'var(--text-secondary)',
      }}>
        <p style={{ fontSize: 14, margin: 0 }}>Tabelas do Board não encontradas no Supabase.</p>
        <p style={{ fontSize: 13, margin: 0 }}>Execute o SQL fornecido e recarregue a página.</p>
      </div>
    )
  }

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filterTag   = tagFilter.trim().toLowerCase()
  const visibleItems = items.filter(it => {
    if (it.type === 'connector') return true
    if (!filterTag) return true
    return it.tags.some(t => t.includes(filterTag))
  })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(680px, calc(100vh - 260px))', minHeight: 480 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', flexWrap: 'wrap',
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        borderRadius: '12px 12px 0 0',
      }}>
        {([
          { key: 'select',  Icon: MousePointer2, label: 'Selecionar' },
          { key: 'sticky',  Icon: MessageSquare,  label: 'Nota'       },
          { key: 'mindmap', Icon: Network,         label: 'Nó'         },
          { key: 'pdf',     Icon: FileText,        label: 'PDF'        },
          { key: 'connect', Icon: Link2,           label: 'Conectar'   },
        ] as const).map(({ key, Icon, label }) => (
          <button
            key={key}
            title={label}
            onClick={() => { setTool(key); setConnectFrom(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              background: tool === key ? 'var(--accent)' : 'var(--bg-secondary)',
              color:      tool === key ? 'white'         : 'var(--text-secondary)',
            }}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />

        <button onClick={() => zoomBy(1.2)}
          style={{ padding: '5px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          <ZoomIn size={14} />
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 34, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => zoomBy(1 / 1.2)}
          style={{ padding: '5px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          <ZoomOut size={14} />
        </button>

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 100 }}>
          <Tag size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            placeholder="filtrar #tag"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              fontSize: 12, color: 'var(--text-primary)', width: '100%',
            }}
          />
        </div>

        {saving && <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>Salvando…</span>}

        {activeId && (
          <button
            title="Excluir"
            onClick={() => deleteItem(activeId)}
            style={{ padding: '5px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#FEE2E2', color: '#DC2626', flexShrink: 0 }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* ── Viewport ────────────────────────────────────────────────────── */}
      <div
        ref={viewportRef}
        data-bg="1"
        style={{
          flex: 1, overflow: 'hidden', position: 'relative',
          cursor: isPanning.current ? 'grabbing' : tool === 'select' ? 'grab' : 'crosshair',
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundColor: 'var(--bg-secondary)',
        }}
        onMouseDown={onBgDown}
        onMouseMove={onBgMove}
        onMouseUp={onBgUp}
        onMouseLeave={onBgUp}
      >
        {/* Canvas transform root */}
        <div style={{
          position: 'absolute',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: 0, height: 0,
        }}>

          {/* SVG connectors */}
          <svg style={{ position: 'absolute', overflow: 'visible', width: 0, height: 0, pointerEvents: 'none' }}>
            <defs>
              <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="var(--text-secondary)" />
              </marker>
              <marker id="arrowhead-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="var(--accent)" />
              </marker>
            </defs>
            {visibleItems
              .filter(it => it.type === 'connector')
              .map(it => {
                const c  = it.content as { fromId: string; toId: string }
                const f  = center(c.fromId)
                const t  = center(c.toId)
                if (!f || !t) return null
                const act = it.id === activeId
                return (
                  <line
                    key={it.id}
                    x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                    stroke={act ? 'var(--accent)' : 'var(--text-secondary)'}
                    strokeWidth={act ? 2.5 : 1.5}
                    strokeDasharray={act ? undefined : '7 4'}
                    markerEnd={act ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => setActiveId(it.id)}
                  />
                )
              })}
          </svg>

          {/* Item cards */}
          {visibleItems
            .filter(it => it.type !== 'connector')
            .map(item => (
              <ItemCard
                key={item.id}
                item={item}
                isActive={item.id === activeId}
                isEditing={item.id === editingId}
                editText={editText}
                setEditText={setEditText}
                connectFrom={connectFrom}
                tool={tool}
                onMouseDown={e => {
                  e.stopPropagation()
                  if (tool === 'connect') { handleConnectClick(item.id); return }
                  if (tool !== 'select') return
                  setActiveId(item.id)
                  dragging.current = { id: item.id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y }
                }}
                onDoubleClick={e => {
                  e.stopPropagation()
                  if (item.type === 'sticky' || item.type === 'mindmap') {
                    setEditingId(item.id)
                    setEditText((item.content as { text: string }).text)
                  } else if (item.type === 'pdf') {
                    window.open((item.content as { url: string }).url, '_blank')
                  }
                }}
                onFinishEdit={text => finishEdit(item.id, text)}
              />
            ))}
        </div>

        {/* Connect hint */}
        {connectFrom && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--accent)', color: 'white', padding: '6px 18px',
            borderRadius: 20, fontSize: 13, fontWeight: 500, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Clique no segundo nó para conectar — ou clique de novo para cancelar
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none',
          }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', opacity: 0.6 }}>
              Selecione uma ferramenta na barra e clique no canvas para criar
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.4 }}>
              Ctrl+scroll para zoom · arraste o fundo para mover · use #tag e @nome para rastrear
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({ item, isActive, isEditing, editText, setEditText, connectFrom, tool, onMouseDown, onDoubleClick, onFinishEdit }: {
  item: BoardItem
  isActive: boolean
  isEditing: boolean
  editText: string
  setEditText: (t: string) => void
  connectFrom: string | null
  tool: Tool
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  onFinishEdit: (text: string) => void
}) {
  const borderColor  = isActive ? 'var(--accent)' : connectFrom && tool === 'connect' ? 'var(--accent)' : 'rgba(0,0,0,0.12)'
  const borderWidth  = isActive || (connectFrom && tool === 'connect') ? 2 : 1.5
  const borderStyle2 = connectFrom && tool === 'connect' ? 'dashed' : 'solid'
  const shadow       = isActive ? '0 0 0 3px rgba(59,123,248,0.2)' : '0 2px 8px rgba(0,0,0,0.1)'

  if (item.type === 'sticky') {
    const c = item.content
    return (
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute', left: item.x, top: item.y,
          width: item.width, height: item.height,
          background: c.color, borderRadius: 10, cursor: 'grab', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          border: `${borderWidth}px ${borderStyle2} ${borderColor}`,
          boxShadow: shadow,
        }}
      >
        <div style={{ height: 26, background: 'rgba(0,0,0,0.09)', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.tags.join(' ')}
          </span>
          {item.assignedToName && (
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)', flexShrink: 0 }}>@{item.assignedToName}</span>
          )}
        </div>
        <div style={{ flex: 1, padding: '8px 10px', position: 'relative', overflow: 'hidden' }}>
          {isEditing ? (
            <textarea
              autoFocus
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onBlur={() => onFinishEdit(editText)}
              onKeyDown={e => { if (e.key === 'Escape') onFinishEdit(editText) }}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              style={{
                width: '100%', height: '100%', border: 'none', outline: 'none',
                resize: 'none', background: 'transparent', fontSize: 13,
                color: 'rgba(0,0,0,0.75)', fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(0,0,0,0.72)', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {c.text || <span style={{ opacity: 0.35 }}>Duplo-clique para editar…</span>}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (item.type === 'mindmap') {
    const c = item.content
    return (
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute', left: item.x, top: item.y,
          width: item.width, height: item.height,
          background: c.color, borderRadius: 36, cursor: 'grab', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `${borderWidth}px ${borderStyle2} ${borderColor}`,
          boxShadow: shadow,
        }}
      >
        {isEditing ? (
          <textarea
            autoFocus
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={() => onFinishEdit(editText)}
            onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); onFinishEdit(editText) } }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: '86%', height: '70%', border: 'none', outline: 'none',
              resize: 'none', background: 'transparent', fontSize: 13, fontWeight: 600,
              color: 'white', fontFamily: 'inherit', lineHeight: 1.4, textAlign: 'center',
            }}
          />
        ) : (
          <div style={{ padding: '8px 14px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'white', wordBreak: 'break-word' }}>
              {c.text || <span style={{ opacity: 0.55 }}>Nó</span>}
            </p>
            {item.assignedToName && (
              <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>@{item.assignedToName}</p>
            )}
            {item.tags.length > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{item.tags.join(' ')}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  if (item.type === 'pdf') {
    const c = item.content
    return (
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute', left: item.x, top: item.y,
          width: item.width, height: item.height,
          background: 'var(--bg-card)', borderRadius: 10, cursor: 'grab', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          border: `${borderWidth}px ${borderStyle2} ${borderColor}`,
          boxShadow: shadow,
        }}
      >
        <div style={{ height: 30, background: '#DC2626', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, flexShrink: 0 }}>
          <FileText size={13} style={{ color: 'white' }} />
          <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>PDF</span>
        </div>
        <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: 'var(--text-primary)', wordBreak: 'break-all', lineHeight: 1.4 }}>{c.name}</p>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Duplo-clique para abrir</span>
        </div>
      </div>
    )
  }

  return null
}
