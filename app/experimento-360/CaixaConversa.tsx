'use client'

import { useEffect, useState } from 'react'
import type { EstadoOrbe } from './Orbe'

const LEGENDA: Record<EstadoOrbe, string | null> = {
  repouso: null,
  pensando: 'Pensando… (simulação local)',
  respondendo: 'Resposta simulada — nenhuma IA conectada nesta etapa.',
}

type Props = {
  estado: EstadoOrbe
  onEnviar: (texto: string) => void
}

export function CaixaConversa({ estado, onEnviar }: Props) {
  const [texto, setTexto] = useState('')
  const [recuoTeclado, setRecuoTeclado] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    // Um elemento `fixed` fica ancorado ao layout viewport, que o teclado
    // virtual não encolhe — sem isto o campo some atrás do teclado no mobile.
    // O visual viewport é quem encolhe, então a diferença é exatamente o
    // quanto precisamos subir.
    const medir = () => {
      const escondido = window.innerHeight - (vv.height + vv.offsetTop)
      setRecuoTeclado(Math.max(0, Math.round(escondido)))
    }
    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
    }
  }, [])

  const enviar = () => {
    const valor = texto.trim()
    if (!valor || estado !== 'repouso') return
    onEnviar(valor)
    setTexto('')
  }

  const legenda = LEGENDA[estado]

  return (
    <div
      data-sem-onda
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.75rem))] transition-transform duration-200 ease-out"
      style={{ transform: `translateY(-${recuoTeclado}px)` }}
    >
      <div className="pointer-events-auto relative w-full max-w-[680px] [touch-action:manipulation]">
        <div
          aria-hidden
          className="absolute -inset-x-8 -inset-y-7 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(94,190,255,0.18),transparent_100%)] blur-2xl"
        />

        <div
          aria-live="polite"
          className="flex min-h-6 items-end justify-center text-pretty px-3 pb-2 text-center text-[12.5px] leading-snug text-cyan-100/70 transition-opacity duration-300"
          style={{ opacity: legenda ? 1 : 0 }}
        >
          {legenda}
        </div>

        <div className="group relative flex items-center gap-2 rounded-full border border-cyan-200/20 bg-[linear-gradient(100deg,rgba(9,20,44,0.55),rgba(12,32,64,0.45)_55%,rgba(24,60,104,0.5))] pl-6 pr-2 shadow-[0_10px_40px_-20px_rgba(60,150,255,0.55)] backdrop-blur-2xl transition-colors duration-300 focus-within:border-cyan-200/40">
          {/* Reflexo mais evidente à direita, como na referência. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.09),transparent_42%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-70 shadow-[inset_-14px_0_26px_-20px_rgba(150,230,255,0.9),inset_0_0_0_1px_rgba(120,205,255,0.10)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-0 shadow-[0_0_0_1px_rgba(150,225,255,0.28),0_0_26px_-8px_rgba(90,190,255,0.45)] transition-opacity duration-300 group-focus-within:opacity-100"
          />

          <input
            value={texto}
            onChange={event => setTexto(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                enviar()
              }
            }}
            aria-label="Converse comigo"
            placeholder="Converse comigo"
            autoComplete="off"
            className="relative min-w-0 flex-1 bg-transparent py-[1.05rem] text-[15px] leading-none tracking-[0.01em] text-white/92 caret-cyan-200/80 outline-none placeholder:text-white/45 sm:text-base"
          />

          <button
            type="button"
            onClick={enviar}
            disabled={!texto.trim() || estado !== 'repouso'}
            aria-label="Enviar"
            className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[#1f6fe0] text-white shadow-[0_0_20px_-6px_rgba(70,160,255,0.8)] transition enabled:hover:bg-[#2a7ef2] disabled:cursor-default disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
          >
            <svg viewBox="0 0 24 24" className="size-[18px] -translate-x-px" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15.6 12 3.4 13.9z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
