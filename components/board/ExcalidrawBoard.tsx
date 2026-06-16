'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, FileText } from 'lucide-react'
import { NCPanel } from './NCPanel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface Props {
  projectId: string
}

function sanitiseAppState(appState: Any) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collaborators, openDialog, openPopup, contextMenu, toast, ...rest } = appState ?? {}
  return rest
}

export function ExcalidrawBoard({ projectId }: Props) {
  const [initialData, setInitialData]      = useState<Any>(null)
  const [loaded, setLoaded]                = useState(false)
  const [selectedElementId, setSelectedId] = useState<string | null>(null)
  const [showNC, setShowNC]                = useState(false)
  const [excalidrawTheme, setExcalidrawTheme] = useState<'light' | 'dark'>('dark')

  const apiRef        = useRef<Any>(null)
  const debouncer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const selectedIdRef = useRef<string | null>(null)

  // ── Sincronizar tema Excalidraw com o sistema BuildSmart ──────────────────
  // O BuildSmart usa data-theme="light" no <html>; sem atributo = escuro (padrão).

  useEffect(() => {
    function readTheme(): 'light' | 'dark' {
      return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    }
    setExcalidrawTheme(readTheme())

    const observer = new MutationObserver(() => setExcalidrawTheme(readTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // ── Carregar board_data ───────────────────────────────────────────────────

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

  // ── Scroll = zoom ─────────────────────────────────────────────────────────
  // Excalidraw interpreta ctrlKey+wheel como zoom e scroll simples como pan.
  // Interceptamos o wheel, bloqueamos o original e reenviamos com ctrlKey:true.

  useEffect(() => {
    if (!loaded) return
    const container = containerRef.current
    if (!container) return

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) return  // já é zoom nativo
      e.preventDefault()
      e.stopImmediatePropagation()
      e.target?.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          ctrlKey: true,
          deltaY: e.deltaY, deltaX: 0,
          clientX: e.clientX, clientY: e.clientY,
        })
      )
    }

    container.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => container.removeEventListener('wheel', onWheel, { capture: true })
  }, [loaded])

  // ── onChange: tracking de seleção + save debounced ───────────────────────

  const handleChange = useCallback(
    (elements: Any, appState: Any, files: Any) => {
      // Rastrear elemento selecionado evitando re-render desnecessário
      const ids = appState.selectedElementIds ?? {}
      const newId = Object.keys(ids).find(id => ids[id]) ?? null
      if (newId !== selectedIdRef.current) {
        selectedIdRef.current = newId
        setSelectedId(newId)
      }

      // Salvar no Supabase com debounce de 1,5 s
      if (debouncer.current) clearTimeout(debouncer.current)
      debouncer.current = setTimeout(async () => {
        const supabase = createClient()
        await supabase
          .from('projetos')
          .update({ board_data: { elements, appState: sanitiseAppState(appState), files } })
          .eq('id', projectId)
      }, 1500)
    },
    [projectId],
  )

  // ── Importar PDF como imagem no canvas ───────────────────────────────────

  async function importPdf(file: File) {
    const api = apiRef.current
    if (!api) return

    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const existingEls: Any[] = api.getSceneElements()
    const newFiles: Any[]    = []
    const newEls: Any[]      = []
    let startY = 100

    for (let p = 1; p <= pdf.numPages; p++) {
      const page     = await pdf.getPage(p)
      const viewport = page.getViewport({ scale: 2 })
      const canvas   = document.createElement('canvas')
      canvas.width   = viewport.width
      canvas.height  = viewport.height
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport } as Any).promise

      const fileId = `pdf-${Date.now()}-p${p}` as Any
      const w      = Math.round(viewport.width  / 2)
      const h      = Math.round(viewport.height / 2)

      newFiles.push({
        id: fileId, mimeType: 'image/png',
        dataURL: canvas.toDataURL('image/png'),
        created: Date.now(), lastRetrieved: Date.now(),
      })
      newEls.push({
        type: 'image', id: `${fileId}-el`, x: 100, y: startY, width: w, height: h,
        angle: 0, strokeColor: 'transparent', backgroundColor: 'transparent',
        fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 0,
        opacity: 100, groupIds: [], frameId: null, roundness: null,
        seed: Math.floor(Math.random() * 1e9), version: 1,
        versionNonce: Math.floor(Math.random() * 1e9),
        isDeleted: false, boundElements: null, updated: Date.now(),
        link: null, locked: false, fileId, scale: [1, 1], status: 'saved', crop: null,
      })
      startY += h + 40
    }

    api.addFiles(newFiles)
    api.updateScene({ elements: [...existingEls, ...newEls] })
  }

  // ── Loading ───────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
      <input
        ref={fileInputRef} type="file" accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) importPdf(file)
        }}
      />

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, height: '100%', minWidth: 0 }}>
        <Excalidraw
          initialData={initialData ?? undefined}
          onChange={handleChange}
          excalidrawAPI={(api: Any) => {
            apiRef.current = api
            // Auto-carregar templates BuildSmart na biblioteca nativa do Excalidraw
            fetch('/buildsmart-library.excalidrawlib')
              .then(r => r.json())
              .then(data => {
                api.updateLibrary({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  libraryItems: data.library.map((elements: any[]) => ({
                    status: 'published',
                    elements,
                  })),
                  action: 'merge',
                })
              })
              .catch(() => {})
          }}
          theme={excalidrawTheme}
          langCode="pt-BR"
          renderTopRightUI={() => (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                title="Importar PDF como imagem no canvas"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: '#e8e6ff', border: '1px solid #c4bfff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#4e46dc',
                }}
              >
                <FileText size={14} /> PDF
              </button>

              <button
                title="Painel de não-conformidades"
                onClick={() => setShowNC(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: showNC ? '#fef2f2' : '#fff7ed',
                  border: `1px solid ${showNC ? '#fca5a5' : '#fed7aa'}`,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: showNC ? '#dc2626' : '#ea580c',
                }}
              >
                <AlertTriangle size={14} /> NCs
              </button>
            </div>
          )}
        >
          {/* MainMenu sem links externos (GitHub, Discord, Twitter) */}
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>
      </div>

      {/* Painel lateral de NCs */}
      {showNC && (
        <div style={{
          width: 300, height: '100%', flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <NCPanel
            api={apiRef}
            projectId={projectId}
            selectedElementId={selectedElementId}
          />
        </div>
      )}
    </div>
  )
}
