'use client'

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts'
import { Banknote, CalendarDays, CheckCircle2, Clock3, Landmark, WalletCards } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MetricCard, StatusItemCard, toneColor, type Tone } from '@/components/ui/InsightCard'
import type { PortalContextDTO } from '@/lib/portal/types'
import { formatPercent } from '@/lib/portal/format'

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const compactMoney = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(Number(value || 0))
const date = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'A definir'
const month = (value: string) => { const [year, number] = value.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, number - 1, 1)).replace('.', '') }
const percent = (value: number) => formatPercent(value, { clamp: true })
const statusLabel: Record<string, string> = { concluida: 'Concluida', em_andamento: 'Em execucao', planejada: 'Planejada', atrasada: 'Atencao' }
const tooltipContentStyle = { background: 'var(--bg-card)', border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)', borderRadius: 8 }
const tooltipLabelStyle = { color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }
const tooltipItemStyle = { color: 'var(--text-secondary)' }
const tooltipCursor = { fill: 'color-mix(in srgb, var(--border) 30%, transparent)' }

export function EvolutionView({ context }: { context: PortalContextDTO }) {
  const { axes, stages } = context.presentation
  const visibility = context.contentVisibility.evolucao
  const active = stages.filter(item => item.physical > 0 && item.physical < 100)
  const completed = stages.filter(item => item.physical >= 100).length
  return <section className="space-y-6">
    <div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Evolução da obra</p><h1 className="mt-1 text-3xl font-semibold">Avanços independentes</h1><p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Execução física, mão de obra, movimentação financeira e financiamento são acompanhados separadamente.</p></div>
    {visibility.indicators && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><RingMetricCard label="Avanço físico" value={axes.physical} detail={`Medição · ${completed} de ${stages.length} etapas concluídas`} tone="success" /><RingMetricCard label="Mão de obra" value={axes.labor} detail="Medição de mão de obra" /><RingMetricCard label="Realização financeira" value={axes.financial} detail="Lançamentos sobre o orçamento" tone="warning" /><RingMetricCard label="Financiamento recebido" value={axes.financing} detail="Sobre os recursos previstos" /></div>}
    {visibility.activeStages && active.length > 0 && <div><div className="mb-3 flex items-center gap-2"><Clock3 size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Em execucao agora</h2></div><div className="grid gap-3 md:grid-cols-2">{active.map(stage => <StageProgress key={stage.id} stage={stage} />)}</div></div>}
    {visibility.stageProgress && <div className="card overflow-hidden"><div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)' }}><h2 className="font-semibold">Avanço por etapa</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Percentual físico registrado pela equipe.</p></div><div className="divide-y" style={{ borderColor: 'var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>{stages.map(stage => <div key={stage.id} className="px-4 py-3.5 sm:px-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{stage.name}</p><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{date(stage.start)} a {date(stage.end)}</p></div><span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: stage.physical >= 100 ? 'var(--success)' : 'var(--accent)' }}>{percent(stage.physical)}</span></div><Progress value={stage.physical} /></div>)}</div></div>}
  </section>
}

function StageProgress({ stage }: { stage: PortalContextDTO['presentation']['stages'][number] }) {
  return <article className="card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{stage.name}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{date(stage.start)} a {date(stage.end)}</p></div><Badge variant="info">{statusLabel[stage.status] || stage.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-4"><div><p className="text-xs">Fisico: {percent(stage.physical)}</p><Progress value={stage.physical} /></div><div><p className="text-xs">Mao de obra: {percent(stage.labor)}</p><Progress value={stage.labor} /></div></div></article>
}
function Progress({ value }: { value: number }) { return <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: 'var(--accent)' }} /></div> }

