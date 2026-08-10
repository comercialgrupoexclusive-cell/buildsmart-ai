'use client'

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts'
import { Banknote, CalendarDays, CheckCircle2, Clock3, Landmark, WalletCards } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MetricCard, StatusItemCard } from '@/components/ui/InsightCard'
import type { PortalContextDTO } from '@/lib/portal/types'

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const compactMoney = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(Number(value || 0))
const date = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'A definir'
const month = (value: string) => { const [year, number] = value.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, number - 1, 1)).replace('.', '') }
const percent = (value: number) => `${Math.max(0, Math.min(100, Number(value || 0))).toFixed(1)}%`
const statusLabel: Record<string, string> = { concluida: 'Concluida', em_andamento: 'Em execucao', planejada: 'Planejada', atrasada: 'Atencao' }

export function EvolutionView({ context }: { context: PortalContextDTO }) {
  const { axes, stages } = context.presentation
  const visibility = context.contentVisibility.evolucao
  const active = stages.filter(item => item.physical > 0 && item.physical < 100)
  const completed = stages.filter(item => item.physical >= 100).length
  return <section className="space-y-6">
    <div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Evolução da obra</p><h1 className="mt-1 text-3xl font-semibold">Avanços independentes</h1><p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Execução física, mão de obra, movimentação financeira e financiamento são acompanhados separadamente.</p></div>
    {visibility.indicators && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Avanço físico" value={percent(axes.physical)} detail={`${completed} de ${stages.length} etapas concluídas`} tone="success" /><MetricCard label="Mão de obra" value={percent(axes.labor)} detail="Medição operacional" /><MetricCard label="Realização financeira" value={percent(axes.financial)} detail="Sobre o orçamento selecionado" tone="warning" /><MetricCard label="Financiamento recebido" value={percent(axes.financing)} detail="Sobre os recursos previstos" /></div>}
    {visibility.activeStages && active.length > 0 && <div><div className="mb-3 flex items-center gap-2"><Clock3 size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Em execucao agora</h2></div><div className="grid gap-3 md:grid-cols-2">{active.map(stage => <StageProgress key={stage.id} stage={stage} />)}</div></div>}
    {visibility.stageProgress && <div className="card overflow-hidden"><div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)' }}><h2 className="font-semibold">Avanço por etapa</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Percentual físico registrado pela equipe.</p></div><div className="divide-y" style={{ borderColor: 'var(--border)' }}>{stages.map(stage => <div key={stage.id} className="px-4 py-3.5 sm:px-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{stage.name}</p><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{date(stage.start)} a {date(stage.end)}</p></div><span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: stage.physical >= 100 ? 'var(--success)' : 'var(--accent)' }}>{percent(stage.physical)}</span></div><Progress value={stage.physical} /></div>)}</div></div>}
  </section>
}

function StageProgress({ stage }: { stage: PortalContextDTO['presentation']['stages'][number] }) {
  return <article className="card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{stage.name}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{date(stage.start)} a {date(stage.end)}</p></div><Badge variant="info">{statusLabel[stage.status] || stage.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-4"><div><p className="text-xs">Fisico: {percent(stage.physical)}</p><Progress value={stage.physical} /></div><div><p className="text-xs">Mao de obra: {percent(stage.labor)}</p><Progress value={stage.labor} /></div></div></article>
}
function Progress({ value }: { value: number }) { return <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: 'var(--accent)' }} /></div> }

export function OverviewCharts({ context }: { context: PortalContextDTO }) {
  const data = context.presentation.stages.slice(0, 10).map(stage => ({ name: stage.name.replace(/^\d+\s*/, '').slice(0, 18), physical: stage.physical }))
  if (!data.length) return null
  return <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Avanço das etapas</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Percentual físico registrado em campo</p></div><div className="h-72"><BarChart responsive data={data} layout="vertical" style={{ width: '100%', height: '100%' }} margin={{ left: 8, right: 12 }}><CartesianGrid stroke="var(--border)" horizontal={false} /><XAxis type="number" domain={[0, 100]} hide /><YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={value => `${Number(value).toFixed(1)}%`} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} /><Bar dataKey="physical" name="Avanço" fill="var(--accent)" radius={[0, 4, 4, 0]} /></BarChart></div></div>
}

