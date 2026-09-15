'use client'

import { useEffect } from 'react'

type Props = {
  titulo: string
  contexto?: string
  // `largo` dá mais área a telas de trabalho (Board, Planta, Financeiro);
  // `preencher` troca a rolagem do corpo por altura total, para o conteúdo
  // que precisa ocupar o painel inteiro em vez de rolar dentro dele.
  largo?: boolean
  preencher?: boolean
  onFechar: () => void
  children: React.ReactNode
}

// Camada/tela que abre SOBRE o sistema atual. Fundo translúcido: o panorama e
// o Levi continuam visíveis e ativos atrás. Não cobre o Dock (fica acima da
// faixa do Dock), para a navegação permanecer acessível.
export function Camada({ titulo, contexto, largo = false, preencher = false, onFechar, children }: Props) {
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTecla)
    return () => window.removeEventListener('keydown', aoTecla)
  }, [onFechar])

  return (
    <div
      data-sem-onda
      className="fixed inset-x-0 top-0 z-[38] flex justify-center px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-3"
      style={{ bottom: 'calc(var(--altura-ia, 4rem) + 4rem)' }}
    >
      {/* Véu mínimo: o fundo e o Levi têm de continuar visíveis e ativos
          atrás — o painel se separa pelo vidro, não por escurecer a cena. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="absolute inset-0 -z-10 cursor-default bg-black/10"
      />

      {/* `vidro-360`: mesma superfície do painel da conversa da IA, definida
          uma vez em app/globals.css. */}
      <div
        className={
          'vidro-360 animate-[camada-entra_.32s_ease-out] flex w-full flex-col overflow-hidden rounded-[26px] ' +
          (largo ? 'max-w-[1180px]' : 'max-w-[860px]')
        }
      >
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent)] px-5 py-3.5">
          <div className="min-w-0">
            {contexto && (
              <div className="text-[10.5px] uppercase tracking-[0.16em] text-cyan-200/55">{contexto}</div>
            )}
            <h2 className="truncate text-[17px] font-semibold text-white/92">{titulo}</h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 outline-none transition hover:bg-white/10 focus-visible:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* `pele-360` reescreve as variáveis de tema só aqui dentro: os
            módulos reais do BuildSmart entram translúcidos e desfocados sem
            que nenhum componente deles seja alterado (ver app/globals.css). */}
        <div
          className={
            'pele-360 min-h-0 flex-1 overscroll-contain p-5 ' +
            (preencher ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}
