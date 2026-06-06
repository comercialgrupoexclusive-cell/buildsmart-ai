'use client'

import { useEffect, useState, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Obra } from '@/lib/types'
import { formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { HardHat, MapPin, Calendar, User, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { ObraCronograma } from '@/components/obra/ObraCronograma'
import { ObraMateriais } from '@/components/obra/ObraMateriais'
import { ObraMedicoes } from '@/components/obra/ObraMedicoes'

type Tab = 'visao-geral' | 'orcamento' | 'cronograma' | 'materiais' | 'medicoes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'medicoes', label: 'Medições' },
]

export default function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [obra, setObra] = useState<Obra | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return (t && TABS.some(x => x.id === t)) ? t : 'visao-geral'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadObra()
  }, [id])

  async function loadObra() {
    const { data } = await supabase.from('obras').select('*').eq('id', id).single()
    setObra(data)
    setLoading(false)
  }

  async function updateStatus(status: Obra['status']) {
    await supabase.from('obras').update({ status }).eq('id', id)
    setObra(o => o ? { ...o, status } : o)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!obra) {
    return (
      <div className="text-center py-16">
        <p style={{ color: 'var(--text-secondary)' }}>Obra não encontrada.</p>
        <Link href="/obras" className="text-sm mt-2 inline-block" style={{ color: 'var(--accent)' }}>← Voltar para Obras</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header da obra */}
      <div>
        <Link href="/obras" className="flex items-center gap-1.5 text-sm mb-4 hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16} /> Obras
        </Link>

        <div className="card p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {obra.foto_url ? (
              <img src={obra.foto_url} alt={obra.nome} className="w-32 h-24 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-32 h-24 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                <HardHat size={32} style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text-primary)' }}>
                    {obra.nome}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {obra.endereco && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={14} /> {obra.endereco}
                      </span>
                    )}
                    {obra.responsavel && (
                      <span className="flex items-center gap-1.5">
                        <User size={14} /> {obra.responsavel}
                      </span>
                    )}
                    {obra.data_previsao && (
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} /> Previsão: {formatDate(obra.data_previsao)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={obra.status}
                    onChange={e => updateStatus(e.target.value as Obra['status'])}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium cursor-pointer ${STATUS_OBRA_COLOR[obra.status]}`}
                    style={{ background: 'transparent' }}
                  >
                    <option value="orcamento">Orçamento</option>
                    <option value="ativa">Ativa</option>
                    <option value="paralisada">Paralisada</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === tabId
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab */}
      <div className="animate-enter">
        {tab === 'visao-geral' && <ObraVisaoGeral obra={obra} />}
        {tab === 'orcamento' && <ObraOrcamento obraId={id} areaM2={obra.area_m2} obraName={obra.nome} obraUf={obra.uf || 'SP'} />}
        {tab === 'cronograma' && <ObraCronograma obraId={id} />}
        {tab === 'materiais' && <ObraMateriais obraId={id} />}
        {tab === 'medicoes' && <ObraMedicoes obraId={id} />}
      </div>
    </div>
  )
}

function ObraVisaoGeral({ obra }: { obra: Obra }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card p-6">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Informações da Obra</h2>
        <dl className="flex flex-col gap-3">
          {[
            { label: 'Nome', value: obra.nome },
            { label: 'Endereço', value: obra.endereco || '—' },
            { label: 'Responsável', value: obra.responsavel || '—' },
            { label: 'Status', value: STATUS_OBRA_LABEL[obra.status] },
            { label: 'Data de início', value: formatDate(obra.data_inicio) },
            { label: 'Previsão de conclusão', value: formatDate(obra.data_previsao) },
            { label: 'Área construída', value: obra.area_m2 ? `${obra.area_m2} m²` : '—' },
            { label: 'UF (preços SINAPI)', value: obra.uf || '—' },
            { label: 'Criado em', value: formatDate(obra.created_at) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
              <dd className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(59,123,248,0.15)' }}>
          <HardHat size={32} style={{ color: 'var(--accent)' }} />
        </div>
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Obra em andamento</p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Use as abas acima para gerenciar orçamento, cronograma, materiais e medições.
        </p>
      </div>
    </div>
  )
}
