'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PdfBoardCardProps {
  item: {
    id: string
    x: number
    y: number
    width: number
    content: { name: string; url: string }
  }
  isActive: boolean
  onMouseDown: (e: React.MouseEvent) => void
}

export function PdfBoardCard({ item, isActive, onMouseDown }: PdfBoardCardProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const pdfRef     = useRef<any>(null)
  const renderTask = useRef<any>(null)

  const [page,      setPage]      = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [errored,   setErrored]   = useState(false)

  // Load PDF document once
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const url = item.content.url
        const source = url.startsWith('data:')
          ? { data: await (await fetch(url)).arrayBuffer().then(b => new Uint8Array(b)) }
          : { url }
        const doc = await pdfjs.getDocument(source as any).promise
        if (cancelled) return
        pdfRef.current = doc
        setPageCount(doc.numPages)
        setLoading(false)
      } catch {
        if (!cancelled) setErrored(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [item.content.url])

  // Render current page
  useEffect(() => {
    if (loading || errored || !pdfRef.current) return
    let cancelled = false

    async function render() {
      const canvas = canvasRef.current
      if (!canvas) return

      const pdfPage = await pdfRef.current.getPage(page)
      if (cancelled) return

      // Render at physical pixel resolution for sharpness
      const dpr     = window.devicePixelRatio || 1
      const desired = item.width - 2           // logical CSS width
      const raw     = pdfPage.getViewport({ scale: 1 })
      const scale   = (desired / raw.width) * dpr
      const viewport = pdfPage.getViewport({ scale })

      const physW = Math.floor(viewport.width)
      const physH = Math.floor(viewport.height)
      const logicH = Math.floor(physH / dpr)

      canvas.width  = physW
      canvas.height = physH
      canvas.style.width  = `${desired}px`
      canvas.style.height = `${logicH}px`

      if (renderTask.current) {
        try { renderTask.current.cancel() } catch { /* ignore */ }
      }

      const ctx = canvas.getContext('2d')
      if (!ctx || cancelled) return

      renderTask.current = pdfPage.render({ canvasContext: ctx, viewport })
      try { await renderTask.current.promise } catch { /* cancelled */ }
    }

    render()
    return () => { cancelled = true }
  }, [page, loading, errored, item.width])

  const border = isActive ? '2px solid var(--accent)' : '1.5px solid rgba(0,0,0,0.18)'
  const shadow = isActive
    ? '0 0 0 3px rgba(59,123,248,0.25), 0 8px 32px rgba(0,0,0,0.22)'
    : '0 4px 20px rgba(0,0,0,0.22)'

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: item.x,
        top: item.y,
        width: item.width,
        background: '#fff',
        borderRadius: 4,
        cursor: 'grab',
        border,
        boxShadow: shadow,
        userSelect: 'none',
        overflow: 'visible',
      }}
    >
      {/* PDF canvas — fills full width, height is natural from the page */}
      {errored ? (
        <div style={{
          height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#666', fontSize: 13,
        }}>
          Erro ao carregar PDF
        </div>
      ) : loading ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid #ddd', borderTopColor: 'var(--accent)',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 4 }} />
      )}

      {/* Filename badge — overlaid top-left */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        color: 'white', fontSize: 11, fontWeight: 600,
        padding: '3px 8px',
        borderRadius: '4px 0 6px 0',
        maxWidth: item.width - 80,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>
        {item.content.name}
      </div>

      {/* Page navigation — overlaid at bottom, only when multiple pages */}
      {pageCount > 1 && !loading && !errored && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '4px 8px',
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          borderRadius: '0 0 4px 4px',
        }}>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setPage(p => Math.max(1, p - 1)) }}
            disabled={page === 1}
            style={{
              border: 'none', background: 'none', cursor: page === 1 ? 'default' : 'pointer',
              color: 'white', padding: 2, opacity: page === 1 ? 0.3 : 1,
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: 11, color: 'white', minWidth: 44, textAlign: 'center' }}>
            {page} / {pageCount}
          </span>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setPage(p => Math.min(pageCount, p + 1)) }}
            disabled={page === pageCount}
            style={{
              border: 'none', background: 'none', cursor: page === pageCount ? 'default' : 'pointer',
              color: 'white', padding: 2, opacity: page === pageCount ? 0.3 : 1,
            }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
