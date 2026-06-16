'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, Eraser, MessageCircle, Minus, MousePointer2, PenLine, Plus, Save, Type, Undo2, X, ZoomIn } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/client'

type ContextType = 'obra' | 'projeto'
type Tool = 'select' | 'pen' | 'text' | 'erase'

type PdfAnnotatorProps = {
  fileUrl: string
  fileName?: string
  contextType: ContextType
  contextId: string
  itemId?: string | null
  onClose?: () => void
}

function annotationKey(fileUrl: string, contextType: ContextType, contextId: string, itemId?: string | null) {
  return `buildsmart_pdf_annotations_${contextType}_${contextId}_${itemId || 'root'}_${fileUrl.slice(0, 120)}`
}

async function dataUrlToBytes(dataUrl: string) {
  const res = await fetch(dataUrl)
  return new Uint8Array(await res.arrayBuffer())
}

// Scale fabric objects in-place when changing zoom level
function scaleObjects(canvas: any, ratio: number) {
  if (Math.abs(ratio - 1) < 0.001) return
  canvas.getObjects().forEach((obj: any) => {
    obj.left = (obj.left || 0) * ratio
    obj.top = (obj.top || 0) * ratio
    obj.scaleX = (obj.scaleX || 1) * ratio
    obj.scaleY = (obj.scaleY || 1) * ratio
    // Textbox: also scale explicit width and font size so text reflows correctly
    if (obj.type === 'textbox' || obj.type === 'i-text') {
      if (obj.width) obj.width = obj.width * ratio
      if (obj.fontSize) obj.fontSize = obj.fontSize * ratio
    }
    obj.setCoords()
  })
}

