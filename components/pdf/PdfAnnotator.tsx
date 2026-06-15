'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, ChevronLeft, ChevronRight,
  Pen, Type, Eraser, Undo2,
  Save, Download, Share2, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tool = 'pen' | 'text' | 'eraser'
type PageAnnotations = Record<number, object>  // page number → Fabric JSON

// ─────────────────────────────────────────────────────────────────────────────
// PdfAnnotator
// ─────────────────────────────────────────────────────────────────────────────

export function PdfAnnotator({
  fileUrl,
  fileName = 'documento.pdf',
  contextType,
  contextId,
  itemId,
  onClose,
}: {
  fileUrl: string
  fileName?: string
  contextType: 'obra' | 'projeto'
  contextId: string
  itemId?: string
  onClose?: () => void
}) {
  // DOM refs
  const pdfCanvasRef      = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef   = useRef<HTMLCanvasElement>(null)
  const fabricWrapperRef  = useRef<HTMLDivElement>(null)
  const containerRef      = useRef<HTMLDivElement>(null)

  // Library instances — kept in refs to avoid triggering re-renders
  const pdfDocRef     = useRef<any>(null)
  const fabricInst    = useRef<any>(null)
  const FabricLib     = useRef<any>(null)

  // Page annotations: collected from DB + user edits; always-current via ref
  const annotationsRef = useRef<PageAnnotations>({})

  // Undo history for the current page (object snapshots)
  const historyRef     = useRef<object[]>([])
  const pauseHistory   = useRef(false)

  // ── React state ──────────────────────────────────────────────────────────

  const [numPages, setNumPages]     = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageW, setPageW]           = useState(800)
  const [pageH, setPageH]           = useState(1100)

  const [tool, setTool]             = useState<Tool>('pen')
  const [color, setColor]           = useState('#e11d48')
  const [strokeW, setStrokeW]       = useState(3)

  const [historyLen, setHistoryLen] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [exporting, setExporting]   = useState(false)

  const [waOpen, setWaOpen]         = useState(false)
  const [waPhone, setWaPhone]       = useState('')

  // Use refs for color/stroke so event handlers always see the latest values
  const colorRef   = useRef(color)
  const strokeWRef = useRef(strokeW)
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { strokeWRef.current = strokeW }, [strokeW])

  // ─────────────────────────────────────────────────────────────────────────
  // Render one PDF page onto the PDF canvas and resize Fabric to match
  // ─────────────────────────────────────────────────────────────────────────

  const renderPage = useCallback(async (pageNum: number) => {
    const pdfDoc = pdfDocRef.current
    const fc     = fabricInst.current
    if (!pdfDoc || !fc || !pdfCanvasRef.current) return

    const page     = await pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: 1 })

    // Scale to fit the scroll container width (with padding)
    const containerW = (containerRef.current?.clientWidth ?? 860) - 48
    const scale      = Math.min(containerW / viewport.width, 1.8)
    const vp         = page.getViewport({ scale })

    // Render PDF
    const canvas = pdfCanvasRef.current
    canvas.width  = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise

    // Resize Fabric canvas + its wrapper
    fc.setWidth(vp.width)
    fc.setHeight(vp.height)
    if (fabricWrapperRef.current) {
      fabricWrapperRef.current.style.width  = `${vp.width}px`
      fabricWrapperRef.current.style.height = `${vp.height}px`
    }

    setPageW(vp.width)
    setPageH(vp.height)

    // Load saved annotations for this page (suppress history tracking)
    pauseHistory.current = true
    const saved = annotationsRef.current[pageNum]
    if (saved) {
      await new Promise<void>(res => fc.loadFromJSON(saved, res))
    } else {
      fc.clear()
    }
    fc.renderAll()
    pauseHistory.current = false

    // Reset undo history for this page
    historyRef.current = []
    setHistoryLen(0)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Bootstrap: load PDF + Fabric + saved annotations
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function init() {
      const [{ default: pdfjsLib }, { fabric }] = await Promise.all([
        import('pdfjs-dist'),
        import('fabric'),
      ])
      if (cancelled) return

      FabricLib.current = fabric

      // Worker via jsDelivr CDN (version-matched)
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

      // Load PDF
      const pdfDoc = await pdfjsLib.getDocument(fileUrl).promise
      if (cancelled) return
      pdfDocRef.current = pdfDoc
      setNumPages(pdfDoc.numPages)

      // Create Fabric canvas
      if (!fabricCanvasRef.current) return
      const fc = new fabric.Canvas(fabricCanvasRef.current, {
        isDrawingMode: true,
        selection: false,
      })
      fabricInst.current = fc

      // Position Fabric's auto-generated wrapper over the PDF canvas
      if (fc.wrapperEl && fabricWrapperRef.current) {
        fabricWrapperRef.current.appendChild(fc.wrapperEl)
      }

      // Initial brush
      fc.freeDrawingBrush.color = colorRef.current
      fc.freeDrawingBrush.width = strokeWRef.current

      // Track undo history
      const pushHistory = () => {
        if (pauseHistory.current) return
        historyRef.current = [...historyRef.current.slice(-30), fc.toJSON()]
        setHistoryLen(historyRef.current.length)
      }
      fc.on('object:added',    pushHistory)
      fc.on('object:modified', pushHistory)
      fc.on('object:removed',  pushHistory)

      // Fetch saved annotations from Supabase
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('pdf_annotations')
        .select('page_number, annotations_json')
        .eq('file_url', fileUrl)
        .eq('context_type', contextType)
        .eq('context_id', contextId)

      if (rows && !cancelled) {
        const loaded: PageAnnotations = {}
        for (const row of rows) loaded[row.page_number] = row.annotations_json
        annotationsRef.current = loaded
      }

      await renderPage(1)
      if (!cancelled) setLoading(false)
    }

    init()

    return () => {
      cancelled = true
      pdfDocRef.current?.destroy?.()
      pdfDocRef.current = null
      fabricInst.current?.dispose()
      fabricInst.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl])

  // ─────────────────────────────────────────────────────────────────────────
  // Page navigation — save current page before switching
  // ─────────────────────────────────────────────────────────────────────────

  async function goToPage(newPage: number) {
    if (newPage < 1 || newPage > numPages || !fabricInst.current) return
    // Snapshot current page
    annotationsRef.current[currentPage] = fabricInst.current.toJSON()
    setCurrentPage(newPage)
    await renderPage(newPage)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tool switching
  // ─────────────────────────────────────────────────────────────────────────

  function applyTool(t: Tool) {
    setTool(t)
    const fc = fabricInst.current
    if (!fc) return

    fc.off('mouse:down')

    switch (t) {
      case 'pen':
        fc.isDrawingMode = true
        fc.selection = false
        fc.freeDrawingBrush.color = colorRef.current
        fc.freeDrawingBrush.width = strokeWRef.current
        break

      case 'text':
        fc.isDrawingMode = false
        fc.selection = false
        fc.on('mouse:down', async (opt: any) => {
          if (opt.target) return
          const Fabric = FabricLib.current
          if (!Fabric) return
          const pt = fc.getPointer(opt.e)
          const txt = new Fabric.IText('Texto', {
            left: pt.x, top: pt.y,
            fontSize: 18,
            fill: colorRef.current,
            fontFamily: 'DM Sans, sans-serif',
            editable: true,
          })
          fc.add(txt)
          fc.setActiveObject(txt)
          txt.enterEditing()
          txt.selectAll()
          fc.renderAll()
        })
        break

      case 'eraser':
        fc.isDrawingMode = false
        fc.selection = false
        fc.on('mouse:down', (opt: any) => {
          if (opt.target) {
            fc.remove(opt.target)
            fc.renderAll()
          }
        })
        break
    }
  }

  // Sync brush when color / width change while pen is active
  useEffect(() => {
    const fc = fabricInst.current
    if (!fc || !fc.freeDrawingBrush) return
    if (tool === 'pen') {
      fc.freeDrawingBrush.color = color
      fc.freeDrawingBrush.width = strokeW
    }
  }, [color, strokeW, tool])

  // ─────────────────────────────────────────────────────────────────────────
  // Undo
  // ─────────────────────────────────────────────────────────────────────────

  async function undo() {
    if (historyRef.current.length === 0) return
    const newHistory = historyRef.current.slice(0, -1)
    historyRef.current = newHistory
    setHistoryLen(newHistory.length)

    const prev = newHistory[newHistory.length - 1] ?? { objects: [], background: '' }
    pauseHistory.current = true
    await new Promise<void>(res => fabricInst.current?.loadFromJSON(prev, res))
    fabricInst.current?.renderAll()
    pauseHistory.current = false
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Save — persist all pages to Supabase
  // ─────────────────────────────────────────────────────────────────────────

  async function save() {
    if (!fabricInst.current) return
    setSaving(true)

    // Snapshot current page
    const allAnnots: PageAnnotations = {
      ...annotationsRef.current,
      [currentPage]: fabricInst.current.toJSON(),
    }
    annotationsRef.current = allAnnots

    const supabase = createClient()

    // Delete all existing annotations for this file + context, then re-insert
    await supabase.from('pdf_annotations')
      .delete()
      .eq('file_url', fileUrl)
      .eq('context_type', contextType)
      .eq('context_id', contextId)

    const rows = Object.entries(allAnnots)
      .filter(([, json]) => (json as any)?.objects?.length > 0)
      .map(([page, json]) => ({
        file_url:     fileUrl,
        context_type: contextType,
        context_id:   contextId,
        item_id:      itemId ?? null,
        page_number:  parseInt(page),
        annotations_json: json,
        updated_at:   new Date().toISOString(),
      }))

    if (rows.length > 0) {
      await supabase.from('pdf_annotations').insert(rows)
    }

    setSaving(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export — embed annotations as PNG image in each PDF page and download
  // ─────────────────────────────────────────────────────────────────────────

  async function exportPdf() {
    if (!pdfDocRef.current || !fabricInst.current) return
    setExporting(true)

    try {
      const { PDFDocument }  = await import('pdf-lib')
      const { fabric }       = await import('fabric')

      // Snapshot current page
      const allAnnots: PageAnnotations = {
        ...annotationsRef.current,
        [currentPage]: fabricInst.current.toJSON(),
      }

      const originalBytes = await fetch(fileUrl).then(r => r.arrayBuffer())
      const pdfDoc        = await PDFDocument.load(originalBytes, { ignoreEncryption: true })
      const pdfPages      = pdfDoc.getPages()

      for (const [pageStr, annotJSON] of Object.entries(allAnnots)) {
        const annot = annotJSON as any
        if (!annot?.objects?.length) continue

        const pdfPage         = pdfPages[parseInt(pageStr) - 1]
        if (!pdfPage) continue
        const { width: pw, height: ph } = pdfPage.getSize()

        // Render annotations to offscreen canvas at PDF resolution
        const offEl  = document.createElement('canvas')
        offEl.width  = pw
        offEl.height = ph

        const offFc = new fabric.Canvas(offEl, { width: pw, height: ph })

        await new Promise<void>(res => offFc.loadFromJSON(annotJSON, res))

        // Scale from display coordinates → PDF coordinates
        const sx = pw / pageW
        const sy = ph / pageH
        offFc.getObjects().forEach((obj: any) => {
          obj.set({
            left:   (obj.left ?? 0) * sx,
            top:    (obj.top  ?? 0) * sy,
            scaleX: (obj.scaleX ?? 1) * sx,
            scaleY: (obj.scaleY ?? 1) * sy,
          })
        })
        offFc.renderAll()

        const pngRes   = await fetch(offEl.toDataURL('image/png'))
        const pngBytes = await pngRes.arrayBuffer()
        const pngImg   = await pdfDoc.embedPng(pngBytes)

        // pdf-lib origin is bottom-left; convert from top-left
        pdfPage.drawImage(pngImg, { x: 0, y: 0, width: pw, height: ph })
        offFc.dispose()
      }

      const bytes = await pdfDoc.save()
      const blob  = new Blob([bytes], { type: 'application/pdf' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      a.download  = fileName.replace(/\.pdf$/i, '') + '-anotado.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WhatsApp — open wa.me link with the file URL
  // ─────────────────────────────────────────────────────────────────────────

  function sendWhatsapp() {
    const text = `📄 *${fileName}*\n\nArquivo do BuildSmart AI:\n${fileUrl}`
    const num  = waPhone.replace(/\D/g, '')
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
    setWaOpen(false)
    setWaPhone('')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const TOOLS: { id: Tool; icon: typeof Pen; label: string }[] = [
    { id: 'pen',    icon: Pen,    label: 'Caneta' },
    { id: 'text',   icon: Type,   label: 'Texto' },
    { id: 'eraser', icon: Eraser, label: 'Borracha' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0d1117' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 px-3 py-2 flex-wrap shrink-0"
        style={{ background: '#1a2233', borderBottom: '1px solid #2d3748' }}
      >
        {/* Close + title */}
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/10 transition-colors mr-1"
          title="Fechar"
        >
          <X size={17} style={{ color: '#94a3b8' }} />
        </button>
        <span className="text-sm font-medium mr-3 hidden sm:inline max-w-[240px] truncate" style={{ color: '#e2e8f0' }}>
          {fileName}
        </span>
        <div className="h-5 w-px mr-1" style={{ background: '#2d3748' }} />

        {/* Tool buttons */}
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => applyTool(id)}
            title={label}
            className="p-1.5 rounded transition-colors"
            style={{
              background: tool === id ? '#3b82f6' : 'transparent',
              color: tool === id ? 'white' : '#94a3b8',
            }}
          >
            <Icon size={15} />
          </button>
        ))}

        {/* Color picker */}
        <label title="Cor" className="relative flex items-center cursor-pointer ml-1">
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
          />
          <span
            className="block w-5 h-5 rounded-full border-2"
            style={{ background: color, borderColor: '#4a5568' }}
          />
        </label>

        {/* Stroke width */}
        <select
          value={strokeW}
          onChange={e => setStrokeW(Number(e.target.value))}
          className="text-xs rounded px-1.5 py-1 outline-none ml-1"
          style={{ background: '#2d3748', color: '#e2e8f0', border: '1px solid #4a5568' }}
          title="Espessura"
        >
          {[1, 2, 3, 5, 8, 12].map(w => (
            <option key={w} value={w}>{w}px</option>
          ))}
        </select>

        {/* Undo */}
        <button
          onClick={undo}
          disabled={historyLen === 0}
          title="Desfazer (Ctrl+Z)"
          className="p-1.5 rounded hover:bg-white/10 transition-colors disabled:opacity-30 ml-0.5"
          style={{ color: '#94a3b8' }}
        >
          <Undo2 size={15} />
        </button>

        {/* Right-side actions */}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
            style={{ background: '#1e3a5f', color: '#60a5fa', border: '1px solid #1e40af' }}
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            {saving ? 'Salvando…' : 'Salvar'}
          </button>

          <button
            onClick={exportPdf}
            disabled={exporting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
            style={{ background: '#1a2e1a', color: '#4ade80', border: '1px solid #166534' }}
          >
            {exporting ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
            {exporting ? 'Exportando…' : 'Exportar PDF'}
          </button>

          <button
            onClick={() => setWaOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
            style={{ background: '#14532d', color: '#86efac', border: '1px solid #166534' }}
          >
            <Share2 size={11} /> WhatsApp
          </button>
        </div>
      </div>

      {/* ── Page nav ─────────────────────────────────────────────────── */}
      {numPages > 1 && (
        <div
          className="flex items-center justify-center gap-3 py-1.5 shrink-0"
          style={{ background: '#0f172a' }}
        >
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            style={{ color: '#94a3b8' }}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs tabular-nums" style={{ color: '#64748b' }}>
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            style={{ color: '#94a3b8' }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* ── Canvas area ──────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-start justify-center p-6"
        style={{ background: '#1a1a2e' }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full w-full gap-3">
            <Loader2 size={22} className="animate-spin" style={{ color: '#3b82f6' }} />
            <span className="text-sm" style={{ color: '#64748b' }}>Carregando PDF…</span>
          </div>
        ) : (
          /* Outer wrapper: sized to the rendered PDF page */
          <div style={{ position: 'relative', width: pageW, height: pageH, flexShrink: 0, boxShadow: '0 4px 32px rgba(0,0,0,0.6)' }}>
            {/* PDF pixel layer */}
            <canvas
              ref={pdfCanvasRef}
              style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
            />
            {/* Fabric annotation layer — Fabric will inject its own wrapper inside this div */}
            <div
              ref={fabricWrapperRef}
              style={{ position: 'absolute', top: 0, left: 0, width: pageW, height: pageH }}
            >
              <canvas ref={fabricCanvasRef} />
            </div>
          </div>
        )}
      </div>

      {/* ── WhatsApp dialog ──────────────────────────────────────────── */}
      {waOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setWaOpen(false)}
        >
          <div
            className="rounded-xl p-6 w-80"
            style={{ background: '#1a2233', border: '1px solid #2d3748' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-1" style={{ color: '#e2e8f0' }}>
              Enviar via WhatsApp
            </h3>
            <p className="text-xs mb-4" style={{ color: '#64748b' }}>
              Abre o WhatsApp com o link do arquivo. O destinatário precisa ter acesso à URL.
            </p>
            <input
              type="tel"
              placeholder="+55 (11) 99999-9999"
              value={waPhone}
              onChange={e => setWaPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && waPhone.trim() && sendWhatsapp()}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
              style={{ background: '#0f172a', border: '1px solid #2d3748', color: '#e2e8f0' }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setWaOpen(false)}
                className="px-3 py-1.5 text-xs rounded"
                style={{ color: '#64748b' }}
              >
                Cancelar
              </button>
              <button
                onClick={sendWhatsapp}
                disabled={!waPhone.trim()}
                className="px-4 py-1.5 text-xs font-medium rounded disabled:opacity-40"
                style={{ background: '#16a34a', color: 'white' }}
              >
                Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
