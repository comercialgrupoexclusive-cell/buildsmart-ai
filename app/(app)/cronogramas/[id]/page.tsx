'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, HardHat, FolderOpen, Link2, Unlink } from 'lucide-react'
import Link from 'next/link'
import { ObraCronograma } from '@/components/obra/ObraCronograma'

type CronogramaHeader = {
  id: string
  nome: string
  obra_id: string | null
  projeto_id: string | null
  status: string
  created_at: string
}

type LinkedEntity = { id: string; nome: string }

export default function CronogramaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [cronograma, setCronograma] = useState<CronogramaHeader | null>(null)
  const [obra, setObra] = useState<LinkedEntity | null>(null)
  const [projeto, setProjeto] = useState<LinkedEntity | null>(null)
  const [loading, setLoading] = useState(true)

  const [showVincular, setShowVincular] = useState(false)
  const [vinculoTipo, setVinculoTipo] = useState<'obra' | 'projeto'>('obra')
  const [obrasDisponiveis, setObrasDisponiveis] = useState<LinkedEntity[]>([])
  const [projetosDisponiveis, setProjetosDisponiveis] = useState<LinkedEntity[]>([])
  const [vinculoId, setVinculoId] = useState('')

  useEffect(() => { loadCronograma() }, [id])

  async function loadCronograma() {
    setLoading(true)
    const { data: crono } = await supabase.from('cronogramas').select('*').eq('id', id).single()
    if (!crono) { setLoading(false); return }
    setCronograma(crono)

    if (crono.obra_id) {
      const { data: o } = await supabase.from('obras').select('id, nome').eq('id', crono.obra_id).single()
      if (o) setObra({ id: o.id, nome: o.nome })
    } else { setObra(null) }

    if (crono.projeto_id) {
      const { data: p } = await supabase.from('projetos').select('id, nome').eq('id', crono.projeto_id).single()
      if (p) setProjeto({ id: p.id, nome: p.nome })
    } else { setProjeto(null) }

    setLoading(false)
  }

  async function openVincular() {
    const [{ data: obrasData }, { data: projData }] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('projetos').select('id, nome').order('nome'),
    ])
    setObrasDisponiveis((obrasData || []) as LinkedEntity[])
    setProjetosDisponiveis((projData || []) as LinkedEntity[])
    setVinculoTipo(obra ? 'projeto' : 'obra')
    setVinculoId('')
    setShowVincular(true)
  }

  async function handleVincular() {
    if (!vinculoId) return
    const update = vinculoTipo === 'obra' ? { obra_id: vinculoId } : { projeto_id: vinculoId }
    await supabase.from('cronogramas').update(update).eq('id', id)
    setShowVincular(false)
    await loadCronograma()
  }

  async function handleDesvincular(tipo: 'obra' | 'projeto') {
    const update = tipo === 'obra' ? { obra_id: null } : { projeto_id: null }
    await supabase.from('cronogramas').update(update).eq('id', id)
    if (tipo === 'obra') setObra(null)
    else setProjeto(null)
    setCronograma(prev => prev ? { ...prev, ...(tipo === 'obra' ? { obra_id: null } : { projeto_id: null }) } : null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!cronograma) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p style={{ color: 'var(--text-secondary)' }}>Cronograma não encontrado.</p>
        <Link href="/cronograma" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Voltar aos cronogramas</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href="/cronograma" className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-80 w-fit" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16} /> Cronogramas
        </Link>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{cronograma.nome}</h1>
          <button onClick={openVincular} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            <Link2 size={14} /> Vincular
          </button>
        </div>

        {(obra || projeto) && (
          <div className="flex flex-wrap gap-2">
            {obra && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <HardHat size={14} style={{ color: 'var(--accent)' }} />
                <Link href={`/obras/${obra.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{obra.nome}</Link>
                <button onClick={() => handleDesvincular('obra')} className="ml-1 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}><Unlink size={12} /></button>
              </div>
            )}
            {projeto && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                <Link href={`/projetos/${projeto.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>{projeto.nome}</Link>
                <button onClick={() => handleDesvincular('projeto')} className="ml-1 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}><Unlink size={12} /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cronograma editor */}
      <ObraCronograma
        cronogramaId={id}
        obraId={cronograma.obra_id || undefined}
        projetoId={cronograma.projeto_id || undefined}
      />

      {/* Modal vincular */}
      {showVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowVincular(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Vincular cronograma</h3>
            <div className="flex gap-2 mb-4">
              {['obra', 'projeto'].map(t => (
                <button key={t} onClick={() => { setVinculoTipo(t as 'obra' | 'projeto'); setVinculoId('') }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={vinculoTipo === t ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {t === 'obra' ? 'Obra' : 'Projeto'}
                </button>
              ))}
            </div>
            <select value={vinculoId} onChange={e => setVinculoId(e.target.value)} className="input-base w-full mb-4">
              <option value="">Selecione...</option>
              {(vinculoTipo === 'obra' ? obrasDisponiveis : projetosDisponiveis).map(e => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowVincular(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleVincular} disabled={!vinculoId} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Vincular</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
