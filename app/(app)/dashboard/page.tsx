'use client'

import { useEffect, useState } from 'react'
import {
  HardHat, FileText, AlertTriangle, TrendingUp, Calendar,
  Package, ShoppingCart, Zap, CheckCircle2, ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra, Etapa, Material } from '@/lib/types'
import { formatCurrency, diasAteData, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import Link from 'next/link'

type DashboardData = {
  obras: Obra[]
  etapasProximas: (Etapa & { obra_nome: string })[]
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
    materiaisPendentes: [],
    alertas: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)

    const [obrasRes, etapasRes, materiaisRes] = await Promise.all([
      supabase.from('obras').select('*').order('created_at', { ascending: false }),
      supabase
        .from('etapas')
        .select('*, obras(nome)')
        .gte('data_inicio', new Date().toISOString().split('T')[0])
        .order('data_inicio'),
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

    setData({ obras, etapasProximas: etapas, materiaisPendentes: materiais, alertas: etapas.length })
    setLoading(false)
  }

  const obrasAtivas = data.obras.filter(o => o.status === 'ativa').length
  const orcamentosAndamento = data.obras.filter(o => o.status === 'orcamento').length

  // ─── Painel preditivo: ações calculadas dos dados já carregados ───────────
  const acoesPrioritarias: AcaoPrioritaria[] = []

  // 1. Materiais com prazo ≤ 3 dias
  data.materiaisPendentes
    .filter(m => m.data_necessidade && diasAteData(m.data_necessidade) <= 3)
    .slice(0, 2)
    .forEach(m => {
      const dias = m.data_necessidade ? diasAteData(m.data_necessidade) : null
      acoesPrioritarias.push({
        icon: ShoppingCart,
        color: 'var(--danger)',
        titulo: `Compra urgente: ${m.insumo_descricao.substring(0, 38)}`,
        subtitulo: `${m.obra_nome}${dias !== null ? ` · vence em ${dias}d` : ''}`,
        href: `/obras/${m.obra_id}`,
      })
    })

  // 2. Etapas críticas (≤ 5 dias)
  data.etapasProximas
    .filter(e => e.data_inicio && diasAteData(e.data_inicio) <= 5)
    .slice(0, 2)
    .forEach(e => {
      const dias = e.data_inicio ? diasAteData(e.data_inicio) : null
      acoesPrioritarias.push({
        icon: AlertTriangle,
        color: 'var(--warning)',
        titulo: `Etapa iminente: ${e.nome}`,
        subtitulo: `${e.obra_nome}${dias !== null ? ` · inicia em ${dias}d` : ''}`,
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
      href: '/obras',
    })
  }

  // Composição de obras por status (dados reais)
  const statusDistrib = [
    { label: 'Ativa', count: data.obras.filter(o => o.status === 'ativa').length, color: '#10B981' },
    { label: 'Orçamento', count: data.obras.filter(o => o.status === 'orcamento').length, color: 'var(--accent)' },
    { label: 'Concluída', count: data.obras.filter(o => o.status === 'concluida').length, color: '#6B7280' },
    { label: 'Paralisada', count: data.obras.filter(o => o.status === 'paralisada').length, color: '#F59E0B' },
  ].filter(s => s.count > 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={HardHat}
          label="Obras Ativas"
          value={String(obrasAtivas)}
          color="var(--success)"
          hint="em andamento"
        />
        <KpiCard
          icon={FileText}
          label="Orçamentos em Andamento"
          value={String(orcamentosAndamento)}
          color="var(--accent)"
          hint="em elaboração"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Alertas do Dia"
          value={String(data.alertas)}
          color={data.alertas > 0 ? 'var(--warning)' : 'var(--success)'}
          hint={data.alertas > 0 ? 'etapas críticas' : 'tudo em dia'}
        />
      </div>

      {/* ── Gráfico + Próximos 7 dias ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Composição do Portfólio
            </h2>
          </div>

          {data.obras.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <HardHat size={36} style={{ color: 'var(--border)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre obras para ver o painel</p>
              <Link href="/obras" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>+ Nova obra</Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Barras de status */}
              {statusDistrib.map(({ label, count, color }) => {
                const pct = data.obras.length > 0 ? (count / data.obras.length) * 100 : 0
                return (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span style={{ color: 'var(--text-primary)' }}>{label}</span>
                      <span className="font-semibold" style={{ color }}>{count} obra{count !== 1 ? 's' : ''} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}

              {/* Lista das obras mais recentes */}
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>OBRAS RECENTES</p>
                <div className="grid grid-cols-2 gap-2">
                  {data.obras.slice(0, 4).map(o => (
                    <Link key={o.id} href={`/obras/${o.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                        background: o.status === 'ativa' ? '#10B981' : o.status === 'orcamento' ? 'var(--accent)' : '#6B7280'
                      }} />
                      <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{o.nome}</span>
                      <ChevronRight size={11} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Próximos 7 dias */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Próximos 7 dias</h2>
          </div>
          {data.etapasProximas.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma etapa crítica
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

      {/* ── Materiais pendentes + Ações Prioritárias ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Materiais pendentes */}
        {data.materiaisPendentes.length > 0 && (
          <div className="card p-6 border-l-4" style={{ borderLeftColor: 'var(--warning)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Package size={18} style={{ color: 'var(--warning)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Materiais com compra pendente
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
                + {data.materiaisPendentes.length - 4} outros pendentes
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
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nenhuma ação urgente no momento</p>
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
                    style={{ background: `${acao.color.replace('var(--', '').replace(')', '')}15` || '#ffffff10' }}
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

function KpiCard({ icon: Icon, label, value, color, hint }: {
  icon: typeof HardHat
  label: string
  value: string
  color: string
  hint: string
}) {
  return (
    <div className="card p-6 animate-enter">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)', fontFamily: 'DM Serif Display, serif' }}>
        {value}
      </p>
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{hint}</p>
    </div>
  )
}
