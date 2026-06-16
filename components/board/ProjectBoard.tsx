'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MousePointer2, MessageSquare, Network, FileText,
  Link2, ZoomIn, ZoomOut, Trash2, Tag, Pen, ImagePlus,
} from 'lucide-react'
import { PdfBoardCard } from '@/components/board/PdfBoardCard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'sticky' | 'mindmap' | 'pdf' | 'connect' | 'pen' | 'image'

interface BoardItemBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  tags: string[]
  assignedToName?: string
}

interface StickyItem    extends BoardItemBase { type: 'sticky';    content: { text: string; color: string } }
interface MindmapItem   extends BoardItemBase { type: 'mindmap';   content: { text: string; color: string } }
interface PdfItem       extends BoardItemBase { type: 'pdf';       content: { name: string; url: string } }
interface ConnectorItem extends BoardItemBase { type: 'connector'; content: { fromId: string; toId: string } }
interface FreehandItem  extends BoardItemBase { type: 'freehand';  content: { d: string; color: string; strokeWidth: number } }
interface ImageItem     extends BoardItemBase { type: 'image';     content: { url: string; name: string } }

type BoardItem = StickyItem | MindmapItem | PdfItem | ConnectorItem | FreehandItem | ImageItem

// ─── Constants ────────────────────────────────────────────────────────────────

const STICKY_COLORS   = ['#FDE68A','#BBF7D0','#BFDBFE','#FCA5A5','#DDD6FE','#FED7AA','#E5E7EB']
const MINDMAP_COLORS  = ['#6366F1','#10B981','#3B82F6','#EF4444','#8B5CF6','#F59E0B','#64748B']
const PEN_COLORS      = ['#1E293B','#EF4444','#3B82F6','#22C55E','#F59E0B','#8B5CF6','#EC4899']

