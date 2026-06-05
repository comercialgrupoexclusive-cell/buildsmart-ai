'use client'

import { useEffect, useState } from 'react'
import { Package, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Material } from '@/lib/types'
import { diasAteData, STATUS_MATERIAL_COLOR } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

const STATUS_LABEL: Record<string, string> = {
  nao_comprado: 'Não comprado',
  parcial: 'Parcial',
  comprado: 'Comprado',
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  nao_comprado: <span className="text-red-400">🔴</span>,
  parcial: <span className="text-yellow-400">🟡</span>,
  comprado: <span className="text-green-400">🟢</span>,
}

export function ObraMateriais({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [materiais, setMateriais] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEtapa, setFiltroEtapa] = useState('todas')

  useEffect(() => {
    loadMateriais()
  }, [obraId])

  async function loadMateriais() {
    setLoading(true)
    const [matsRes, etapasRes] = await Promise.all([
      supabase
        .from('materiais')
        .select('*, sinapi_insumos(descricao, unidade, codigo), etapas(nome)')
        .eq('obra_id', obraId)
        .order('data_necessidade'),
      supabase.from('etapas').select('id, nome').eq('obra_id', obraId).order('ordem'),
    ])
    setMateriais(matsRes.data || [])
    setEtapas(etapasRes.data || [])
    setLoading(false)
  }

  async function handleUpdateStatus(id: string, status: string, qtdComprada?: number) {
    const update: any = { status_compra: status }
    if (qtdComprada !== undefined) update.quantidade_comprada = qtdComprada
    await supabase.from('materiais').update(update).eq('id', id)
    setMateriais(prev => prev.map(m => m.id === id ? { ...m, ...update } : m))
  }

  async function marcarComprado(m: any) {
    await handleUpdateStatus(m.id, 'comprado', m.quantidade_total)
  }

  const materiaisFiltrados = materiais.filter(m =>
    filtroEtapa === 'todas' || m.etapa_id === filtroEtapa
  )

  const pendentes = materiais.filter(m => m.status_compra !== 'comprado')

  if (loading) {
    return <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Alerta se houver pendentes */}
      {pendentes.length > 0 && (
        <div className="card p-4 border-l-4 flex items-start gap-3" style={{ borderLeftColor: 'var(--warning)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {pendentes.length} {pendentes.length === 1 ? 'material pendente' : 'materiais pendentes'} de compra
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Verifique etapas próximas com materiais não comprados.
            </p>
          </div>
        </div>
      )}

      {/* Filtro por etapa */}
      {etapas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltroEtapa('todas')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={filtroEtapa === 'todas'
              ? { background: 'var(--accent)', color: 'white' }
              : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Todas
          </button>
          {etapas.map(e => (
            <button
              key={e.id}
              onClick={() => setFiltroEtapa(e.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtroEtapa === e.id
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {e.nome}
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      {materiaisFiltrados.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material cadastrado"
          description="Os materiais são gerados automaticamente a partir das composições das etapas."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Status', 'Insumo', 'Etapa', 'Qtd Total', 'Comprado', 'Falta', 'Data Necessidade', 'Ação'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materiaisFiltrados.map(m => {
                  const falta = Math.max(0, m.quantidade_total - m.quantidade_comprada)
                  const diasParaNecessidade = m.data_necessidade ? diasAteData(m.data_necessidade) : null
                  const urgente = diasParaNecessidade !== null && diasParaNecessidade <= 7 && m.status_compra !== 'comprado'

                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3">
                        <span title={STATUS_LABEL[m.status_compra]}>{STATUS_ICON[m.status_compra]}</span>
                      </td>
                      <td className="px-4 py-3" style={{ maxWidth: '250px' }}>
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {m.sinapi_insumos?.descricao || '—'}
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {m.sinapi_insumos?.codigo}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {m.etapas?.nome || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {m.quantidade_total} {m.sinapi_insumos?.unidade}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--success)' }}>
                        {m.quantidade_comprada} {m.sinapi_insumos?.unidade}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold" style={{ color: falta > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {falta} {m.sinapi_insumos?.unidade}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {m.data_necessidade ? (
                          <span style={{ color: urgente ? 'var(--danger)' : 'var(--text-secondary)' }} className="flex items-center gap-1">
                            {urgente && <AlertTriangle size={12} />}
                            {new Date(m.data_necessidade).toLocaleDateString('pt-BR')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {m.status_compra !== 'comprado' && (
                          <button
                            onClick={() => marcarComprado(m)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}
                          >
                            <CheckCircle size={12} /> Comprado
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
