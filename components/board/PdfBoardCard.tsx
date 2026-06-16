'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react'

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

  // Render current page whenever page or loading changes
  useEffect(() => {
    if (loading || errored || !pdfRef.current) return
    let cancelled = false

    async function render() {
      const canvas = canvasRef.current
      if (!canvas) return

      const pdfPage  = await pdfRef.current.getPage(page)
      if (cancelled) return

      // Scale so the PDF fills the card width
      const desired  = item.width - 2  // subtract border
      const raw      = pdfPage.getViewport({ scale: 1 })
      const scale    = desired / raw.width
      const viewport = pdfPage.getViewport({ scale })

      canvas.width  = viewport.width
      canvas.height = viewport.height

      // Cancel any in-flight render
      if (renderTask.current) {
        try { renderTask.current.cancel() } catch { /* ignore */ }
      }

      const ctx = canvas.getContext('2d')
      if (!ctx || cancelled) return

      renderTask.current = pdfPage.render({ canvasContext: ctx, viewport })
      try {
        await renderTask.current.promise
      } catch {
        // render was cancelled — that's fine
      }
    }

    render()
    return () => { cancelled = true }
  }, [page, loading, errored, item.width])

  const border = isActive ? '2px solid var(--accent)' : '1.5px solid rgba(0,0,0,0.15)'
  const shadow = isActive ? '0 0 0 3px rgba(59,123,248,0.2)' : '0 2px 12px rgba(0,0,0,0.18)'

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: item.x,
        top: item.y,
        width: item.width,
        background: 'var(--bg-card)',
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'grab',
        border,
        boxShadow: shadow,
        userSelect: 'none',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', background: '#DC2626', flexShrink: 0,
      }}>
        <FileText size={13} color="white" style={{ flexShrink: 0 }} />
        <span style={{
          fontSize: 12, color: 'white', fontWeight: 600,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.content.name}
        </span>
      </div>

      {/* ── PDF canvas ──────────────────────────────────────────────────── */}
      {errored ? (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Erro ao carregar PDF</span>
        </div>
      ) : loading ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%' }}
        />
      )}

      {/* ── Page navigation ─────────────────────────────────────────────── */}
      {pageCount > 1 && !loading && !errored && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '4px 8px', background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setPage(p => Math.max(1, p - 1)) }}
            disabled={page === 1}
            style={{
              border: 'none', background: 'none', cursor: page === 1 ? 'default' : 'pointer',
              color: page === 1 ? 'var(--text-secondary)' : 'var(--text-primary)', padding: 2,
              opacity: page === 1 ? 0.3 : 1,
            }}
          >
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 48, textAlign: 'center' }}>
            {page} / {pageCount}
          </span>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setPage(p => Math.min(pageCount, p + 1)) }}
            disabled={page === pageCount}
            style={{
              border: 'none', background: 'none', cursor: page === pageCount ? 'default' : 'pointer',
              color: page === pageCount ? 'var(--text-secondary)' : 'var(--text-primary)', padding: 2,
              opacity: page === pageCount ? 0.3 : 1,
            }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* Spin keyframe — injected once via style tag */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
