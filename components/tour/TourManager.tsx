'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ChevronDown, Eye, ImagePlus, Link2, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { BuildSmartTourViewer } from '@/components/portal/BuildSmartTourViewer'
import type { PortalTourDTO } from '@/lib/portal/types'

type RawTour = { id: string; nome: string; tipo: 'projeto' | 'obra'; descricao: string | null; publicado_cliente: boolean; obra_id: string | null; projeto_id: string | null }
type RawNode = { id: string; tour_id: string; nome: string; pavimento: string | null; ambiente: string | null; imagem_url: string; thumbnail_url: string | null; ordem: number; yaw_inicial: number; pitch_inicial: number; publicado: boolean }
type RawLink = { id: string; node_origem_id: string; node_destino_id: string; yaw: number; pitch: number; label: string | null }
type RawTourPayload = RawTour & { nodes: RawNode[]; links: RawLink[] }

export function TourManager({ obraId, projectId }: { obraId?: string | null; projectId?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const [tours, setTours] = useState<RawTourPayload[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [showLinks, setShowLinks] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [editName, setEditName] = useState('')
  const [nodeFile, setNodeFile] = useState<File | null>(null)
  const [nodeForm, setNodeForm] = useState({ nome: '', ambiente: '', pavimento: '' })
  const [linkForm, setLinkForm] = useState({ origem: '', destino: '', yaw: '0', pitch: '0', label: '' })
  const selected = tours.find(tour => tour.id === selectedId)
  const nodes = selected?.nodes || []
  const links = selected?.links || []

  const load = useCallback(async () => {
    if (!currentProfile || (!obraId && !projectId)) return
    const { data, error: tourError } = await supabase.rpc('portal_tour_admin_list', {
      p_profile_id: currentProfile.id,
      p_obra_id: obraId || null,
      p_project_id: projectId || null,
    })
    if (tourError) { setError(tourError.message); return }
    const list = (data || []) as RawTourPayload[]
    setTours(list)
    const nextSelectedId = selectedId && list.some(tour => tour.id === selectedId) ? selectedId : list[0]?.id || ''
    setSelectedId(nextSelectedId)
  }, [currentProfile, obraId, projectId, selectedId, supabase])

  const manage = useCallback(async (action: string, entityId: string | null, payload: Record<string, unknown> = {}) => {
    if (!currentProfile || (!obraId && !projectId)) return { data: null, error: new Error('Perfil ou contexto indisponível.') }
    return supabase.rpc('portal_tour_admin_manage', {
      p_profile_id: currentProfile.id,
      p_action: action,
      p_obra_id: obraId || null,
      p_project_id: projectId || null,
      p_entity_id: entityId,
      p_payload: payload,
    })
  }, [currentProfile, obraId, projectId, supabase])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function createTour() {
    setBusy(true)
    setError('')
    const baseName = projectId ? 'Tour do projeto' : 'Tour da obra'
    const nome = tours.length ? `${baseName} ${tours.length + 1}` : baseName
    const { data, error: createError } = await manage('create_tour', null, { nome })
    setBusy(false)
    if (createError) { setError(createError.message); return }
    await load()
    if (data) {
      setSelectedId(data)
      setEditName(nome)
      setShowNodeForm(true)
    }
  }

  async function renameTour() {
    if (!selectedId || !editName.trim()) return
    const { error: renameError } = await manage('rename_tour', selectedId, { nome: editName.trim() })
    if (renameError) { setError(renameError.message); return }
    setRenaming(false)
    await load()
  }

  async function removeTour(tour: RawTour) {
    if (!window.confirm(`Excluir o tour “${tour.nome}” e seus ambientes?`)) return
    const { error: removeError } = await manage('delete_tour', tour.id)
    if (removeError) { setError(removeError.message); return }
    setSelectedId('')
    await load()
  }

  async function uploadNode() {
    if (!selectedId || !nodeForm.nome.trim() || !nodeFile) return
    setBusy(true)
    setError('')
    const safeName = nodeFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `tours/${obraId || 'projetos'}/${selectedId}/${nodeFile.lastModified}-${nodeFile.size}-${safeName}`
    const uploaded = await supabase.storage.from('project-files').upload(path, nodeFile, { cacheControl: '3600', upsert: false })
    if (uploaded.error) { setBusy(false); setError(uploaded.error.message); return }
    const imageUrl = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
    const { error: insertError } = await manage('create_node', selectedId, {
      nome: nodeForm.nome.trim(),
      ambiente: nodeForm.ambiente.trim() || nodeForm.nome.trim(),
      pavimento: nodeForm.pavimento.trim() || null,
      imagem_url: imageUrl,
      thumbnail_url: imageUrl,
      ordem: nodes.length,
      publicado: true,
    })
    setBusy(false)
    if (insertError) { setError(insertError.message); return }
    setNodeForm({ nome: '', ambiente: '', pavimento: '' })
    setNodeFile(null)
    setShowNodeForm(false)
    await load()
  }

  async function removeNode(node: RawNode) {
    if (!window.confirm(`Remover o ambiente “${node.nome}”?`)) return
    const { error: removeError } = await manage('delete_node', node.id)
    if (removeError) { setError(removeError.message); return }
    await load()
  }

  async function addLink() {
    if (!linkForm.origem || !linkForm.destino || linkForm.origem === linkForm.destino) return
    const { error: linkError } = await manage('create_link', null, {
      origem_id: linkForm.origem,
      destino_id: linkForm.destino,
      yaw: Number(linkForm.yaw) || 0,
      pitch: Number(linkForm.pitch) || 0,
      label: linkForm.label || null,
    })
    if (linkError) { setError(linkError.message); return }
    setLinkForm({ origem: '', destino: '', yaw: '0', pitch: '0', label: '' })
    setShowLinks(false)
    await load()
  }

  async function togglePublish(tour: RawTour) {
    const { error: publishError } = await manage('toggle_publish', tour.id)
    if (publishError) { setError(publishError.message); return }
    await load()
  }

  const viewerTour: PortalTourDTO | null = selected && nodes.length ? {
    id: selected.id,
    nome: selected.nome,
    tipo: selected.tipo,
    descricao: selected.descricao,
    nodes: nodes.map(node => ({
      id: node.id,
      nome: node.nome,
      pavimento: node.pavimento,
      ambiente: node.ambiente,
      imagemUrl: node.imagem_url,
      thumbnailUrl: node.thumbnail_url,
      yawInicial: Number(node.yaw_inicial || 0),
      pitchInicial: Number(node.pitch_inicial || 0),
      links: links.filter(link => link.node_origem_id === node.id).map(link => ({ id: link.id, nodeDestinoId: link.node_destino_id, yaw: Number(link.yaw), pitch: Number(link.pitch), label: link.label })),
      hotspots: [],
    })),
  } : null

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Tour Virtual 360°</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Crie o tour e depois adicione os ambientes em fotos 360°.</p>
        </div>
        <button type="button" onClick={createTour} disabled={busy} className="flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Novo tour
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {tours.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tours.map(tour => (
            <button key={tour.id} type="button" onClick={() => setSelectedId(tour.id)} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium" style={selectedId === tour.id ? { background: 'var(--accent)', color: 'white' } : { border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {tour.nome}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {renaming ? (
              <div className="flex min-w-0 flex-1 gap-2">
                <input value={editName} onChange={event => setEditName(event.target.value)} className="input-base min-h-10 min-w-0 flex-1" aria-label="Nome do tour" />
                <button type="button" onClick={renameTour} className="grid size-10 shrink-0 place-items-center rounded-lg" title="Salvar nome" style={{ background: 'var(--accent)', color: 'white' }}><Save size={16} /></button>
                <button type="button" onClick={() => setRenaming(false)} className="grid size-10 shrink-0 place-items-center rounded-lg" title="Cancelar" style={{ border: '1px solid var(--border)' }}><X size={16} /></button>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{selected.nome}</p>
                  <button type="button" onClick={() => { setEditName(selected.nome); setRenaming(true) }} className="grid size-8 shrink-0 place-items-center rounded-lg" title="Renomear tour"><Pencil size={14} /></button>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{nodes.length} ambiente{nodes.length === 1 ? '' : 's'}</p>
              </div>
            )}
            {!renaming && (
              <div className="flex gap-2">
                {obraId && <button type="button" onClick={() => togglePublish(selected)} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium" style={{ border: '1px solid var(--border)', color: selected.publicado_cliente ? 'var(--success)' : 'var(--text-secondary)' }}><Eye size={16} /> {selected.publicado_cliente ? 'Publicado' : 'Publicar'}</button>}
                <button type="button" onClick={() => removeTour(selected)} className="grid size-10 place-items-center rounded-lg text-red-400" title="Excluir tour" style={{ border: '1px solid var(--border)' }}><Trash2 size={16} /></button>
              </div>
            )}
          </div>

          {viewerTour && <div className="card overflow-hidden"><BuildSmartTourViewer tour={viewerTour} onCreateAnnotation={() => {}} onOpenBoardItem={() => {}} /></div>}

          <div className="flex items-center justify-between gap-3">
            <div><h3 className="font-semibold">Ambientes</h3><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Cada ambiente corresponde a uma foto panorâmica.</p></div>
            <button type="button" onClick={() => setShowNodeForm(true)} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold" style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}><ImagePlus size={16} /> Adicionar ambiente</button>
          </div>

          {showNodeForm && (
            <div className="card space-y-3 p-4">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Novo ambiente</h3><button type="button" onClick={() => { setShowNodeForm(false); setNodeFile(null) }} className="grid size-9 place-items-center rounded-lg" title="Fechar"><X size={16} /></button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={nodeForm.nome} onChange={event => setNodeForm(value => ({ ...value, nome: event.target.value }))} className="input-base min-h-11" placeholder="Nome do ambiente *" />
                <input value={nodeForm.pavimento} onChange={event => setNodeForm(value => ({ ...value, pavimento: event.target.value }))} className="input-base min-h-11" placeholder="Pavimento (opcional)" />
              </div>
              <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-sm font-medium" style={{ borderColor: nodeFile ? 'var(--accent)' : 'var(--border)', color: nodeFile ? 'var(--accent)' : 'var(--text-secondary)' }}>
                <ImagePlus size={17} /> {nodeFile ? nodeFile.name : 'Selecionar foto 360° *'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => setNodeFile(event.target.files?.[0] || null)} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setShowNodeForm(false); setNodeFile(null) }} className="min-h-10 rounded-lg px-3 text-sm">Cancelar</button>
                <button type="button" onClick={uploadNode} disabled={busy || !nodeForm.nome.trim() || !nodeFile} className="flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Adicionar ambiente</button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map(node => (
              <article key={node.id} className="card overflow-hidden">
                <div className="relative aspect-[2/1] w-full"><Image src={node.thumbnail_url || node.imagem_url} alt={node.nome} fill unoptimized className="object-cover" /></div>
                <div className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{node.nome}</p><p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{node.pavimento || 'Ambiente 360°'}</p></div>
                  <button type="button" onClick={() => removeNode(node)} className="grid size-10 place-items-center rounded-lg text-red-400" title="Remover ambiente"><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>

          {nodes.length > 1 && (
            <div>
              <button type="button" onClick={() => setShowLinks(value => !value)} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Link2 size={15} /> Conectar ambientes <ChevronDown size={14} className={showLinks ? 'rotate-180' : ''} /></button>
              {showLinks && <div className="mt-3 card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"><select value={linkForm.origem} onChange={event => setLinkForm(value => ({ ...value, origem: event.target.value }))} className="input-base min-h-10"><option value="">Origem</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.nome}</option>)}</select><select value={linkForm.destino} onChange={event => setLinkForm(value => ({ ...value, destino: event.target.value }))} className="input-base min-h-10"><option value="">Destino</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.nome}</option>)}</select><input value={linkForm.label} onChange={event => setLinkForm(value => ({ ...value, label: event.target.value }))} className="input-base min-h-10" placeholder="Rótulo" /><input type="number" step="0.1" value={linkForm.yaw} onChange={event => setLinkForm(value => ({ ...value, yaw: event.target.value }))} className="input-base min-h-10" title="Posição horizontal" /><input type="number" step="0.1" value={linkForm.pitch} onChange={event => setLinkForm(value => ({ ...value, pitch: event.target.value }))} className="input-base min-h-10" title="Posição vertical" /><button type="button" onClick={addLink} className="flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium" style={{ border: '1px solid var(--border)' }}><Link2 size={15} /> Conectar</button></div>}
            </div>
          )}
        </>
      ) : (
        <div className="card border-dashed p-10 text-center"><ImagePlus className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhum tour criado</p><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Clique em “Novo tour” para começar.</p></div>
      )}
    </section>
  )
}
