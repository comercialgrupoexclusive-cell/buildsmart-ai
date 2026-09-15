'use client'

import { useEffect } from 'react'

type Props = {
  titulo: string
  contexto?: string
  onFechar: () => void
  children: React.ReactNode
}

// Camada/tela que abre SOBRE o sistema atual. Fundo translúcido: o panorama e
// o Levi continuam visíveis e ativos atrás. Não cobre o Dock (fica acima da
// faixa do Dock), para a navegação permanecer acessível.
export function Camada({ titulo, contexto, onFechar, children }: Props) {
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTecla)
    return () => window.removeEventListener('keydown', aoTecla)
  }, [onFechar])

  return (
    <div
      data-sem-onda
      className="fixed inset-0 z-40 flex justify-center px-3 pb-[6.5rem] pt-[max(1rem,env(safe-area-inset-top))]"
    >
      {/* Escurecimento sutil: mantém o fundo/Levi perceptíveis atrás. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="absolute inset-0 -z-10 cursor-default bg-black/25"
      />

      <div className="animate-[camada-entra_.32s_ease-out] flex w-full max-w-[860px] flex-col overflow-hidden rounded-[26px] border border-white/12 bg-[linear-gradient(160deg,rgba(12,20,40,0.62),rgba(10,18,36,0.5))] shadow-[0_30px_90px_-40px_rgba(40,120,255,0.7)] backdrop-blur-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
