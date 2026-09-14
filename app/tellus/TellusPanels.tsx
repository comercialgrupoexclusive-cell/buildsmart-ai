'use client'

import { type ReactNode, useState } from 'react'
import {
  NAV_ICONS,
  OPERACOES_ALLEGRA,
  ORCAMENTO_ALLEGRA,
  PROJETO_ALLEGRA,
  PROJETOS,
  TOP_NAV_LINKS,
  formatBRL,
} from './data'

// Experimento visual "Tellus" — painéis de "vidro" (glass morphism) sobre o
// canvas 3D. Desktop replica a referência (3 blocos: lista de projetos à
// esquerda, detalhe+orçamento+operações à direita); mobile empilha tudo em
// coluna única — ver instrução explícita da tarefa: não forçar 3 colunas em
// tela estreita.

function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/15 bg-white/[0.06] shadow-2xl shadow-black/50 backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'Em execução' ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30'
    : status === 'Planejamento' ? 'text-sky-300 bg-sky-400/10 border-sky-400/30'
    : status === 'Em análise' ? 'text-amber-300 bg-amber-400/10 border-amber-400/30'
    : 'text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-400/30'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${color}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

function TopBar() {
  return (
    <header className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/50 text-cyan-200 sm:h-10 sm:w-10">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="9" ry="3.2" />
            <path d="M4 8h16M4 16h16" strokeOpacity="0.5" />
          </svg>
        </span>
        <div>
          <div className="text-lg font-semibold tracking-[0.3em] text-white sm:text-xl">TELLUS</div>
          <div className="hidden text-[10px] tracking-[0.25em] text-white/50 sm:block">O AMBIENTE INTELIGENTE</div>
        </div>
      </div>

      <nav className="hidden flex-col items-end gap-1 text-right text-[11px] font-medium tracking-[0.15em] text-white/60 lg:flex">
        {TOP_NAV_LINKS.map((link) => (
          <span key={link} className="cursor-default hover:text-white/90">{link}</span>
        ))}
      </nav>
    </header>
  )
}

