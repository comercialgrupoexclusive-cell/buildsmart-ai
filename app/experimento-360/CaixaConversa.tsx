'use client'

import { useEffect, useState } from 'react'

export function CaixaConversa() {
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

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.75rem))] transition-transform duration-200 ease-out"
      style={{ transform: `translateY(-${recuoTeclado}px)` }}
    >
      <div className="pointer-events-auto relative w-full max-w-[680px] [touch-action:manipulation]">
        <div
          aria-hidden
          className="absolute -inset-x-8 -inset-y-7 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(122,162,255,0.17),transparent_100%)] blur-2xl"
        />
        <div className="group relative rounded-[26px] border border-white/12 bg-white/[0.055] shadow-[0_8px_34px_-18px_rgba(90,130,255,0.5)] backdrop-blur-2xl transition-colors duration-300 focus-within:border-white/25">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0.10),transparent_45%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[26px] opacity-0 shadow-[0_0_0_1px_rgba(165,195,255,0.20),0_0_24px_-10px_rgba(135,175,255,0.30)] transition-opacity duration-300 group-focus-within:opacity-100"
          />
          <input
            value={texto}
            onChange={event => setTexto(event.target.value)}
            aria-label="Converse comigo"
            placeholder="Converse comigo"
            autoComplete="off"
            className="relative w-full rounded-[26px] bg-transparent px-6 py-[1.15rem] text-[15px] leading-none tracking-[0.01em] text-white/92 caret-white/80 outline-none placeholder:text-white/45 sm:text-base"
          />
        </div>
      </div>
    </div>
  )
}
