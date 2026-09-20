'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panorama360 } from './Panorama360'
import { Orbe, type EstadoOrbe, type OrbeHandle } from './Orbe'
import { CaixaConversa } from './CaixaConversa'
import { AtividadeHabilidade, type FaseAtividade } from './AtividadeHabilidade'
import { CampoDeTrabalho, type FaseCampo } from './CampoDeTrabalho'
import { PlanoDeTrabalho } from './PlanoDeTrabalho'
import { SAUDACAO, ritmoDaPalavra, type Atividade, type Mensagem } from './conversa'
import { createClient } from '@/lib/supabase/client'
import { criarEntradaTexto } from '@/lib/processo/caixa-entrada'
import { useProfile } from '@/lib/profile-context'

const MS_PENSANDO = 900
const MS_CONCLUIDO = 1500
const CHAVE = 'experimento-360:movimento'

// Laboratório da Fase 2 (Mundo → Campo de Trabalho → Plano de Trabalho):
// Processo e Prospecção reais, fixos por enquanto — nada de seletor.
const PROCESSO_ID = 'ddb11993-d703-490b-b5ff-f0cba47e398f'
const PROSPECCAO_ID = 'a85d357c-de61-4a7c-8791-d7e3c50b614c'

const TERMOS_PESQUISA = ['pesquis', 'imov', 'comparav', 'mercado', 'semelhant', 'gravata']

function semAcento(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function pedePesquisa(texto: string): boolean {
  const alvo = semAcento(texto)
  return TERMOS_PESQUISA.some(termo => alvo.includes(termo))
}

const ATIVIDADE_PESQUISA: Atividade = { agente: 'Laboratório Investidor', habilidade: 'Pesquisa de comparáveis' }
const ATIVIDADE_REGISTRO: Atividade = { agente: 'Motor de Processo', habilidade: 'Registrando na Caixa de Entrada' }

export function ExperienciaMundo() {
  const { currentProfile } = useProfile()
  const [movimento, setMovimento] = useState<boolean | null>(null)
  const [pedeReduzido, setPedeReduzido] = useState(false)
  const [estado, setEstado] = useState<EstadoOrbe>('repouso')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [atividade, setAtividade] = useState<Atividade | null>(null)
  const [faseAtividade, setFaseAtividade] = useState<FaseAtividade>('oculto')
  const [campoFase, setCampoFase] = useState<FaseCampo | null>(null)
  const [campoResultado, setCampoResultado] = useState('')
  const [planoAberto, setPlanoAberto] = useState(false)

  const orbeRef = useRef<OrbeHandle>(null)
  const movimentoRef = useRef<boolean | null>(null)
  const temporizadores = useRef<number[]>([])
  const proximoId = useRef(0)

  useEffect(() => { movimentoRef.current = movimento }, [movimento])

  // Mesmo cuidado de Experiencia.tsx: força o ambiente escuro enquanto o
  // laboratório está montado, restaura o tema do usuário ao sair.
  useEffect(() => {
    const raiz = document.documentElement
    const anterior = raiz.getAttribute('data-theme')
    const forcarEscuro = () => { if (raiz.hasAttribute('data-theme')) raiz.removeAttribute('data-theme') }
    forcarEscuro()
    const obs = new MutationObserver(forcarEscuro)
    obs.observe(raiz, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      obs.disconnect()
      if (anterior !== null) raiz.setAttribute('data-theme', anterior)
    }
  }, [])

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

  const concluirAtividade = () => {
    setFaseAtividade('concluido')
    temporizadores.current.push(window.setTimeout(() => setFaseAtividade('oculto'), MS_CONCLUIDO))
  }

  async function buscarComparaveis() {
    const res = await fetch('/api/investidor/mercado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pesquisar_comparaveis',
        prospeccaoId: PROSPECCAO_ID,
        profileId: currentProfile?.id,
        actor: currentProfile?.name,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.status === 'erro' || data.blocked) {
      throw new Error(data.message || data.error || 'Não consegui pesquisar comparáveis agora.')
    }
    const { count } = await createClient()
      .from('prospeccao_comparaveis')
      .select('id', { count: 'exact', head: true })
      .eq('prospeccao_id', PROSPECCAO_ID)
    return count ?? 0
  }

  const enviar = (texto: string) => {
    limpar()
    setMensagens(atuais => [...atuais, { id: proximoId.current++, autor: 'voce', texto }])
    setEstado('pensando')

    // A intenção sempre vira uma entrada real na Caixa de Entrada do
    // Processo — isso não depende de detectar pesquisa ou não.
    void criarEntradaTexto(createClient(), PROCESSO_ID, texto).catch(() => {})

    const achouPesquisa = pedePesquisa(texto)
    setAtividade(achouPesquisa ? ATIVIDADE_PESQUISA : ATIVIDADE_REGISTRO)
    setFaseAtividade('trabalhando')

    temporizadores.current.push(
      window.setTimeout(() => {
        if (!achouPesquisa) {
          apresentar('Registrei isso na Caixa de Entrada do processo.', concluirAtividade)
          return
        }

        setCampoFase('trabalhando')
        buscarComparaveis()
          .then(count => {
            setCampoResultado(count === 1 ? '1 imóvel encontrado' : `${count} imóveis encontrados`)
            setCampoFase(count > 0 ? 'pronto' : null)
            apresentar(
              count > 0
                ? `Encontrei ${count === 1 ? '1 imóvel semelhante' : `${count} imóveis semelhantes`}. Toque no cartão abaixo para abrir o Plano de Trabalho.`
                : 'Não encontrei comparáveis ainda. Pode tentar de novo em instantes.',
              concluirAtividade,
            )
          })
          .catch(err => {
            setCampoFase(null)
            apresentar(err instanceof Error ? err.message : 'Não consegui pesquisar comparáveis agora.', concluirAtividade)
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
      <CampoDeTrabalho
        fase={campoFase}
        titulo="Pesquisa de mercado — Gravataí"
        resultado={campoFase === 'pronto' ? campoResultado : undefined}
        onAbrir={() => setPlanoAberto(true)}
      />
      <CaixaConversa estado={estado} mensagens={mensagens} onEnviar={enviar} />

      {planoAberto && (
        <PlanoDeTrabalho
          processoId={PROCESSO_ID}
          prospeccaoId={PROSPECCAO_ID}
          onFechar={() => setPlanoAberto(false)}
        />
      )}

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