function ProjectListPanel() {
  return (
    <GlassCard className="flex w-full flex-col p-4 sm:p-5 lg:w-[360px] lg:shrink-0">
      <div className="mb-3 flex items-center justify-between text-xs text-white/60">
        <span>Projetos <span className="text-white/30">›</span> Selecionar</span>
        <span className="text-white/40">⌕</span>
      </div>
      <div className="flex flex-col gap-2">
        {PROJETOS.map((projeto) => (
          <div
            key={projeto.id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
              projeto.id === 'allegra'
                ? 'border-cyan-300/40 bg-cyan-400/10'
                : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg">
              {projeto.thumbnail}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{projeto.nome}</div>
              <div className="truncate text-[11px] text-white/50">{projeto.tipo} · {projeto.cidade}</div>
            </div>
            <StatusBadge status={projeto.status} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        Projetos que transformam territórios em oportunidades.
      </p>
    </GlassCard>
  )
}

function ProjectDetailPanel() {
  const [tab, setTab] = useState<'geral' | 'etapas' | 'equipe' | 'documentos' | 'indicadores'>('geral')
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'geral', label: 'Visão Geral' },
    { id: 'etapas', label: 'Etapas' },
    { id: 'equipe', label: 'Equipe' },
    { id: 'documentos', label: 'Documentos' },
    { id: 'indicadores', label: 'Indicadores' },
  ]

  return (
    <GlassCard className="w-full p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">Projeto {PROJETO_ALLEGRA.nome}</div>
          <div className="text-xs text-white/50">{PROJETO_ALLEGRA.tipo} · {PROJETO_ALLEGRA.cidade}</div>
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> {PROJETO_ALLEGRA.status}
        </span>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto text-[11px] font-medium text-white/50 [scrollbar-width:none]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
              tab === t.id ? 'bg-cyan-400/15 text-cyan-200' : 'hover:text-white/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 aspect-[16/9] w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-700/60 to-slate-900/60">
        <div className="flex h-full w-full items-center justify-center text-4xl">🏗️</div>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-white/60">{PROJETO_ALLEGRA.descricao}</p>

      <div className="mb-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
        <div>
          <div className="text-sm font-semibold text-cyan-300">{PROJETO_ALLEGRA.progresso}%</div>
          <div className="text-[10px] text-white/40">Concluído</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{formatBRL(PROJETO_ALLEGRA.orcamentoTotal)}</div>
          <div className="text-[10px] text-white/40">Orçamento total</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{PROJETO_ALLEGRA.etapas}</div>
          <div className="text-[10px] text-white/40">Etapas</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{PROJETO_ALLEGRA.parceiros}</div>
          <div className="text-[10px] text-white/40">Parceiros</div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-sm font-semibold text-white">{PROJETO_ALLEGRA.entregaPrevista}</div>
          <div className="text-[10px] text-white/40">Entrega prevista</div>
        </div>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-cyan-300">
          Acessar projeto →
        </button>
        <button className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/5">
          Ver no mapa
        </button>
      </div>
    </GlassCard>
  )
}

function statusDot(status: 'ok' | 'atencao' | 'pendente') {
  if (status === 'ok') return 'bg-emerald-400'
  if (status === 'atencao') return 'bg-amber-400'
  return 'bg-white/25'
}

function BudgetPanel() {
  const total = ORCAMENTO_ALLEGRA.reduce((acc, l) => acc + l.previsto, 0)
  return (
    <GlassCard className="w-full p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Orçamento</span>
        <select className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/70" disabled defaultValue="allegra">
          <option value="allegra">Allegra</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-[11px]">
          <thead className="text-white/40">
            <tr>
              <th className="pb-2 font-normal">Categoria</th>
              <th className="pb-2 text-right font-normal">Previsto</th>
              <th className="pb-2 text-right font-normal">Realizado</th>
              <th className="pb-2 pl-2 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {ORCAMENTO_ALLEGRA.map((linha) => (
              <tr key={linha.categoria} className="border-t border-white/5">
                <td className="py-1.5">{linha.categoria}</td>
                <td className="py-1.5 text-right tabular-nums text-white/60">{formatBRL(linha.previsto)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBRL(linha.realizado)}</td>
                <td className="py-1.5 pl-2 text-right">
                  <span className={`inline-block h-2 w-2 rounded-full ${statusDot(linha.status)}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-sm">
        <span className="text-white/60">Total do projeto</span>
        <span className="font-semibold text-white">{formatBRL(total)}</span>
      </div>
    </GlassCard>
  )
}

function OperationsPanel() {
  const stats = [
    { label: 'Obras', value: OPERACOES_ALLEGRA.obras, delta: OPERACOES_ALLEGRA.obrasVariacao, up: true },
    { label: 'Equipe', value: OPERACOES_ALLEGRA.equipe, delta: OPERACOES_ALLEGRA.equipeVariacao, up: true },
    { label: 'Ocorrências', value: OPERACOES_ALLEGRA.ocorrencias, delta: OPERACOES_ALLEGRA.ocorrenciasVariacao, up: false },
    { label: 'Conformidade', value: `${OPERACOES_ALLEGRA.conformidade}%`, delta: OPERACOES_ALLEGRA.conformidadeVariacao, up: true },
  ]
  return (
    <GlassCard className="w-full p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Operações</span>
        <span className="text-[11px] text-white/40">Últimos 30 dias</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-center">
            <div className="text-base font-semibold text-white">{s.value}</div>
            <div className="text-[10px] text-white/40">{s.label}</div>
            <div className={`text-[10px] ${s.up ? 'text-emerald-300' : 'text-rose-300'}`}>{s.delta}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-10 mt-auto flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
      <div className="flex w-full max-w-3xl gap-1 overflow-x-auto rounded-2xl border border-white/15 bg-white/[0.06] px-2 py-2 shadow-2xl shadow-black/50 backdrop-blur-xl [scrollbar-width:none] sm:justify-center">
        {NAV_ICONS.map((label, i) => (
          <button
            key={label}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors ${
              i === 0 ? 'bg-cyan-400/15 text-cyan-200' : 'text-white/50 hover:text-white/80'
            }`}
          >
            <span className="text-base leading-none">
              {['🌐', '📁', '📊', '📅', '🏗️', '🛒', '💳', '📄'][i]}
            </span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function TellusPanels() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <TopBar />

      <main className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:flex-row lg:items-start lg:gap-6 lg:px-10 lg:py-8">
        <ProjectListPanel />

        <div className="flex w-full flex-col gap-4 lg:ml-auto lg:w-[440px] lg:shrink-0">
          <ProjectDetailPanel />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <BudgetPanel />
            <OperationsPanel />
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
