'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Eye, ImagePlus, Link2, Loader2, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BuildSmartTourViewer } from '@/components/portal/BuildSmartTourViewer'
import type { PortalTourDTO } from '@/lib/portal/types'

type RawTour = { id: string; nome: string; tipo: 'projeto' | 'obra'; descricao: string | null; publicado_cliente: boolean; obra_id: string | null; projeto_id: string | null }
type RawNode = { id: string; tour_id: string; nome: string; pavimento: string | null; ambiente: string | null; imagem_url: string; thumbnail_url: string | null; ordem: number; yaw_inicial: number; pitch_inicial: number; publicado: boolean }
type RawLink = { id: string; node_origem_id: string; node_destino_id: string; yaw: number; pitch: number; label: string | null }

export function TourManager({ obraId, projectId }: { obraId?: string | null; projectId?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [tours, setTours] = useState<RawTour[]>([])
  const [nodes, setNodes] = useState<RawNode[]>([])
  const [links, setLinks] = useState<RawLink[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [newTourName, setNewTourName] = useState('')
  const [nodeForm, setNodeForm] = useState({ nome: '', ambiente: '', pavimento: '' })
  const [linkForm, setLinkForm] = useState({ origem: '', destino: '', yaw: '0', pitch: '0', label: '' })

  const load = useCallback(async () => {
    let query = supabase.from('portal_tours').select('*').order('updated_at', { ascending: false })
    query = projectId ? query.eq('projeto_id', projectId) : query.eq('obra_id', obraId || '')
    const { data, error: tourError } = await query
    if (tourError) { setError(tourError.message); return }
    const list = (data || []) as RawTour[]
    setTours(list)
    setSelectedId(current => current && list.some(tour => tour.id === current) ? current : list[0]?.id || '')
  }, [obraId, projectId, supabase])

  const loadTour = useCallback(async () => {
    if (!selectedId) { setNodes([]); setLinks([]); return }
    const { data: nodeRows } = await supabase.from('portal_tour_nodes').select('*').eq('tour_id', selectedId).order('ordem')
    const loadedNodes = (nodeRows || []) as RawNode[]
    setNodes(loadedNodes)
    if (!loadedNodes.length) { setLinks([]); return }
    const { data: linkRows } = await supabase.from('portal_tour_links').select('*').in('node_origem_id', loadedNodes.map(node => node.id))
    setLinks((linkRows || []) as RawLink[])
  }, [selectedId, supabase])

  useEffect(() => { void Promise.resolve().then(load) }, [load])
  useEffect(() => { void Promise.resolve().then(loadTour) }, [loadTour])

  async function createTour() {
    if (!newTourName.trim()) return
    setBusy(true); setError('')
    const { data, error: createError } = await supabase.from('portal_tours').insert({
      nome: newTourName.trim(), tipo: projectId ? 'projeto' : 'obra', descricao: null,
      obra_id: obraId || null, projeto_id: projectId || null, publicado_cliente: false,
    }).select('*').single()
    setBusy(false)
    if (createError) { setError(createError.message); return }
    setNewTourName(''); await load(); if (data) setSelectedId(data.id)
  }

  async function uploadNode(file: File) {
    if (!selectedId || !nodeForm.nome.trim()) return
    setBusy(true); setError('')
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `tours/${obraId || 'projetos'}/${selectedId}/${Date.now()}-${safeName}`
    const uploaded = await supabase.storage.from('project-files').upload(path, file, { cacheControl: '3600', upsert: false })
    if (uploaded.error) { setBusy(false); setError(uploaded.error.message); return }
    const imageUrl = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
    const { error: insertError } = await supabase.from('portal_tour_nodes').insert({
      tour_id: selectedId, nome: nodeForm.nome.trim(), ambiente: nodeForm.ambiente.trim() || null,
      pavimento: nodeForm.pavimento.trim() || null, imagem_url: imageUrl, thumbnail_url: imageUrl,
      ordem: nodes.length, publicado: true,
    })
    setBusy(false)
    if (insertError) { setError(insertError.message); return }
    setNodeForm({ nome: '', ambiente: '', pavimento: '' }); await loadTour()
  }

  async function removeNode(node: RawNode) {
    if (!window.confirm(`Remover o ambiente ${node.nome}?`)) return
    await supabase.from('portal_tour_nodes').delete().eq('id', node.id)
    await loadTour()
  }

  async function addLink() {
    if (!linkForm.origem || !linkForm.destino || linkForm.origem === linkForm.destino) return
    const { error: linkError } = await supabase.from('portal_tour_links').insert({
      node_origem_id: linkForm.origem, node_destino_id: linkForm.destino,
      yaw: Number(linkForm.yaw) || 0, pitch: Number(linkForm.pitch) || 0, label: linkForm.label || null,
    })
    if (linkError) { setError(linkError.message); return }
    setLinkForm({ origem: '', destino: '', yaw: '0', pitch: '0', label: '' }); await loadTour()
  }

  async function togglePublish(tour: RawTour) {
    await supabase.from('portal_tours').update({ publicado_cliente: !tour.publicado_cliente }).eq('id', tour.id)
    await load()
  }

  const selected = tours.find(tour => tour.id === selectedId)
  const viewerTour: PortalTourDTO | null = selected && nodes.length ? {
    id: selected.id, nome: selected.nome, tipo: selected.tipo, descricao: selected.descricao,
    nodes: nodes.map(node => ({
      id: node.id, nome: node.nome, pavimento: node.pavimento, ambiente: node.ambiente,
      imagemUrl: node.imagem_url, thumbnailUrl: node.thumbnail_url, yawInicial: Number(node.yaw_inicial || 0), pitchInicial: Number(node.pitch_inicial || 0),
      links: links.filter(link => link.node_origem_id === node.id).map(link => ({ id: link.id, nodeDestinoId: link.node_destino_id, yaw: Number(link.yaw), pitch: Number(link.pitch), label: link.label })), hotspots: [],
    })),
  } : null

  return <section className="space-y-4">
    <div><h2 className="text-xl font-semibold">Tour Virtual 360°</h2><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Organize ambientes, conecte panoramas e publique o Tour no Portal.</p></div>
    {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
    <div className="card grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
      <input value={newTourName} onChange={event => setNewTourName(event.target.value)} className="input-base min-h-11" placeholder={projectId ? 'Ex.: Projeto 360 da residência' : 'Ex.: Visita de agosto'} />
      <button type="button" onClick={createTour} disabled={busy || !newTourName.trim()} className="flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}><Plus size={16} /> Novo Tour</button>
    </div>
    {tours.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{tours.map(tour => <button key={tour.id} type="button" onClick={() => setSelectedId(tour.id)} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium" style={selectedId === tour.id ? { background: 'var(--accent)', color: 'white' } : { border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{tour.nome}</button>)}</div>}
    {selected && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{selected.nome} <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>{nodes.length} ambientes</span></p>{obraId && <button type="button" onClick={() => togglePublish(selected)} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium" style={{ border: '1px solid var(--border)', color: selected.publicado_cliente ? 'var(--success)' : 'var(--text-secondary)' }}><Eye size={16} /> {selected.publicado_cliente ? 'Publicado no Portal' : 'Publicar no Portal'}</button>}</div>
      <div className="card grid gap-3 p-4 md:grid-cols-3"><input value={nodeForm.nome} onChange={e => setNodeForm(v => ({ ...v, nome: e.target.value }))} className="input-base min-h-11" placeholder="Nome do ambiente" /><input value={nodeForm.ambiente} onChange={e => setNodeForm(v => ({ ...v, ambiente: e.target.value }))} className="input-base min-h-11" placeholder="Ambiente (ex.: Cozinha)" /><input value={nodeForm.pavimento} onChange={e => setNodeForm(v => ({ ...v, pavimento: e.target.value }))} className="input-base min-h-11" placeholder="Pavimento" /><label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium md:col-span-3" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}><ImagePlus size={17} /> {busy ? 'Enviando...' : 'Adicionar panorama 360°'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={busy || !nodeForm.nome.trim()} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadNode(file) }} /></label></div>
      {nodes.length > 1 && <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"><select value={linkForm.origem} onChange={e => setLinkForm(v => ({ ...v, origem: e.target.value }))} className="input-base min-h-10"><option value="">Origem</option>{nodes.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}</select><select value={linkForm.destino} onChange={e => setLinkForm(v => ({ ...v, destino: e.target.value }))} className="input-base min-h-10"><option value="">Destino</option>{nodes.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}</select><input value={linkForm.label} onChange={e => setLinkForm(v => ({ ...v, label: e.target.value }))} className="input-base min-h-10" placeholder="Rótulo" /><input type="number" step="0.1" value={linkForm.yaw} onChange={e => setLinkForm(v => ({ ...v, yaw: e.target.value }))} className="input-base min-h-10" title="Yaw" /><input type="number" step="0.1" value={linkForm.pitch} onChange={e => setLinkForm(v => ({ ...v, pitch: e.target.value }))} className="input-base min-h-10" title="Pitch" /><button type="button" onClick={addLink} className="flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium" style={{ border: '1px solid var(--border)' }}><Link2 size={15} /> Conectar</button></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{nodes.map(node => <article key={node.id} className="card overflow-hidden"><div className="relative aspect-[2/1] w-full"><Image src={node.thumbnail_url || node.imagem_url} alt={node.nome} fill unoptimized className="object-cover" /></div><div className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{node.nome}</p><p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{[node.pavimento, node.ambiente].filter(Boolean).join(' · ') || 'Ambiente 360°'}</p></div><button type="button" onClick={() => removeNode(node)} className="grid size-10 place-items-center rounded-lg text-red-400" title="Remover ambiente"><Trash2 size={16} /></button></div></article>)}</div>
      {viewerTour && <div className="card overflow-hidden"><BuildSmartTourViewer tour={viewerTour} onCreateAnnotation={() => {}} onOpenBoardItem={() => {}} /></div>}
    </>}
    {!busy && !tours.length && <div className="card border-dashed p-10 text-center"><ImagePlus className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Crie o primeiro Tour</p><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Depois envie panoramas 2:1 dos ambientes.</p></div>}
    {busy && <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><Loader2 className="animate-spin" size={16} /> Processando...</div>}
  </section>
}