export function FinancialDetailView({ context }: { context: PortalContextDTO }) {
  const { financial } = context.presentation
  const visibility = context.contentVisibility.financeiro
  const chartData = financial.timeline.map(item => ({ ...item, label: month(item.month) }))
  return <section className="space-y-6">
    <div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Financeiro</p><h1 className="mt-1 text-3xl font-semibold">Investimento da obra</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Orçamento completo, incluindo BDI e gerenciamento, comparado aos lançamentos confirmados.</p></div>
    {visibility.indicators && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Valor orçado" value={money(financial.budget)} /><MetricCard label="Realizado" value={money(financial.realized)} tone="warning" /><MetricCard label="Pago" value={money(financial.paid)} tone="success" /><MetricCard label="Saldo orçamentário" value={money(financial.balance)} /></div>}
    {visibility.chart && chartData.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Evolução mensal</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Realizado e pago por mês</p></div><div className="h-64"><BarChart responsive data={chartData} style={{ width: '100%', height: '100%' }} margin={{ top: 4, right: 4, left: -16 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip formatter={value => money(Number(value))} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} /><Bar dataKey="realized" name="Realizado" fill="var(--accent)" radius={[4, 4, 0, 0]} /><Bar dataKey="paid" name="Pago" fill="var(--success)" radius={[4, 4, 0, 0]} /></BarChart></div></div>}
    {visibility.recent && <FinancialEntries title="Lançamentos recentes" items={financial.entries.slice(0, 5)} />}
    {visibility.allEntries && financial.entries.length > 0 && <FinancialEntries title="Todos os lançamentos" items={financial.entries} />}
  </section>
}

export function ForecastCharts({ context }: { context: PortalContextDTO }) {
  const items = context.previsoes.filter(item => item.valorPrevisto != null)
  if (!items.length) return null

  const byDate = new Map<string, { launches: number; purchases: number }>()
  const bySupplier = new Map<string, number>()
  const byWeek = new Map<string, { label: string; launches: number; purchases: number }>()

  for (const item of items) {
    const value = Number(item.valorPrevisto || 0)
    const supplier = item.fornecedorNome || 'Não informado'
    bySupplier.set(supplier, (bySupplier.get(supplier) || 0) + value)
    if (!item.dataPrevista) continue

    const dateEntry = byDate.get(item.dataPrevista) || { launches: 0, purchases: 0 }
    if (item.tipo === 'compra_material') dateEntry.purchases += value
    else dateEntry.launches += value
    byDate.set(item.dataPrevista, dateEntry)

    const due = new Date(`${item.dataPrevista}T12:00:00`)
    const weekStart = new Date(due)
    weekStart.setDate(due.getDate() - due.getDay())
    const key = weekStart.toISOString().slice(0, 10)
    const weekEntry = byWeek.get(key) || { label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(weekStart), launches: 0, purchases: 0 }
    if (item.tipo === 'compra_material') weekEntry.purchases += value
    else weekEntry.launches += value
    byWeek.set(key, weekEntry)
  }

  const orderedDates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
  const curve = orderedDates.map(([day], index) => {
    const accumulated = orderedDates.slice(0, index + 1).reduce((total, [, values]) => ({ launches: total.launches + values.launches, purchases: total.purchases + values.purchases }), { launches: 0, purchases: 0 })
    return { day: date(day).slice(0, 5), ...accumulated, total: accumulated.launches + accumulated.purchases }
  })
  const suppliers = [...bySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name: name.slice(0, 20), value }))
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
  const tooltipStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }

  return <div className="space-y-4">
    {curve.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Curva acumulada de previsões</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Lançamentos, compras e total previsto ao longo do tempo</p></div><div className="h-72"><ComposedChart responsive data={curve} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 8, left: -16 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip formatter={value => money(Number(value))} contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Area type="monotone" dataKey="launches" name="Lançamentos" fill="var(--danger)" fillOpacity={0.08} stroke="var(--danger)" /><Area type="monotone" dataKey="purchases" name="Compras" fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" /><Line type="monotone" dataKey="total" name="Total" stroke="var(--text-secondary)" strokeDasharray="5 5" dot={false} /></ComposedChart></div></div>}
    <div className="grid gap-4 lg:grid-cols-2">
      {suppliers.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Valores por fornecedor</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Distribuição do total comprometido</p></div><div className="h-64"><BarChart responsive data={suppliers} layout="vertical" style={{ width: '100%', height: '100%' }} margin={{ left: 8, right: 16 }}><CartesianGrid stroke="var(--border)" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={105} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={value => money(Number(value))} contentStyle={tooltipStyle} /><Bar dataKey="value" name="Total" fill="var(--accent)" radius={[0, 4, 4, 0]} /></BarChart></div></div>}
      {weeks.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Linha do tempo semanal</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Lançamentos e compras por semana</p></div><div className="h-64"><BarChart responsive data={weeks} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 8, left: -16 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip formatter={value => money(Number(value))} contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="launches" name="Lançamentos" fill="var(--danger)" radius={[4, 4, 0, 0]} /><Bar dataKey="purchases" name="Compras" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></div></div>}
    </div>
  </div>
}

