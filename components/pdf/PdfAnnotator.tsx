'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, Eraser, MessageCircle, Minus, PenLine, Plus, RotateCcw, Save, Type, X, ZoomIn } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import { createClient } from '@/lib/supabase/client'

type ContextType = 'obra' | 'projeto'
type Tool = 'pen' | 'text' | 'erase'

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

export function PdfAnnotator({ fileUrl, fileName = 'documento.pdf', contextType, contextId, itemId = null, onClose }: PdfAnnotatorProps) {
  const supabase = createClient()
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const fabricContainerRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fabricCanvasRef = useRef<any>(null)
  const pdfDocRef = useRef<any>(null)
  const pageJsonRef = useRef<Record<number, string>>({})
  const undoStackRef = useRef<string[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [scale, setScale] = useState(1)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#10B981')
  const [width, setWidth] = useState(3)
  const storageKey = annotationKey(fileUrl, contextType, contextId, itemId)

  const snapshotCurrentPage = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    pageJsonRef.current[page] = JSON.stringify(canvas.toJSON())
  }, [page])

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
    } catch {
      // Supabase pode ainda não ter a tabela/migration; o fallback local mantém a função utilizável.
    }
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
    } catch {
      // fallback local
    }
  }

  const configureTool = useCallback(async () => {
    const fabric = await import('fabric')
    const canvas = fabricCanvasRef.current
    if (!canvas) return

    // Remove any previous text-placement click listener
    canvas.off('mouse:down:before')

    if (tool === 'pen') {
      canvas.isDrawingMode = true
      canvas.selection = false
      canvas.defaultCursor = 'crosshair'
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
      canvas.freeDrawingBrush.color = color
      canvas.freeDrawingBrush.width = width
    } else if (tool === 'text') {
      canvas.isDrawingMode = false
      canvas.selection = false
      canvas.defaultCursor = 'text'
      // Place a textbox wherever the user clicks
      canvas.on('mouse:down:before', (opt: any) => {
        if ((canvas as any)._isTextEditing) return
        const pointer = canvas.getPointer(opt.e)
        const textbox = new fabric.Textbox('', {
          left: pointer.x,
          top: pointer.y,
          width: 200,
          fill: color,
          fontSize: 18,
          fontFamily: 'Arial',
          editable: true,
          cursorColor: color,
        })
        canvas.add(textbox)
        canvas.setActiveObject(textbox)
        canvas.requestRenderAll()
        textbox.enterEditing()
        canvas.requestRenderAll()
        // After placing, restore selection mode so user can click elsewhere
        ;(canvas as any)._isTextEditing = true
        textbox.on('editing:exited', () => {
          ;(canvas as any)._isTextEditing = false
          if (!textbox.text || textbox.text.trim() === '') {
            canvas.remove(textbox)
          }
          canvas.requestRenderAll()
        })
      })
    } else {
      canvas.isDrawingMode = false
      canvas.selection = true
      canvas.defaultCursor = 'default'
    }
  }, [color, tool, width])

  // Ctrl+Scroll zoom
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setScale(prev => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        return Math.round(Math.min(4, Math.max(0.25, prev + delta)) * 100) / 100
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Keyboard shortcuts: Delete/Backspace = remove, Ctrl+Z = undo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      const canvas = fabricCanvasRef.current
      if (!canvas) return
      const isEditingText = !!(canvas as any).isEditing || !!(canvas as any)._isTextEditing

      // Ctrl+Z / Cmd+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (isTyping) return
        e.preventDefault()
        const stack = undoStackRef.current
        if (stack.length <= 1) return
        stack.pop()
        const previous = stack[stack.length - 1]
        canvas.loadFromJSON(previous).then(() => {
          canvas.requestRenderAll()
          pageJsonRef.current[page] = previous
        })
        return
      }

      // Delete / Backspace — remove selected
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (isTyping || isEditingText) return
      const active = canvas.getActiveObjects()
      if (!active.length) return
      active.forEach((obj: any) => canvas.remove(obj))
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      pageJsonRef.current[page] = JSON.stringify(canvas.toJSON())
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [page])

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

    // Dispose previous Fabric canvas and clear container
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose()
      fabricCanvasRef.current = null
    }
    container.innerHTML = ''

    // Create a fresh canvas element inside the container div
    const freshCanvas = document.createElement('canvas')
    container.appendChild(freshCanvas)

    const fabricCanvas = new fabric.Canvas(freshCanvas, {
      width: viewport.width,
      height: viewport.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
    })
    fabricCanvasRef.current = fabricCanvas

    const json = pageJsonRef.current[pageNumber]
    if (json) {
      await fabricCanvas.loadFromJSON(json)
      fabricCanvas.requestRenderAll()
    }

    fabricCanvas.on('object:added', () => {
      undoStackRef.current.push(JSON.stringify(fabricCanvas.toJSON()))
      pageJsonRef.current[pageNumber] = JSON.stringify(fabricCanvas.toJSON())
    })
    fabricCanvas.on('object:modified', () => {
      undoStackRef.current.push(JSON.stringify(fabricCanvas.toJSON()))
      pageJsonRef.current[pageNumber] = JSON.stringify(fabricCanvas.toJSON())
    })
    fabricCanvas.on('object:removed', () => {
      pageJsonRef.current[pageNumber] = JSON.stringify(fabricCanvas.toJSON())
    })

    await configureTool()
  }, [configureTool, scale, snapshotCurrentPage])

  useEffect(() => {
    let mounted = true
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const pdfjs = await import('pdfjs-dist')
        // Worker local (copiado para /public/ no build)
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

  useEffect(() => {
    configureTool()
  }, [configureTool])

  function activateTextTool() {
    setTool('text')
  }

  function eraseSelected() {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    const selected = canvas.getActiveObjects()
    selected.forEach((obj: any) => canvas.remove(obj))
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    pageJsonRef.current[page] = JSON.stringify(canvas.toJSON())
  }

  async function undo() {
    const canvas = fabricCanvasRef.current
    if (!canvas || undoStackRef.current.length <= 1) return
    undoStackRef.current.pop()
    const previous = undoStackRef.current[undoStackRef.current.length - 1]
    await canvas.loadFromJSON(previous)
    canvas.requestRenderAll()
    pageJsonRef.current[page] = previous
  }

  async function saveAll() {
    snapshotCurrentPage()
    setSaving(true)
    await Promise.all(Object.entries(pageJsonRef.current).map(([pageNumber, json]) => persistPage(Number(pageNumber), json)))
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
        // Get PNG data URL from Fabric canvas
        const fabricCanvas = fabricCanvasRef.current
        if (!fabricCanvas) continue
        const pngDataUrl = fabricCanvas.toDataURL({ format: 'png', multiplier: 1 })
        const pngBytes = await dataUrlToBytes(pngDataUrl)
        const png = await output.embedPng(pngBytes)
        const pdfPage = pages[pageNumber - 1]
        const { width: pageWidth, height: pageHeight } = pdfPage.getSize()
        pdfPage.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight })
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
    alert('Anotações salvas. Exporte o PDF anotado e envie pelo WhatsApp da obra; o envio automático de arquivo será conectado quando houver endpoint de mídia configurado.')
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" title="Fechar">
          <X size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{fileName}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Página {page} de {pageCount}</p>
        </div>

        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ArrowLeft size={16} /></button>
        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}><ArrowRight size={16} /></button>

        <div className="flex items-center gap-0.5 rounded-lg px-1" style={{ background: 'var(--bg-secondary)' }}>
          <button onClick={() => setScale(s => Math.max(0.25, Math.round((s - 0.1) * 100) / 100))} className="p-1.5 rounded hover:bg-[var(--bg-primary)]" title="Diminuir zoom (Ctrl+Scroll)">
            <Minus size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <span className="text-xs font-mono w-10 text-center select-none" style={{ color: 'var(--text-primary)' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale(s => Math.min(4, Math.round((s + 0.1) * 100) / 100))} className="p-1.5 rounded hover:bg-[var(--bg-primary)]" title="Aumentar zoom (Ctrl+Scroll)">
            <Plus size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <button onClick={() => setScale(1)} className="p-1.5 rounded hover:bg-[var(--bg-primary)]" title="Redefinir zoom 100%">
            <ZoomIn size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" onClick={() => setTool('pen')} style={{ color: tool === 'pen' ? 'var(--accent)' : 'var(--text-secondary)' }}><PenLine size={16} /></button>
        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" onClick={activateTextTool} title="Texto — clique no PDF para posicionar" style={{ color: tool === 'text' ? 'var(--accent)' : 'var(--text-secondary)' }}><Type size={16} /></button>
        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" onClick={eraseSelected} style={{ color: tool === 'erase' ? 'var(--danger)' : 'var(--text-secondary)' }}><Eraser size={16} /></button>
        <button className="p-2 rounded-lg hover:bg-[var(--bg-secondary)]" onClick={undo}><RotateCcw size={16} /></button>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-9 rounded-lg border-0 bg-transparent" />
        <input type="range" min={1} max={12} value={width} onChange={e => setWidth(Number(e.target.value))} className="w-20" />

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
          /* O div externo tem position:relative para o container do Fabric ficar sobreposto ao pdfCanvas */
          <div className="relative mx-auto shadow-2xl" style={{ background: 'white', width: 'fit-content' }}>
            <canvas ref={pdfCanvasRef} className="block" />
            {/* Container div com absolute inset-0 — Fabric.js cria seus canvases aqui sem quebrar o posicionamento */}
            <div
              ref={fabricContainerRef}
              className="absolute inset-0"
              style={{ pointerEvents: 'auto', cursor: tool === 'text' ? 'text' : tool === 'pen' ? 'crosshair' : 'default' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
