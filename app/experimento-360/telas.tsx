'use client'

import { PROCESSO_TESTE } from './dock'

// Etiqueta reutilizável: deixa explícito que é interface de teste, sem lógica.
function Selo() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/15 bg-cyan-300/8 px-2.5 py-1 text-[11px] text-cyan-100/70">
      <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_currentColor]" />
      Tela de teste — sem lógica nesta etapa
    </span>
  )
}

function Bloco({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 backdrop-blur-md">
      {children}
    </div>
  )
}

// Tela Tempo — a tela de teste designada. Layout de vitrine, sem o Tempo real.
export function TelaTempo() {
  return (
    <div className="flex flex-col gap-4">
      <Selo />
      <p className="max-w-prose text-[14px] leading-relaxed text-white/70">
        Espaço reservado para o <strong className="font-semibold text-white/90">Tempo</strong>.
        Nesta etapa a tela existe só para validar a abertura da camada glass, o
        fundo ativo atrás, a navegação e a responsividade. A lógica real entra
        numa próxima etapa.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {['Hoje', 'Semana', 'Mês'].map(t => (
          <Bloco key={t}>
            <div className="text-[12px] uppercase tracking-[0.12em] text-cyan-200/55">{t}</div>
            <div className="mt-2 h-16 rounded-lg bg-[linear-gradient(120deg,rgba(90,160,255,0.14),rgba(120,90,255,0.10))]" />
          </Bloco>
        ))}
      </div>
      <Bloco>
        <div className="text-[12px] uppercase tracking-[0.12em] text-cyan-200/55">Linha do tempo</div>
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-2 rounded-full bg-cyan-300/70" />
              <div className="h-2 flex-1 rounded-full bg-white/8" style={{ maxWidth: `${80 - i * 18}%` }} />
            </div>
          ))}
        </div>
      </Bloco>
    </div>
  )
}

// Lista de Processos — traz um Processo de teste. Abri-lo muda o contexto do
// Dock para as abas daquele Processo.
export function TelaProcessos({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Selo />
      <button
        type="button"
        onClick={onAbrir}
        className="group flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-left outline-none transition hover:border-cyan-200/30 hover:bg-white/[0.08] focus-visible:border-cyan-200/30"
      >
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-white/92">{PROCESSO_TESTE.nome}</div>
          <div className="mt-0.5 text-[13px] text-white/55">
            Abrir para trocar o Dock para as abas do Processo
          </div>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cyan-100/80 transition group-hover:bg-cyan-300/15">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </button>
      <p className="text-[13px] text-white/45">
        Só um Processo de teste nesta etapa. Nada de dados reais ou Motor de
        Processo por trás.
      </p>
    </div>
  )
}

// Placeholder genérico para as demais abas (sem conteúdo real nesta etapa).
export function TelaPlaceholder({ nome }: { nome: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Selo />
      <p className="max-w-prose text-[14px] leading-relaxed text-white/70">
        <strong className="font-semibold text-white/90">{nome}</strong> ainda não
        foi migrado. Esta camada existe apenas para validar a navegação e a
        troca de contexto do Dock. O conteúdo real entra nas próximas etapas.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl border border-white/8 bg-white/[0.03]" />
        ))}
      </div>
    </div>
  )
}