function FinancialEntries({ title, items }: { title: string; items: PortalContextDTO['presentation']['financial']['entries'] }) {
  return <div><div className="mb-3 flex items-center gap-2"><Banknote size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">{title}</h2></div>{items.length ? <div className="space-y-3">{items.map(item => <StatusItemCard key={`${title}:${item.id}`} title={item.title} eyebrow={`${item.stage} · ${item.budget_name}`} value={money(item.value)} detail={item.payment_status === 'pago' ? 'Pago' : 'Em aberto'} tone={item.payment_status === 'pago' ? 'success' : 'warning'} meta={<div className="flex flex-wrap gap-x-3 gap-y-1"><span>{date(item.data)}</span>{item.supplier && <span>{item.supplier}</span>}{item.payment_method && <span>{item.payment_method}</span>}</div>} />)}</div> : <EmptyState title="Nenhum lançamento confirmado" description="Os lançamentos financeiros publicados aparecerão aqui." />}</div>
}

const sourceLabel = { financiamento: 'Financiamento Caixa', fgts: 'FGTS', recursos_proprios: 'Recursos proprios' }
export function FinancingDetailView({ context }: { context: PortalContextDTO }) {
  const { financing } = context.presentation
  const receivedPercent = financing.expected > 0 ? financing.received / financing.expected * 100 : 0
  return <section className="space-y-6"><div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Financiamento</p><h1 className="mt-1 text-3xl font-semibold">Fontes e reembolsos</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Acompanhamento separado do orcamento executivo da obra.</p></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Base prevista" value={money(financing.expected)} /><MetricCard label="Solicitado" value={money(financing.requested)} tone="warning" /><MetricCard label="Aprovado" value={money(financing.approved)} /><MetricCard label="Recebido" value={money(financing.received)} tone="success" /></div><div className="card p-4 sm:p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Progresso dos recursos</p><p className="mt-1 text-xl font-bold">{percent(receivedPercent)} recebido</p></div><p className="text-right text-sm font-semibold">Saldo<br />{money(financing.balance)}</p></div><Progress value={receivedPercent} /></div><div><div className="mb-3 flex items-center gap-2"><WalletCards size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Composicao dos recursos</h2></div><div className="grid gap-3 md:grid-cols-3">{financing.sources.map(source => <article key={source.id} className="card p-4"><div className="flex items-center justify-between gap-3"><Landmark size={18} style={{ color: 'var(--accent)' }} /><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{source.budgetName}</span></div><p className="mt-4 text-sm font-medium">{sourceLabel[source.type]}</p><p className="mt-1 text-xl font-bold">{money(source.value)}</p></article>)}</div></div><div><div className="mb-3 flex items-center gap-2"><CheckCircle2 size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Historico de reembolsos</h2></div>{financing.reimbursements.length ? <div className="space-y-3">{financing.reimbursements.map(item => <StatusItemCard key={item.id} title={item.title} eyebrow={item.status} value={money(item.received || item.approved || item.requested)} meta={<span>{date(item.date)}</span>} />)}</div> : <EmptyState title="Nenhum reembolso registrado" description="Solicitacoes, aprovacoes e recebimentos aparecerao aqui." />}</div></section>
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="card border-dashed px-5 py-10 text-center"><CalendarDays className="mx-auto" size={24} style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p></div> }
