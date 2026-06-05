'use client'

import { useEffect, useState } from 'react'
import { Package, AlertTriangle, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra } from '@/lib/types'
import { diasAteData } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  nao_comprado: 'Não comprado',
  parcial: 'Parcial',
  comprado: 'Comprado',
}
const STATUS_ICON: Record<string, string> = {
  nao_comprado: '🔴',
  parcial: '🟡',
  comprado: '🟢',
}

export default function MateriaisPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [materiais, setMateriais] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [obraId, setObraId] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadObras() }, [])
  useEffect(() => {
    if (obraId) loadMateriais(obraId)
    else { setMateriais([]); setEtapas([]) }
  }, [obraId])

  async function loadObras() {
    const { data } = await supabase.from('obras').select('*').order('created_at', { ascending: false })
    const list = data || []
    setObras(list)
    if (list.length > 0) setObraId(list[0].id)
  }

  async function loadMateriais(id: string) {
    setLoading(true)
    const [matsRes, etapasRes] = await Promise.all([
      supabase.from('materiais')
        .select('*, sinapi_insumos(descricao, unidade, codigo), etapas(nome)')
        .eq('obra_id', id)
        .order('data_necessidade'),
      supabase.from('etapas').select('id, nome').eq('obra_id', id).order('ordem'),
    ])
    setMateriais(matsRes.data || [])
    setEtapas(etapasRes.data || [])
    setLoading(false)
  }

  async function handleUpdateStatus(id: string, status: string) {
    const qtd = materiais.find(m => m.id === id)?.quantidade_total || 0
    const update: any = { status_compra: status }
    if (status === 'comprado') update.quantidade_comprada = qtd
    await supabase.from('materiais').update(update).eq('id', id)
    setMateriais(prev => prev.map(m => m.id === id ? { ...m, ...update } : m))
  }

  const obraAtual = obras.find(o => o.id === obraId)

  const filtrados = materiais.filter(m => {
    const byEtapa = filtroEtapa === 'todas' || m.etapa_id === filtroEtapa
    const byStatus = filtroStatus === 'todos' || m.status_compra === filtroStatus
    return byEtapa && byStatus
  })

  const pendentes = materiais.filter(m => m.status_compra !== 'comprado').length

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de obra */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Obra</label>
          <select value={obraId} onChange={e => { setObraId(e.target.value); setFiltroEtapa('todas') }} className="input-base min-w-72">
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        {obraAtual && (
          <Link href={`/obras/${obraAtual.id}?tab=materiais`} className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Abrir na obra →
          </Link>
        )}
      </div>

      {pendentes > 0 && obraId && (
        <div className="card p-4 border-l-4 flex items-start gap-3" style={{ borderLeftColor: 'var(--warning)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {pendentes} {pendentes === 1 ? 'material pendente' : 'materiais pendentes'} de compra
          </p>
        </div>
      )}

      {/* Filtros */}
      {obraId && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltroEtapa('todas')} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={filtroEtapa === 'todas' ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Todas etapas
          </button>
          {etapas.map(e => (
            <button key={e.id} onClick={() => setFiltroEtapa(e.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtroEtapa === e.id ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {e.nome}
            </button>
          ))}
          <div className="w-px self-stretch mx-1" style={{ background: 'var(--border)' }} />
          {['todos', 'nao_comprado', 'parcial', 'comprado'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtroStatus === s ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {s === 'todos' ? 'Todos status' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obraId ? (
        <EmptyState icon={Package} title="Selecione uma obra" description="Escolha uma obra acima para ver os materiais." />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum material encontrado"
          description="Os materiais são gerados ao ativar o orçamento ou podem ser adicionados manualmente na aba Materiais da obra." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['', 'Insumo', 'Etapa', 'Qtd Total', 'Comprado', 'Falta', 'Necessidade', 'Ação'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(m => {
                  const falta = Math.max(0, m.quantidade_total - m.quantidade_comprada)
                  const diasNec = m.data_necessidade ? diasAteData(m.data_necessidade) : null
                  const urgente = diasNec !== null && diasNec <= 7 && m.status_compra !== 'comprado'
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 text-base">{STATUS_ICON[m.status_compra]}</td>
                      <td className="px-4 py-3" style={{ maxWidth: 250 }}>
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {m.sinapi_insumos?.descricao || '—'}
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {m.sinapi_insumos?.codigo}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{m.etapas?.nome || '—'}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{m.quantidade_total} {m.sinapi_insumos?.unidade}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--success)' }}>{m.quantidade_comprada} {m.sinapi_insumos?.unidade}</td>
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
                          <button onClick={() => handleUpdateStatus(m.id, 'comprado')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                            style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>
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