export function PdfAnnotator({ fileUrl, fileName = 'documento.pdf', contextType, contextId, itemId = null, onClose }: PdfAnnotatorProps) {
  const supabase = createClient()
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const fabricContainerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fabricCanvasRef = useRef<any>(null)
  const pdfDocRef = useRef<any>(null)
  const pageJsonRef = useRef<Record<number, string>>({})
  const undoStackRef = useRef<string[]>([])
  const currentPageRef = useRef<number>(1)
  const currentScaleRef = useRef<number>(1)
  // Suppresses pushUndo during loadFromJSON so undo doesn't push phantom states
  const isUndoingRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [scale, setScale] = useState(1)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#10B981')
  const [width, setWidth] = useState(3)
  const storageKey = annotationKey(fileUrl, contextType, contextId, itemId)

  useEffect(() => { currentPageRef.current = page }, [page])
  useEffect(() => { currentScaleRef.current = scale }, [scale])

  // Snapshot includes the render scale so annotations can be re-scaled on zoom change
  const snapshotCurrentPage = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const data = { ...canvas.toJSON(), _renderScale: currentScaleRef.current }
    pageJsonRef.current[currentPageRef.current] = JSON.stringify(data)
  }, [])

  async function persistPage(pageNumber: number, json: string) {
    const localRaw = localStorage.getItem(storageKey)
    const local = localRaw ? JSON.parse(localRaw) : {}
    local[pageNumber] = json
    localStorage.setItem(storageKey, JSON.stringify(local))
    try {
      await supabase.from('pdf_annotations').upsert({
        file_url: fileUrl,
        context_type: contextType,
        context_id: contextId,
        item_id: itemId,
        page_number: pageNumber,
        annotations_json: json,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'file_url,context_type,context_id,item_id,page_number' })
    } catch { /* fallback local */ }
  }

  async function loadAnnotations() {
    const fromLocal = localStorage.getItem(storageKey)
    if (fromLocal) pageJsonRef.current = JSON.parse(fromLocal)
    try {
      const { data } = await supabase
        .from('pdf_annotations')
        .select('page_number, annotations_json')
        .eq('file_url', fileUrl)
        .eq('context_type', contextType)
        .eq('context_id', contextId)
        .eq('item_id', itemId)
      if (data?.length) {
        const next: Record<number, string> = {}
        data.forEach((row: any) => { next[row.page_number] = row.annotations_json })
        pageJsonRef.current = { ...pageJsonRef.current, ...next }
      }
    } catch { /* fallback local */ }
  }

  const configureTool = useCallback(async () => {
    const fabric = await import('fabric')
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    // Remove all previous tool-specific listeners
    canvas.off('mouse:down')
    canvas.off('mouse:down:before')
    canvas.off('mouse:up')
    ;(canvas as any)._isTextEditing = false

    if (tool === 'select') {
      canvas.isDrawingMode = false
      canvas.selection = true
      canvas.defaultCursor = 'default'
    } else if (tool === 'pen') {
      canvas.isDrawingMode = true
      canvas.selection = false
      canvas.defaultCursor = 'crosshair'
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
      canvas.freeDrawingBrush.color = color
      canvas.freeDrawingBrush.width = width
    } else if (tool === 'text') {
      canvas.isDrawingMode = false
      canvas.selection = true   // allow clicking existing textboxes to edit them
      canvas.defaultCursor = 'text'
      // mouse:up fires AFTER Fabric finishes its own event handling
      // opt.target is set only when an existing object was hit
      canvas.on('mouse:up', (opt: any) => {
        if (opt.target) return          // clicked existing object — Fabric handles it
        if ((canvas as any)._isTextEditing) return
        const pointer = canvas.getPointer(opt.e)
        ;(canvas as any)._isTextEditing = true
        const textbox = new fabric.Textbox('', {
          left: pointer.x,
          top: pointer.y,
          width: Math.round(200 * currentScaleRef.current),
          fill: color,
          fontSize: Math.round(18 * currentScaleRef.current),
          fontFamily: 'Arial',
          editable: true,
          cursorColor: color,
        })
        canvas.add(textbox)
        canvas.setActiveObject(textbox)
        canvas.renderAll()
        textbox.enterEditing()
        canvas.renderAll()
        textbox.on('editing:exited', () => {
          ;(canvas as any)._isTextEditing = false
          if (!textbox.text || textbox.text.trim() === '') canvas.remove(textbox)
          canvas.renderAll()
        })
      })
    } else if (tool === 'erase') {
      canvas.isDrawingMode = false
      canvas.selection = false
      canvas.defaultCursor = 'crosshair'
      // Click any object → remove immediately
      canvas.on('mouse:down', (opt: any) => {
        if (!opt.target) return
        canvas.remove(opt.target)
        canvas.discardActiveObject()
        canvas.requestRenderAll()
        const j = JSON.stringify(canvas.toJSON())
        const stack = undoStackRef.current
        stack.push(j)
        if (stack.length > 20) stack.splice(0, stack.length - 20)
        pageJsonRef.current[currentPageRef.current] = j
      })
    }
  }, [color, tool, width])

  // Ctrl+Scroll zoom
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setScale(prev => Math.round(Math.min(4, Math.max(0.25, prev + (e.deltaY > 0 ? -0.1 : 0.1))) * 100) / 100)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Delete / Backspace = remove selected; Ctrl+Z = undo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      const canvas = fabricCanvasRef.current
      if (!canvas) return
      const isEditingText = !!(canvas as any).isEditing || !!(canvas as any)._isTextEditing

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (isTyping || isEditingText) return
        e.preventDefault()
        const stack = undoStackRef.current
        if (stack.length <= 1) return
        stack.pop()
        const previous = stack[stack.length - 1]
        isUndoingRef.current = true
        canvas.loadFromJSON(previous).then(() => {
          isUndoingRef.current = false
          canvas.requestRenderAll()
          pageJsonRef.current[currentPageRef.current] = previous
        })
        return
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (isTyping || isEditingText) return
      const active = canvas.getActiveObjects()
      if (!active.length) return
      active.forEach((obj: any) => canvas.remove(obj))
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      const j = JSON.stringify(canvas.toJSON())
      const stack = undoStackRef.current
      stack.push(j)
      if (stack.length > 20) stack.splice(0, stack.length - 20)
      pageJsonRef.current[currentPageRef.current] = j
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const renderPage = useCallback(async (pageNumber: number) => {
    const pdf = pdfDocRef.current
    const pdfCanvas = pdfCanvasRef.current
    const container = fabricContainerRef.current
    if (!pdf || !pdfCanvas || !container) return

    snapshotCurrentPage()

    const fabric = await import('fabric')
    const pdfPage = await pdf.getPage(pageNumber)
    const viewport = pdfPage.getViewport({ scale })
    const ctx = pdfCanvas.getContext('2d')
    if (!ctx) return

    pdfCanvas.width = viewport.width
    pdfCanvas.height = viewport.height
    await pdfPage.render({ canvasContext: ctx, viewport }).promise

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose()
      fabricCanvasRef.current = null
    }
    container.innerHTML = ''

    const freshCanvas = document.createElement('canvas')
    container.appendChild(freshCanvas)

    const fabricCanvas = new fabric.Canvas(freshCanvas, {
      width: viewport.width,
      height: viewport.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
    })
    fabricCanvasRef.current = fabricCanvas

    // Load saved annotations; re-scale if the saved scale differs from current
    undoStackRef.current = []
    const rawJson = pageJsonRef.current[pageNumber]
    if (rawJson) {
      const saved = JSON.parse(rawJson)
      const savedScale: number = saved._renderScale ?? scale
      isUndoingRef.current = true
      await fabricCanvas.loadFromJSON(saved)
      isUndoingRef.current = false
      scaleObjects(fabricCanvas, scale / savedScale)
    }
    fabricCanvas.renderAll()

    // Push initial state (with current scale tag) to undo stack
    const initJson = JSON.stringify({ ...fabricCanvas.toJSON(), _renderScale: scale })
    undoStackRef.current.push(initJson)
    pageJsonRef.current[pageNumber] = initJson

    const pushUndo = () => {
      if (isUndoingRef.current) return
      const j = JSON.stringify({ ...fabricCanvas.toJSON(), _renderScale: scale })
      const stack = undoStackRef.current
      stack.push(j)
      if (stack.length > 20) stack.splice(0, stack.length - 20)
      pageJsonRef.current[pageNumber] = j
    }

    fabricCanvas.on('object:added', pushUndo)
    fabricCanvas.on('object:modified', pushUndo)
    fabricCanvas.on('object:removed', pushUndo)

    await configureTool()
  }, [configureTool, scale, snapshotCurrentPage])

  useEffect(() => {
    let mounted = true
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        await loadAnnotations()
        const source = fileUrl.startsWith('data:')
          ? { data: await dataUrlToBytes(fileUrl) }
          : { url: fileUrl }
        const pdf = await pdfjs.getDocument(source as any).promise
        if (!mounted) return
        pdfDocRef.current = pdf
        setPageCount(pdf.numPages)
        setPage(1)
      } catch (err: any) {
        console.error('Erro ao abrir PDF:', err)
        setError('Não foi possível abrir o PDF. Verifique se o arquivo é válido.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    init()
    return () => {
      mounted = false
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose()
        fabricCanvasRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl])

  useEffect(() => {
    if (!loading && !error) renderPage(page)
  }, [loading, page, renderPage, error])

  useEffect(() => { configureTool() }, [configureTool])

  async function undo() {
    const canvas = fabricCanvasRef.current
    if (!canvas || undoStackRef.current.length <= 1) return
    undoStackRef.current.pop()
    const previous = undoStackRef.current[undoStackRef.current.length - 1]
    isUndoingRef.current = true
    await canvas.loadFromJSON(previous)
    isUndoingRef.current = false
    canvas.requestRenderAll()
    pageJsonRef.current[currentPageRef.current] = previous
  }

  async function saveAll() {
    snapshotCurrentPage()
    setSaving(true)
    await Promise.all(Object.entries(pageJsonRef.current).map(([pn, json]) => persistPage(Number(pn), json)))
    setSaving(false)
  }

  async function exportPdf() {
    snapshotCurrentPage()
    setExporting(true)
    try {
      const original = await dataUrlToBytes(fileUrl)
      const output = await PDFDocument.load(original)
      const pages = output.getPages()
      const currentPage = page

      for (const [pageNumberRaw, json] of Object.entries(pageJsonRef.current)) {
        const pageNumber = Number(pageNumberRaw)
        if (!json || !pages[pageNumber - 1]) continue

        await renderPage(pageNumber)

        const fabricCanvas = fabricCanvasRef.current
        const pdfCanvas = pdfCanvasRef.current
        if (!fabricCanvas || !pdfCanvas) continue

        fabricCanvas.renderAll()

        // Merge PDF layer + annotation layer into one image
        const merged = document.createElement('canvas')
        merged.width = pdfCanvas.width
        merged.height = pdfCanvas.height
        const mctx = merged.getContext('2d')!
        mctx.drawImage(pdfCanvas, 0, 0)
        mctx.drawImage(fabricCanvas.getElement(), 0, 0)

        const pngBytes = await dataUrlToBytes(merged.toDataURL('image/png'))
        const png = await output.embedPng(pngBytes)
        const pdfPage = pages[pageNumber - 1]
        const { width: pw, height: ph } = pdfPage.getSize()
        pdfPage.drawImage(png, { x: 0, y: 0, width: pw, height: ph })
      }

      setPage(currentPage)
      const bytes = await output.save()
      const blob = new Blob([bytes.buffer.slice(0) as ArrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.replace(/\.pdf$/i, '') + '-anotado.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  async function sendWhatsApp() {
    await saveAll()
    alert('Anotações salvas. Exporte o PDF anotado e envie pelo WhatsApp da obra.')
  }

  const cursorStyle = tool === 'text' ? 'text' : tool === 'pen' ? 'crosshair' : tool === 'erase' ? 'crosshair' : 'default'

  const toolBtn = (t: Tool, icon: React.ReactNode, title: string) => (
    <button
      onClick={() => setTool(t)}
      title={title}
      className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
      style={{
        color: tool === t ? (t === 'erase' ? 'var(--danger)' : 'var(--accent)') : 'var(--text-secondary)',
        background: tool === t ? 'var(--bg-secondary)' : 'transparent',
      }}
    >
      {icon}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" title="Fechar">
          <X size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{fileName}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Página {page} de {pageCount}</p>
        </div>

        {/* Page navigation */}
        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ArrowLeft size={16} /></button>
        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}><ArrowRight size={16} /></button>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 rounded-lg px-1" style={{ background: 'var(--bg-secondary)' }}>
          <button onClick={() => setScale(s => Math.max(0.25, Math.round((s - 0.1) * 100) / 100))} className="p-1.5 rounded hover:bg-[var(--bg-primary)]" title="Zoom -">
            <Minus size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span className="text-xs font-mono w-10 text-center select-none" style={{ color: 'var(--text-primary)' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(4, Math.round((s + 0.1) * 100) / 100))} className="p-1.5 rounded hover:bg-[var(--bg-primary)]" title="Zoom +">
            <Plus size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button onClick={() => setScale(1)} className="p-1.5 rounded hover:bg-[var(--bg-primary)]" title="100%">
            <ZoomIn size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Drawing tools */}
        <div className="flex items-center gap-0.5 rounded-lg px-1" style={{ background: 'var(--bg-secondary)' }}>
          {toolBtn('select', <MousePointer2 size={16} />, 'Seleção — mover / apagar objetos')}
          {toolBtn('pen',    <PenLine size={16} />,        'Caneta livre')}
          {toolBtn('text',   <Type size={16} />,           'Texto — clique para inserir')}
          {toolBtn('erase',  <Eraser size={16} />,         'Borracha — clique no objeto para apagar')}
        </div>

        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" onClick={undo} title="Desfazer (Ctrl+Z)">
          <Undo2 size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>

        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-9 rounded-lg border-0 bg-transparent cursor-pointer" title="Cor" />
        <input type="range" min={1} max={12} value={width} onChange={e => setWidth(Number(e.target.value))} className="w-20" title="Espessura" />

        <button onClick={saveAll} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button onClick={exportPdf} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
          <Download size={14} /> {exporting ? 'Exportando...' : 'Exportar'}
        </button>
        <button onClick={sendWhatsApp} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(16,185,129,0.16)', color: 'var(--success)' }}>
          <MessageCircle size={14} /> WhatsApp
        </button>
      </div>

      {/* Canvas area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</p>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Fechar</button>
          </div>
        )}
        {!loading && !error && (
          <div className="relative mx-auto shadow-2xl" style={{ background: 'white', width: 'fit-content' }}>
            <canvas ref={pdfCanvasRef} className="block" />
            <div
              ref={fabricContainerRef}
              className="absolute inset-0"
              style={{ pointerEvents: 'auto', cursor: cursorStyle }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
