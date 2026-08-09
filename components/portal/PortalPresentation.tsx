'use client'

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { Banknote, CalendarDays, CheckCircle2, Clock3, Landmark, WalletCards } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { MetricCard, StatusItemCard } from '@/components/ui/InsightCard'
import type { PortalContextDTO } from '@/lib/portal/types'

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function compactMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }).format(Number(value || 0))
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'A definir'
}

function month(value: string) {
  const [year, monthNumber] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, monthNumber - 1, 1)).replace('.', '')
}

function percent(value: number) {
  return `${Math.max(0, Math.min(100, Number(value || 0))).toFixed(1)}%`
}

const statusLabel: Record<string, string> = {
  concluida: 'Concluída',
  em_andamento: 'Em execução',
  planejada: 'Planejada',
  atrasada: 'Atenção',
}

export function EvolutionView({ context }: { context: PortalContextDTO }) {
  const { axes, stages } = context.presentation
  const active = stages.filter(item => item.physical > 0 && item.physical < 100)
  const completed = stages.filter(item => item.physical >= 100).length

  return <section className="space-y-6">
    <div>
      <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Evolução da obra</p>
      <h1 className="mt-1 text-3xl font-semibold">Avanços independentes</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Execução física, mão de obra, movimentação financeira e financiamento são acompanhados separadamente.</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Avanço físico" value={percent(axes.physical)} detail={`${completed} de ${stages.length} etapas concluídas`} tone="success" />
      <MetricCard label="Mão de obra" value={percent(axes.labor)} detail="Medição operacional" />
      <MetricCard label="Realização financeira" value={percent(axes.financial)} detail="Sobre o orçamento selecionado" tone="warning" />
      <MetricCard label="Financiamento recebido" value={percent(axes.financing)} detail="Sobre os recursos previstos" />
    </div>

    {active.length > 0 && <div>
      <div className="mb-3 flex items-center gap-2"><Clock3 size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Em execução agora</h2></div>
      <div className="grid gap-3 md:grid-cols-2">{active.map(stage => <StageProgress key={stage.id} stage={stage} />)}</div>
    </div>}

    <div className="card overflow-hidden">
      <div className="border-b px-4 py-4 sm:px-5" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-semibold">Avanço por etapa</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Percentual físico registrado pela equipe.</p>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {stages.map(stage => <div key={stage.id} className="px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><p className="truncate text-sm font-medium">{stage.name}</p><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{date(stage.start)} a {date(stage.end)}</p></div>
            <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: stage.physical >= 100 ? 'var(--success)' : 'var(--accent)' }}>{percent(stage.physical)}</span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, stage.physical)}%`, background: stage.physical >= 100 ? 'var(--success)' : 'var(--accent)' }} /></div>
        </div>)}
      </div>
    </div>
  </section>
}

function StageProgress({ stage }: { stage: PortalContextDTO['presentation']['stages'][number] }) {
  return <article className="card p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{stage.name}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{date(stage.start)} a {date(stage.end)}</p></div><Badge variant="info">{statusLabel[stage.status] || stage.status}</Badge></div>
    <div className="mt-4 grid grid-cols-2 gap-4"><Progress label="Físico" value={stage.physical} /><Progress label="Mão de obra" value={stage.labor} /></div>
  </article>
}

function Progress({ label, value }: { label: string; value: number }) {
  return <div><div className="flex justify-between gap-2 text-xs"><span style={{ color: 'var(--text-secondary)' }}>{label}</span><strong>{percent(value)}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: 'var(--accent)' }} /></div></div>
}

export function FinancialDetailView({ context }: { context: PortalContextDTO }) {
  const { financial } = context.presentation
  const chartData = financial.timeline.map(item => ({ ...item, label: month(item.month) }))
  return <section className="space-y-6">
    <div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Financeiro</p><h1 className="mt-1 text-3xl font-semibold">Investimento da obra</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Valores do orçamento selecionado e lançamentos confirmados.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Valor orçado" value={money(financial.budget)} />
      <MetricCard label="Realizado" value={money(financial.realized)} tone="warning" />
      <MetricCard label="Pago" value={money(financial.paid)} tone="success" />
      <MetricCard label="Saldo orçamentário" value={money(financial.balance)} />
    </div>
    {chartData.length > 0 && <div className="card min-w-0 p-4 sm:p-5"><div className="mb-5"><h2 className="font-semibold">Evolução mensal</h2><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Realizado e pago por mês</p></div><div className="h-64 min-w-0"><BarChart responsive data={chartData} style={{ width: '100%', height: '100%' }} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} width={62} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} /><Bar dataKey="realized" name="Realizado" fill="var(--accent)" radius={[4, 4, 0, 0]} /><Bar dataKey="paid" name="Pago" fill="var(--success)" radius={[4, 4, 0, 0]} /></BarChart></div></div>}
    <div><div className="mb-3 flex items-center gap-2"><Banknote size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Lançamentos recentes</h2></div>{financial.recent.length ? <div className="space-y-3">{financial.recent.map(item => <StatusItemCard key={item.id} title={item.title} eyebrow={`${item.stage} · ${item.budget_name}`} value={money(item.value)} detail={item.payment_status === 'pago' ? 'Pago' : 'Em aberto'} tone={item.payment_status === 'pago' ? 'success' : 'warning'} meta={<span>{date(item.data)}</span>} />)}</div> : <EmptyState title="Nenhum lançamento confirmado" description="Os lançamentos financeiros publicados aparecerão aqui." />}</div>
  </section>
}

const sourceLabel = { financiamento: 'Financiamento Caixa', fgts: 'FGTS', recursos_proprios: 'Recursos próprios' }

export function FinancingDetailView({ context }: { context: PortalContextDTO }) {
  const { financing } = context.presentation
  const receivedPercent = financing.expected > 0 ? financing.received / financing.expected * 100 : 0
  return <section className="space-y-6">
    <div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Financiamento</p><h1 className="mt-1 text-3xl font-semibold">Fontes e reembolsos</h1><p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Acompanhamento separado do orçamento executivo da obra.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Base prevista" value={money(financing.expected)} /><MetricCard label="Solicitado" value={money(financing.requested)} tone="warning" /><MetricCard label="Aprovado" value={money(financing.approved)} /><MetricCard label="Recebido" value={money(financing.received)} tone="success" /></div>
    <div className="card p-4 sm:p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Progresso dos recursos</p><p className="mt-1 text-xl font-bold">{percent(receivedPercent)} recebido</p></div><p className="text-right text-sm font-semibold">Saldo<br />{money(financing.balance)}</p></div><div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, receivedPercent)}%`, background: 'var(--success)' }} /></div></div>
    <div><div className="mb-3 flex items-center gap-2"><WalletCards size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Composição dos recursos</h2></div><div className="grid gap-3 md:grid-cols-3">{financing.sources.map(source => <article key={source.id} className="card p-4"><div className="flex items-center justify-between gap-3"><Landmark size={18} style={{ color: 'var(--accent)' }} /><span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{source.budgetName}</span></div><p className="mt-4 text-sm font-medium">{sourceLabel[source.type]}</p><p className="mt-1 text-xl font-bold tabular-nums">{money(source.value)}</p>{source.note && <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{source.note}</p>}</article>)}</div></div>
    <div><div className="mb-3 flex items-center gap-2"><CheckCircle2 size={18} style={{ color: 'var(--accent)' }} /><h2 className="text-lg font-semibold">Histórico de reembolsos</h2></div>{financing.reimbursements.length ? <div className="space-y-3">{financing.reimbursements.map(item => <StatusItemCard key={item.id} title={item.title} eyebrow={item.status} value={money(item.received || item.approved || item.requested)} meta={<span>{date(item.date)}</span>} />)}</div> : <EmptyState title="Nenhum reembolso registrado" description="As fontes de recursos já estão cadastradas. Solicitações, aprovações e recebimentos aparecerão aqui quando forem lançados." />}</div>
  </section>
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="card border-dashed px-5 py-10 text-center"><CalendarDays className="mx-auto" size={24} style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-semibold">{title}</p><p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p></div>
}
