'use client'

export interface RemoteUser {
  userId: string
  name: string
  color: string
  cursor: { x: number; y: number }
}

interface ViewState {
  zoom: number
  scrollX: number
  scrollY: number
}

interface Props {
  onlineUsers: RemoteUser[]
  viewState: ViewState
}

// Converte coordenada do canvas Excalidraw → coordenada de tela.
// Fórmula: screen = (canvas + scroll) * zoom
function toScreen(canvas: number, scroll: number, zoom: number) {
  return canvas * zoom + scroll * zoom
}

export function RemoteCursors({ onlineUsers, viewState }: Props) {
  if (onlineUsers.length === 0) return null

  const { zoom, scrollX, scrollY } = viewState

  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', zIndex: 10, overflow: 'hidden',
      }}
    >
      {onlineUsers.map(user => {
        const sx = toScreen(user.cursor.x, scrollX, zoom)
        const sy = toScreen(user.cursor.y, scrollY, zoom)

        return (
          <div
            key={user.userId}
            style={{
              position: 'absolute',
              left: sx, top: sy,
              transition: 'left 80ms linear, top 80ms linear',
              pointerEvents: 'none',
            }}
          >
            {/* SVG cursor arrow */}
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
              <path
                d="M1 1L1 16L4.5 12.5L7 18.5L9 18L6.5 12L12 12L1 1Z"
                fill={user.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* Nome do usuário */}
            <div style={{
              background: user.color,
              color: 'white',
              fontSize: 11, fontWeight: 600,
              padding: '2px 7px', borderRadius: 4,
              marginTop: 1, marginLeft: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              userSelect: 'none',
            }}>
              {user.name.split(/\s+/)[0]}
            </div>
          </div>
        )
      })}
    </div>
  )
}
