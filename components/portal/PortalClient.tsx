'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import {
  BarChart3, Bot, CalendarRange, Camera, ChevronRight, CircleDollarSign, ClipboardList,
  FileText, Landmark, LayoutDashboard, Menu, MessageSquare, PanelsTopLeft, X,
} from 'lucide-react'
import { PortalBoard } from './PortalBoard'
import { PortalAssistant } from './PortalAssistant'
import type { PortalBoardItemDTO, PortalContextDTO, PortalTourPosition } from '@/lib/portal/types'

const BuildSmartTourViewer = dynamic(
  () => import('./BuildSmartTourViewer').then(module => module.BuildSmartTourViewer),
  { ssr: false, loading: () => <div className="grid min-h-[430px] place-items-center rounded-lg bg-[#171914] text-sm text-white">Carregando Tour...</div> },
)

const NAV = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'evolucao', label: 'Evolução', icon: BarChart3 },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarRange },
  { id: 'financeiro', label: 'Financeiro', icon: CircleDollarSign },
  { id: 'financiamento', label: 'Financiamento', icon: Landmark },
  { id: 'tour', label: 'Tour Virtual', icon: PanelsTopLeft },
  { id: 'board', label: 'Board', icon: ClipboardList },
  { id: 'fotos', label: 'Fotos', icon: Camera },
  { id: 'relatorios', label: 'Relatórios', icon: FileText },
  { id: 'ia', label: 'Pergunte à IA', icon: Bot },
] as const

type View = typeof NAV[number]['id']

type Props = {
  token: string
  initialContext: PortalContextDTO
  initialView?: string
  deepLink: { node?: string; yaw?: string; pitch?: string }
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'A definir'
}

