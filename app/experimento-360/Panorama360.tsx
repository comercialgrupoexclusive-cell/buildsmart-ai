'use client'

import { useEffect, useRef, useState } from 'react'
import { Viewer, events as viewerEvents } from '@photo-sphere-viewer/core'
import { AutorotatePlugin } from '@photo-sphere-viewer/autorotate-plugin'
import '@photo-sphere-viewer/core/index.css'

// Ritmo da rotação: uma volta completa a cada N minutos. É o único número a
// mexer para acelerar ou desacelerar o ambiente.
const MINUTOS_POR_VOLTA = 10

const PANORAMA = '/experimento-360/fundo-tellus.png'

// O plugin dispara sozinho a primeira rotação assim que `autostartDelay`
// vence, e esse start() só aplica o giro num microtask — ou seja, um stop()
// síncrono logo depois não o alcança. Adiando o autostart para nunca, quem
// decide começar e parar passa a ser exclusivamente `sincronizar()`.
const NUNCA = Number.MAX_SAFE_INTEGER

export function Panorama360({ movimento }: { movimento: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pronto, setPronto] = useState(false)
  const movimentoRef = useRef(movimento)
  const sincronizarRef = useRef<() => void>(() => {})

  useEffect(() => {
    movimentoRef.current = movimento
    sincronizarRef.current()
  }, [movimento])

  useEffect(() => {
    if (!containerRef.current) return

    let viewer: Viewer | null = null
    let desmontado = false
    // Só gira quando faz sentido girar: o movimento está ligado e a aba está
    // visível (aba oculta continuaria consumindo GPU à toa).
    const deveGirar = () => movimentoRef.current && !document.hidden

    const sincronizar = () => {
      const plugin = viewer?.getPlugin<AutorotatePlugin>(AutorotatePlugin)
      if (!plugin) return
      if (deveGirar()) plugin.start()
      else plugin.stop()
    }

    // O Strict Mode monta e descarta o componente uma vez em dev; adiar a
    // criação do contexto WebGL para o próximo tick evita inicializar um
    // viewer que será jogado fora (mesmo cuidado do BuildSmartTourViewer).
    const timer = window.setTimeout(() => {
      if (desmontado || !containerRef.current) return

      viewer = new Viewer({
        container: containerRef.current,
        panorama: PANORAMA,
        navbar: false,
        defaultZoomLvl: 20,
        // Fundo ambiente, não tour: nenhuma interação de câmera pelo usuário,
        // assim tocar a tela (ou o campo de conversa) nunca move o céu.
        mousemove: false,
        mousewheel: false,
        keyboard: false,
        touchmoveTwoFingers: false,
        plugins: [
          AutorotatePlugin.withConfig({
            autorotateSpeed: `${1 / MINUTOS_POR_VOLTA}rpm`,
            autostartDelay: NUNCA,
            autostartOnIdle: false,
          }),
        ],
      })

      viewer.addEventListener(
        viewerEvents.ReadyEvent.type,
        () => {
          if (desmontado) return
          sincronizar()
          setPronto(true)
        },
        { once: true },
      )
    }, 0)

    sincronizarRef.current = sincronizar
    document.addEventListener('visibilitychange', sincronizar)

    return () => {
      desmontado = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', sincronizar)
      viewer?.destroy()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 transition-opacity duration-[1200ms] ease-out"
      style={{ opacity: pronto ? 1 : 0, pointerEvents: 'none' }}
    />
  )
}