export function RingMetricCard({ label, value, detail, tone = 'accent' }: { label: string; value: number; detail?: string; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, Number(value || 0)))
  return <article className="card relative min-w-0 overflow-hidden p-4 sm:p-5">
    <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: toneColor[tone] }} />
    <div className="flex min-w-0 items-center gap-3">
      <div className="portal-progress-ring grid size-14 shrink-0 place-items-center rounded-full" style={{ '--progress': clamped } as React.CSSProperties}>
        <div className="grid size-10 place-items-center rounded-full" style={{ background: 'var(--bg-card)' }}>
          <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatPercent(clamped, { clamp: true })}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        {detail && <p className="mt-1 text-xs leading-4" style={{ color: 'var(--text-secondary)' }}>{detail}</p>}
      </div>
    </div>
  </article>
}

function PaymentPercentCard({ label, planned, paid, detail, className }: { label: string; planned: number; paid: number; detail?: string; className?: string }) {
  const pct = planned > 0 ? Math.min(100, paid / planned * 100) : (paid > 0 ? 100 : 0)
  return <article className={`card relative min-w-0 overflow-hidden p-4 sm:p-5 ${className || ''}`}>
    <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'var(--accent)' }} />
    <p className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{label}</p>
    <p className="mt-2 whitespace-nowrap text-xl font-bold leading-tight tabular-nums sm:text-2xl" style={{ color: 'var(--text-primary)' }}>{formatPercent(pct, { clamp: true })}</p>
    <Progress value={pct} />
    {detail && <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{detail}</p>}
  </article>
}

export function PaymentPercentGrid({ operational }: { operational: PortalContextDTO['presentation']['financial']['operational'] }) {
  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <PaymentPercentCard label="Materiais pagos" planned={operational.materials.planned} paid={operational.materials.paid} />
      <PaymentPercentCard label="Mão de obra paga" planned={operational.labor.planned} paid={operational.labor.paid} detail="Medição de mão de obra" />
      <PaymentPercentCard label="Gerenciamento pago" planned={operational.management.planned} paid={operational.management.paid} detail="Medição de gerenciamento" />
      <MetricCard label="Equipamentos" value={money(operational.otherEquipmentPaid)} detail="Fora do total operacional" />
    </div>
    <PaymentPercentCard className="mt-3" label="Total operacional pago" planned={operational.total.planned} paid={operational.total.paid} detail="Sobre o total previsto" />
  </>
}