export function PortalClient({ token, initialContext, initialView, deepLink }: Props) {
  const [context, setContext] = useState(initialContext)
  const [view, setView] = useState<View>(NAV.some(item => item.id === initialView) ? initialView as View : 'overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [draftTour, setDraftTour] = useState<PortalTourPosition | null>(null)
  const [focusBoardItemId, setFocusBoardItemId] = useState<string | null>(null)
  const [tourTarget, setTourTarget] = useState<{ nodeId?: string; yaw?: number; pitch?: number }>({
    nodeId: deepLink.node,
    yaw: deepLink.yaw ? Number(deepLink.yaw) : undefined,
    pitch: deepLink.pitch ? Number(deepLink.pitch) : undefined,
  })
  const [selectedTourId, setSelectedTourId] = useState(context.tours[0]?.id || '')

  const selectedTour = context.tours.find(tour => tour.id === selectedTourId) || context.tours[0]
  const progress = Math.max(0, Math.min(100, Number(context.summary.avancoFisico || 0)))

  async function refresh(nextBudget = context.selectedOrcamentoId) {
    setLoading(true)
    try {
      const response = await fetch(`/api/portal/${token}?budget=${encodeURIComponent(nextBudget)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Não foi possível atualizar o Portal.')
      const next = await response.json() as PortalContextDTO
      setContext(next)
      window.history.replaceState(null, '', `/portal/${token}?budget=${encodeURIComponent(nextBudget)}&view=${view}`)
      if (!next.tours.some(tour => tour.id === selectedTourId)) setSelectedTourId(next.tours[0]?.id || '')
    } finally {
      setLoading(false)
    }
  }

  function navigate(next: View) {
    setView(next)
    setMenuOpen(false)
    window.history.replaceState(null, '', `/portal/${token}?budget=${encodeURIComponent(context.selectedOrcamentoId)}&view=${next}`)
  }

  function openTour(item: PortalBoardItemDTO) {
    if (!item.tour) return
    const tour = context.tours.find(candidate => candidate.nodes.some(node => node.id === item.tour?.nodeId))
    if (tour) setSelectedTourId(tour.id)
    setTourTarget({ nodeId: item.tour.nodeId, yaw: Number(item.tour.yaw), pitch: Number(item.tour.pitch) })
    navigate('tour')
  }

  const budgetName = useMemo(() => context.selectedOrcamentoId === 'todos'
    ? 'Todos os orçamentos'
    : context.orcamentos.find(item => item.id === context.selectedOrcamentoId)?.nome || 'Orçamento', [context])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#dfe4df] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6">
          <button type="button" onClick={() => setMenuOpen(true)} className="grid size-11 place-items-center rounded-md border border-[#dfe4df] lg:hidden" aria-label="Abrir navegação"><Menu size={20} /></button>
          <div className="grid size-9 place-items-center rounded-md bg-[#176b55] font-bold text-white">B</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{context.obra.nome}</p><p className="truncate text-[11px] text-[#68706a]">Portal da obra</p></div>
          <label className="hidden min-w-64 sm:block"><span className="sr-only">Orçamento</span><select value={context.selectedOrcamentoId} onChange={event => refresh(event.target.value)} className="min-h-10 w-full rounded-md border border-[#dfe4df] bg-white px-3 text-sm font-medium" disabled={loading}><option value="todos">Todos os orçamentos</option>{context.orcamentos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        </div>
      </header>

      {menuOpen && <div className="fixed inset-0 z-50 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)}>
        <nav className="h-full w-[min(86vw,330px)] bg-white p-4 shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="mb-5 flex items-center justify-between"><span className="font-semibold">Navegação</span><button type="button" onClick={() => setMenuOpen(false)} className="grid size-10 place-items-center"><X size={20} /></button></div>
          <div className="space-y-1">{NAV.map(item => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}</div>
        </nav>
      </div>}

      <div className="mx-auto grid max-w-[1480px] lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-64px)] border-r border-[#dfe4df] bg-white px-3 py-5 lg:block">
          <nav className="sticky top-20 space-y-1">{NAV.map(item => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}</nav>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-10">
          <div className="mb-5 sm:hidden"><label><span className="mb-1 block text-[11px] font-semibold uppercase text-[#68706a]">Orçamento</span><select value={context.selectedOrcamentoId} onChange={event => refresh(event.target.value)} className="min-h-12 w-full rounded-md border border-[#dfe4df] bg-white px-3 font-medium" disabled={loading}><option value="todos">Todos os orçamentos</option>{context.orcamentos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div>
          {loading && <div className="mb-3 h-1 overflow-hidden rounded-full bg-[#dfe4df]"><div className="h-full w-1/2 animate-pulse bg-[#176b55]" /></div>}

          {view === 'overview' && <Overview context={context} progress={progress} budgetName={budgetName} onNavigate={navigate} />}
          {view === 'evolucao' && <FoundationView title="Evolução da obra" description="A base já separa avanço físico, financeiro, mão de obra e financiamento. As curvas completas entram na próxima fase." icon={BarChart3} />}
          {view === 'cronograma' && <ScheduleView context={context} />}
          {view === 'financeiro' && <FinancialView title="Financeiro" primaryLabel="Realizado" primary={context.summary.realizadoFinanceiro} secondaryLabel="Pago" secondary={context.summary.pago} />}
          {view === 'financiamento' && <FinancialView title="Financiamento" primaryLabel="Previsto" primary={context.summary.financiamentoPrevisto} secondaryLabel="Recebido" secondary={context.summary.financiamentoRecebido} />}
          {view === 'tour' && (
            <section className="space-y-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#68706a]">Ambientes imersivos</p><h1 className="mt-1 text-3xl font-semibold">Tour Virtual</h1></div>
              {context.tours.length > 1 && <select value={selectedTour?.id} onChange={event => { setSelectedTourId(event.target.value); setTourTarget({}) }} className="min-h-11 w-full max-w-md rounded-md border border-[#dfe4df] bg-white px-3">{context.tours.map(tour => <option key={tour.id} value={tour.id}>{tour.nome} · {tour.tipo === 'obra' ? 'Obra atual' : 'Projeto'}</option>)}</select>}
              {selectedTour ? <BuildSmartTourViewer tour={selectedTour} initialNodeId={tourTarget.nodeId} initialYaw={tourTarget.yaw} initialPitch={tourTarget.pitch} onCreateAnnotation={position => { setDraftTour(position); navigate('board') }} onOpenBoardItem={itemId => { setFocusBoardItemId(itemId); navigate('board') }} /> : <Empty title="Nenhum Tour publicado" description="Quando a equipe publicar panoramas da obra ou do projeto, eles aparecerão aqui." />}
            </section>
          )}
          {view === 'board' && <PortalBoard key={`${draftTour?.nodeId || 'board'}:${focusBoardItemId || ''}`} token={token} orcamentoId={context.selectedOrcamentoId} items={context.boardItems} draftTour={draftTour} focusItemId={focusBoardItemId} onDraftConsumed={() => setDraftTour(null)} onChanged={() => refresh()} onOpenTour={openTour} />}
          {view === 'fotos' && <FoundationView title="Fotos da obra" description="A galeria consumirá apenas registros publicados pela equipe. Nenhuma foto interna é exposta automaticamente." icon={Camera} />}
          {view === 'relatorios' && <FoundationView title="Relatórios publicados" description="A estrutura está reservada para os snapshots mensais imutáveis da próxima fase." icon={FileText} />}
          {view === 'ia' && <PortalAssistant token={token} orcamentoId={context.selectedOrcamentoId} onBoardChanged={() => refresh()} />}
        </main>
      </div>
    </div>
  )
}

function NavButton({ item, active, onClick }: { item: typeof NAV[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return <button type="button" onClick={onClick} className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium ${active ? 'bg-[#e8f0ec] text-[#176b55]' : 'text-[#59615b] hover:bg-[#f2f5f1]'}`}><Icon size={18} /><span className="flex-1">{item.label}</span>{active && <ChevronRight size={15} />}</button>
}

function Overview({ context, progress, budgetName, onNavigate }: { context: PortalContextDTO; progress: number; budgetName: string; onNavigate: (view: View) => void }) {
  return <div className="space-y-8">
    <section className="relative min-h-[330px] overflow-hidden rounded-lg bg-[#303631] sm:min-h-[410px]">
      {context.obra.fotoUrl && <Image src={context.obra.fotoUrl} alt={context.obra.nome} fill sizes="(min-width: 1024px) 70vw, 100vw" unoptimized className="object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/5" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{budgetName}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold sm:text-5xl">{context.obra.nome}</h1>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80"><span>{context.obra.status}</span><span>Previsão: {date(context.obra.dataPrevisao)}</span>{context.obra.endereco && <span>{context.obra.endereco}</span>}</div>
      </div>
    </section>

    <section className="grid gap-6 border-y border-[#dfe4df] py-7 md:grid-cols-[220px_1fr] md:items-center">
      <div className="flex items-center gap-5"><div className="portal-progress-ring grid size-28 shrink-0 place-items-center rounded-full" style={{ '--progress': progress } as React.CSSProperties}><div className="grid size-20 place-items-center rounded-full bg-[#f7f8f6]"><span className="text-xl font-semibold">{progress.toFixed(1)}%</span></div></div><div><p className="text-xs font-semibold uppercase text-[#68706a]">Avanço físico</p><p className="mt-1 text-xl font-semibold">Evolução em campo</p></div></div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4"><Metric label="Valor orçado" value={money(context.summary.valorOrcado)} /><Metric label="Realizado" value={money(context.summary.realizadoFinanceiro)} /><Metric label="Pago" value={money(context.summary.pago)} /><Metric label="Financiamento recebido" value={money(context.summary.financiamentoRecebido)} /></div>
    </section>

    <section className="grid gap-6 md:grid-cols-2">
      <button type="button" onClick={() => onNavigate('cronograma')} className="group min-h-44 rounded-lg bg-[#176b55] p-6 text-left text-white"><CalendarRange size={24} /><h2 className="mt-8 text-2xl font-semibold">Cronograma executivo</h2><p className="mt-2 text-sm text-white/75">{context.cronograma.filter(item => item.status !== 'concluida').length} etapas em acompanhamento</p></button>
      <button type="button" onClick={() => onNavigate('board')} className="group min-h-44 rounded-lg border border-[#dfe4df] bg-white p-6 text-left"><MessageSquare size={24} className="text-[#a67c3f]" /><h2 className="mt-8 text-2xl font-semibold">Decisões e pendências</h2><p className="mt-2 text-sm text-[#68706a]">{context.boardItems.length} itens compartilhados com você</p></button>
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[11px] font-semibold uppercase text-[#7b837d]">{label}</p><p className="mt-1 break-words text-lg font-semibold sm:text-xl">{value}</p></div>
}

function ScheduleView({ context }: { context: PortalContextDTO }) {
  return <section><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#68706a]">Planejamento</p><h1 className="mt-1 text-3xl font-semibold">Cronograma</h1><div className="mt-6 divide-y divide-[#e3e7e3] border-y border-[#dfe4df]">{context.cronograma.map(item => <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_180px_90px] sm:items-center"><div><p className="font-semibold">{item.nome}</p><p className="mt-1 text-xs text-[#68706a]">{date(item.inicio)} → {date(item.fim)}</p></div><div className="h-2 overflow-hidden rounded-full bg-[#e4e9e4]"><div className="h-full rounded-full bg-[#176b55]" style={{ width: `${Math.min(100, Number(item.percentual))}%` }} /></div><p className="text-sm font-semibold sm:text-right">{Number(item.percentual).toFixed(0)}%</p></div>)}</div></section>
}

function FinancialView({ title, primaryLabel, primary, secondaryLabel, secondary }: { title: string; primaryLabel: string; primary: number; secondaryLabel: string; secondary: number }) {
  return <section><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#68706a]">Visão permitida</p><h1 className="mt-1 text-3xl font-semibold">{title}</h1><div className="mt-8 grid gap-8 border-y border-[#dfe4df] py-8 sm:grid-cols-2"><Metric label={primaryLabel} value={money(primary)} /><Metric label={secondaryLabel} value={money(secondary)} /></div><p className="mt-5 max-w-2xl text-sm leading-6 text-[#68706a]">Esta base já respeita o orçamento selecionado. Séries históricas e gráficos detalhados serão adicionados na fase analítica.</p></section>
}

function FoundationView({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Camera }) {
  return <section><Icon size={28} className="text-[#176b55]" /><h1 className="mt-4 text-3xl font-semibold">{title}</h1><p className="mt-3 max-w-xl text-base leading-7 text-[#68706a]">{description}</p></section>
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="rounded-lg border border-dashed border-[#cfd5cf] bg-white px-5 py-14 text-center"><p className="font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm text-[#68706a]">{description}</p></div>
}
