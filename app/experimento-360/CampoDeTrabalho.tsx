'use client'

import { Loader2, Search } from 'lucide-react'

export type FaseCampo = 'trabalhando' | 'pronto'

type Props = {
  fase: FaseCampo | null
  titulo: string
  resultado?: string
  onAbrir: () => void
}

// Campo de Trabalho: card único de vidro no terço inferior, invisível até
// existir uma intenção em andamento. Nasce em 'trabalhando' e vira 'pronto'
// quando o resultado real chega (pesquisa de comparáveis já existente via
// /api/investidor/mercado) — tocar nele é o que abre o Plano de Trabalho.
export function CampoDeTrabalho({ fase, titulo, resultado, onAbrir }: Props) {
  const visivel = fase !== null
  const pronto = fase === 'pronto'

  return (
    <div
      data-sem-onda
      className="pointer-events-none fixed inset-x-0 z-[25] flex justify-center px-4 transition-all duration-500 ease-out"
      style={{
        bottom: 'calc(var(--altura-ia, 4rem) + 1.1rem)',
        opacity: visivel ? 1 : 0,
        transform: visivel ? 'translateY(0)' : 'translateY(14px)',
      }}
      aria-hidden={!visivel}
    >
      <button
        type="button"
        onClick={pronto ? onAbrir : undefined}
        disabled={!pronto}
        className="vidro-360 pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none transition enabled:hover:brightness-110 disabled:cursor-default"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-cyan-200">
          {pronto ? <Search size={16} /> : <Loader2 size={16} className="animate-spin" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[10.5px] uppercase tracking-[0.14em] text-cyan-200/55">Campo de trabalho</span>
          <span className="block truncate text-[14px] font-medium text-white/92">{titulo}</span>
          {resultado && <span className="block text-[12px] text-white/60">{resultado}</span>}
        </span>
      </button>
    </div>
  )
}
