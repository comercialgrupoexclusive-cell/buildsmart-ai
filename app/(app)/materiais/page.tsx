'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Clock, ExternalLink, Package, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra } from '@/lib/types'
import { diasAteData } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  nao_comprado: 'Pendente',
  parcial: 'Parcial',
  comprado: 'Comprado',
}

const STATUS_COLOR: Record<string, string> = {
  nao_comprado: 'var(--danger)',
  parcial: 'var(--warning)',
  comprado: 'var(--success)',
}

type CompraRow = {
  id: string
  obra_id: string
  etapa_id: string | null
  sinapi_codigo: string | null
  descricao?: string | null
  unidade?: string | null
  quantidade_total: number
  quantidade_comprada: number
  status_compra: 'nao_comprado' | 'parcial' | 'comprado'
  data_necessidade: string | null
  sinapi_insumos?: { descricao?: string | null; unidade?: string | null; codigo?: string | null } | null
  etapas?: { nome?: string | null } | null
}

function descricaoMaterial(material: CompraRow) {
  return material.descricao || material.sinapi_insumos?.descricao || 'Material sem descricao'
}

function unidadeMaterial(material: CompraRow) {
  return material.unidade || material.sinapi_insumos?.unidade || 'UN'
}

function codigoMaterial(material: CompraRow) {
  return material.sinapi_codigo || material.sinapi_insumos?.codigo || ''
}

function statusOperacional(material: CompraRow) {
  if (material.status_compra === 'comprado') return 'comprado'
  const dias = material.data_necessidade ? diasAteData(material.data_necessidade) : null
  if (dias !== null && dias <= 7) return 'agora'
  if (material.status_compra === 'parcial') return 'parcial'
  return 'pendente'
}

