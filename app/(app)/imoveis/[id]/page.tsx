'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Imovel, ImovelFase } from '@/lib/types'
import { FASE_IMOVEL_LABEL, FASE_IMOVEL_COLOR, ORIGEM_IMOVEL_LABEL } from '@/lib/utils'
import { Building2, MapPin, User, ChevronLeft, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useProfile } from '@/lib/profile-context'
import { usePermission } from '@/lib/permissions'
import { ImovelVisaoGeral } from '@/components/imovel/ImovelVisaoGeral'
import { ImovelAnalise } from '@/components/imovel/ImovelAnalise'
import { ImovelAquisicao } from '@/components/imovel/ImovelAquisicao'
import { ImovelReforma } from '@/components/imovel/ImovelReforma'
import { ImovelVenda } from '@/components/imovel/ImovelVenda'
import { ImovelResultado } from '@/components/imovel/ImovelResultado'

type Tab = 'visao-geral' | 'analise' | 'aquisicao' | 'reforma' | 'venda' | 'resultado'

const TABS: { id: Tab; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'analise', label: 'Análise' },
  { id: 'aquisicao', label: 'Aquisição' },
  { id: 'reforma', label: 'Reforma' },
  { id: 'venda', label: 'Venda' },
  { id: 'resultado', label: 'Resultado' },
]

const FASES_ORDEM: ImovelFase[] = ['prospeccao', 'analise', 'aquisicao', 'reforma', 'venda', 'concluido', 'descartado']

export default function ImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { theme } = useProfile()
  const { canDelete } = usePermission()
  const [imovel, setImovel] = useState<Imovel | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return (t && TABS.some(x => x.id === t)) ? t : 'visao-geral'
  })
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [id])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function load() {
    const { data } = await supabase.from('imoveis').select('*, responsavel:profiles(id, name)').eq('id', id).single()
    setImovel(data)
    setLoading(false)
  }

  function updateLocal(fields: Partial<Imovel>) {
    setImovel(i => i ? { ...i, ...fields } : i)
  }

  async function updateFase(fase: ImovelFase) {
    updateLocal({ fase })
    const { error } = await supabase.from('imoveis').update({ fase }).eq('id', id)
    if (error) alert('Erro ao salvar: ' + error.message)
  }

  async function handleDelete() {
    if (!imovel) return
    if (!confirm(`Excluir definitivamente "${imovel.titulo}"? Todos os dados vinculados (reforma, propostas, fotos) serão removidos. Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    setMenuOpen(false)
    await supabase.from('imoveis').delete().eq('id', id)
    setDeleting(false)
    router.push('/imoveis')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!imovel) {
    return (
      <div className="text-center py-16">
        <p style={{ color: 'var(--text-secondary)' }}>Imóvel não encontrado.</p>
        <Link href="/imoveis" className="text-sm mt-2 inline-block" style={{ color: 'var(--accent)' }}>← Voltar para Imóveis</Link>
      </div>
    )
  }

  const localidade = [imovel.bairro, imovel.cidade, imovel.uf].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/imoveis" className="flex items-center gap-1.5 text-sm mb-4 hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16} /> Imóveis
        </Link>

        <div className="card p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {imovel.foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imovel.foto_url} alt={imovel.titulo} className="w-32 h-24 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-32 h-24 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                <Building2 size={32} style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{imovel.codigo}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>· {ORIGEM_IMOVEL_LABEL[imovel.origem]}</span>
                  </div>
                  <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text-primary)' }}>
                    {imovel.titulo}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {localidade && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={14} /> {localidade}
                      </span>
                    )}
                    {imovel.responsavel?.name && (
                      <span className="flex items-center gap-1.5">
                        <User size={14} /> {imovel.responsavel.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={imovel.fase}
                    onChange={e => updateFase(e.target.value as ImovelFase)}
                    className="text-xs px-3 py-1.5 rounded-full border font-medium cursor-pointer"
                    style={{ background: 'transparent', color: FASE_IMOVEL_COLOR[imovel.fase], borderColor: FASE_IMOVEL_COLOR[imovel.fase], colorScheme: theme }}
                  >
                    {FASES_ORDEM.map(f => (
                      <option key={f} value={f} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{FASE_IMOVEL_LABEL[f]}</option>
                    ))}
                  </select>

                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setMenuOpen(v => !v)}
                      className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      title="Mais ações"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen && (
                      <div
                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                      >
                        <button
                          onClick={() => { setMenuOpen(false); setTab('visao-geral') }}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                          Editar dados
                        </button>
                        {canDelete && (
                          <>
                            <div className="my-1 mx-3" style={{ height: '1px', background: 'var(--border)' }} />
                            <button
                              onClick={handleDelete}
                              disabled={deleting}
                              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 size={14} />
                              {deleting ? 'Excluindo...' : 'Excluir imóvel'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit overflow-x-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={tab === tabId
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="animate-enter">
        {tab === 'visao-geral' && <ImovelVisaoGeral imovel={imovel} onUpdate={updateLocal} />}
        {tab === 'analise' && <ImovelAnalise imovel={imovel} onUpdate={updateLocal} />}
        {tab === 'aquisicao' && <ImovelAquisicao imovel={imovel} onUpdate={updateLocal} />}
        {tab === 'reforma' && <ImovelReforma imovel={imovel} onUpdate={updateLocal} />}
        {tab === 'venda' && <ImovelVenda imovel={imovel} onUpdate={updateLocal} />}
        {tab === 'resultado' && <ImovelResultado imovel={imovel} />}
      </div>
    </div>
  )
}
