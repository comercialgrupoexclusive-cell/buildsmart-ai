'use client'

// Guarda de navegação: evita perder uma edição não salva ao sair da tela POR
// DENTRO do app (trocar de aba do Processo, clicar no menu ou em qualquer link).
// O aviso nativo do navegador (beforeunload, ver lib/use-guarda-alteracoes.ts)
// só cobre fechar ou recarregar a aba — não esses caminhos.
//
// Como funciona:
// - uma tela com rascunho chama useRascunhoNaoSalvo(sujo, salvar, descartar);
// - quem vai navegar chama confirmarSaida(): sem rascunho devolve true na hora;
//   com rascunho abre o aviso (Salvar e sair / Descartar / Continuar editando);
// - cliques em links internos são interceptados aqui mesmo.
//
// Limitação conhecida: o botão "voltar" do navegador/celular não passa por aqui.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { mensagemDeErro } from '@/lib/erros'
import { ConfirmarSaidaModal, type EscolhaDeSaida } from './ConfirmarSaidaModal'

export type Rascunho = {
  salvar: () => Promise<void>
  descartar: () => void
}

type Contexto = {
  registrar: (rascunho: Rascunho | null) => void
  confirmarSaida: () => Promise<boolean>
}

const SEM_GUARDA: Contexto = {
  registrar: () => {},
  confirmarSaida: async () => true,
}

const Ctx = createContext<Contexto>(SEM_GUARDA)

// Caminho de destino se o clique é numa navegação interna para OUTRA página;
// null para tudo que não deve ser interceptado (outra aba, download, externo,
// âncora na mesma página).
function destinoInterno(ancora: Element | null): string | null {
  if (!(ancora instanceof HTMLAnchorElement)) return null
  if (ancora.target === '_blank' || ancora.hasAttribute('download')) return null
  const url = new URL(ancora.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  const mesmaPagina =
    url.pathname === window.location.pathname && url.search === window.location.search
  return mesmaPagina ? null : `${url.pathname}${url.search}${url.hash}`
}

export function GuardaNavegacaoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const rascunhoRef = useRef<Rascunho | null>(null)
  const decisaoRef = useRef<((podeSair: boolean) => void) | null>(null)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const registrar = useCallback((rascunho: Rascunho | null) => {
    rascunhoRef.current = rascunho
  }, [])

  const confirmarSaida = useCallback((): Promise<boolean> => {
    if (!rascunhoRef.current) return Promise.resolve(true)
    if (decisaoRef.current) return Promise.resolve(false)
    return new Promise<boolean>(resolver => {
      decisaoRef.current = resolver
      setErro(null)
      setAberto(true)
    })
  }, [])

  const encerrar = useCallback((podeSair: boolean) => {
    setAberto(false)
    decisaoRef.current?.(podeSair)
    decisaoRef.current = null
  }, [])

  async function escolher(escolha: EscolhaDeSaida) {
    const rascunho = rascunhoRef.current
    if (escolha === 'continuar') return encerrar(false)
    if (!rascunho) return encerrar(true)
    if (escolha === 'descartar') {
      rascunho.descartar()
      return encerrar(true)
    }
    setSalvando(true)
    setErro(null)
    try {
      await rascunho.salvar()
      encerrar(true)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar.'))
    } finally {
      setSalvando(false)
    }
  }

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (!rascunhoRef.current || e.defaultPrevented) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const ancora = e.target instanceof Element ? e.target.closest('a[href]') : null
      const destino = destinoInterno(ancora)
      if (!destino) return
      e.preventDefault()
      e.stopPropagation()
      void confirmarSaida().then(podeSair => {
        if (podeSair) router.push(destino)
      })
    }
    document.addEventListener('click', aoClicar, true)
    return () => document.removeEventListener('click', aoClicar, true)
  }, [confirmarSaida, router])

  const valor = useMemo(() => ({ registrar, confirmarSaida }), [registrar, confirmarSaida])

  return (
    <Ctx.Provider value={valor}>
      {children}
      <ConfirmarSaidaModal
        aberto={aberto}
        salvando={salvando}
        erro={erro}
        onEscolher={escolha => void escolher(escolha)}
      />
    </Ctx.Provider>
  )
}

export function useGuardaNavegacao() {
  return useContext(Ctx)
}

// Uma tela com rascunho chama isto: enquanto `sujo`, sair dela passa pelo aviso.
// `salvar` deve LANÇAR se não conseguir salvar — assim o aviso mantém o usuário
// na tela em vez de deixá-lo sair sem ter salvo.
export function useRascunhoNaoSalvo(
  sujo: boolean,
  salvar: () => Promise<void>,
  descartar: () => void,
) {
  const { registrar } = useGuardaNavegacao()
  const acoes = useRef({ salvar, descartar })

  useEffect(() => {
    acoes.current = { salvar, descartar }
  })

  useEffect(() => {
    if (!sujo) return
    registrar({
      salvar: () => acoes.current.salvar(),
      descartar: () => acoes.current.descartar(),
    })
    return () => registrar(null)
  }, [sujo, registrar])
}
