'use client'

import Link from 'next/link'

// Peças compartilhadas das telas de módulo da nova experiência. Só
// apresentação: nenhuma regra de negócio mora aqui — os módulos reais do
// BuildSmart continuam sendo a fonte de comportamento e de dados.

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-[13px] text-cyan-100/60">
      <span className="size-4 animate-spin rounded-full border-2 border-white/15 border-t-cyan-300" />
      {texto}
    </div>
  )
}

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-12 text-center">
      <div className="text-[15px] font-semibold text-white/85">{titulo}</div>
      {descricao && <p className="max-w-prose text-[13px] leading-relaxed text-white/55">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}

// Estado honesto para o que depende de sessão. As tabelas do Motor de Processo
// (processos, compra_itens, plantas, boards com processo_id) têm RLS por
// `processo_is_accessible`, que exige sessão + vínculo de organização. A rota
// do experimento fica fora do middleware de auth, então é possível chegar aqui
// sem sessão — e nesse caso o certo é dizer isso, não mostrar tela vazia.
export function PrecisaSessao({ modulo }: { modulo: string }) {
  return (
    <Vazio
      titulo="Entre no sistema para ver este módulo"
      descricao={`${modulo} lê dados protegidos por RLS: o acesso depende da sua sessão e da sua organização. Faça login no BuildSmart nesta mesma aba e volte para o experimento — a sessão vale aqui também.`}
      acao={
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-4 py-1.5 text-[13px] text-cyan-100/90 outline-none transition hover:bg-cyan-300/18"
        >
          Abrir o BuildSmart
        </Link>
      }
    />
  )
}

// Sub-abas internas de uma tela (Pesquisa, Board). Mesmo vocabulário visual do
// Dock, em escala menor.
export function SubAbas<T extends string>({ abas, valor, onMudar }: {
  abas: { id: T; rotulo: string }[]
  valor: T
  onMudar: (id: T) => void
}) {
  return (
    <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
      {abas.map(a => {
        const on = a.id === valor
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onMudar(a.id)}
            aria-current={on ? 'page' : undefined}
            className={
              'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-medium outline-none transition ' +
              (on
                ? 'bg-cyan-300/15 text-white shadow-[inset_0_0_0_1px_rgba(120,205,255,0.32)]'
                : 'text-white/55 hover:bg-white/5 hover:text-white/85 focus-visible:bg-white/5')
            }
          >
            {a.rotulo}
          </button>
        )
      })}
    </div>
  )
}

// Barra de contexto de um item aberto dentro da tela (ex.: a prospecção
// aberta dentro de Pesquisa). Dá o caminho de volta sem sair da camada.
export function Voltar({ rotulo, onVoltar, titulo, subtitulo }: {
  rotulo: string
  onVoltar: () => void
  titulo: string
  subtitulo?: string | null
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onVoltar}
        className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cyan-100/80 outline-none transition hover:bg-white/10"
        aria-label={rotulo}
        title={rotulo}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold text-white/92">{titulo}</div>
        {subtitulo && <div className="truncate text-[12.5px] text-white/50">{subtitulo}</div>}
      </div>
    </div>
  )
}
