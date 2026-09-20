'use client'

import { useEffect, useRef, useState } from 'react'
import type { ItemDock } from './dock-model'

type Props = {
  itens: ItemDock[]
  ativo: string | null
  contexto: 'global' | 'processo'
  nomeProcesso?: string
  falando?: boolean
  onSelecionar: (id: string) => void
  onSairProcesso: () => void
}

// Menu principal do sistema. Fica ACIMA da barra da IA (que segue fixa embaixo)
// e usa o mesmo vidro do modal da IA. Pode ser arrastado para baixo para
// recolher, deixando só um puxador; puxando/clicando ele volta.
//
// Enquanto a IA fala, o Dock recolhe sozinho: o texto da resposta cresce
// palavra a palavra logo abaixo dele e, se o Dock ficasse aberto, seria
// empurrado para cima a cada palavra (tremida) e competiria com a fala. Some
// enquanto ela fala e volta ao terminar — respeitando um recolhimento manual.
export function Dock({ itens, ativo, contexto, nomeProcesso, falando = false, onSelecionar, onSairProcesso }: Props) {
  const [manual, setManual] = useState(false)   // recolhido pelo usuário (arraste)
  const [arraste, setArraste] = useState(0)      // deslocamento vertical durante o gesto
  const [arrastando, setArrastando] = useState(false)
  const inicioY = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const recolhido = manual || falando

  // Apoia o Dock logo acima da barra da IA usando a altura publicada por ela.
  const base = 'calc(var(--altura-ia, 4rem) + 0.6rem)'

  // Publica a altura do Dock numa variável CSS, como a barra da IA faz com
  // --altura-ia. A Camada usa as duas para reservar o rodapé inteiro (input +
  // Dock) e nunca sobrepor a navegação no mobile, onde o Dock quebra em mais
  // de uma linha. Re-mede a cada troca de estado (falando/recolhido) porque o
  // nó medido muda entre os ramos de render.
  useEffect(() => {
    const el = rootRef.current
    const aplicar = () => {
      const altura = el ? Math.round(el.offsetHeight) : 0
      document.documentElement.style.setProperty('--altura-dock', `${altura}px`)
    }
    aplicar()
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(aplicar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [falando, recolhido])

  const aoBaixar = (e: React.PointerEvent) => {
    inicioY.current = e.clientY
    setArrastando(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const aoMover = (e: React.PointerEvent) => {
    if (inicioY.current === null) return
    setArraste(Math.max(0, e.clientY - inicioY.current)) // só para baixo
  }
  const aoSoltar = () => {
    if (inicioY.current === null) return
    if (arraste > 38) setManual(true)
    inicioY.current = null
    setArrastando(false)
    setArraste(0)
  }

  // Enquanto a IA fala, some por completo (sem puxador) para não disputar com
  // a fala; o clique/arraste manual só reaparece quando ela termina.
  if (falando) {
    return (
      <div
        ref={rootRef}
        data-sem-onda
        aria-hidden
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 opacity-0 transition-opacity duration-300"
        style={{ bottom: base }}
      />
    )
  }

  if (recolhido) {
    return (
      <div
        ref={rootRef}
        data-sem-onda
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3"
        style={{ bottom: base }}
      >
        <button
          type="button"
          onClick={() => setManual(false)}
          aria-label="Mostrar menu"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(100deg,rgba(10,18,38,0.66),rgba(14,28,54,0.58))] px-4 py-1.5 text-[12px] text-cyan-100/80 shadow-[0_10px_30px_-16px_rgba(60,150,255,0.6)] backdrop-blur-2xl outline-none transition hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 15l6-6 6 6" />
          </svg>
          Menu
        </button>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      data-sem-onda
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3"
      style={{
        bottom: base,
        transform: `translateY(${arraste}px)`,
        transition: arrastando ? 'none' : 'transform .25s ease',
      }}
    >
      <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-col items-center rounded-[26px] border border-white/12 bg-[linear-gradient(100deg,rgba(10,18,38,0.66),rgba(14,28,54,0.58))] p-1 shadow-[0_14px_44px_-22px_rgba(60,150,255,0.6)] backdrop-blur-2xl">
        {/* Puxador: arraste para baixo para recolher. */}
        <div
          onPointerDown={aoBaixar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={aoSoltar}
          className="flex h-4 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          role="button"
          aria-label="Arraste para baixo para recolher o menu"
        >
          <span className="h-1 w-9 rounded-full bg-white/25" />
        </div>

        <nav
          aria-label="Menu principal"
          className="flex max-w-full items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
        >
          {contexto === 'processo' && (
            <button
              type="button"
              onClick={onSairProcesso}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-cyan-100/80 outline-none transition hover:bg-white/5 focus-visible:bg-white/5"
              title="Voltar ao menu global"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span className="max-w-[140px] truncate">{nomeProcesso}</span>
              <span aria-hidden className="mx-0.5 h-5 w-px bg-white/12" />
            </button>
          )}

          {itens.map(item => {
            const selecionado = ativo === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelecionar(item.id)}
                aria-current={selecionado ? 'page' : undefined}
                className={
                  'relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium outline-none transition ' +
                  (selecionado
                    ? 'bg-cyan-300/15 text-white shadow-[inset_0_0_0_1px_rgba(120,205,255,0.35),0_0_18px_-6px_rgba(90,190,255,0.7)]'
                    : 'text-white/60 hover:text-white/90 hover:bg-white/5 focus-visible:bg-white/5')
                }
              >
                {item.rotulo}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
