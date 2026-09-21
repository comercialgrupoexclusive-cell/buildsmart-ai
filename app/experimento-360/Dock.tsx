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
  const pilulRef = useRef<HTMLDivElement>(null)

  // Publica a altura do Dock para que a Camada possa se posicionar sem sobreposição.
  useEffect(() => {
    const el = pilulRef.current
    if (!el) return
    const publicar = () =>
      document.documentElement.style.setProperty('--altura-dock', `${Math.round(el.offsetHeight)}px`)
    publicar()
    const ro = new ResizeObserver(publicar)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const recolhido = manual || falando

  // Apoia o Dock logo acima da barra da IA usando a altura publicada por ela.
  const base = 'calc(var(--altura-ia, 4rem) + 0.6rem)'

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
      data-sem-onda
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3"
      style={{
        bottom: base,
        transform: `translateY(${arraste}px)`,
        transition: arrastando ? 'none' : 'transform .25s ease',
      }}
    >
      <div ref={pilulRef} className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-col items-center rounded-[26px] border border-white/12 bg-[linear-gradient(100deg,rgba(10,18,38,0.66),rgba(14,28,54,0.58))] p-1 shadow-[0_14px_44px_-22px_rgba(60,150,255,0.6)] backdrop-blur-2xl">
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
          className="flex max-w-full items-center gap-1 overflow-x-auto pl-1 pr-6 pb-1 [scrollbar-width:none]"
        >
          {contexto === 'processo' && (
            // Indicador "você está aqui", visualmente distinto dos itens de
            // navegação abaixo (tinta de destaque própria) — não é mais um
            // botão de menu igual aos outros, é o contexto do Processo aberto.
            <button
              type="button"
              onClick={onSairProcesso}
              className="mr-1 flex shrink-0 items-center gap-1.5 rounded-full bg-cyan-300/[0.08] py-1.5 pl-2.5 pr-3 text-[12px] font-medium text-cyan-100/90 outline-none shadow-[inset_0_0_0_1px_rgba(120,205,255,0.2)] transition hover:bg-cyan-300/[0.14] focus-visible:bg-cyan-300/[0.14] sm:py-2 sm:text-[12.5px]"
              title="Voltar ao menu global"
            >
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              <span className="max-w-[120px] truncate sm:max-w-[160px]">{nomeProcesso}</span>
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
                  'relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] outline-none transition sm:px-4 sm:py-2 sm:text-[13px] ' +
                  (selecionado
                    ? 'bg-cyan-300/20 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(120,205,255,0.45),0_0_18px_-6px_rgba(90,190,255,0.8)]'
                    : 'font-medium text-white/50 hover:bg-white/5 hover:text-white/85 focus-visible:bg-white/5')
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
