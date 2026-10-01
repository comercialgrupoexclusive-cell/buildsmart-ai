'use client'

// EAP do Processo: estrutura própria em etapas/subetapas, com duas visões —
// Kanban (por status) e Cascata (por datas). Fonte: processo_etapa (RLS direto).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { atualizarEtapa, criarEtapa, excluirEtapa, listarEtapas, STATUS_EAP, type EtapaStatus, type ProcessoEtapa } from '@/lib/processo/eap'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

type Visao = 'kanban' | 'cascata'

export function ProcessoEAP({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [etapas, setEtapas] = useState<ProcessoEtapa[]>([])
  const [loading, setLoading] = useState(true)
  const [visao, setVisao] = useState<Visao>('kanban')
  const [nova, setNova] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [novaSub, setNovaSub] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setEtapas(await listarEtapas(supabase, processoId))
    setLoading(false)
  }, [supabase, processoId])

  useEffect(() => { void carregar() }, [carregar])

  const topo = etapas.filter(e => !e.parent_id)
  const subsDe = (id: string) => etapas.filter(e => e.parent_id === id)
  const selecionada = etapas.find(e => e.id === sel) || null

  async function adicionarEtapa() {
    const nome = nova.trim()
    if (!nome) return
    setNova('')
    const e = await criarEtapa(supabase, { processo_id: processoId, nome, ordem: topo.length })
    if (e) setEtapas(prev => [...prev, e])
  }

  async function adicionarSub(parentId: string) {
    const nome = novaSub.trim()
    if (!nome) return
    setNovaSub('')
    const e = await criarEtapa(supabase, { processo_id: processoId, nome, parent_id: parentId, ordem: subsDe(parentId).length })
    if (e) setEtapas(prev => [...prev, e])
  }

  async function patch(id: string, p: Partial<ProcessoEtapa>) {
    setEtapas(prev => prev.map(e => e.id === id ? { ...e, ...p } : e))
    await atualizarEtapa(supabase, id, p)
  }

  async function remover(id: string) {
    if (!window.confirm('Excluir esta etapa (e subetapas)?')) return
    await excluirEtapa(supabase, id)
    setEtapas(prev => prev.filter(e => e.id !== id && e.parent_id !== id))
    if (sel === id) setSel(null)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: 'var(--text-secondary)' }} /></div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          {(['kanban', 'cascata'] as Visao[]).map(v => (
            <button key={v} type="button" onClick={() => setVisao(v)}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize"
              style={visao === v ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={nova} onChange={e => setNova(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void adicionarEtapa() }} placeholder="Nova etapa…" className="w-44" />
          <Button size="sm" icon={<Plus size={15} />} onClick={() => void adicionarEtapa()}>Etapa</Button>
        </div>
      </div>

      {topo.length === 0 ? (
        <div className="card p-10 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa ainda. Crie a primeira acima.</div>
      ) : visao === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUS_EAP.map(col => {
            const cards = topo.filter(e => e.status === col.id)
            return (
              <div key={col.id} className="w-64 shrink-0 rounded-lg p-2" style={{ background: 'var(--bg-secondary)' }}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold" style={{ color: col.cor }}>{col.label}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map(e => (
                    <button key={e.id} type="button" onClick={() => setSel(e.id)} className="card w-full p-3 text-left">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.nome}</p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="h-full rounded-full" style={{ width: `${e.progresso}%`, background: col.cor }} />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span>{e.progresso}%</span>
                        {subsDe(e.id).length > 0 && <span>{subsDe(e.id).length} subetapa(s)</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Cascata etapas={etapas} onAbrir={setSel} />
      )}

      {selecionada && (
        <EditorEtapa
          etapa={selecionada}
          subs={subsDe(selecionada.id)}
          novaSub={novaSub}
          setNovaSub={setNovaSub}
          onAddSub={() => void adicionarSub(selecionada.id)}
          onPatch={(p) => void patch(selecionada.id, p)}
          onPatchSub={(id, p) => void patch(id, p)}
          onRemover={() => void remover(selecionada.id)}
          onRemoverSub={(id) => void remover(id)}
          onFechar={() => setSel(null)}
        />
      )}
    </div>
  )
}

function EditorEtapa({ etapa, subs, novaSub, setNovaSub, onAddSub, onPatch, onPatchSub, onRemover, onRemoverSub, onFechar }: {
  etapa: ProcessoEtapa
  subs: ProcessoEtapa[]
  novaSub: string
  setNovaSub: (v: string) => void
  onAddSub: () => void
  onPatch: (p: Partial<ProcessoEtapa>) => void
  onPatchSub: (id: string, p: Partial<ProcessoEtapa>) => void
  onRemover: () => void
  onRemoverSub: (id: string) => void
  onFechar: () => void
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Etapa</h3>
        <button type="button" onClick={onFechar} style={{ color: 'var(--text-secondary)' }}><X size={16} /></button>
      </div>

      <Input label="Nome" value={etapa.nome} onChange={e => onPatch({ nome: e.target.value })} />
      <Textarea label="Descrição" value={etapa.descricao ?? ''} onChange={e => onPatch({ descricao: e.target.value })} rows={2} />

      <div className="grid grid-cols-2 gap-3">
        <Select label="Status" value={etapa.status} onChange={e => onPatch({ status: e.target.value as EtapaStatus })}>
          {STATUS_EAP.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Progresso: {etapa.progresso}%</label>
          <input type="range" min={0} max={100} value={etapa.progresso} onChange={e => onPatch({ progresso: Number(e.target.value) })} className="mt-3 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Início" type="date" value={etapa.data_inicio ?? ''} onChange={e => onPatch({ data_inicio: e.target.value || null })} />
        <Input label="Fim" type="date" value={etapa.data_fim ?? ''} onChange={e => onPatch({ data_fim: e.target.value || null })} />
      </div>

      <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Subetapas</p>
        {subs.map(s => (
          <div key={s.id} className="flex items-center gap-2">
            <Input value={s.nome} onChange={e => onPatchSub(s.id, { nome: e.target.value })} className="flex-1" />
            <Select value={s.status} onChange={e => onPatchSub(s.id, { status: e.target.value as EtapaStatus })} className="w-36">
              {STATUS_EAP.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
            </Select>
            <button type="button" onClick={() => onRemoverSub(s.id)} style={{ color: 'var(--danger)' }}><Trash2 size={15} /></button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Input value={novaSub} onChange={e => setNovaSub(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAddSub() }} placeholder="Nova subetapa…" className="flex-1" />
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAddSub}>Add</Button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemover}>Excluir etapa</Button>
      </div>
    </div>
  )
}

function Cascata({ etapas, onAbrir }: { etapas: ProcessoEtapa[]; onAbrir: (id: string) => void }) {
  const comData = etapas.filter(e => e.data_inicio && e.data_fim)
  const todas = etapas.slice().sort((a, b) => (a.data_inicio ?? '').localeCompare(b.data_inicio ?? ''))
  const min = comData.reduce<string | null>((m, e) => !m || (e.data_inicio! < m) ? e.data_inicio! : m, null)
  const max = comData.reduce<string | null>((m, e) => !m || (e.data_fim! > m) ? e.data_fim! : m, null)
  const t0 = min ? new Date(min).getTime() : 0
  const t1 = max ? new Date(max).getTime() : 0
  const span = t1 - t0

  function barra(e: ProcessoEtapa) {
    if (!e.data_inicio || !e.data_fim || span <= 0) return null
    const left = ((new Date(e.data_inicio).getTime() - t0) / span) * 100
    const width = Math.max(2, ((new Date(e.data_fim).getTime() - new Date(e.data_inicio).getTime()) / span) * 100)
    const cor = STATUS_EAP.find(s => s.id === e.status)?.cor ?? 'var(--accent)'
    return <div className="relative h-5 w-full rounded" style={{ background: 'var(--bg-secondary)' }}>
      <div className="absolute top-0 h-5 rounded" style={{ left: `${left}%`, width: `${width}%`, background: cor, opacity: 0.85 }} />
    </div>
  }

  return (
    <div className="card p-4">
      {min && max && (
        <div className="mb-2 flex justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          <span>{new Date(min).toLocaleDateString('pt-BR')}</span>
          <span>{new Date(max).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
      <div className="space-y-2">
        {todas.map(e => (
          <div key={e.id} className={`grid grid-cols-[40%_60%] items-center gap-2 ${e.parent_id ? 'pl-4' : ''}`}>
            <button type="button" onClick={() => onAbrir(e.parent_id ?? e.id)} className="truncate text-left text-sm" style={{ color: 'var(--text-primary)' }}>
              {e.parent_id && <ChevronRight size={12} className="mr-1 inline" style={{ color: 'var(--text-secondary)' }} />}
              {e.nome}
            </button>
            {barra(e) ?? <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>sem datas</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
