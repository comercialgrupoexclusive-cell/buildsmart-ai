'use client'

// EAP de Processos: estrutura operacional navegável (não um formulário longo).
// - Desktop: árvore hierárquica compacta à esquerda + painel de detalhes à direita.
// - Mobile: linhas expansíveis — só o essencial (nome, status, progresso);
//   datas/descrição/edição aparecem ao abrir o item.
// Alça ⠿ (reaproveita o DnD do motor de orçamento) reordena DENTRO do mesmo
// nível. Toque na linha = selecionar/expandir; arrastar só pela alça.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  atualizarEtapa, criarEtapa, excluirEtapa, listarEtapas, reordenarEtapas,
  STATUS_EAP, type EtapaStatus, type ProcessoEtapa,
} from '@/lib/processo/eap'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { SortableList, type DragSlot } from '@/components/ui/SortableList'

type Visao = 'arvore' | 'cascata' | 'kanban'
type Filtro = 'tudo' | EtapaStatus

function corDe(status: EtapaStatus) { return STATUS_EAP.find(s => s.id === status)?.cor ?? 'var(--accent)' }

function StatusBadge({ status }: { status: EtapaStatus }) {
  const s = STATUS_EAP.find(x => x.id === status)!
  return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${s.cor} 16%, transparent)`, color: s.cor }}>{s.label}</span>
}

function Progresso({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="h-1.5 w-full min-w-10 overflow-hidden rounded-full" style={{ background: 'var(--bg-secondary)' }}>
      <div className="h-full rounded-full" style={{ width: `${valor}%`, background: cor }} />
    </div>
  )
}

export function ProcessoEAP({ processoId }: { processoId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [etapas, setEtapas] = useState<ProcessoEtapa[]>([])
  const [loading, setLoading] = useState(true)
  const [visao, setVisao] = useState<Visao>('arvore')
  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [nova, setNova] = useState('')
  const [novaSub, setNovaSub] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [exp, setExp] = useState<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    setLoading(true)
    const lista = await listarEtapas(supabase, processoId)
    setEtapas(lista)
    setExp(new Set(lista.filter(e => !e.parent_id).map(e => e.id))) // começa expandido
    setLoading(false)
  }, [supabase, processoId])

  useEffect(() => { void carregar() }, [carregar])

  const ordenar = (a: ProcessoEtapa, b: ProcessoEtapa) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at)
  const topo = etapas.filter(e => !e.parent_id).sort(ordenar)
  const subsDe = (id: string) => etapas.filter(e => e.parent_id === id).sort(ordenar)
  const selecionada = etapas.find(e => e.id === sel) || null

  const contagem = {
    tudo: etapas.length,
    em_andamento: etapas.filter(e => e.status === 'em_andamento').length,
    a_fazer: etapas.filter(e => e.status === 'a_fazer').length,
    concluido: etapas.filter(e => e.status === 'concluido').length,
    bloqueado: etapas.filter(e => e.status === 'bloqueado').length,
  }

  const topoVisivel = filtro === 'tudo' ? topo : topo.filter(e => e.status === filtro || subsDe(e.id).some(s => s.status === filtro))

  function toggleExp(id: string) {
    setExp(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selecionar(e: ProcessoEtapa) {
    setSel(e.id)
    if (!e.parent_id && subsDe(e.id).length > 0) setExp(prev => new Set(prev).add(e.id))
  }

  async function adicionar(parentId: string | null, nome: string) {
    const n = nome.trim()
    if (!n) return
    const irmaos = parentId ? subsDe(parentId) : topo
    const e = await criarEtapa(supabase, { processo_id: processoId, nome: n, parent_id: parentId, ordem: irmaos.length })
    if (e) { setEtapas(prev => [...prev, e]); if (parentId) setExp(prev => new Set(prev).add(parentId)) }
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

  async function reordenar(nivelPaiId: string | null, nova: ProcessoEtapa[]) {
    const ids = nova.map(e => e.id)
    setEtapas(prev => {
      const outros = prev.filter(e => (nivelPaiId ? e.parent_id !== nivelPaiId : !!e.parent_id))
      const reord = nova.map((e, i) => ({ ...e, ordem: i }))
      return [...outros, ...reord]
    })
    await reordenarEtapas(supabase, ids)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin" style={{ color: 'var(--text-secondary)' }} /></div>

  const editor = (e: ProcessoEtapa) => (
    <EditorEtapa
      etapa={e}
      subs={subsDe(e.id)}
      permitirSub={!e.parent_id}
      novaSub={novaSub}
      setNovaSub={setNovaSub}
      onAddSub={() => { void adicionar(e.id, novaSub); setNovaSub('') }}
      onPatch={p => void patch(e.id, p)}
      onPatchSub={(id, p) => void patch(id, p)}
      onRemover={() => void remover(e.id)}
      onRemoverSub={id => void remover(id)}
      onFechar={() => setSel(null)}
    />
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>EAP de Processos</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Planeje e acompanhe todas as etapas do processo.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          {([['arvore', 'Árvore'], ['cascata', 'Cascata'], ['kanban', 'Kanban']] as [Visao, string][]).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setVisao(v)} className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={visao === v ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={nova} onChange={e => setNova(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { void adicionar(null, nova); setNova('') } }} placeholder="Nova etapa…" className="w-40 sm:w-48" />
          <Button size="sm" icon={<Plus size={15} />} onClick={() => { void adicionar(null, nova); setNova('') }}>Etapa</Button>
        </div>
      </div>

      {visao === 'arvore' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {([['tudo', 'Tudo'], ['em_andamento', 'Em andamento'], ['a_fazer', 'A fazer'], ['concluido', 'Concluídas']] as [Filtro, string][]).map(([f, l]) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} className="rounded-full px-3 py-1 text-xs font-medium"
              style={filtro === f ? { background: 'var(--accent)', color: 'white' } : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {l} <span className="opacity-70">{contagem[f === 'tudo' ? 'tudo' : f]}</span>
            </button>
          ))}
        </div>
      )}

      {topo.length === 0 ? (
        <div className="card p-10 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa ainda. Crie a primeira acima.</div>
      ) : visao === 'cascata' ? (
        <Cascata etapas={etapas} onAbrir={id => setSel(id)} />
      ) : visao === 'kanban' ? (
        <Kanban topo={topoVisivel} subsDe={subsDe} onAbrir={e => selecionar(e)} />
      ) : (
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-4 lg:items-start">
          {/* Árvore */}
          <div className="card overflow-hidden">
            <SortableList items={topoVisivel} onReorder={n => void reordenar(null, n)} disabled={filtro !== 'tudo'}>
              {(e, i, drag) => (
                <div ref={drag.setNodeRef} style={drag.style}>
                  <LinhaEAP
                    etapa={e} numero={`${i + 1}`} nivel={0}
                    temFilhos={subsDe(e.id).length > 0} expandido={exp.has(e.id)}
                    selecionado={sel === e.id} handle={drag.handle}
                    onToggle={() => toggleExp(e.id)} onSelect={() => selecionar(e)}
                  />
                  {sel === e.id && <div className="lg:hidden">{editor(e)}</div>}
                  {exp.has(e.id) && subsDe(e.id).length > 0 && (
                    <div className="ml-5 border-l" style={{ borderColor: 'var(--border)' }}>
                      <SortableList items={subsDe(e.id)} onReorder={n => void reordenar(e.id, n)}>
                        {(s, j, dragS) => (
                          <div ref={dragS.setNodeRef} style={dragS.style}>
                            <LinhaEAP
                              etapa={s} numero={`${i + 1}.${j + 1}`} nivel={1}
                              temFilhos={false} expandido={false}
                              selecionado={sel === s.id} handle={dragS.handle}
                              onToggle={() => {}} onSelect={() => selecionar(s)}
                            />
                            {sel === s.id && <div className="lg:hidden">{editor(s)}</div>}
                          </div>
                        )}
                      </SortableList>
                    </div>
                  )}
                </div>
              )}
            </SortableList>
          </div>

          {/* Painel de detalhes (desktop) */}
          <div className="hidden lg:block lg:sticky lg:top-4">
            {selecionada ? editor(selecionada) : (
              <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Selecione uma etapa para ver os detalhes.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function LinhaEAP({ etapa, numero, nivel, temFilhos, expandido, selecionado, handle, onToggle, onSelect }: {
  etapa: ProcessoEtapa; numero: string; nivel: number; temFilhos: boolean; expandido: boolean
  selecionado: boolean; handle: React.ReactNode; onToggle: () => void; onSelect: () => void
}) {
  const cor = corDe(etapa.status)
  return (
    <div
      onClick={onSelect}
      className="flex cursor-pointer items-center gap-2 px-2 py-2 transition-colors hover:bg-[var(--bg-secondary)]"
      style={{ borderBottom: '1px solid var(--border)', background: selecionado ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
    >
      {handle}
      {temFilhos ? (
        <button type="button" onClick={e => { e.stopPropagation(); onToggle() }} className="grid size-5 flex-shrink-0 place-items-center" style={{ color: 'var(--text-secondary)' }}>
          {expandido ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      ) : <span className="w-5 flex-shrink-0" />}

      <span className="flex-shrink-0 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{numero}</span>
      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-primary)', fontWeight: nivel === 0 ? 600 : 400 }}>{etapa.nome}</span>

      <span className="hidden w-24 flex-shrink-0 sm:block"><Progresso valor={etapa.progresso} cor={cor} /></span>
      <span className="w-9 flex-shrink-0 text-right text-[11px] tabular-nums sm:w-10" style={{ color: 'var(--text-secondary)' }}>{etapa.progresso}%</span>
      <span className="flex-shrink-0"><StatusBadge status={etapa.status} /></span>
      {(etapa.data_inicio || etapa.data_fim) && (
        <span className="hidden flex-shrink-0 text-[11px] md:inline" style={{ color: 'var(--text-secondary)' }}>
          {etapa.data_inicio ? new Date(etapa.data_inicio).toLocaleDateString('pt-BR') : '—'} → {etapa.data_fim ? new Date(etapa.data_fim).toLocaleDateString('pt-BR') : '—'}
        </span>
      )}
    </div>
  )
}

function EditorEtapa({ etapa, subs, permitirSub, novaSub, setNovaSub, onAddSub, onPatch, onPatchSub, onRemover, onRemoverSub, onFechar }: {
  etapa: ProcessoEtapa
  subs: ProcessoEtapa[]
  permitirSub: boolean
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
    <div className="card m-2 space-y-3 p-4 lg:m-0">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Detalhes da etapa</h3>
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

      {permitirSub && (
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Subetapas ({subs.length})</p>
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
      )}

      <div className="flex justify-end pt-2">
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onRemover}>Excluir</Button>
      </div>
    </div>
  )
}

function Kanban({ topo, subsDe, onAbrir }: { topo: ProcessoEtapa[]; subsDe: (id: string) => ProcessoEtapa[]; onAbrir: (e: ProcessoEtapa) => void }) {
  return (
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
                <button key={e.id} type="button" onClick={() => onAbrir(e)} className="card w-full p-3 text-left">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.nome}</p>
                  <div className="mt-2"><Progresso valor={e.progresso} cor={col.cor} /></div>
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
    return <div className="relative h-5 w-full rounded" style={{ background: 'var(--bg-secondary)' }}>
      <div className="absolute top-0 h-5 rounded" style={{ left: `${left}%`, width: `${width}%`, background: corDe(e.status), opacity: 0.85 }} />
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
