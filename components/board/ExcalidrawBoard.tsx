'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, FileText } from 'lucide-react'
import { NCPanel } from './NCPanel'
import { RemoteCursors, type RemoteUser } from './RemoteCursors'
import { FullscreenButton } from './FullscreenButton'
import { generateUserColor, getInitials } from '@/lib/board-utils'
import { useProfile } from '@/lib/profile-context'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

interface Props {
  projectId: string
}

interface ViewState {
  zoom: number
  scrollX: number
  scrollY: number
}

function sanitiseAppState(appState: Any) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collaborators, openDialog, openPopup, contextMenu, toast, ...rest } = appState ?? {}
  return rest
}

function zoomValue(appStateZoom: Any): number {
  if (typeof appStateZoom === 'object' && appStateZoom !== null) return appStateZoom.value ?? 1
  return typeof appStateZoom === 'number' ? appStateZoom : 1
}

export function ExcalidrawBoard({ projectId }: Props) {
  const { currentProfile } = useProfile()

  const [initialData, setInitialData]      = useState<Any>(null)
  const [loaded, setLoaded]                = useState(false)
  const [selectedElementId, setSelectedId] = useState<string | null>(null)
  const [showNC, setShowNC]                = useState(false)
  const [excalidrawTheme, setExcalidrawTheme] = useState<'light' | 'dark'>('dark')
  const [onlineUsers, setOnlineUsers]      = useState<RemoteUser[]>([])
  const [viewState, setViewState]          = useState<ViewState>({ zoom: 1, scrollX: 0, scrollY: 0 })

  const apiRef           = useRef<Any>(null)
  const debouncer        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const broadcastDebouncer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef     = useRef<HTMLInputElement>(null)
  const containerRef     = useRef<HTMLDivElement>(null)
  const selectedIdRef    = useRef<string | null>(null)
  const channelRef       = useRef<Any>(null)
  const cursorThrottle   = useRef(0)
  const viewThrottle     = useRef(0)
  // Ref para evitar closure stale dentro dos handlers do canal
  const profileRef       = useRef(currentProfile)
  profileRef.current     = currentProfile

  // ── Sincronizar tema Excalidraw com o sistema BuildSmart ──────────────────

  useEffect(() => {
    function readTheme(): 'light' | 'dark' {
      return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    }
    setExcalidrawTheme(readTheme())
    const obs = new MutationObserver(() => setExcalidrawTheme(readTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
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

  // ── Supabase Realtime — Broadcast + Presence ──────────────────────────────

  useEffect(() => {
    if (!currentProfile) return

    const supabase = createClient()
    const channel  = supabase.channel(`board:${projectId}`)

    // Receber canvas de outros usuários
    channel.on('broadcast', { event: 'canvas-update' }, ({ payload }: Any) => {
      if (payload.userId === profileRef.current?.id) return
      apiRef.current?.updateScene({ elements: payload.elements })
    })

    // Atualizar lista de usuários online e seus cursores
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, RemoteUser[]>
      const users = Object.values(state).flat()
      setOnlineUsers(users.filter(u => u.userId !== profileRef.current?.id))
    })

    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED' && profileRef.current) {
        await channel.track({
          userId: profileRef.current.id,
          name:   profileRef.current.name,
          color:  generateUserColor(profileRef.current.id),
          cursor: { x: 0, y: 0 },
        })
      }
    })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [projectId, currentProfile?.id])

  // ── Scroll = zoom (intercepta wheel sem Ctrl e re-despacha com Ctrl) ──────

  useEffect(() => {
    if (!loaded) return
    const container = containerRef.current
    if (!container) return

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) return
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

  // ── onChange: seleção + broadcast (300ms) + persist (1500ms) + viewState ──

  const handleChange = useCallback(
    (elements: Any, appState: Any, files: Any) => {
      // Rastrear elemento selecionado
      const ids   = appState.selectedElementIds ?? {}
      const newId = Object.keys(ids).find(id => ids[id]) ?? null
      if (newId !== selectedIdRef.current) {
        selectedIdRef.current = newId
        setSelectedId(newId)
      }

      // Atualizar viewState para RemoteCursors — só quando os valores mudam (throttle 200ms)
      const now = Date.now()
      if (now - viewThrottle.current > 200) {
        viewThrottle.current = now
        const z = zoomValue(appState.zoom)
        const sx = appState.scrollX ?? 0
        const sy = appState.scrollY ?? 0
        setViewState(prev => {
          if (prev.zoom === z && prev.scrollX === sx && prev.scrollY === sy) return prev
          return { zoom: z, scrollX: sx, scrollY: sy }
        })
      }

      // Broadcast para outros (300ms debounce)
      if (broadcastDebouncer.current) clearTimeout(broadcastDebouncer.current)
      broadcastDebouncer.current = setTimeout(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'canvas-update',
          payload: { elements, userId: profileRef.current?.id },
        })
      }, 300)

      // Persistir no Supabase (1500ms debounce)
      if (debouncer.current) clearTimeout(debouncer.current)
      debouncer.current = setTimeout(async () => {
        const supabase = createClient()
        const { error } = await supabase
          .from('projetos')
          .update({ board_data: { elements, appState: sanitiseAppState(appState), files } })
          .eq('id', projectId)
        if (error) console.error('[Board] Falha ao salvar:', error.message, error.code)
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
    <div
      id="board-container"
      style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}
    >
      <input
        ref={fileInputRef} type="file" accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) importPdf(file)
        }}
      />

      {/* Canvas + overlay de cursores remotos */}
      <div ref={containerRef} style={{ flex: 1, height: '100%', minWidth: 0, position: 'relative' }}>
        <Excalidraw
          initialData={initialData ?? undefined}
          onChange={handleChange}
          excalidrawAPI={(api: Any) => {
            apiRef.current = api
            fetch('/buildsmart-library.excalidrawlib')
              .then(r => r.json())
              .then(data => {
                api.updateLibrary({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  libraryItems: data.library.map((elements: any[]) => ({
                    status: 'published', elements,
                  })),
                  action: 'merge',
                })
              })
              .catch(() => {})
          }}
          // Atualizar cursor no canal com throttle de 80ms
          onPointerUpdate={({ pointer }: Any) => {
            const now = Date.now()
            if (now - cursorThrottle.current < 80) return
            cursorThrottle.current = now
            const profile = profileRef.current
            if (!profile) return
            channelRef.current?.track({
              userId: profile.id,
              name:   profile.name,
              color:  generateUserColor(profile.id),
              cursor: { x: pointer.x, y: pointer.y },
            })
          }}
          theme={excalidrawTheme}
          langCode="pt-BR"
          renderTopRightUI={() => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Avatares dos usuários online */}
              {onlineUsers.map(user => (
                <div
                  key={user.userId}
                  title={user.name}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: user.color, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 11, fontWeight: 700,
                    border: '2px solid white', cursor: 'default',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  }}
                >
                  {getInitials(user.name)}
                </div>
              ))}

              {/* Botão PDF */}
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

              {/* Botão NCs */}
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

              {/* Tela cheia */}
              <FullscreenButton />
            </div>
          )}
        >
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
        </Excalidraw>

        {/* Cursores remotos sobrepostos */}
        <RemoteCursors onlineUsers={onlineUsers} viewState={viewState} />
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
