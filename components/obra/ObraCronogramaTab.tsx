'use client'

import { useEffect, useState } from 'react'
import { Calendar, CalendarClock, LineChart, Pencil, Plus, Link2, Unlink, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ObraCronograma } from '@/components/obra/ObraCronograma'
import { ObraPrevisoes } from '@/components/obra/ObraPrevisoes'
import { ObraCurvaS } from '@/components/obra/ObraCurvaS'
import { ObraAssistenteDock } from '@/components/obra/ObraAssistenteDock'

type SubTab = 'gantt' | 'previsoes' | 'curva'

const TABS: { id: SubTab; label: string; icon: typeof Calendar }[] = [
  { id: 'gantt', label: 'Etapas', icon: Calendar },
  { id: 'previsoes', label: 'Previsões', icon: CalendarClock },
  { id: 'curva', label: 'Curva S', icon: LineChart },
]

type CronoSelectItem = { id: string; nome: string }

export function ObraCronogramaTab({ obraId, obraNome, obraUf = 'SP', orcamentoIds, orcamentoId }: { obraId: string; obraNome: string; obraUf?: string; orcamentoIds: string[]; orcamentoId: string }) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<SubTab>('gantt')
  const [cronogramas, setCronogramas] = useState<CronoSelectItem[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showVincular, setShowVincular] = useState(false)
  const [disponiveis, setDisponiveis] = useState<CronoSelectItem[]>([])
  const [vinculoId, setVinculoId] = useState('')
  const [showNovo, setShowNovo] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [showAssistente, setShowAssistente] = useState(false)

  useEffect(() => { load() }, [obraId])

  useEffect(() => {
    function onDataChanged() { load() }
    window.addEventListener('buildsmart:obra-data-changed', onDataChanged)
    return () => window.removeEventListener('buildsmart:obra-data-changed', onDataChanged)
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('cronogramas')
      .select('id, nome, created_at')
      .eq('obra_id', obraId)
      .order('created_at', { ascending: false })
    const cronos = (data || []) as (CronoSelectItem & { created_at: string })[]
    const ids = cronos.map(crono => crono.id)
    const { data: etapasVinculadas } = ids.length
      ? await supabase.from('etapas').select('cronograma_id').in('cronograma_id', ids)
      : { data: [] as { cronograma_id: string | null }[] }
    const quantidadeEtapas = new Map<string, number>()
    ;((etapasVinculadas || []) as { cronograma_id: string | null }[]).forEach(etapa => {
      if (etapa.cronograma_id) quantidadeEtapas.set(etapa.cronograma_id, (quantidadeEtapas.get(etapa.cronograma_id) || 0) + 1)
    })
    const list = [...cronos]
      .sort((a, b) => (quantidadeEtapas.get(b.id) || 0) - (quantidadeEtapas.get(a.id) || 0) || b.created_at.localeCompare(a.created_at))
      .map(({ id, nome }) => ({ id, nome }))
    setCronogramas(list)
    if (list.length > 0 && (!selectedId || !list.find(c => c.id === selectedId))) {
      setSelectedId(list[0].id)
    }
    if (list.length === 0) setSelectedId('')
    setLoading(false)
  }

  async function handleCriar() {
    if (!novoNome.trim()) return
    setCreating(true)
    const { data: novo } = await supabase
      .from('cronogramas')
      .insert({ obra_id: obraId, nome: novoNome.trim() })
      .select()
      .single()
    setCreating(false)
    setShowNovo(false)
    setNovoNome('')
    if (novo) {
      await load()
      setSelectedId(novo.id)
    }
  }

  async function handleRenomear() {
    if (!editName.trim() || !selectedId) return
    await supabase.from('cronogramas').update({ nome: editName.trim() }).eq('id', selectedId)
    setEditingName(false)
    load()
  }

  async function openVincular() {
    const { data } = await supabase
      .from('cronogramas')
      .select('id, nome')
      .is('obra_id', null)
      .order('created_at', { ascending: false })
    setDisponiveis((data || []) as CronoSelectItem[])
    setVinculoId('')
    setShowVincular(true)
  }

  async function handleVincular() {
    if (!vinculoId) return
    await supabase.from('cronogramas').update({ obra_id: obraId }).eq('id', vinculoId)
    setShowVincular(false)
    setSelectedId(vinculoId)
    load()
  }

  async function handleDesvincular() {
    if (!selectedId) return
    if (!confirm('Desvincular este cronograma da obra? Ele continuará existindo em Cronogramas.')) return
    await supabase.from('cronogramas').update({ obra_id: null }).eq('id', selectedId)
    setSelectedId('')
    load()
  }

  const selectedCrono = cronogramas.find(c => c.id === selectedId)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-abas */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit overflow-x-auto max-w-full" style={{ background: 'var(--bg-secondary)' }}>
        {TABS.map(t => {
          const Ic = t.icon
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
              style={subTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              <Ic size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {subTab === 'gantt' && (
        <>
          {/* Toolbar: dropdown + ações */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {cronogramas.length > 0 ? (
                <>
                  <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    className="input-base text-sm font-medium"
                    style={{ minWidth: 220, maxWidth: 400 }}
                  >
                    {cronogramas.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setEditName(selectedCrono?.nome || ''); setEditingName(true) }}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Renomear"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={handleDesvincular}
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Desvincular da obra"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Unlink size={13} />
                  </button>
                </>
              ) : (
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum cronograma vinculado</span>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={openVincular} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <Link2 size={13} /> Vincular
              </button>
              <button onClick={() => { setNovoNome(`${obraNome} - Cronograma`); setShowNovo(true) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>
                <Plus size={13} /> Novo
              </button>
              <button onClick={() => setShowAssistente(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                <Sparkles size={13} /> Assistente IA
              </button>
            </div>
          </div>

          {selectedId ? (
            <ObraCronograma key={`${selectedId}-${orcamentoIds.join(',')}`} cronogramaId={selectedId} obraId={obraId} orcamentoIds={orcamentoIds} />
          ) : (
            <div className="card p-8 text-center">
              <Calendar size={32} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum cronograma vinculado</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Crie um novo ou vincule um cronograma existente a esta obra.</p>
            </div>
          )}
        </>
      )}

      {subTab === 'previsoes' && <ObraPrevisoes obraId={obraId} orcamentoId={orcamentoId} />}
      {subTab === 'curva' && <ObraCurvaS obraId={obraId} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}

      {/* Modal novo cronograma */}
      {showNovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNovo(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Novo Cronograma</h3>
            <input
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCriar()}
              placeholder="Nome do cronograma"
              className="input-base w-full mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNovo(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleCriar} disabled={!novoNome.trim() || creating} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
                {creating ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal renomear */}
      {editingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingName(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Renomear Cronograma</h3>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRenomear()}
              placeholder="Nome do cronograma"
              className="input-base w-full mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingName(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleRenomear} disabled={!editName.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal vincular existente */}
      {showVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowVincular(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Vincular cronograma existente</h3>
            <select value={vinculoId} onChange={e => setVinculoId(e.target.value)} className="input-base w-full mb-4">
              <option value="">Selecione um cronograma...</option>
              {disponiveis.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowVincular(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleVincular} disabled={!vinculoId} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Vincular</button>
            </div>
          </div>
        </div>
      )}

      <ObraAssistenteDock
        open={showAssistente}
        onClose={() => setShowAssistente(false)}
        obraId={obraId}
        obraNome={obraNome}
        obraUf={obraUf}
        cronogramaId={selectedId || undefined}
      />
    </div>
  )
}
