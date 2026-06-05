'use client'

import { useEffect, useState } from 'react'
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPercent, STATUS_OBRA_LABEL, STATUS_OBRA_COLOR } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

type ObraResumo = {
  id: string
  nome: string
  status: string
  data_previsao: string | null
  total_orcado: number
  total_itens: number
  etapas: number
  etapas_concluidas: number
  materiais_pendentes: number
  avancoFisico: number
}

export default function RelatoriosPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [loading, setLoading] = useState(true)

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
        supabase.from('medicoes').select('percentual_executado').eq('obra_id', obra.id).order('created_at', { ascending: false }).limit(10),
      ])

      const orc = (orcRes.data || [])[0]
      const bdi = orc?.bdi_percentual || 25
      const itens = (orc as any)?.orcamento_itens || []
      const subtotal = itens.reduce((a: number, i: any) => a + i.quantidade * i.preco_unitario_snapshot, 0)
      const total_orcado = subtotal * (1 + bdi / 100)

      const etapas = etapasRes.data || []
      const etapas_concluidas = etapas.filter(e => e.status === 'concluida').length

      const mats = matsRes.data || []
      const materiais_pendentes = mats.filter(m => m.status_compra !== 'comprado').length

      const meds = medRes.data || []
      const avancoFisico = meds.length > 0
        ? meds.reduce((a, m) => a + m.percentual_executado, 0) / meds.length
        : 0

      return {
        id: obra.id,
        nome: obra.nome,
        status: obra.status,
        data_previsao: obra.data_previsao,
        total_orcado,
        total_itens: itens.length,
        etapas: etapas.length,
        etapas_concluidas,
        materiais_pendentes,
        avancoFisico,
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
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Obras', value: totais.obras, icon: BarChart3, color: 'var(--accent)' },
          { label: 'Obras Ativas', value: totais.ativas, icon: TrendingUp, color: '#10B981' },
          { label: 'Valor Total Orçado', value: formatCurrency(totais.valor), icon: CheckCircle, color: '#F59E0B' },
          { label: 'Materiais Pendentes', value: totais.materiais_pendentes, icon: AlertTriangle, color: '#EF4444' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : obras.length === 0 ? (
        <EmptyState icon={BarChart3} title="Nenhuma obra cadastrada" description="Cadastre obras para gerar relatórios." />
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Resumo por Obra</h2>
          {obras.map((obra, i) => (
            <div key={obra.id} className="card p-5 animate-enter" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{obra.nome}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_OBRA_COLOR[obra.status]}`}>
                      {STATUS_OBRA_LABEL[obra.status]}
                    </span>
                  </div>
                  {obra.data_previsao && (
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                      <Clock size={11} />
                      Previsão: {new Date(obra.data_previsao).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total orçado</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(obra.total_orcado)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Avanço físico</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, obra.avancoFisico)}%`, background: 'var(--accent)' }} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(obra.avancoFisico)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Etapas</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {obra.etapas_concluidas}/{obra.etapas} concluídas
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Itens orçados</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{obra.total_itens}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Materiais pendentes</p>
                  <p className="text-sm font-semibold" style={{ color: obra.materiais_pendentes > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {obra.materiais_pendentes > 0 ? `${obra.materiais_pendentes} pendente${obra.materiais_pendentes > 1 ? 's' : ''}` : 'OK'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
