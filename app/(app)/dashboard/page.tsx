'use client'

import { useEffect, useState } from 'react'
import { HardHat, FileText, AlertTriangle, TrendingUp, Calendar, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Obra, Etapa, Material } from '@/lib/types'
import { formatCurrency, diasAteData, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts'

type DashboardData = {
  obras: Obra[]
  etapasProximas: (Etapa & { obra_nome: string })[]
  materiaisPendentes: (Material & { obra_nome: string; insumo_descricao: string })[]
  alertas: number
}

export default function DashboardPage() {
  const { currentProfile } = useProfile()
  const supabase = createClient()
  const [data, setData] = useState<DashboardData>({
    obras: [],
    etapasProximas: [],
    materiaisPendentes: [],
    alertas: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

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
        .select('*, obras(nome), sinapi_insumos(descricao)')
        .neq('status_compra', 'comprado')
        .order('data_necessidade'),
    ])

    const obras = obrasRes.data || []
    const etapas = (etapasRes.data || []).map((e: any) => ({
      ...e,
      obra_nome: e.obras?.nome || '',
    })).filter((e: any) => diasAteData(e.data_inicio) <= 7)

    const materiais = (materiaisRes.data || []).map((m: any) => ({
      ...m,
      obra_nome: m.obras?.nome || '',
      insumo_descricao: m.sinapi_insumos?.descricao || '',
    }))

    setData({
      obras,
      etapasProximas: etapas,
      materiaisPendentes: materiais,
      alertas: etapas.length,
    })
    setLoading(false)
  }

  const obrasAtivas = data.obras.filter(o => o.status === 'ativa').length
  const orcamentosAndamento = data.obras.filter(o => o.status === 'orcamento').length

  // Dados fictícios de tendência para o gráfico (substituir por dados reais)
  const trendData = [
    { dia: 'Hoje', consumo: 12, estoque: 45 },
    { dia: 'D+2', consumo: 18, estoque: 38 },
    { dia: 'D+4', consumo: 8, estoque: 32 },
    { dia: 'D+6', consumo: 22, estoque: 28 },
    { dia: 'D+8', consumo: 15, estoque: 20 },
    { dia: 'D+10', consumo: 30, estoque: 12 },
    { dia: 'D+12', consumo: 10, estoque: 8 },
    { dia: 'D+14', consumo: 5, estoque: 5 },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
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

      {/* Gráfico + Próximos 7 dias */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de tendência */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tendência: Consumo vs Estoque (15 dias)
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorConsumo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorEstoque" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: 'var(--text-primary)' }}
              />
              <Area type="monotone" dataKey="consumo" stroke="var(--accent)" fill="url(#colorConsumo)" strokeWidth={2} name="Consumo" />
              <Area type="monotone" dataKey="estoque" stroke="var(--success)" fill="url(#colorEstoque)" strokeWidth={2} name="Estoque" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Próximos 7 dias */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Próximos 7 dias</h2>
          </div>

          {data.etapasProximas.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma etapa crítica nos próximos 7 dias
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.etapasProximas.slice(0, 5).map((etapa) => {
                const dias = etapa.data_inicio ? diasAteData(etapa.data_inicio) : null
                return (
                  <div key={etapa.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: dias !== null && dias <= 2 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', color: dias !== null && dias <= 2 ? 'var(--danger)' : 'var(--warning)' }}>
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

      {/* Alertas de materiais + Obras recentes */}
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
                <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
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
                + {data.materiaisPendentes.length - 4} outros materiais pendentes
              </p>
            )}
          </div>
        )}

        {/* Obras recentes */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HardHat size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Obras Recentes</h2>
            </div>
            <Link href="/obras" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
              Ver todas →
            </Link>
          </div>

          {data.obras.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma obra cadastrada</p>
              <Link href="/obras" className="text-sm font-medium mt-2 inline-block" style={{ color: 'var(--accent)' }}>
                Criar primeira obra →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.obras.slice(0, 4).map((obra) => (
                <Link key={obra.id} href={`/obras/${obra.id}`}
                  className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-3 min-w-0">
                    {obra.foto_url ? (
                      <img src={obra.foto_url} alt={obra.nome} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                        <HardHat size={16} style={{ color: 'var(--text-secondary)' }} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{obra.nome}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{obra.endereco}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 border ${STATUS_OBRA_COLOR[obra.status]}`}>
                    {STATUS_OBRA_LABEL[obra.status]}
                  </span>
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