function uid() { return Math.random().toString(36).slice(2, 11) }
function parseTags(text: string)     { return [...new Set((text.match(/#\w+/g) ?? []).map(t => t.toLowerCase()))] }
function parseAssigned(text: string) { const m = text.match(/@(\w+)/); return m ? m[1] : undefined }
function rndColor(arr: string[])     { return arr[Math.floor(Math.random() * arr.length)] }

// Build SVG path string from array of points
function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }
  return d
}

// ─── ItemCard (sticky / mindmap) ──────────────────────────────────────────────

function ItemCard({ item, isActive, isEditing, editText, setEditText, connectFrom, tool, onMouseDown, onDoubleClick, onFinishEdit }: {
  item: BoardItem
  isActive: boolean
  isEditing: boolean
  editText: string
  setEditText: (v: string) => void
  connectFrom: string | null
  tool: Tool
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
  onFinishEdit: (text: string) => void
}) {
  if (item.type !== 'sticky' && item.type !== 'mindmap') return null
  const c = item.content as { text: string; color: string }
  const isSticky  = item.type === 'sticky'
  const border    = isActive  ? '2px solid var(--accent)'   : '1.5px solid rgba(0,0,0,0.08)'
  const shadow    = isActive  ? '0 0 0 3px rgba(59,123,248,0.18)' : '0 2px 8px rgba(0,0,0,0.12)'
  const highlight = connectFrom ? (connectFrom === item.id ? '0 0 0 3px #F59E0B' : undefined) : undefined

  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{
        position: 'absolute',
        left: item.x, top: item.y,
        width: item.width,
        minHeight: item.height,
        background: isSticky ? c.color : c.color,
        borderRadius: isSticky ? 10 : 8,
        padding: isSticky ? 12 : '10px 14px',
        cursor: tool === 'select' ? 'grab' : 'crosshair',
        border, boxShadow: highlight ?? shadow,
        userSelect: 'none',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {isEditing ? (
        <textarea
          autoFocus
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onBlur={() => onFinishEdit(editText)}
          onKeyDown={e => { if (e.key === 'Escape') onFinishEdit(editText) }}
          style={{
            background: 'transparent', border: 'none', outline: 'none', resize: 'none',
            fontSize: isSticky ? 14 : 13, fontWeight: isSticky ? 400 : 600,
            color: isSticky ? '#1E293B' : 'white', width: '100%', minHeight: 60,
            fontFamily: 'inherit',
          }}
          placeholder={isSticky ? 'Digite uma nota… use #tag ou @nome' : 'Texto do nó…'}
        />
      ) : (
        <p style={{
          margin: 0, fontSize: isSticky ? 14 : 13, fontWeight: isSticky ? 400 : 600,
          color: isSticky ? '#1E293B' : 'white',
          wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          minHeight: 24,
        }}>
          {c.text || <span style={{ opacity: 0.4 }}>{isSticky ? 'Duplo-clique para editar' : 'Nó'}</span>}
        </p>
      )}

      {item.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {item.tags.map(t => (
            <span key={t} style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(0,0,0,0.1)', color: isSticky ? '#1E293B' : 'white',
            }}>{t}</span>
          ))}
        </div>
      )}

      {item.assignedToName && (
        <span style={{ fontSize: 10, opacity: 0.65, color: isSticky ? '#1E293B' : 'white' }}>
          @{item.assignedToName}
        </span>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectBoard({ projectId }: { projectId: string }) {
  const [items,       setItems]       = useState<BoardItem[]>([])
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
  const [penColor,    setPenColor]    = useState(PEN_COLORS[0])
  const [penWidth,    setPenWidth]    = useState(3)

  // In-progress freehand path (shown live while drawing)
  const [livePoints,  setLivePoints]  = useState<{ x: number; y: number }[]>([])

  // Stable refs
  const panRef       = useRef(pan)
  const zoomRef      = useRef(zoom)
  const itemsRef     = useRef<BoardItem[]>(items)
  const boardIdRef   = useRef<string | null>(null)
  const dragging     = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const isPanning    = useRef(false)
  const isDrawing    = useRef(false)
  const panStart     = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const saveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef  = useRef<HTMLInputElement>(null)
  const pendingPdfPos = useRef<{ x: number; y: number } | null>(null)
  const pendingImgPos = useRef<{ x: number; y: number } | null>(null)
  const livePointsRef = useRef<{ x: number; y: number }[]>([])
  const penColorRef   = useRef(penColor)
  const penWidthRef   = useRef(penWidth)
  const toolRef       = useRef<Tool>(tool)

  panRef.current      = pan
  zoomRef.current     = zoom
  itemsRef.current    = items
  penColorRef.current = penColor
  penWidthRef.current = penWidth
  toolRef.current     = tool

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
    if (e.target !== viewportRef.current &&
        !(e.target as HTMLElement).dataset.bg) return

    const currentTool = toolRef.current
    const pos = toCanvas(e.clientX, e.clientY)

    if (currentTool !== 'select' && currentTool !== 'pen') {
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

  function finishStroke() {
    if (!isDrawing.current) return
    isDrawing.current = false
    const pts = livePointsRef.current
    setLivePoints([])
    livePointsRef.current = []
    if (pts.length < 2) return
    const d = pointsToPath(pts)
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const newItem: FreehandItem = {
      id: uid(), type: 'freehand',
      x: minX, y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      tags: [],
      content: { d, color: penColorRef.current, strokeWidth: penWidthRef.current },
    }
    commit([...itemsRef.current, newItem])
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
      pendingPdfPos.current = { x, y }
      fileInputRef.current?.click()
      return
    } else if (tool === 'image') {
      pendingImgPos.current = { x, y }
      imgInputRef.current?.click()
      return
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

  // ── Handle PDF file selection ─────────────────────────────────────────────

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pendingPdfPos.current) return
    const pos  = pendingPdfPos.current
    pendingPdfPos.current = null
    const name = file.name
    const id   = uid()
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const newItem: PdfItem = {
        id, type: 'pdf', x: pos.x, y: pos.y, width: 600, height: 10,
        content: { name, url: dataUrl }, tags: [],
      }
      commit([...itemsRef.current, newItem])
      setActiveId(id)
    }
    reader.readAsDataURL(file)
  }

  // ── Handle Image file selection ───────────────────────────────────────────

  function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pendingImgPos.current) return
    const pos  = pendingImgPos.current
    pendingImgPos.current = null
    const name = file.name
    const id   = uid()
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const newItem: ImageItem = {
        id, type: 'image', x: pos.x, y: pos.y, width: 300, height: 200,
        content: { name, url: dataUrl }, tags: [],
      }
      commit([...itemsRef.current, newItem])
      setActiveId(id)
    }
    reader.readAsDataURL(file)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function deleteItem(id: string) {
    const bid = boardIdRef.current
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
    const tags     = parseTags(text)
    const assigned = parseAssigned(text)
    commit(itemsRef.current.map(it => {
      if (it.id !== id) return it
      if (it.type === 'sticky' || it.type === 'mindmap') {
        return { ...it, content: { ...it.content, text }, tags, assignedToName: assigned }
      }
      return it
    }))
  }

  // ── Connector center ───────────────────────────────────────────────────────

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

  const filterTag    = tagFilter.trim().toLowerCase()
  const visibleItems = items.filter(it => {
    if (it.type === 'connector' || it.type === 'freehand' || it.type === 'image') return true
    if (!filterTag) return true
    return it.tags.some(t => t.includes(filterTag))
  })

  // Cursor for current tool
  const viewCursor = tool === 'pen'
    ? 'crosshair'
    : isPanning.current
      ? 'grabbing'
      : tool === 'select'
        ? 'grab'
        : 'crosshair'

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(680px, calc(100vh - 260px))', minHeight: 480 }}>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
        style={{ display: 'none' }} onChange={onFileSelected} />
      <input ref={imgInputRef} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={onImageSelected} />

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
          { key: 'image',   Icon: ImagePlus,       label: 'Imagem'     },
          { key: 'pen',     Icon: Pen,             label: 'Caneta'     },
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

        {/* Pen color swatches — only visible when pen tool is active */}
        {tool === 'pen' && (
          <>
            <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />
            {PEN_COLORS.map(c => (
              <button
                key={c}
                title={c}
                onClick={() => setPenColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: c,
                  boxShadow: penColor === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none',
                  flexShrink: 0,
                }}
              />
            ))}
            <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 2px' }} />
            {[2, 4, 7].map(w => (
              <button
                key={w}
                title={`Espessura ${w}`}
                onClick={() => setPenWidth(w)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: penWidth === w ? 'var(--accent)' : 'var(--bg-secondary)',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: w * 2.5, height: w, borderRadius: w,
                  background: penWidth === w ? 'white' : 'var(--text-secondary)',
                }} />
              </button>
            ))}
          </>
        )}

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 80 }}>
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
          cursor: viewCursor,
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

          {/* SVG layer — connectors + freehand paths + live path */}
          <svg style={{ position: 'absolute', overflow: 'visible', width: 0, height: 0, pointerEvents: 'none' }}>
            <defs>
              <marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="var(--text-secondary)" />
              </marker>
              <marker id="arrowhead-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 z" fill="var(--accent)" />
              </marker>
            </defs>

            {/* Saved freehand paths */}
            {visibleItems
              .filter(it => it.type === 'freehand')
              .map(it => {
                const f = it.content as { d: string; color: string; strokeWidth: number }
                const isAct = it.id === activeId
                return (
                  <path
                    key={it.id}
                    d={f.d}
                    stroke={isAct ? 'var(--accent)' : f.color}
                    strokeWidth={f.strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={() => setActiveId(it.id)}
                  />
                )
              })}

            {/* Live drawing path */}
            {livePoints.length > 1 && (
              <path
                d={pointsToPath(livePoints)}
                stroke={penColor}
                strokeWidth={penWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Connector arrows */}
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

          {/* Image items */}
          {visibleItems
            .filter(it => it.type === 'image')
            .map(item => {
              const img = item.content as { url: string; name: string }
              const isAct = item.id === activeId
              return (
                <div
                  key={item.id}
                  onMouseDown={e => {
                    e.stopPropagation()
                    if (tool !== 'select') return
                    setActiveId(item.id)
                    dragging.current = { id: item.id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y }
                  }}
                  style={{
                    position: 'absolute',
                    left: item.x, top: item.y,
                    width: item.width,
                    cursor: 'grab',
                    borderRadius: 8,
                    overflow: 'hidden',
                    boxShadow: isAct
                      ? '0 0 0 2px var(--accent), 0 4px 16px rgba(0,0,0,0.2)'
                      : '0 2px 12px rgba(0,0,0,0.18)',
                    border: isAct ? '2px solid var(--accent)' : '1.5px solid rgba(0,0,0,0.12)',
                    userSelect: 'none',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.name}
                    draggable={false}
                    style={{ display: 'block', width: '100%', pointerEvents: 'none' }}
                  />
                </div>
              )
            })}

          {/* PDF cards */}
          {visibleItems
            .filter(it => it.type === 'pdf')
            .map(item => (
              <PdfBoardCard
                key={item.id}
                item={item as PdfItem}
                isActive={item.id === activeId}
                onMouseDown={e => {
                  e.stopPropagation()
                  if (tool === 'connect') { handleConnectClick(item.id); return }
                  if (tool !== 'select') return
                  setActiveId(item.id)
                  dragging.current = { id: item.id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y }
                }}
              />
            ))}

          {/* Sticky / mindmap cards */}
          {visibleItems
            .filter(it => it.type === 'sticky' || it.type === 'mindmap')
            .map(item => {
              const itemMouseDown = (e: React.MouseEvent) => {
                e.stopPropagation()
                if (tool === 'connect') { handleConnectClick(item.id); return }
                if (tool !== 'select') return
                setActiveId(item.id)
                dragging.current = { id: item.id, sx: e.clientX, sy: e.clientY, ox: item.x, oy: item.y }
              }
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  isActive={item.id === activeId}
                  isEditing={item.id === editingId}
                  editText={editText}
                  setEditText={setEditText}
                  connectFrom={connectFrom}
                  tool={tool}
                  onMouseDown={itemMouseDown}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    if (item.type === 'sticky' || item.type === 'mindmap') {
                      setEditingId(item.id)
                      setEditText((item.content as { text: string }).text)
                    }
                  }}
                  onFinishEdit={text => finishEdit(item.id, text)}
                />
              )
            })}
        </div>

        {/* ── Pen overlay — sits above all items, captures all events when pen is active ── */}
        {tool === 'pen' && (
          <div
            style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 500, background: 'transparent' }}
            onMouseDown={e => {
              const pos = toCanvas(e.clientX, e.clientY)
              isDrawing.current = true
              livePointsRef.current = [pos]
              setLivePoints([pos])
            }}
            onMouseMove={e => {
              if (!isDrawing.current) return
              const pos = toCanvas(e.clientX, e.clientY)
              livePointsRef.current = [...livePointsRef.current, pos]
              setLivePoints([...livePointsRef.current])
            }}
            onMouseUp={finishStroke}
            onMouseLeave={finishStroke}
          />
        )}

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

        {/* Pen hint */}
        {tool === 'pen' && !isDrawing.current && livePoints.length === 0 && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.6)', color: 'white', padding: '5px 14px',
            borderRadius: 20, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Clique e arraste para desenhar
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none',
          }}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', opacity: 0.6 }}>
              Escolha uma ferramenta e clique no canvas para criar
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', opacity: 0.4 }}>
              Nota · Nó · PDF · Imagem · Caneta · Conectar — Ctrl+scroll para zoom · #tag e @nome para rastrear
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