export default function MateriaisPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [materiais, setMateriais] = useState<CompraRow[]>([])
  const [etapas, setEtapas] = useState<{ id: string; nome: string }[]>([])
  const [obraId, setObraId] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('abertas')
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
    setMateriais((matsRes.data || []) as CompraRow[])
    setEtapas(etapasRes.data || [])
    setLoading(false)
  }

  async function marcarComprado(id: string) {
    const qtd = materiais.find(m => m.id === id)?.quantidade_total || 0
    const update = { status_compra: 'comprado', quantidade_comprada: qtd }
    await supabase.from('materiais').update(update).eq('id', id)
    setMateriais(prev => prev.map(m => m.id === id ? { ...m, ...update } as CompraRow : m))
  }

  const obraAtual = obras.find(o => o.id === obraId)

  const resumo = useMemo(() => {
    const comprarAgora = materiais.filter(m => statusOperacional(m) === 'agora').length
    const abertas = materiais.filter(m => m.status_compra !== 'comprado').length
    const parciais = materiais.filter(m => m.status_compra === 'parcial').length
    const comprados = materiais.filter(m => m.status_compra === 'comprado').length
    return { comprarAgora, abertas, parciais, comprados }
  }, [materiais])

  const filtrados = materiais.filter(m => {
    const byEtapa = filtroEtapa === 'todas' || m.etapa_id === filtroEtapa
    const estado = statusOperacional(m)
    const byStatus =
      filtroStatus === 'todos' ||
      (filtroStatus === 'abertas' && m.status_compra !== 'comprado') ||
      filtroStatus === estado ||
      filtroStatus === m.status_compra
    return byEtapa && byStatus
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Obra</label>
          <select value={obraId} onChange={e => { setObraId(e.target.value); setFiltroEtapa('todas') }} className="input-base min-w-72">
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        {obraAtual && (
          <Link href={`/obras/${obraAtual.id}?tab=materiais`} className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Abrir compras da obra <ExternalLink size={14} />
          </Link>
        )}
      </div>

      {obraId && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ResumoCard icon={AlertTriangle} label="Comprar agora" value={resumo.comprarAgora} color={resumo.comprarAgora > 0 ? 'var(--danger)' : 'var(--success)'} />
          <ResumoCard icon={ShoppingCart} label="Em aberto" value={resumo.abertas} color={resumo.abertas > 0 ? 'var(--warning)' : 'var(--success)'} />
          <ResumoCard icon={Clock} label="Parciais" value={resumo.parciais} color="var(--accent)" />
          <ResumoCard icon={CheckCircle} label="Comprados" value={resumo.comprados} color="var(--success)" />
        </div>
      )}

      {obraId && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'abertas', label: 'Em aberto' },
              { id: 'agora', label: 'Comprar agora' },
              { id: 'parcial', label: 'Parciais' },
              { id: 'comprado', label: 'Comprados' },
              { id: 'todos', label: 'Todos' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFiltroStatus(id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={filtroStatus === id
                  ? { background: 'var(--accent)', color: 'white' }
                  : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {label}
              </button>
            ))}
          </div>

          {etapas.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFiltroEtapa('todas')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={filtroEtapa === 'todas'
                  ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
                  : { color: 'var(--text-secondary)' }}
              >
                Todas etapas
              </button>
              {etapas.map(e => (
                <button
                  key={e.id}
                  onClick={() => setFiltroEtapa(e.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={filtroEtapa === e.id
                    ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
                    : { color: 'var(--text-secondary)' }}
                >
                  {e.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obraId ? (
        <EmptyState icon={Package} title="Selecione uma obra" description="Escolha uma obra acima para ver as compras." />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Package} title="Nenhuma compra encontrada" description="Os materiais aparecem aqui quando entram no orçamento ou quando sao adicionados na obra." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {filtrados.map(material => (
            <CompraCard key={material.id} material={material} onComprado={() => marcarComprado(material.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResumoCard({ icon: Icon, label, value, color }: {
  icon: typeof Package
  label: string
  value: number
  color: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold" style={{ color }}>{value}</p>
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>
          <Icon size={18} style={{ color }} />
        </div>
      </div>
    </div>
  )
}

function CompraCard({ material, onComprado }: { material: CompraRow; onComprado: () => void }) {
  const falta = Math.max(0, material.quantidade_total - material.quantidade_comprada)
  const unidade = unidadeMaterial(material)
  const dias = material.data_necessidade ? diasAteData(material.data_necessidade) : null
  const estado = statusOperacional(material)
  const pctComprado = material.quantidade_total > 0 ? Math.min(100, (material.quantidade_comprada / material.quantidade_total) * 100) : 0
  const urgente = estado === 'agora'

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{descricaoMaterial(material)}</p>
          <div className="flex flex-wrap gap-2 mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {codigoMaterial(material) && <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{codigoMaterial(material)}</span>}
            <span>{material.etapas?.nome || 'Sem etapa'}</span>
          </div>
        </div>
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
          style={{ color: STATUS_COLOR[material.status_compra], background: 'var(--bg-secondary)' }}
        >
          {urgente ? 'Comprar agora' : STATUS_LABEL[material.status_compra]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniInfo label="Precisa" value={`${material.quantidade_total} ${unidade}`} />
        <MiniInfo label="Comprado" value={`${material.quantidade_comprada} ${unidade}`} />
        <MiniInfo label="Falta" value={falta > 0 ? `${falta} ${unidade}` : '0'} highlight={falta > 0 ? 'var(--danger)' : 'var(--success)'} />
      </div>

      <div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pctComprado}%`, background: 'var(--success)' }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-xs" style={{ color: urgente ? 'var(--danger)' : 'var(--text-secondary)' }}>
          <span className="inline-flex items-center gap-1">
            {urgente && <AlertTriangle size={12} />}
            {material.data_necessidade ? new Date(`${material.data_necessidade}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem data'}
          </span>
          {dias !== null && material.status_compra !== 'comprado' && <span>{dias <= 0 ? 'vence hoje' : `${dias} dias`}</span>}
        </div>
      </div>

      {material.status_compra !== 'comprado' && (
        <button
          onClick={onComprado}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'rgba(16,185,129,0.14)', color: 'var(--success)' }}
        >
          <CheckCircle size={15} /> Marcar comprado
        </button>
      )}
    </div>
  )
}

function MiniInfo({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}>
      <p className="text-[10px] font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-sm font-semibold truncate" style={{ color: highlight || 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}
