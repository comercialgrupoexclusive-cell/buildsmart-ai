'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { createClient } from '@/lib/supabase/client'
import { FileText } from 'lucide-react'

// ─── Types (loose — avoids fighting with Excalidraw's internal types) ──────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = any

interface Props {
  projectId: string
}

// ─── Helper: strip un-serialisable fields from appState ───────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitiseAppState(appState: any) {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    collaborators, openDialog, openPopup, contextMenu,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    toast, ...rest
  } = appState ?? {}
  return rest
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExcalidrawBoard({ projectId }: Props) {
  const [initialData, setInitialData] = useState<AnyApi>(null)
  const [loaded, setLoaded] = useState(false)
  const apiRef      = useRef<AnyApi>(null)
  const debouncer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load board data ────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('projetos')
          .select('board_data')
          .eq('id', projectId)
          .single()
        if (data?.board_data) setInitialData(data.board_data)
      } finally {
        setLoaded(true)
      }
    }
    load()
  }, [projectId])

  // ── Debounced save ─────────────────────────────────────────────────────────

  const handleChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (elements: any, appState: any, files: any) => {
      if (debouncer.current) clearTimeout(debouncer.current)
      debouncer.current = setTimeout(async () => {
        const supabase = createClient()
        await supabase
          .from('projetos')
          .update({
            board_data: {
              elements,
              appState: sanitiseAppState(appState),
              files,
            },
          })
          .eq('id', projectId)
      }, 1500)
    },
    [projectId],
  )

  // ── PDF import ─────────────────────────────────────────────────────────────

  async function importPdf(file: File) {
    const api = apiRef.current
    if (!api) return

    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise

    const existingElements = api.getSceneElements() as AnyApi[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newFiles: any[]    = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newElements: any[] = []

    // Start inserting to the right of existing content
    const startX = 100
    let   startY = 100

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page     = await pdf.getPage(pageNum)
      // scale=2 → retina resolution; logical size = viewport / 2
      const viewport = page.getViewport({ scale: 2 })

      const offscreen       = document.createElement('canvas')
      offscreen.width  = viewport.width
      offscreen.height = viewport.height
      const ctx = offscreen.getContext('2d')!
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport } as any).promise

      const dataURL  = offscreen.toDataURL('image/png')
      const fileId   = `pdf-${Date.now()}-p${pageNum}` as AnyApi
      const logicW   = Math.round(viewport.width  / 2)
      const logicH   = Math.round(viewport.height / 2)

      newFiles.push({
        id:            fileId,
        mimeType:      'image/png',
        dataURL,
        created:       Date.now(),
        lastRetrieved: Date.now(),
      })

      newElements.push({
        type:            'image',
        id:              `${fileId}-el`,
        x:               startX,
        y:               startY,
        width:           logicW,
        height:          logicH,
        angle:           0,
        strokeColor:     'transparent',
        backgroundColor: 'transparent',
        fillStyle:       'solid',
        strokeWidth:     1,
        strokeStyle:     'solid',
        roughness:       0,
        opacity:         100,
        groupIds:        [],
        frameId:         null,
        roundness:       null,
        seed:            Math.floor(Math.random() * 1e9),
        version:         1,
        versionNonce:    Math.floor(Math.random() * 1e9),
        isDeleted:       false,
        boundElements:   null,
        updated:         Date.now(),
        link:            null,
        locked:          false,
        fileId,
        scale:           [1, 1],
        status:          'saved',
        crop:            null,
      })

      startY += logicH + 40
    }

    api.addFiles(newFiles)
    api.updateScene({ elements: [...existingElements, ...newElements] })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Hidden PDF file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) importPdf(file)
        }}
      />

      <Excalidraw
        initialData={initialData ?? undefined}
        onChange={handleChange}
        excalidrawAPI={(api: AnyApi) => { apiRef.current = api }}
        renderTopRightUI={() => (
          <button
            title="Importar PDF como imagem no canvas"
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              background: '#e8e6ff', border: '1px solid #c4bfff',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: '#4e46dc',
            }}
          >
            <FileText size={14} />
            PDF
          </button>
        )}
      />
    </div>
  )
}
