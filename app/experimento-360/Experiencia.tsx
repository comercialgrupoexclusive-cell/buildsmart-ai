'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panorama360 } from './Panorama360'
import { Orbe, type EstadoOrbe, type OrbeHandle } from './Orbe'
import { CaixaConversa } from './CaixaConversa'
import { SAUDACAO, responderDemonstracao, ritmoDaPalavra, type Mensagem } from './conversa'

const MS_PENSANDO = 1100
const CHAVE = 'experimento-360:movimento'

export function Experiencia() {
  // `null` enquanto a preferência do sistema não foi lida. O orbe não desenha
  // nada nesse intervalo, então nunca aparece um quadro estático dele.
  const [movimento, setMovimento] = useState<boolean | null>(null)
  const [pedeReduzido, setPedeReduzido] = useState(false)
  const [estado, setEstado] = useState<EstadoOrbe>('repouso')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])

  const orbeRef = useRef<OrbeHandle>(null)
  const movimentoRef = useRef<boolean | null>(null)
  const temporizadores = useRef<number[]>([])
  const proximoId = useRef(0)

  useEffect(() => { movimentoRef.current = movimento }, [movimento])

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

  const limparTemporizadores = () => {
    temporizadores.current.forEach(clearTimeout)
    temporizadores.current = []
  }
  useEffect(() => limparTemporizadores, [])

  // Revela a resposta palavra a palavra. Cada palavra é um pulso no orbe, e é
  // o fim da última que devolve a cena ao repouso — o ciclo visual é dirigido
  // pela apresentação do texto, não por um cronômetro paralelo.
  const apresentar = useCallback((texto: string) => {
    const id = proximoId.current++
    setMensagens(atuais => [...atuais, { id, autor: 'orbe', texto: '' }])

    if (!movimentoRef.current) {
      setMensagens(atuais => atuais.map(m => (m.id === id ? { ...m, texto } : m)))
      setEstado('repouso')
      return
    }

    const palavras = texto.split(' ')
    let i = 0
    const revelar = () => {
      const palavra = palavras[i]
      const ate = palavras.slice(0, i + 1).join(' ')
      i++
      setMensagens(atuais => atuais.map(m => (m.id === id ? { ...m, texto: ate } : m)))
      const { atraso, intensidade } = ritmoDaPalavra(palavra)
      // "Respondendo" começa exatamente quando a primeira palavra aparece.
      if (i === 1) setEstado('respondendo')
      orbeRef.current?.pulsar(intensidade)
      if (i >= palavras.length) {
        temporizadores.current.push(window.setTimeout(() => setEstado('repouso'), 420))
        return
      }
      temporizadores.current.push(window.setTimeout(revelar, atraso))
    }
    revelar()
  }, [])

  const saudou = useRef(false)
  const aoOrbePronto = useCallback(() => {
    if (saudou.current) return
    saudou.current = true
    apresentar(SAUDACAO)
  }, [apresentar])

  const enviar = (texto: string) => {
    limparTemporizadores()
    setMensagens(atuais => [...atuais, { id: proximoId.current++, autor: 'voce', texto }])
    setEstado('pensando')
    temporizadores.current.push(
      window.setTimeout(() => apresentar(responderDemonstracao(texto)), MS_PENSANDO),
    )
  }

  const alternarMovimento = () => {
    setMovimento(atual => {
      const proximo = !atual
      try { localStorage.setItem(CHAVE, proximo ? '1' : '0') } catch { /* modo privado */ }
      return proximo
    })
  }

  return (
    <>
      <Panorama360 movimento={movimento === true} />
      <Orbe ref={orbeRef} estado={estado} movimento={movimento} onPronto={aoOrbePronto} />
      <CaixaConversa estado={estado} mensagens={mensagens} onEnviar={enviar} />

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
