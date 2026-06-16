'use client'

import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  function toggle() {
    if (!document.fullscreenElement) {
      document.getElementById('board-container')?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 6, border: 'none',
        background: 'transparent', cursor: 'pointer', color: 'inherit',
      }}
    >
      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  )
}
