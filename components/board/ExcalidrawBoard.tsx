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
  projectId?: string
  obraId?: string
  portalToken?: string
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

export function ExcalidrawBoard({ projectId, obraId, portalToken }: Props) {
  const { currentProfile } = useProfile()

  const [initialData, setInitialData]      = useState<Any>(null)
  const [loaded, setLoaded]                = useState(false)
  const [selectedElementId, setSelectedId] = useState<string | null>(null)
  const [showNC, setShowNC]                = useState(false)
  const [excalidrawTheme, setExcalidrawTheme] = useState<'light' | 'dark'>('dark')
  const [onlineUsers, setOnlineUsers]      = useState<RemoteUser[]>([])
  const [boardId, setBoardId]              = useState<string | null>(null)
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
  // IDs de arquivos já persistidos na tabela board_files (evita re-upload)
  const persistedFilesRef = useRef<Set<string>>(new Set())
  // Ref para evitar closure stale dentro dos handlers do canal
  const profileRef       = useRef(currentProfile)

  useEffect(() => { profileRef.current = currentProfile }, [currentProfile])

  // ── Sincronizar tema Excalidraw com o sistema BuildSmart ──────────────────

  useEffect(() => {
    function readTheme(): 'light' | 'dark' {
      return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    }
    const timer = window.setTimeout(() => setExcalidrawTheme(readTheme()), 0)
    const obs = new MutationObserver(() => setExcalidrawTheme(readTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { window.clearTimeout(timer); obs.disconnect() }
  }, [])

  // ── Carregar board_data + board_files ────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        let document: Any = null
        let fileRows: Any[] = []
        if (projectId) {
          const [{ data: proj }, { data: rows }] = await Promise.all([
            supabase.from('projetos').select('board_data').eq('id', projectId).single(),
            supabase.from('board_files').select('id, mime_type, data_url, created').eq('projeto_id', projectId),
          ])
          document = proj?.board_data
          fileRows = rows ?? []
        } else if (portalToken) {
          const response = await fetch(`/api/portal/${portalToken}/canvas`, { cache: 'no-store' })
          if (!response.ok) throw new Error('Nao foi possivel abrir o Board.')
          const payload = await response.json()
          setBoardId(payload.boardId)
          document = payload.document
          fileRows = (payload.files ?? []).map((file: Any) => ({
            id: file.id, mime_type: file.mimeType, data_url: file.dataURL, created: file.created,
          }))
        } else if (obraId) {
          let { data: board } = await supabase.from('boards').select('id,document_data')
            .eq('obra_id', obraId).eq('scope', 'portal').order('created_at').limit(1).maybeSingle()
          if (!board) {
            const created = await supabase.from('boards').insert({
              obra_id: obraId, name: 'Board do cliente', scope: 'portal', visibility: 'client',
            }).select('id,document_data').single()
            board = created.data
          }
          if (!board) throw new Error('Nao foi possivel criar o Board da obra.')
          setBoardId(board.id)
          document = board.document_data
          const { data: rows } = await supabase.from('board_files')
            .select('id, mime_type, data_url, created').eq('board_id', board.id)
          fileRows = rows ?? []
        }

        // Reconstrói o mapa de arquivos e registra IDs já persistidos
        const filesMap: Any = {}
        for (const row of fileRows ?? []) {
          filesMap[row.id] = {
            id: row.id,
            mimeType: row.mime_type,
            dataURL: row.data_url,
            created: row.created ?? Date.now(),
            lastRetrieved: Date.now(),
          }
          persistedFilesRef.current.add(row.id)
        }

        const handTool = { type: 'hand', locked: false, lastActiveTool: null, customType: null }
        if (document) {
          setInitialData({
            ...document,
            files: filesMap,
            appState: { ...(document.appState ?? {}), activeTool: handTool },
          })
        } else {
          setInitialData({ files: filesMap, appState: { activeTool: handTool } })
        }
      } finally {
        setLoaded(true)
      }
    }
    load()
  }, [projectId, obraId, portalToken])

  // ── Supabase Realtime — Broadcast + Presence ──────────────────────────────

  useEffect(() => {
    if (!currentProfile) return

    const channelKey = boardId || projectId
    if (!channelKey) return
    const supabase = createClient()
    const channel  = supabase.channel(`board:${channelKey}`)

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
  }, [boardId, projectId, currentProfile])

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

  const persistScene = useCallback(async (elements: Any, appState: Any, files: Any) => {
    const document = { elements, appState: sanitiseAppState(appState) }
    const newEntries = Object.entries(files as Record<string, Any>)
      .filter(([id]) => !persistedFilesRef.current.has(id))
    if (portalToken) {
      const response = await fetch(`/api/portal/${portalToken}/canvas`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document, files: newEntries.map(([id, file]) => ({ id, ...file })) }),
      })
      if (!response.ok) throw new Error('Falha ao salvar o Board do cliente.')
    } else {
      const supabase = createClient()
      if (projectId) {
        const { error } = await supabase.from('projetos').update({ board_data: document }).eq('id', projectId)
        if (error) throw error
      } else if (boardId) {
        const { error } = await supabase.from('boards').update({ document_data: document }).eq('id', boardId)
        if (error) throw error
      }
      if (newEntries.length > 0) {
        const rows = newEntries.map(([id, file]) => ({
          id, projeto_id: projectId || null, board_id: boardId,
          mime_type: file.mimeType ?? 'image/png', data_url: file.dataURL, created: file.created ?? Date.now(),
        }))
        const { error } = await supabase.from('board_files')
          .upsert(rows, { onConflict: projectId ? 'projeto_id,id' : 'board_id,id' })
        if (error) throw error
      }
    }
    newEntries.forEach(([id]) => persistedFilesRef.current.add(id))
  }, [boardId, portalToken, projectId])

  const handleChange = useCallback(
    (elements: Any, appState: Any, files: Any) => {
      // Rastrear elemento selecionado
      const ids   = appState.selectedElementIds ?? {}
      const newId = Object.keys(ids).find(id => ids[id]) ?? null
      if (newId !== selectedIdRef.current) {
        selectedIdRef.current = newId
        setSelectedId(newId)
        if (projectId && newId) setShowNC(true)
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
      debouncer.current = setTimeout(() => {
        persistScene(elements, appState, files).catch(error =>
          console.error('[Board] Falha ao salvar:', error instanceof Error ? error.message : error))
      }, 1500)
    },
    [persistScene, projectId],
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
    const allElements = [...existingEls, ...newEls]
    api.updateScene({ elements: allElements })

    // Salva imediatamente — não espera o debounce de 1500ms
    if (debouncer.current) {
      clearTimeout(debouncer.current)
      debouncer.current = null
    }
    const supabase = createClient()
    const appState = api.getAppState()
    if (!projectId) {
      await persistScene(allElements, appState, Object.fromEntries(newFiles.map(file => [file.id, file])))
      return
    }
    await supabase
      .from('projetos')
      .update({ board_data: { elements: allElements, appState: sanitiseAppState(appState) } })
      .eq('id', projectId)
    const fileRows = newFiles.map((f: Any) => ({
      id: f.id, projeto_id: projectId,
      mime_type: f.mimeType, data_url: f.dataURL, created: f.created,
    }))
    const { error: fe } = await supabase
      .from('board_files')
      .upsert(fileRows, { onConflict: 'id,projeto_id' })
    if (!fe) newFiles.forEach((f: Any) => persistedFilesRef.current.add(f.id))
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
      className="buildsmart-board-shell"
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
            <div className="board-topbar-ui" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Avatares dos usuários online */}
              {onlineUsers.map(user => (
                <div
                  key={user.userId}
                  title={user.name}
                  className="board-avatar"
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
                className="board-topbtn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: '#e8e6ff', border: '1px solid #c4bfff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#4e46dc',
                }}
              >
                <FileText size={14} /> <span className="board-btn-label">PDF</span>
              </button>

              {/* Botão NCs */}
              {projectId && <button
                title="Painel de não-conformidades"
                onClick={() => setShowNC(v => !v)}
                className="board-topbtn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: showNC ? '#fef2f2' : '#fff7ed',
                  border: `1px solid ${showNC ? '#fca5a5' : '#fed7aa'}`,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  color: showNC ? '#dc2626' : '#ea580c',
                }}
              >
                <AlertTriangle size={14} /> <span className="board-btn-label">NCs</span>
              </button>}

              {/* Tela cheia */}
              <FullscreenButton />
            </div>
          )}
        >
          <MainMenu>
            {/* Ações custom — acessíveis também pelo menu (essencial no mobile) */}
            <MainMenu.Item onSelect={() => fileInputRef.current?.click()} icon={<FileText size={16} />}>
              Importar PDF
            </MainMenu.Item>
            {projectId && <MainMenu.Item onSelect={() => setShowNC(v => !v)} icon={<AlertTriangle size={16} />}>
              Não-conformidades
            </MainMenu.Item>}
            <MainMenu.Separator />
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

      {/* Painel lateral de NCs — overlay para não cobrir a biblioteca */}
      {showNC && projectId && (
        <div className="board-nc-panel" style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: 300, zIndex: 30,
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.15)',
        }}>
          <NCPanel
            api={apiRef}
            projectId={projectId}
            selectedElementId={selectedElementId}
            onClose={() => setShowNC(false)}
          />
        </div>
      )}
      <style jsx global>{`
        @media (max-width: 639px) {
          .buildsmart-board-shell .excalidraw .FixedSideContainer_side_top {
            left: 0;
            right: 0;
            max-width: 100%;
            overflow: hidden;
          }
          .buildsmart-board-shell .excalidraw .App-toolbar,
          .buildsmart-board-shell .excalidraw .App-toolbar-content,
          .buildsmart-board-shell .excalidraw .FixedSideContainer_side_top .Island {
            max-width: calc(100vw - 24px);
            overflow-x: auto;
            overflow-y: hidden;
            justify-content: flex-start;
            scrollbar-width: none;
          }
          .buildsmart-board-shell .excalidraw .App-toolbar::-webkit-scrollbar,
          .buildsmart-board-shell .excalidraw .App-toolbar-content::-webkit-scrollbar,
          .buildsmart-board-shell .excalidraw .FixedSideContainer_side_top .Island::-webkit-scrollbar {
            display: none;
          }
          .buildsmart-board-shell .excalidraw .ToolIcon__icon {
            min-width: 34px;
          }
          /* Impede a barra superior de estourar a largura do container:
             força min-width:0 na cadeia p/ o toolbar central encolher e rolar */
          .buildsmart-board-shell .excalidraw .FixedSideContainer_side_top > *,
          .buildsmart-board-shell .excalidraw .App-toolbar-container,
          .buildsmart-board-shell .excalidraw .App-toolbar-container > * {
            min-width: 0 !important;
            max-width: 100% !important;
            box-sizing: border-box;
          }
          /* Ilha de ferramentas mobile: largura fixa = viewport, rola internamente */
          .buildsmart-board-shell .excalidraw .App-toolbar.App-toolbar--mobile {
            width: calc(100vw - 28px) !important;
            max-width: calc(100vw - 28px) !important;
            flex: 0 0 auto !important;
            overflow-x: auto !important;
          }
          /* No mobile, PDF/NCs ficam no menu hambúrguer e a UI custom do topo
             é ocultada — libera a barra de ferramentas para rolar sem estourar */
          .buildsmart-board-shell .board-topbar-ui {
            display: none !important;
          }
          .buildsmart-board-shell .board-avatar {
            width: 24px !important;
            height: 24px !important;
            font-size: 10px !important;
          }
          /* Painel de NCs ocupa a tela toda no mobile em vez de faixa lateral apertada */
          .buildsmart-board-shell .board-nc-panel {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            z-index: 40 !important;
          }
        }
      `}</style>
    </div>
  )
}
