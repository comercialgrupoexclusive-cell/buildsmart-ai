'use client'

import { useEffect, useRef, useState } from 'react'
import { Panorama360 } from './Panorama360'
import { Orbe, type EstadoOrbe } from './Orbe'
import { CaixaConversa } from './CaixaConversa'

const MS_PENSANDO = 1800
const MS_RESPONDENDO = 3600
const CHAVE = 'experimento-360:movimento'

export function Experiencia() {
  // A cena começa parada até sabermos a preferência do sistema, senão o
  // primeiro quadro já animaria para quem pediu movimento reduzido.
  const [movimento, setMovimento] = useState(false)
  const [pedeReduzido, setPedeReduzido] = useState(false)
  const [estado, setEstado] = useState<EstadoOrbe>('repouso')
  const temporizadores = useRef<number[]>([])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const aplicar = () => {
      setPedeReduzido(mq.matches)
      // Escolha manual anterior vence a do sistema: quem já ligou a animação
      // nesta página não deveria ter de ligar de novo a cada visita.
      let escolha: string | null = null
      try { escolha = localStorage.getItem(CHAVE) } catch { escolha = null }
      setMovimento(escolha === null ? !mq.matches : escolha === '1')
    }
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [])

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), [])

  const alternarMovimento = () => {
    setMovimento(atual => {
      const proximo = !atual
      try { localStorage.setItem(CHAVE, proximo ? '1' : '0') } catch { /* modo privado */ }
      return proximo
    })
  }

  const enviar = () => {
    temporizadores.current.forEach(clearTimeout)
    setEstado('pensando')
    temporizadores.current = [
      window.setTimeout(() => setEstado('respondendo'), MS_PENSANDO),
      window.setTimeout(() => setEstado('repouso'), MS_PENSANDO + MS_RESPONDENDO),
    ]
  }

  return (
    <>
      <Panorama360 movimento={movimento} />
      <Orbe estado={estado} movimento={movimento} />
      <CaixaConversa estado={estado} onEnviar={enviar} />

      {pedeReduzido && (
        <div
          data-sem-onda
          className="fixed right-3 top-3 z-20 flex items-center gap-2 rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-[12px] backdrop-blur-md"
        >
          <span className="hidden text-white/50 sm:inline">
            Seu sistema pede movimento reduzido
          </span>
          <button
            type="button"
            onClick={alternarMovimento}
            className="rounded-full text-cyan-200/90 underline-offset-2 outline-none hover:underline focus-visible:underline"
          >
            {movimento ? 'Pausar animação' : 'Ativar animação'}
          </button>
        </div>
      )}
    </>
  )
}
