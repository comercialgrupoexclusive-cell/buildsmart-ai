'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, ExternalLink, HardHat, FolderOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraCronograma } from '@/components/obra/ObraCronograma'
import Link from 'next/link'

type EntidadeSimples = { id: string; nome: string }

export default function CronogramaPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<EntidadeSimples[]>([])
  const [projetos, setProjetos] = useState<EntidadeSimples[]>([])
  const [tipo, setTipo] = useState<'obra' | 'projeto'>('obra')
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: obrasData }, { data: projData }] = await Promise.all([
        supabase.from('obras').select('id, nome').order('created_at', { ascending: false }),
        supabase.from('projetos').select('id, nome').order('created_at', { ascending: false }),
      ])
      const obrasList = (obrasData || []) as EntidadeSimples[]
      const projList = (projData || []) as EntidadeSimples[]
      setObras(obrasList)
      setProjetos(projList)
      if (obrasList.length > 0) setSelectedId(obrasList[0].id)
      else if (projList.length > 0) { setTipo('projeto'); setSelectedId(projList[0].id) }
      setLoading(false)
    }
    load()
  }, [])

  const lista = tipo === 'obra' ? obras : projetos

  function handleTipoChange(t: 'obra' | 'projeto') {
    setTipo(t)
    const l = t === 'obra' ? obras : projetos
    setSelectedId(l[0]?.id || '')
  }

  const linkHref = tipo === 'obra' && selectedId
    ? `/obras/${selectedId}?tab=cronograma`
    : tipo === 'projeto' && selectedId
      ? `/projetos/${selectedId}`
      : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Tipo</label>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              {([
                { value: 'obra' as const, label: 'Obras', icon: HardHat },
                { value: 'projeto' as const, label: 'Projetos', icon: FolderOpen },
              ]).map(t => (
                <button
                  key={t.value}
                  onClick={() => handleTipoChange(t.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={tipo === t.value
                    ? { background: 'var(--accent)', color: 'white' }
                    : { color: 'var(--text-secondary)' }}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              {tipo === 'obra' ? 'Obra' : 'Projeto'}
            </label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="input-base w-full sm:min-w-72"
            >
              {lista.length === 0 && <option value="">Nenhum(a) encontrado(a)</option>}
              {lista.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
        </div>

        {linkHref && (
          <Link href={linkHref} className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
            Abrir {tipo === 'obra' ? 'na obra' : 'no projeto'} <ExternalLink size={14} />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !selectedId ? (
        <EmptyState icon={CalendarDays} title="Nenhum cronograma" description="Crie uma obra ou projeto para usar o cronograma." />
      ) : tipo === 'obra' ? (
        <ObraCronograma key={selectedId} obraId={selectedId} />
      ) : (
        <ObraCronograma key={selectedId} projetoId={selectedId} />
      )}
    </div>
  )
}
