'use client'

import { useEffect, useRef, useState } from 'react'
import type { EstadoOrbe } from './Orbe'
import type { Mensagem } from './conversa'

type Props = {
  estado: EstadoOrbe
  mensagens: Mensagem[]
  onEnviar: (texto: string) => void
}

function Balao({ m }: { m: Mensagem }) {
  const meu = m.autor === 'voce'
  return (
    <div className={meu ? 'flex justify-end' : 'flex justify-start'}>
      <p
        className={
          meu
            ? 'max-w-[85%] rounded-2xl rounded-br-md border border-cyan-200/15 bg-cyan-300/10 px-3.5 py-2 text-[14px] leading-relaxed text-white/88'
            : 'max-w-[90%] rounded-2xl rounded-bl-md border border-white/8 bg-white/[0.05] px-3.5 py-2 text-[14px] leading-relaxed text-cyan-50/92'
        }
      >
        {m.texto}
      </p>
    </div>
  )
}

export function CaixaConversa({ estado, mensagens, onEnviar }: Props) {
  const [texto, setTexto] = useState('')
  const [recuoTeclado, setRecuoTeclado] = useState(0)
  const [expandido, setExpandido] = useState(false)
  const [aviso, setAviso] = useState('')
  const avisoTimer = useRef<number | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const processando = estado !== 'repouso'

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    // Um elemento `fixed` fica ancorado ao layout viewport, que o teclado
    // virtual não encolhe — sem isto o campo some atrás do teclado no mobile.
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

  const textoUltima = mensagens[mensagens.length - 1]?.texto
  useEffect(() => {
    if (!expandido) return
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [expandido, mensagens.length, textoUltima])

  useEffect(() => () => { if (avisoTimer.current) clearTimeout(avisoTimer.current) }, [])

  const podeEnviar = texto.trim().length > 0 && estado === 'repouso'

  const enviar = () => {
    if (!podeEnviar) return
    onEnviar(texto.trim())
    setTexto('')
  }

  const indisponivel = (o: string) => {
    setAviso(`${o} fica disponível numa próxima etapa.`)
    if (avisoTimer.current) clearTimeout(avisoTimer.current)
    avisoTimer.current = window.setTimeout(() => setAviso(''), 2600)
  }

  // Recolhido: só a última troca (última do usuário + última do orbe).
  const ultimoVoce = [...mensagens].reverse().find(m => m.autor === 'voce')
  const ultimoOrbe = [...mensagens].reverse().find(m => m.autor === 'orbe')
  const compacto = [ultimoVoce, ultimoOrbe].filter(Boolean) as Mensagem[]
  compacto.sort((a, b) => a.id - b.id)
  const temHistorico = mensagens.length > compacto.length

  return (
    <div
      data-sem-onda
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.75rem))] transition-transform duration-200 ease-out"
      style={{ transform: `translateY(-${recuoTeclado}px)` }}
    >
      <div className="pointer-events-auto relative w-full max-w-[680px] [touch-action:manipulation]">
        <div
          aria-hidden
          className="absolute -inset-x-8 -inset-y-6 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(94,190,255,0.16),transparent_100%)] blur-2xl"
        />

        {mensagens.length > 0 && (
          <div className="mb-2.5">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="rounded-full border border-cyan-200/15 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-cyan-100/55 backdrop-blur-md">
                Demonstração
              </span>
              {(temHistorico || expandido) && (
                <button
                  type="button"
                  onClick={() => setExpandido(v => !v)}
                  className="rounded-full px-2 py-0.5 text-[11px] text-cyan-100/70 underline-offset-2 outline-none hover:underline focus-visible:underline"
                >
                  {expandido ? 'Recolher' : `Ver conversa (${mensagens.length})`}
                </button>
              )}
            </div>

            {expandido ? (
              <div
                ref={listaRef}
                className="max-h-[42vh] overflow-y-auto overscroll-contain rounded-[22px] border border-white/8 bg-black/28 px-4 py-3.5 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,transparent,black_14px)]"
              >
                <div className="flex flex-col gap-2.5">
                  {mensagens.map(m => <Balao key={m.id} m={m} />)}
                </div>
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/8 bg-black/22 px-4 py-3 backdrop-blur-xl">
                <div className="flex flex-col gap-2.5">
                  {compacto.map(m => <Balao key={m.id} m={m} />)}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          className="flex h-4 items-center justify-center overflow-hidden text-center text-[11.5px] text-cyan-100/60 transition-opacity duration-300"
          style={{ opacity: aviso ? 1 : 0 }}
          aria-live="polite"
        >
          {aviso}
        </div>

        {/* Cápsula do input com borda em degradê e luz percorrendo ao processar. */}
        <div className="relative overflow-hidden rounded-full">
          <div className="pointer-events-none absolute -inset-[1.5px] rounded-full" hidden={!processando}>
            <div
              className="absolute -inset-[55%]"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0deg, transparent 290deg, rgba(150,120,255,0.55) 322deg, rgba(120,220,255,0.95) 350deg, transparent 360deg)',
                animation: 'orbe-borda 2.2s linear infinite',
              }}
            />
          </div>

          <div className="group relative m-[1.5px] flex items-center gap-1 rounded-full border border-transparent bg-[linear-gradient(100deg,rgba(9,20,44,0.62),rgba(12,32,64,0.5)_55%,rgba(24,60,104,0.55))] pl-2 pr-2 shadow-[0_10px_40px_-20px_rgba(60,150,255,0.55)] backdrop-blur-2xl [background-clip:padding-box]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_42%)]"
            />
            {/* Borda em degradê azul/ciano, mais evidente à direita. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full opacity-80 shadow-[inset_-14px_0_26px_-20px_rgba(150,230,255,0.9),inset_0_0_0_1px_rgba(120,180,255,0.14)]"
            />

            <button
              type="button"
              onClick={() => indisponivel('Anexar arquivo')}
              aria-label="Anexar arquivo (indisponível nesta demonstração)"
              className="relative grid size-9 shrink-0 place-items-center rounded-full text-white/45 outline-none transition hover:text-white/70 focus-visible:text-white/80"
            >
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3" />
              </svg>
            </button>

            <input
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  enviar()
                }
              }}
              aria-label="Converse comigo"
              placeholder="Converse comigo"
              autoComplete="off"
              className="relative min-w-0 flex-1 bg-transparent py-[1.05rem] text-[15px] leading-none tracking-[0.01em] text-white/92 caret-cyan-200/80 outline-none placeholder:text-white/45 sm:text-base"
            />

            <span aria-hidden className="relative h-6 w-px shrink-0 bg-white/12" />

            <button
              type="button"
              onClick={() => indisponivel('O microfone')}
              aria-label="Falar (indisponível nesta demonstração)"
              className="relative grid size-9 shrink-0 place-items-center rounded-full text-white/45 outline-none transition hover:text-white/70 focus-visible:text-white/80"
            >
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>

            <button
              type="button"
              onClick={enviar}
              disabled={!podeEnviar}
              aria-label="Enviar"
              className="relative grid size-11 shrink-0 place-items-center rounded-full bg-[#1f6fe0] text-white shadow-[0_0_20px_-6px_rgba(70,160,255,0.85)] transition enabled:hover:bg-[#2a7ef2] disabled:cursor-default disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
            >
              <svg viewBox="0 0 24 24" className="size-[18px] -translate-x-px" fill="currentColor" aria-hidden>
                <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15.6 12 3.4 13.9z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
