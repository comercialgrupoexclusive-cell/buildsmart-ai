'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  BarChart3, Bot, CalendarRange, Camera, CircleDollarSign, ClipboardList,
  Download, FileText, Landmark, LayoutDashboard, MessageSquare, PanelsTopLeft, CalendarClock, Moon, Newspaper, Sun,
} from 'lucide-react'
import { PortalBoard } from './PortalBoard'
import { PortalAssistant } from './PortalAssistant'
import type { PortalBoardItemDTO, PortalContextDTO, PortalTourPosition } from '@/lib/portal/types'
import { useProfile } from '@/lib/profile-context'
import { Badge } from '@/components/ui/Badge'
import { MetricCard, StatusItemCard } from '@/components/ui/InsightCard'
import { PREVISAO_STATUS_LABEL, PREVISAO_TIPO_LABEL, previsaoPrazo, previsaoTone } from '@/lib/previsoes'
import { PortalGantt } from './PortalGantt'
import type { PortalSectionId, PortalVisibility } from '@/lib/portal/sections'
import { EvolutionView, FinancialDetailView, FinancingDetailView } from './PortalPresentation'
import { PortalFeed } from './PortalFeed'

const BuildSmartTourViewer = dynamic(
  () => import('./BuildSmartTourViewer').then(module => module.BuildSmartTourViewer),
  { ssr: false, loading: () => <div className="grid min-h-[430px] place-items-center rounded-lg bg-[#171914] text-sm text-white">Carregando Tour...</div> },
)

const NAV = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'evolucao', label: 'Evolução', icon: BarChart3 },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarRange },
  { id: 'financeiro', label: 'Financeiro', icon: CircleDollarSign },
  { id: 'previsoes', label: 'Previsões', icon: CalendarClock },
  { id: 'financiamento', label: 'Financiamento', icon: Landmark },
  { id: 'tour', label: 'Tour Virtual', icon: PanelsTopLeft },
  { id: 'board', label: 'Board', icon: ClipboardList },
  { id: 'fotos', label: 'Fotos', icon: Camera },
  { id: 'relatorios', label: 'Relatórios', icon: FileText },
  { id: 'ia', label: 'Pergunte à IA', icon: Bot },
] as const

