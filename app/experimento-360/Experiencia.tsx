'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panorama360 } from './Panorama360'
import { Orbe, type EstadoOrbe, type OrbeHandle } from './Orbe'
import { CaixaConversa } from './CaixaConversa'
import { AtividadeHabilidade, type FaseAtividade } from './AtividadeHabilidade'
import {
  SAUDACAO,
  responderDemonstracao,
  ritmoDaPalavra,
  atividadePara,
  type Atividade,
  type Mensagem,
} from './conversa'

const MS_PENSANDO = 1100
const MS_CONCLUIDO = 1500
const CHAVE = 'experimento-360:movimento'

export function Experiencia() {
  const [movimento, setMovimento] = useState<boolean | null>(null)
  const [pedeReduzido, setPedeReduzido] = useState(false)
  const [estado, setEstado] = useState<EstadoOrbe>('repouso')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [atividade, setAtividade] = useState<Atividade | null>(null)
  const [faseAtividade, setFaseAtividade] = useState<FaseAtividade>('oculto')

  const orbeRef = useRef<OrbeHandle>(null)
  const movimentoRef = useRef<boolean | null>(null)
  const temporizadores = useRef<number[]>([])
  const proximoId = useRef(0)

  useEffect(() => { movimentoRef.current = movimento }, [movimento])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const aplicar = () => {
      setPedeReduzido(mq.matches)
      let escolha: string | null = null
      try { escolha = localStorage.getItem(CHAVE) } catch { escolha = null }
      setMovimento(escolha === null ? !mq.matches : escolha === '1')
    }
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [])

  const limpar = () => {
    temporizadores.current.forEach(clearTimeout)
    temporizadores.current = []
  }
  useEffect(() => limpar, [])

  // Revela a resposta palavra a palavra; cada palavra é um pulso no orbe. É o
  // fim da última palavra que devolve ao repouso e dispara `onFim`, então o
  // ciclo visual e o indicador de atividade seguem a apresentação do texto.
  const apresentar = useCallback((texto: string, onFim?: () => void) => {
    const id = proximoId.current++
    setMensagens(atuais => [...atuais, { id, autor: 'orbe', texto: '' }])

    if (!movimentoRef.current) {
      setMensagens(atuais => atuais.map(m => (m.id === id ? { ...m, texto } : m)))
      setEstado('repouso')
      onFim?.()
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
      if (i === 1) setEstado('respondendo')
      orbeRef.current?.pulsar(intensidade)
      if (i >= palavras.length) {
        temporizadores.current.push(window.setTimeout(() => {
          setEstado('repouso')
          onFim?.()
        }, 420))
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
    limpar()
    setMensagens(atuais => [...atuais, { id: proximoId.current++, autor: 'voce', texto }])
    // Indicador de atividade acompanha o mesmo ciclo da resposta.
    setAtividade(atividadePara(texto))
    setFaseAtividade('trabalhando')
    setEstado('pensando')
    temporizadores.current.push(
      window.setTimeout(() => {
        apresentar(responderDemonstracao(texto), () => {
          setFaseAtividade('concluido')
          temporizadores.current.push(
            window.setTimeout(() => setFaseAtividade('oculto'), MS_CONCLUIDO),
          )
        })
      }, MS_PENSANDO),
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
      <AtividadeHabilidade atividade={atividade} fase={faseAtividade} />
      <CaixaConversa estado={estado} mensagens={mensagens} onEnviar={enviar} />

      {pedeReduzido && (
        <div
          data-sem-onda
          className="fixed left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-center gap-2 rounded-full border border-white/12 bg-black/45 px-3 py-1.5 text-[12px] backdrop-blur-md"
        >
          <span className="hidden text-white/50 sm:inline">Movimento reduzido</span>
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
