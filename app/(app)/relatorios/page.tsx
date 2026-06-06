'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, TrendingUp, AlertTriangle, CheckCircle,
  Clock, ExternalLink, ChevronDown, ChevronRight,
  MapPin, FileText, Package, Activity,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPercent, STATUS_OBRA_LABEL, STATUS_OBRA_COLOR } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

type ObraResumo = {
  id: string
  nome: string
  status: string
  uf: string
  data_previsao: string | null
  area_m2: number | null
  total_orcado: number
  subtotal: number
  bdi: number
  total_itens: number
  etapas: number
  etapas_concluidas: number
  materiais_pendentes: number
  materiais_total: number
  materiais_comprados: number
  avancoFisico: number
  medicoes: number
}

export default function RelatoriosPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => { loadRelatorio() }, [])

  async function loadRelatorio() {
    setLoading(true)
    const { data: obrasData } = await supabase.from('obras').select('*').order('created_at', { ascending: false })
    if (!obrasData) { setLoading(false); return }

    const resumos = await Promise.all(obrasData.map(async (obra) => {
      const [orcRes, etapasRes, matsRes, medRes] = await Promise.all([
        supabase.from('orcamentos')
          .select('bdi_percentual, orcamento_itens(quantidade, preco_unitario_snapshot)')
          .eq('obra_id', obra.id)
          .order('versao', { ascending: false })
          .limit(1),
        supabase.from('etapas').select('status').eq('obra_id', obra.id),
        supabase.from('materiais').select('status_compra').eq('obra_id', obra.id),
        supabase.from('medicoes').select('percentual_executado').eq('obra_id', obra.id).order('data_medicao', { ascending: false }).limit(1),
      ])

      const orc = (orcRes.data || [])[0]
      const bdi = orc?.bdi_percentual ?? 25
      const itens = (orc as any)?.orcamento_itens || []
      const subtotal = itens.reduce((a: number, i: any) => a + i.quantidade * i.preco_unitario_snapshot, 0)
      const total_orcado = subtotal * (1 + bdi / 100)

      const etapas = etapasRes.data || []
      const etapas_concluidas = etapas.filter(e => e.status === 'concluida').length

      const mats = matsRes.data || []
      const materiais_total = mats.length
      const materiais_comprados = mats.filter(m => m.status_compra === 'comprado').length
      const materiais_pendentes = materiais_total - materiais_comprados

      const meds = medRes.data || []
      const avancoFisico = meds.length > 0 ? (meds[0].percentual_executado ?? 0) : 0

      return {
        id: obra.id,
        nome: obra.nome,
        status: obra.status,
        uf: obra.uf || '—',
        data_previsao: obra.data_previsao,
        area_m2: obra.area_m2,
        total_orcado,
        subtotal,
        bdi,
        total_itens: itens.length,
        etapas: etapas.length,
        etapas_concluidas,
        materiais_pendentes,
        materiais_total,
        materiais_comprados,
        avancoFisico,
        medicoes: meds.length,
      }
    }))

    setObras(resumos)
    setLoading(false)
  }

  const totais = {
    obras: obras.length,
    ativas: obras.filter(o => o.status === 'ativa').length,
    valor: obras.reduce((a, o) => a + o.total_orcado, 0),
    materiais_pendentes: obras.reduce((a, o) => a + o.materiais_pendentes, 0),
    etapas_total: obras.reduce((a, o) => a + o.etapas, 0),
    etapas_concluidas: obras.reduce((a, o) => a + o.etapas_concluidas, 0),
  }

  const avancoMedio = obras.length > 0
    ? obras.reduce((a, o) => a + o.avancoFisico, 0) / obras.length
    : 0

  function toggleObra(id: string) {
    setCollapsed(c => ({ ...c, [id]: !c[id] }))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── KPIs gerais ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Obras', value: totais.obras, sub: `${totais.ativas} ativa${totais.ativas !== 1 ? 's' : ''}`, icon: BarChart3, color: 'var(--accent)' },
          { label: 'Valor Total Orçado', value: formatCurrency(totais.valor), sub: `BDI médio aplicado`, icon: FileText, color: '#10B981' },
          { label: 'Avanço Médio', value: formatPercent(avancoMedio), sub: `${totais.etapas_concluidas}/${totais.etapas_total} etapas`, icon: Activity, color: '#8B5CF6' },
          { label: 'Materiais Pendentes', value: totais.materiais_pendentes, sub: 'itens sem compra confirmada', icon: AlertTriangle, color: totais.materiais_pendentes > 0 ? '#EF4444' : '#10B981' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <span className="text-xs font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : obras.length === 0 ? (
        <EmptyState icon={BarChart3} title="Nenhuma obra cadastrada" description="Cadastre obras para gerar relatórios." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Detalhamento por Obra</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{obras.length} obras</p>
          </div>

          {obras.map((obra, i) => {
            const isCollapsed = collapsed[obra.id]
            const pctMats = obra.materiais_total > 0 ? (obra.materiais_comprados / obra.materiais_total) * 100 : 0
            const pctEtapas = obra.etapas > 0 ? (obra.etapas_concluidas / obra.etapas) * 100 : 0
            const custoPorM2 = obra.area_m2 && obra.area_m2 > 0 ? obra.total_orcado / obra.area_m2 : null

            return (
              <div key={obra.id} className="card overflow-hidden animate-enter" style={{ animationDelay: `${i * 40}ms` }}>
                {/* Cabeçalho clicável */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                  style={{ background: 'var(--bg-secondary)', borderBottom: isCollapsed ? 'none' : '1px solid var(--border)' }}
                  onClick={() => toggleObra(obra.id)}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{obra.nome}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_OBRA_COLOR[obra.status]}`}>
                        {STATUS_OBRA_LABEL[obra.status]}
                      </span>
                      {obra.uf && obra.uf !== '—' && (
                        <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <MapPin size={10} /> {obra.uf}
                        </span>
                      )}
                    </div>
                    {obra.data_previsao && (
                      <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        <Clock size={10} /> Previsão: {new Date(obra.data_previsao + 'T12:00').toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>

                  {/* Mini-progresso avanço */}
                  <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avanço físico</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, obra.avancoFisico)}%`, background: 'var(--accent)' }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-10 text-right" style={{ color: 'var(--accent)' }}>
                        {formatPercent(obra.avancoFisico)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right ml-2">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Orçamento</p>
                    <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(obra.total_orcado)}</p>
                  </div>
                </div>

                {/* Conteúdo expandido */}
                {!isCollapsed && (
                  <div className="p-5 flex flex-col gap-5">
                    {/* Grid de métricas */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {/* Avanço físico */}
                      <MetricCard
                        label="Avanço físico"
                        value={formatPercent(obra.avancoFisico)}
                        sub={obra.medicoes > 0 ? 'última medição' : 'sem medições'}
                        color="var(--accent)"
                        progress={obra.avancoFisico}
                      />
                      {/* Etapas */}
                      <MetricCard
                        label="Etapas concluídas"
                        value={`${obra.etapas_concluidas}/${obra.etapas}`}
                        sub={obra.etapas > 0 ? `${pctEtapas.toFixed(0)}% concluído` : 'sem etapas'}
                        color="#8B5CF6"
                        progress={pctEtapas}
                      />
                      {/* Materiais */}
                      <MetricCard
                        label="Materiais comprados"
                        value={`${obra.materiais_comprados}/${obra.materiais_total}`}
                        sub={obra.materiais_pendentes > 0 ? `${obra.materiais_pendentes} pendente${obra.materiais_pendentes > 1 ? 's' : ''}` : 'todos comprados'}
                        color={obra.materiais_pendentes > 0 ? '#F59E0B' : '#10B981'}
                        progress={pctMats}
                      />
                      {/* Custo/m² ou Itens */}
                      {custoPorM2 !== null ? (
                        <MetricCard
                          label="Custo/m²"
                          value={formatCurrency(custoPorM2)}
                          sub={`${obra.area_m2} m² construídos`}
                          color="#10B981"
                        />
                      ) : (
                        <MetricCard
                          label="Itens orçados"
                          value={String(obra.total_itens)}
                          sub={`BDI ${obra.bdi}%`}
                          color="#10B981"
                        />
                      )}
                    </div>

                    {/* Breakdown financeiro */}
                    {obra.total_orcado > 0 && (
                      <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Composição do orçamento</p>
                        <div className="flex flex-col gap-2">
                          {[
                            { label: `Subtotal s/ BDI`, value: obra.subtotal, pct: 100 - (obra.bdi / (1 + obra.bdi / 100)), color: 'var(--accent)' },
                            { label: `BDI (${obra.bdi}%)`, value: obra.total_orcado - obra.subtotal, pct: obra.bdi / (1 + obra.bdi / 100), color: '#8B5CF6' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="flex items-center gap-3">
                              <span className="text-xs w-32 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                                <div className="h-full rounded-full" style={{
                                  width: `${(value / obra.total_orcado) * 100}%`,
                                  background: color,
                                }} />
                              </div>
                              <span className="text-xs font-medium w-24 text-right" style={{ color: 'var(--text-primary)' }}>
                                {formatCurrency(value)}
                              </span>
                            </div>
                          ))}
                          <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <span className="text-xs font-bold w-32 flex-shrink-0" style={{ color: 'var(--text-primary)' }}>Total Geral</span>
                            <div className="flex-1" />
                            <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(obra.total_orcado)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Links de ação */}
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/obras/${obra.id}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)', opacity: 0.85 }}
                      >
                        <ExternalLink size={12} /> Abrir obra
                      </Link>
                      <Link
                        href={`/obras/${obra.id}?tab=orcamento`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      >
                        <FileText size={12} /> Ver orçamento
                      </Link>
                      <Link
                        href={`/obras/${obra.id}?tab=materiais`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      >
                        <Package size={12} /> Materiais
                        {obra.materiais_pendentes > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ background: '#F59E0B', fontSize: 10 }}>
                            {obra.materiais_pendentes}
                          </span>
                        )}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, color, progress,
}: {
  label: string
  value: string
  sub: string
  color: string
  progress?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {progress !== undefined && (
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, progress || 0)}%`, background: color }} />
        </div>
      )}
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{sub}</p>
    </div>
  )
}