export function OverviewCharts({ context }: { context: PortalContextDTO }) {
  const data = context.presentation.overview.monthlyEvolution.map(item => ({
    ...item,
    label: `${month(item.month)}${item.kind === 'forecast' ? ' (prev.)' : ''}`,
  }))
  if (!data.length) return null
  return <div className="card min-w-0 overflow-hidden"><div className="p-4 pb-0 sm:p-5 sm:pb-0"><h2 className="font-semibold">Evolução físico-financeira</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Medições realizadas e a próxima previsão do cronograma Caixa</p></div><div className="h-72 p-2 sm:p-4"><ComposedChart responsive data={data} style={{ width: '100%', height: '100%' }} margin={{ top: 12, right: 2, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis yAxisId="value" tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={66} /><YAxis yAxisId="physical" orientation="right" domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={38} /><Tooltip cursor={tooltipCursor} formatter={(value, name) => name === 'Avanço físico' ? formatPercent(Number(value)) : money(Number(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar yAxisId="value" dataKey="value" name="Valor acumulado" fill="var(--accent)" fillOpacity={0.18} stroke="var(--accent)" radius={[4, 4, 0, 0]} /><Line yAxisId="physical" type="monotone" dataKey="physical" name="Avanço físico" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></div><div className="divide-y border-t" style={{ borderColor: 'var(--border)', '--tw-divide-color': 'var(--border)' } as React.CSSProperties}>{data.map(item => <div key={item.month} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-sm sm:grid-cols-[110px_1fr_auto] sm:px-5"><div className="flex items-center gap-2"><span className="font-semibold capitalize">{month(item.month)}/{item.month.slice(2, 4)}</span>{item.kind === 'forecast' && <Badge variant="info">Previsão</Badge>}</div><span className="hidden text-xs sm:block" style={{ color: 'var(--text-secondary)' }}>{item.kind === 'forecast' ? 'Próxima medição' : 'Realizado'}</span><div className="text-right"><p className="font-bold tabular-nums">{formatPercent(Number(item.physical))}</p><p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{money(item.value)}</p></div></div>)}</div></div>
}

export function FinancialDetailView({ context }: { context: PortalContextDTO }) {
  const { financial } = context.presentation
  const { operational } = financial
  const visibility = context.contentVisibility.financeiro
  const chartData = financial.timeline.map(item => ({ ...item, label: month(item.month) }))
  return <section className="space-y-6">
    <div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Financeiro</p><h1 className="mt-1 text-3xl font-semibold">Investimento da obra</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Orçamento completo, incluindo BDI e gerenciamento, comparado aos lançamentos confirmados.</p></div>
    {visibility.indicators && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Valor orçado" value={money(financial.budget)} /><MetricCard label="Lançamentos confirmados" value={money(financial.realized)} tone="warning" /><MetricCard label="Pago (lançamentos)" value={money(financial.paid)} detail="Compras e serviços lançados" tone="success" /><MetricCard label="Saldo orçamentário" value={money(financial.balance)} /></div>}

    {visibility.indicators && <div className="card p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold">Pagamento operacional</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Materiais lançados + mão de obra e gerenciamento medidos — mesmo total da Visão Geral, nunca somado ao &quot;Pago (lançamentos)&quot; acima.</p></div>
      <PaymentPercentGrid operational={operational} />
    </div>}

    {visibility.chart && chartData.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Evolução mensal</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Lançamentos confirmados e pagos (compra_itens) por mês</p></div><div className="h-64"><BarChart responsive data={chartData} style={{ width: '100%', height: '100%' }} margin={{ top: 4, right: 4, left: -16 }}><CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip cursor={tooltipCursor} formatter={value => money(Number(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="realized" name="Confirmado" fill="var(--accent)" radius={[4, 4, 0, 0]} /><Bar dataKey="paid" name="Pago" fill="var(--success)" radius={[4, 4, 0, 0]} /></BarChart></div></div>}
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

  return <div className="space-y-4">
    {curve.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Curva acumulada de previsões</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Lançamentos, compras e total previsto ao longo do tempo</p></div><div className="h-72"><ComposedChart responsive data={curve} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 8, left: -16 }}><CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} /><XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip cursor={tooltipCursor} formatter={value => money(Number(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Area type="monotone" dataKey="launches" name="Lançamentos" fill="var(--danger)" fillOpacity={0.08} stroke="var(--danger)" /><Area type="monotone" dataKey="purchases" name="Compras" fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" /><Line type="monotone" dataKey="total" name="Total" stroke="var(--text-secondary)" strokeDasharray="5 5" dot={false} /></ComposedChart></div></div>}
    <div className="grid gap-4 lg:grid-cols-2">
      {suppliers.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Valores por fornecedor</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Distribuição do total comprometido</p></div><div className="h-64"><BarChart responsive data={suppliers} layout="vertical" style={{ width: '100%', height: '100%' }} margin={{ left: 8, right: 16 }}><CartesianGrid stroke="var(--border)" strokeOpacity={0.5} horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={105} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip cursor={tooltipCursor} formatter={value => money(Number(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="value" name="Total" fill="var(--accent)" radius={[0, 4, 4, 0]} /></BarChart></div></div>}
      {weeks.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Linha do tempo semanal</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Lançamentos e compras por semana</p></div><div className="h-64"><BarChart responsive data={weeks} style={{ width: '100%', height: '100%' }} margin={{ top: 8, right: 8, left: -16 }}><CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip cursor={tooltipCursor} formatter={value => money(Number(value))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="launches" name="Lançamentos" fill="var(--danger)" radius={[4, 4, 0, 0]} /><Bar dataKey="purchases" name="Compras" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></div></div>}
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