type View = PortalSectionId

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
  const { currentProfile, theme, toggleTheme } = useProfile()
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false)
  const [portalTheme, setPortalTheme] = useState<'dark' | 'light'>('light')
  const [context, setContext] = useState(initialContext)
  const initialVisibleView = NAV.find(item => item.id === initialView && initialContext.visibility[item.id])?.id
    || NAV.find(item => initialContext.visibility[item.id])?.id
    || 'feed'
  const [view, setView] = useState<View>(initialVisibleView)
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
  const visibleNav = useMemo(() => NAV.filter(item => context.visibility[item.id]), [context.visibility])

  useEffect(() => {
    if (!currentProfile) document.documentElement.setAttribute('data-theme', 'light')
  }, [currentProfile])

  const activeTheme = mounted && currentProfile ? theme : portalTheme

  function handleTheme() {
    if (currentProfile) { toggleTheme(); return }
    const next = portalTheme === 'dark' ? 'light' : 'dark'
    setPortalTheme(next)
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
  }

  async function refresh() {
    setLoading(true)
    try {
      const response = await fetch(`/api/portal/${token}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Não foi possível atualizar o Portal.')
      const next = await response.json() as PortalContextDTO
      setContext(next)
      const nextView = next.visibility[view] ? view : NAV.find(item => next.visibility[item.id])?.id || 'feed'
      if (nextView !== view) setView(nextView)
      window.history.replaceState(null, '', `/portal/${token}?view=${nextView}`)
      if (!next.tours.some(tour => tour.id === selectedTourId)) setSelectedTourId(next.tours[0]?.id || '')
    } finally {
      setLoading(false)
    }
  }

  function navigate(next: View) {
    setView(next)
    window.history.replaceState(null, '', `/portal/${token}?view=${next}`)
  }

  function openTour(item: PortalBoardItemDTO) {
    if (!item.tour) return
    const tour = context.tours.find(candidate => candidate.nodes.some(node => node.id === item.tour?.nodeId))
    if (tour) setSelectedTourId(tour.id)
    setTourTarget({ nodeId: item.tour.nodeId, yaw: Number(item.tour.yaw), pitch: Number(item.tour.pitch) })
    navigate('tour')
  }

  const budgetName = useMemo(() => context.orcamentos[0]?.nome || 'Orçamento', [context.orcamentos])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg-primary) 94%, transparent)' }}>
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6">
          <div className="grid size-9 place-items-center rounded-lg font-bold text-white" style={{ background: 'var(--accent)' }}>B</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">BuildSmart</p><p className="truncate text-[11px]" style={{ color: 'var(--text-secondary)' }}>{context.obra.nome} · Portal do Cliente</p></div>
          <button type="button" onClick={handleTheme} className="grid size-10 place-items-center rounded-lg hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }} title={activeTheme === 'dark' ? 'Modo claro' : 'Modo escuro'}>{activeTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </header>

      <div className="sticky top-16 z-30 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <nav role="tablist" aria-label="Seções do Portal" className="mx-auto flex max-w-[1480px] overflow-x-auto px-3 sm:px-5">
          {visibleNav.map(item => <PortalTab key={item.id} item={item} active={view === item.id} onClick={() => navigate(item.id)} />)}
        </nav>
      </div>

      <div className="mx-auto max-w-[1320px]">
        <main className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-10">
          {loading && <div className="mb-3 h-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}><div className="h-full w-1/2 animate-pulse" style={{ background: 'var(--accent)' }} /></div>}

          {view === 'feed' && <PortalFeed key={context.selectedOrcamentoId} token={token} items={context.feed} obraNome={context.obra.nome} />}
          {view === 'overview' && <Overview context={context} progress={progress} budgetName={budgetName} visibility={context.visibility} onNavigate={navigate} />}
          {view === 'evolucao' && <EvolutionView context={context} />}
          {view === 'cronograma' && <ScheduleView context={context} />}
          {view === 'financeiro' && <FinancialDetailView context={context} />}
          {view === 'previsoes' && <ForecastView context={context} />}
          {view === 'financiamento' && <FinancingDetailView context={context} />}
          {view === 'tour' && (
            <section className="space-y-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>Ambientes imersivos</p><h1 className="mt-1 text-3xl font-semibold">Tour Virtual</h1></div>
              {context.tours.length > 1 && <select value={selectedTour?.id} onChange={event => { setSelectedTourId(event.target.value); setTourTarget({}) }} className="input-base min-h-11 w-full max-w-md">{context.tours.map(tour => <option key={tour.id} value={tour.id}>{tour.nome} · {tour.tipo === 'obra' ? 'Obra atual' : 'Projeto'}</option>)}</select>}
              {selectedTour ? <BuildSmartTourViewer tour={selectedTour} initialNodeId={tourTarget.nodeId} initialYaw={tourTarget.yaw} initialPitch={tourTarget.pitch} onCreateAnnotation={position => { setDraftTour(position); navigate('board') }} onOpenBoardItem={itemId => { setFocusBoardItemId(itemId); navigate('board') }} /> : <Empty title="Nenhum Tour publicado" description="Quando a equipe publicar panoramas da obra ou do projeto, eles aparecerão aqui." />}
            </section>
          )}
          {view === 'board' && <PortalBoard key={`${draftTour?.nodeId || 'board'}:${focusBoardItemId || ''}`} token={token} orcamentoId={context.selectedOrcamentoId} items={context.boardItems} draftTour={draftTour} focusItemId={focusBoardItemId} onDraftConsumed={() => setDraftTour(null)} onChanged={() => refresh()} onOpenTour={openTour} />}
          {view === 'fotos' && <PublishedFilesView context={context} mode="photos" />}
          {view === 'relatorios' && <PublishedFilesView context={context} mode="reports" />}
          {view === 'ia' && <PortalAssistant token={token} orcamentoId={context.selectedOrcamentoId} onBoardChanged={() => refresh()} />}
        </main>
      </div>
    </div>
  )
}

function PortalTab({ item, active, onClick }: { item: typeof NAV[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className="relative flex min-h-13 shrink-0 items-center gap-2 px-3 text-sm font-medium transition-colors hover:bg-[var(--bg-secondary)] sm:px-4" style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}><Icon size={17} /><span>{item.label}</span><span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full" style={{ background: active ? 'var(--accent)' : 'transparent' }} /></button>
}

function Overview({ context, progress, budgetName, visibility, onNavigate }: { context: PortalContextDTO; progress: number; budgetName: string; visibility: PortalVisibility; onNavigate: (view: View) => void }) {
  return <div className="space-y-8">
    <section className="relative min-h-[330px] overflow-hidden rounded-lg sm:min-h-[410px]" style={{ background: context.obra.fotoUrl ? '#303631' : 'var(--accent)' }}>
      {context.obra.fotoUrl && <Image src={context.obra.fotoUrl} alt={context.obra.nome} fill sizes="(min-width: 1024px) 70vw, 100vw" unoptimized className="object-cover" />}
      {context.obra.fotoUrl && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/5" />}
      {!context.obra.fotoUrl && <div className="absolute right-6 top-7 text-right text-white/90 sm:right-9 sm:top-9"><p className="text-xs font-semibold uppercase text-white/70">Avanço físico</p><p className="mt-1 text-5xl font-semibold tabular-nums sm:text-7xl">{progress.toFixed(1)}%</p></div>}
      <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{budgetName}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold sm:text-5xl">{context.obra.nome}</h1>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80"><span>{context.obra.status}</span><span>Previsão: {date(context.obra.dataPrevisao)}</span>{context.obra.endereco && <span>{context.obra.endereco}</span>}</div>
      </div>
    </section>

    {(visibility.evolucao || visibility.financeiro || visibility.financiamento) && <section className={`grid gap-5 ${visibility.evolucao ? 'md:grid-cols-[220px_1fr]' : ''} md:items-center`}>
      {visibility.evolucao && <div className="card flex items-center gap-5 p-5"><div className="portal-progress-ring grid size-24 shrink-0 place-items-center rounded-full" style={{ '--progress': progress } as React.CSSProperties}><div className="grid size-[4.5rem] place-items-center rounded-full" style={{ background: 'var(--bg-card)' }}><span className="text-lg font-semibold">{progress.toFixed(1)}%</span></div></div><div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Avanço físico</p><p className="mt-1 text-lg font-semibold">Evolução em campo</p></div></div>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {visibility.financeiro && <><MetricCard label="Valor orçado" value={money(context.summary.valorOrcado)} /><MetricCard label="Realizado" value={money(context.summary.realizadoFinanceiro)} tone="warning" /><MetricCard label="Pago" value={money(context.summary.pago)} tone="success" /></>}
        {visibility.financiamento && <MetricCard label="Financiamento recebido" value={money(context.summary.financiamentoRecebido)} />}
      </div>
    </section>}

    {visibility.previsoes && context.previsoes.length > 0 && <ForecastSummary context={context} onNavigate={onNavigate} />}

    {(visibility.cronograma || visibility.board) && <section className="grid gap-6 md:grid-cols-2">
      {visibility.cronograma && <button type="button" onClick={() => onNavigate('cronograma')} className="group min-h-44 rounded-lg p-6 text-left text-white" style={{ background: 'var(--accent)' }}><CalendarRange size={24} /><h2 className="mt-8 text-2xl font-semibold">Cronograma executivo</h2><p className="mt-2 text-sm text-white/75">{context.cronograma.filter(item => item.status !== 'concluida').length} etapas em acompanhamento</p></button>}
      {visibility.board && <button type="button" onClick={() => onNavigate('board')} className="card group min-h-44 p-6 text-left"><MessageSquare size={24} style={{ color: 'var(--accent)' }} /><h2 className="mt-8 text-2xl font-semibold">Decisões e pendências</h2><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{context.boardItems.length} itens compartilhados com você</p></button>}
    </section>}
  </div>
}

function ScheduleView({ context }: { context: PortalContextDTO }) {
  return <section><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>Planejamento</p><h1 className="mt-1 text-3xl font-semibold">Cronograma</h1><div className="mt-6"><PortalGantt items={context.cronograma} /></div></section>
}

function ForecastSummary({ context, onNavigate }: { context: PortalContextDTO; onNavigate: (view: View) => void }) {
  const upcoming = context.previsoes.filter(item => !['realizada', 'cancelada'].includes(item.status)).slice(0, 3)
  if (!upcoming.length) return null
  return <section>
    <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Planejamento</p><h2 className="mt-1 text-xl font-semibold">Próximos compromissos</h2></div><button type="button" onClick={() => onNavigate('previsoes')} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Ver todos</button></div>
    <div className="grid gap-3 lg:grid-cols-3">{upcoming.map(item => <PortalForecastCard key={item.id} item={item} />)}</div>
  </section>
}

function ForecastView({ context }: { context: PortalContextDTO }) {
  const active = context.previsoes.filter(item => !['realizada', 'cancelada'].includes(item.status))
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const within = (days: number) => active.filter(item => {
    const due = new Date(`${item.dataPrevista}T00:00:00`)
    return due >= today && due.getTime() <= today.getTime() + days * 86400000
  })
  const seven = within(7)
  const thirty = within(30)
  const sum = (items: typeof active) => items.reduce((total, item) => total + Number(item.valorPrevisto || 0), 0)
  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>Planejamento publicado</p><h1 className="mt-1 text-3xl font-semibold">Próximos compromissos</h1></div>
    <div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Próximos 7 dias" value={money(sum(seven))} detail={`${seven.length} compromisso${seven.length === 1 ? '' : 's'}`} tone="warning" /><MetricCard label="Próximos 30 dias" value={money(sum(thirty))} detail={`${thirty.length} compromisso${thirty.length === 1 ? '' : 's'}`} /></div>
    {context.previsoes.length === 0 ? <Empty title="Nenhuma previsão publicada" description="A equipe controla o que pode ser visualizado pelo cliente. Novos compromissos aparecerão aqui quando forem publicados." /> : <div className="space-y-3">{context.previsoes.map(item => <PortalForecastCard key={item.id} item={item} />)}</div>}
    <p className="text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>Previsto e realizado são momentos diferentes. Uma diferença não representa automaticamente economia ou estouro de orçamento.</p>
  </section>
}

function PortalForecastCard({ item }: { item: PortalContextDTO['previsoes'][number] }) {
  const tone = previsaoTone(item.status, item.dataPrevista)
  return <StatusItemCard title={item.titulo} eyebrow={`${PREVISAO_TIPO_LABEL[item.tipo]} · ${item.orcamentoNome}`} value={item.valorPrevisto == null ? undefined : money(item.valorPrevisto)} detail={previsaoPrazo(item.dataPrevista, item.status)} tone={tone} badge={<Badge variant={tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info'}>{PREVISAO_STATUS_LABEL[item.status]}</Badge>} meta={<div className="flex flex-wrap gap-x-4 gap-y-1"><span>{date(item.dataPrevista)}</span>{item.etapaNome && <span>{item.etapaNome}</span>}{item.baseline && <span>Baseline</span>}</div>} />
}

function PublishedFilesView({ context, mode }: { context: PortalContextDTO; mode: 'photos' | 'reports' }) {
  const isImage = (item: PortalContextDTO['documentos'][number]) => item.categoria === 'imagem' || item.tipo.startsWith('image/')
  const items = context.documentos.filter(item => mode === 'photos' ? isImage(item) : !isImage(item))
  const Icon = mode === 'photos' ? Camera : FileText
  const title = mode === 'photos' ? 'Fotos da obra' : 'Relatórios e documentos'
  return <section className="space-y-6">
    <div><Icon size={24} style={{ color: 'var(--accent)' }} /><h1 className="mt-3 text-3xl font-semibold">{title}</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Conteúdo selecionado e publicado pela equipe da obra.</p></div>
    {items.length === 0 ? <Empty title={mode === 'photos' ? 'Nenhuma foto publicada' : 'Nenhum relatório publicado'} description={mode === 'photos' ? 'Os registros fotográficos aparecerão aqui assim que forem liberados pela equipe.' : 'Os documentos e relatórios liberados para o cliente aparecerão aqui.'} /> : mode === 'photos' ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{items.map(item => <a key={item.id} href={item.url || undefined} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-[var(--bg-secondary)]">{item.url && <Image src={item.url} alt={item.nome} fill unoptimized sizes="(min-width: 768px) 30vw, 50vw" className="object-cover transition-transform group-hover:scale-[1.02]" />}<div className="absolute inset-x-0 bottom-0 bg-black/65 p-3 text-white"><p className="truncate text-sm font-medium">{item.nome}</p><p className="mt-0.5 text-[11px] text-white/70">{new Date(item.createdAt).toLocaleDateString('pt-BR')}</p></div></a>)}</div> : <div className="space-y-3">{items.map(item => <article key={item.id} className="card flex items-center gap-3 p-4"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--bg-secondary)]"><FileText size={19} style={{ color: 'var(--accent)' }} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.nome}</p><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{item.categoria} · {new Date(item.createdAt).toLocaleDateString('pt-BR')}</p></div>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--accent)' }} title="Abrir documento"><Download size={18} /></a>}</article>)}</div>}
  </section>
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="card border-dashed px-5 py-14 text-center"><p className="font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p></div>
}
