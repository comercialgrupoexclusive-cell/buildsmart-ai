'use client'

import { useEffect, useState } from 'react'
import {
  HardHat, FileText, AlertTriangle, TrendingUp, Calendar,
  Package, ShoppingCart, Zap, CheckCircle2, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra, Etapa, Material } from '@/lib/types'
import { formatCurrency, diasAteData, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { ClimaWidgets } from '@/components/dashboard/ClimaWidgets'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts'

type DashboardData = {
  obras: Obra[]
  etapasProximas: (Etapa & { obra_nome: string })[]
  todasEtapas: Etapa[]
  materiaisPendentes: (Material & { obra_nome: string; insumo_descricao: string })[]
  alertas: number
}

type AcaoPrioritaria = {
  icon: typeof HardHat
  color: string
  titulo: string
  subtitulo: string
  href: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const [data, setData] = useState<DashboardData>({
    obras: [],
    etapasProximas: [],
    todasEtapas: [],
    materiaisPendentes: [],
    alertas: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)

    const [obrasRes, etapasRes, todasEtapasRes, materiaisRes] = await Promise.all([
      supabase.from('obras').select('*').order('created_at', { ascending: false }),
      supabase
        .from('etapas')
        .select('*, obras(nome)')
        .gte('data_inicio', new Date().toISOString().split('T')[0])
        .order('data_inicio'),
      // Todas as etapas (sem filtro de data) — usadas para montar a Curva S (previsto x realizado)
      supabase.from('etapas').select('id, obra_id, nome, status, data_inicio, data_fim, ordem'),
      supabase
        .from('materiais')
        // schema v3: descricao é coluna direta, não via join sinapi_insumos
        .select('*, obras(nome)')
        .neq('status_compra', 'comprado')
        .order('data_necessidade'),
    ])

    const obras = obrasRes.data || []

    const etapas = (etapasRes.data || []).map((e: any) => ({
      ...e,
      obra_nome: e.obras?.nome || '',
    })).filter((e: any) => e.data_inicio && diasAteData(e.data_inicio) <= 7)

    const materiais = (materiaisRes.data || []).map((m: any) => ({
      ...m,
      obra_nome: m.obras?.nome || '',
      insumo_descricao: m.descricao || '',   // schema v3: coluna direta
    }))

    setData({ obras, etapasProximas: etapas, todasEtapas: (todasEtapasRes.data || []) as Etapa[], materiaisPendentes: materiais, alertas: etapas.length })
    setLoading(false)
  }

  const obrasAtivas = data.obras.filter(o => o.status === 'ativa').length
  const materiaisParciais = data.materiaisPendentes.filter(m => m.status_compra === 'parcial').length
  const materiaisNaoComprados = data.materiaisPendentes.filter(m => m.status_compra === 'nao_comprado').length
  const materiaisComPrazo = data.materiaisPendentes.filter(m => m.data_necessidade).length

  const materiaisPorStatus = [
    { nome: 'Não comprado', value: materiaisNaoComprados, cor: '#EF4444' },
    { nome: 'Parcial', value: materiaisParciais, cor: '#F59E0B' },
    { nome: 'Com prazo', value: materiaisComPrazo, cor: '#3B7BF8' },
  ].filter(item => item.value > 0)

  // ─── Painel preditivo: ações calculadas dos dados já carregados ───────────
  const acoesPrioritarias: AcaoPrioritaria[] = []

  // 1. Materiais com prazo â‰¤ 3 dias
  data.materiaisPendentes
    .filter(m => m.data_necessidade && diasAteData(m.data_necessidade) <= 3)
    .slice(0, 2)
    .forEach(m => {
      const dias = m.data_necessidade ? diasAteData(m.data_necessidade) : null
      acoesPrioritarias.push({
        icon: ShoppingCart,
        color: 'var(--danger)',
        titulo: `Material previsto: ${m.insumo_descricao.substring(0, 38)}`,
        subtitulo: `${m.obra_nome}${dias !== null ? ` · previsto em ${dias}d` : ''}`,
        href: `/obras/${m.obra_id}?tab=materiais`,
      })
    })

  // 2. Etapas crÃ­ticas (â‰¤ 5 dias)
  data.etapasProximas
    .filter(e => e.data_inicio && diasAteData(e.data_inicio) <= 5)
    .slice(0, 2)
    .forEach(e => {
      const dias = e.data_inicio ? diasAteData(e.data_inicio) : null
      acoesPrioritarias.push({
        icon: AlertTriangle,
        color: 'var(--warning)',
        titulo: `Próxima etapa: ${e.nome}`,
        subtitulo: `${e.obra_nome}${dias !== null ? ` · prevista em ${dias}d` : ''}`,
        href: `/obras/${e.obra_id}`,
      })
    })

  // 3. Obras em orçamento (sem cronograma ativo)
  data.obras
    .filter(o => o.status === 'orcamento')
    .slice(0, 1)
    .forEach(o => {
      acoesPrioritarias.push({
        icon: FileText,
        color: 'var(--accent)',
        titulo: `Orçamento em elaboração`,
        subtitulo: o.nome,
        href: `/obras/${o.id}`,
      })
    })

  // 4. Materiais sem prazo definido (pendentes sem data)
  const semPrazo = data.materiaisPendentes.filter(m => !m.data_necessidade)
  if (semPrazo.length > 0 && acoesPrioritarias.length < 4) {
    acoesPrioritarias.push({
      icon: Package,
      color: 'var(--text-secondary)',
      titulo: `${semPrazo.length} ${semPrazo.length === 1 ? 'material sem' : 'materiais sem'} data de compra`,
      subtitulo: 'Defina prazos para monitoramento automático',
      href: '/materiais',
    })
  }

  // Tendência: consumo previsto (itens com necessidade prevista) vs. itens já garantidos em estoque/compra,
  // acumulados ao longo dos próximos 15 dias — ajuda a antecipar rupturas de suprimento.
  const consumoVsEstoque = (() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    let consumoAcumulado = 0
    let estoqueAcumulado = 0

    return Array.from({ length: 15 }, (_, i) => {
      const dia = new Date(hoje)
      dia.setDate(dia.getDate() + i)
      const diaStr = dia.toISOString().split('T')[0]

      const previstosNoDia = data.materiaisPendentes.filter(m => m.data_necessidade === diaStr)
      consumoAcumulado += previstosNoDia.length
      estoqueAcumulado += previstosNoDia.filter(m => m.status_compra !== 'nao_comprado').length

      return {
        dia: dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        consumo: consumoAcumulado,
        estoque: estoqueAcumulado,
      }
    })
  })()

  // Curva S do portfólio: % acumulado de etapas previstas para concluir até cada mês
  // (linha "Previsto") vs % acumulado de etapas efetivamente concluídas até o mês
  // corrente (linha "Realizado") — visão clássica de avanço físico planejado x executado.
  const curvaS = (() => {
    const comDatas = data.todasEtapas.filter(e => e.data_inicio && e.data_fim)
    if (comDatas.length === 0) return [] as { mes: string; previsto: number; realizado: number }[]

    const total = comDatas.length
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

    const inicio = new Date(Math.min(...comDatas.map(e => new Date(e.data_inicio as string).getTime())))
    const fimPrevisto = new Date(Math.max(...comDatas.map(e => new Date(e.data_fim as string).getTime())))
    // Janela de exibição: do início do portfólio até o maior entre (fim previsto, hoje)
    const fim = fimPrevisto.getTime() > hoje.getTime() ? fimPrevisto : hoje

    const meses: { rotulo: string; fimMes: Date }[] = []
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1)
    const limite = new Date(fim.getFullYear(), fim.getMonth(), 1)
    while (cursor.getTime() <= limite.getTime() && meses.length < 36) {
      const fimMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      meses.push({ rotulo: cursor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), fimMes })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    return meses.map(({ rotulo, fimMes }) => {
      const previstoCount = comDatas.filter(e => new Date(e.data_fim as string).getTime() <= fimMes.getTime()).length
      // "Realizado" só conta etapas concluídas até o mês — e não projeta além de hoje
      const realizadoCount = fimMes.getTime() > hoje.getTime()
        ? comDatas.filter(e => e.status === 'concluida' && new Date(e.data_fim as string).getTime() <= hoje.getTime()).length
        : comDatas.filter(e => e.status === 'concluida' && new Date(e.data_fim as string).getTime() <= fimMes.getTime()).length
      return {
        mes: rotulo,
        previsto: Math.round((previstoCount / total) * 1000) / 10,
        realizado: Math.round((realizadoCount / total) * 1000) / 10,
      }
    })
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-6 overflow-hidden relative">
        <div className="absolute right-5 top-5 opacity-10">
          <HardHat size={96} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Painel preditivo</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
            Visão rápida das obras
          </h1>
          <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Próximas etapas, materiais a comprar, clima e pontos de decisão em um só lugar.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 relative">
          {[
            { label: 'Obras', value: data.obras.length, color: 'var(--accent)' },
            { label: 'Ativas', value: obrasAtivas, color: 'var(--success)' },
            { label: 'Materiais', value: data.materiaisPendentes.length, color: 'var(--warning)' },
            { label: 'Etapas próximas', value: data.alertas, color: data.alertas > 0 ? 'var(--danger)' : 'var(--success)' },
          ].map(item => (
            <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      <ClimaWidgets etapasProximas={data.etapasProximas} alertasInternos={data.alertas} />

      {/* Curva S do portfólio: avanço físico previsto x realizado */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Curva S — Avanço físico do portfólio</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          % acumulado de etapas previstas para concluir até cada mês (linha prevista) comparado ao % efetivamente concluído (linha realizada).
        </p>
        {curvaS.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Calendar size={36} style={{ color: 'var(--border)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre etapas com datas de início e fim para gerar a curva S</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={curvaS}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [`${value}%`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="previsto" name="Previsto (acumulado)" stroke="var(--accent)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="realizado" name="Realizado (acumulado)" stroke="var(--success)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráficos + próximos 7 dias */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tendência de Consumo vs Estoque — Próximos 15 dias
            </h2>
          </div>

          {data.materiaisPendentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Package size={36} style={{ color: 'var(--border)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Sem materiais previstos para os próximos dias</p>
              <Link href="/materiais" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Ver materiais</Link>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={consumoVsEstoque}>
                <defs>
                  <linearGradient id="colorConsumo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorEstoque" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                />
                <Area type="monotone" dataKey="consumo" stroke="var(--warning)" fill="url(#colorConsumo)" strokeWidth={2} name="Consumo previsto (acumulado)" />
                <Area type="monotone" dataKey="estoque" stroke="var(--success)" fill="url(#colorEstoque)" strokeWidth={2} name="Garantido em estoque/compra" />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
            Quanto maior o vão entre as curvas, maior o risco de falta de material no período.
          </p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package size={18} style={{ color: 'var(--warning)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Materiais em aberto</h2>
          </div>
          {materiaisPorStatus.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center gap-2">
              <CheckCircle2 size={28} style={{ color: 'var(--success)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum material pendente</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={materiaisPorStatus} dataKey="value" nameKey="nome" innerRadius={48} outerRadius={72} paddingAngle={4} animationDuration={900}>
                    {materiaisPorStatus.map(item => <Cell key={item.nome} fill={item.cor} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {materiaisPorStatus.map(item => (
                  <div key={item.nome} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.cor }} />
                      {item.nome}
                    </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
        {/* Próximos 7 dias */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Próximos 7 dias</h2>
          </div>
          {data.etapasProximas.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma etapa prevista para os próximos dias
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.etapasProximas.slice(0, 5).map((etapa) => {
                const dias = etapa.data_inicio ? diasAteData(etapa.data_inicio) : null
                return (
                  <div key={etapa.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: dias !== null && dias <= 2 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                        color: dias !== null && dias <= 2 ? 'var(--danger)' : 'var(--warning)',
                      }}
                    >
                      {dias !== null ? `${dias}d` : '—'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{etapa.obra_nome}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Materiais pendentes + Ações Prioritárias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Materiais pendentes */}
        {data.materiaisPendentes.length > 0 && (
          <div className="card p-6 border-l-4" style={{ borderLeftColor: 'var(--warning)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Package size={18} style={{ color: 'var(--warning)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Materiais previstos
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              {data.materiaisPendentes.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.insumo_descricao}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.obra_nome}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${m.status_compra === 'nao_comprado' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {m.status_compra === 'nao_comprado' ? 'Não comprado' : 'Parcial'}
                  </span>
                </div>
              ))}
            </div>
            {data.materiaisPendentes.length > 4 && (
              <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
                + {data.materiaisPendentes.length - 4} outros materiais previstos
              </p>
            )}
          </div>
        )}

        {/* Ações Prioritárias — substitui "Obras Recentes" */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Ações Prioritárias</h2>
          </div>

          {acoesPrioritarias.length === 0 ? (
            <div className="py-8 text-center flex flex-col items-center gap-2">
              <CheckCircle2 size={30} style={{ color: 'var(--success)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Tudo em dia</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhum ponto de decisão previsto no momento</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {acoesPrioritarias.map((acao, i) => (
                <Link
                  key={i}
                  href={acao.href}
                  className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg-secondary)' }}
                  >
                    <acao.icon size={15} style={{ color: acao.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{acao.titulo}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{acao.subtitulo}</p>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
