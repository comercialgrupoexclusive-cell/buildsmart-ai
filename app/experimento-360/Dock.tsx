'use client'

import type { ItemDock } from './dock'

type Props = {
  itens: ItemDock[]
  ativo: string | null
  contexto: 'global' | 'processo'
  nomeProcesso?: string
  onSelecionar: (id: string) => void
  onSairProcesso: () => void
}

// Menu principal do sistema. Fica sobre o fundo (o panorama e o Levi seguem
// ativos atrás). Muda de conjunto de itens conforme o contexto e oferece o
// caminho de volta ao nível global quando dentro de um Processo.
export function Dock({ itens, ativo, contexto, nomeProcesso, onSelecionar, onSairProcesso }: Props) {
  return (
    <div
      data-sem-onda
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]"
    >
      <nav
        aria-label="Menu principal"
        className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-full border border-white/12 bg-[linear-gradient(100deg,rgba(10,18,38,0.66),rgba(14,28,54,0.58))] p-1 shadow-[0_14px_44px_-22px_rgba(60,150,255,0.6)] backdrop-blur-2xl [scrollbar-width:none]"
    >
        {contexto === 'processo' && (
          <button
            type="button"
            onClick={onSairProcesso}
            className="group flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] text-cyan-100/80 outline-none transition hover:bg-white/5 focus-visible:bg-white/5"
            title="Voltar ao menu global"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="max-w-[140px] truncate">{nomeProcesso}</span>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-white/12" />
          </button>
        )}

        {itens.map(item => {
          const selecionado = ativo === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelecionar(item.id)}
              aria-current={selecionado ? 'page' : undefined}
              className={
                'relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium outline-none transition ' +
                (selecionado
                  ? 'bg-cyan-300/15 text-white shadow-[inset_0_0_0_1px_rgba(120,205,255,0.35),0_0_18px_-6px_rgba(90,190,255,0.7)]'
                  : 'text-white/60 hover:text-white/90 hover:bg-white/5 focus-visible:bg-white/5')
              }
            >
              {item.rotulo}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
