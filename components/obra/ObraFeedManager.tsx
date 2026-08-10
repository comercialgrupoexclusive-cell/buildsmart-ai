'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, BookOpen, ChevronDown, Crop, ImagePlus, LayoutDashboard, Loader2, Megaphone, Newspaper, Send, Star, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { PhotoCropEditor } from '@/components/media/PhotoCropEditor'
import type { PortalFeedItemDTO } from '@/lib/portal/types'
import { ObraPortalMessages } from './ObraPortalMessages'

type FileOption = {
  id: string
  nome: string
  url: string | null
  tipo: string
  source_type?: string | null
  source_id?: string | null
  source_index?: number | null
}
type BudgetOption = { id: string; nome: string | null; versao: number }
type SourceOption = { id: string; type: 'diario' | 'comunicado'; label: string; titulo: string; conteudo: string }
type DiarioRow = { id: string; data: string; atividades: string | null; observacoes: string | null }
type ComunicadoRow = { id: string; titulo: string; conteudo: string }
type RdoRow = { id: string; data: string; servicos_executados: string | null; fotos: unknown }
type RdoPhoto = { rdoId: string; index: number; data: string; url: string; titulo: string }

export function ObraFeedManager({ obraId }: { obraId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const uploadRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<PortalFeedItemDTO[]>([])
  const [files, setFiles] = useState<FileOption[]>([])
  const [rdoPhotos, setRdoPhotos] = useState<RdoPhoto[]>([])
  const [budgets, setBudgets] = useState<BudgetOption[]>([])
  const [sources, setSources] = useState<SourceOption[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [editingFile, setEditingFile] = useState<FileOption | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'internal' | 'client' | 'shared'>('client')
  const [budgetId, setBudgetId] = useState('')
  const [album, setAlbum] = useState('')
  const [isStory, setIsStory] = useState(false)
  const [source, setSource] = useState('manual')
  const [showPhotoLibrary, setShowPhotoLibrary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!currentProfile) return
    setLoading(true)
    const [feedResult, fileResult, budgetResult, diarioResult, comunicadoResult, rdoResult] = await Promise.all([
      supabase.rpc('feed_admin_list', { p_obra_id: obraId, p_profile_id: currentProfile.id }),
      supabase.from('obra_files').select('id,nome,url,tipo,source_type,source_id,source_index').eq('obra_id', obraId).like('tipo', 'image/%').not('url', 'is', null).order('criado_em', { ascending: false }),
      supabase.from('orcamentos').select('id,nome,versao').eq('obra_id', obraId).neq('status', 'arquivado').order('versao', { ascending: false }),
      supabase.from('diario_obra').select('id,data,atividades,observacoes').eq('obra_id', obraId).order('data', { ascending: false }).limit(30),
      supabase.from('comunicados_obra').select('id,titulo,conteudo,created_at').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(30),
      supabase.from('rdo').select('id,data,servicos_executados,fotos').eq('obra_id', obraId).order('data', { ascending: false }).limit(30),
    ])
    const nextFiles = (fileResult.data || []) as FileOption[]
    setItems((feedResult.data || []) as PortalFeedItemDTO[])
    setFiles(nextFiles)
    setBudgets((budgetResult.data || []) as BudgetOption[])
    setSources([
      ...((diarioResult.data || []) as DiarioRow[]).map(row => ({ id: row.id, type: 'diario' as const, label: `Diario - ${formatDate(row.data)}`, titulo: row.atividades || 'Atualizacao da obra', conteudo: row.observacoes || row.atividades || '' })),
      ...((comunicadoResult.data || []) as ComunicadoRow[]).map(row => ({ id: row.id, type: 'comunicado' as const, label: `Comunicado - ${row.titulo}`, titulo: row.titulo, conteudo: row.conteudo })),
    ])
    const imported = new Set(nextFiles.filter(file => file.source_type === 'rdo').map(file => `${file.source_id}:${file.source_index}`))
    setRdoPhotos(((rdoResult.data || []) as RdoRow[]).flatMap(row => normalizePhotos(row.fotos).map((url, index) => ({
      rdoId: row.id, index, data: row.data, url, titulo: row.servicos_executados || `RDO de ${formatDate(row.data)}`,
    }))).filter(photo => !imported.has(`${photo.rdoId}:${photo.index}`)))
    setError(feedResult.error?.message || fileResult.error?.message || rdoResult.error?.message || '')
    setLoading(false)
  }, [currentProfile, obraId, supabase])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function chooseSource(value: string) {
    setSource(value)
    if (value === 'manual') return
    const selected = sources.find(item => `${item.type}:${item.id}` === value)
    if (selected) { setTitle(selected.titulo); setContent(selected.conteudo) }
  }

  async function uploadImages(fileList: FileList | null) {
    if (!fileList?.length || !currentProfile) return
    setSaving(true)
    setError('')
    const uploadedIds: string[] = []
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue
      const created = await storeImage(file, file.name)
      if (created) uploadedIds.push(created.id)
    }
    setSelectedFiles(current => [...current, ...uploadedIds])
    setSaving(false)
    if (uploadRef.current) uploadRef.current.value = ''
  }

  async function storeImage(blob: Blob, name: string, sourceData?: { type: string; id: string; index: number }) {
    if (!currentProfile) return null
    const safeName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `obras/${obraId}/feed/${crypto.randomUUID()}-${safeName || 'foto.jpg'}`
    const uploaded = await supabase.storage.from('project-files').upload(path, blob, { cacheControl: '3600', upsert: false, contentType: blob.type || 'image/jpeg' })
    if (uploaded.error) { setError(uploaded.error.message); return null }
    const url = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
    const inserted = await supabase.from('obra_files').insert({
      obra_id: obraId, nome: name, tipo: blob.type || 'image/jpeg', tamanho: blob.size,
      categoria: 'imagem', url, uploaded_by: currentProfile.id, publicado_cliente: visibility !== 'internal',
      source_type: sourceData?.type || null, source_id: sourceData?.id || null, source_index: sourceData?.index ?? null,
    }).select('id,nome,url,tipo,source_type,source_id,source_index').single()
    if (inserted.error) { setError(inserted.error.message); return null }
    const created = inserted.data as FileOption
    setFiles(current => [created, ...current])
    return created
  }

  async function importRdoPhoto(photo: RdoPhoto) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(photo.url)
      if (!response.ok) throw new Error('Nao foi possivel abrir a foto do RDO.')
      const blob = await response.blob()
      const created = await storeImage(blob, `RDO-${photo.data}-${photo.index + 1}.jpg`, { type: 'rdo', id: photo.rdoId, index: photo.index })
      if (created) {
        setSelectedFiles(current => [...current, created.id])
        setRdoPhotos(current => current.filter(item => !(item.rdoId === photo.rdoId && item.index === photo.index)))
        setMessage('Foto do Diario adicionada ao acervo e selecionada.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao importar a foto do RDO.')
    } finally {
      setSaving(false)
    }
  }

  async function saveCrop(blob: Blob) {
    if (!editingFile?.url || !currentProfile) return
    setError('')
    const path = `obras/${obraId}/feed/edited/${crypto.randomUUID()}-${editingFile.id}.jpg`
    const uploaded = await supabase.storage.from('project-files').upload(path, blob, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' })
    if (uploaded.error) throw uploaded.error
    const url = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
    const result = await supabase.rpc('feed_admin_update_photo', { p_file_id: editingFile.id, p_profile_id: currentProfile.id, p_url: url, p_tamanho: blob.size })
    if (result.error) throw result.error
    setMessage('Foto atualizada em todas as publicacoes que a utilizam.')
    await load()
  }

  async function sendToBoard(file: FileOption) {
    if (!currentProfile) return
    setSaving(true)
    setError('')
    const result = await supabase.rpc('feed_admin_send_photo_to_board', { p_file_id: file.id, p_profile_id: currentProfile.id, p_orcamento_id: budgetId || null })
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setMessage('Foto enviada ao Board da obra.')
  }

  async function publish() {
    if (!currentProfile || !title.trim() || saving) return
    setSaving(true)
    setError('')
    const [sourceType, sourceId] = source === 'manual' ? ['manual', null] : source.split(':')
    const { error: publishError } = await supabase.rpc('feed_admin_publish', {
      p_obra_id: obraId, p_profile_id: currentProfile.id, p_orcamento_id: budgetId || null,
      p_titulo: title.trim(), p_conteudo: content.trim() || null, p_visibility: visibility,
      p_is_story: isStory, p_album_nome: album.trim() || null, p_file_ids: selectedFiles,
      p_source_type: sourceType, p_source_id: sourceId,
    })
    setSaving(false)
    if (publishError) { setError(publishError.message); return }
    setTitle(''); setContent(''); setSelectedFiles([]); setAlbum(''); setIsStory(false); setSource('manual'); setShowPhotoLibrary(false)
    setMessage('Publicacao criada.')
    await load()
  }

  async function archive(itemId: string, archived: boolean) {
    if (!currentProfile) return
    await supabase.rpc('feed_admin_archive', { p_item_id: itemId, p_profile_id: currentProfile.id, p_archived: archived })
    await load()
  }

  return <section className="space-y-4">
    <ObraPortalMessages obraId={obraId} />
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><Newspaper size={19} /></div>
        <div><h3 className="font-semibold">Publicar no Feed</h3><p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Revise, recorte e escolha o que o cliente vera. Nada e publicado automaticamente.</p></div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Field label="Origem"><select value={source} onChange={event => chooseSource(event.target.value)} className="input-base min-h-11 w-full"><option value="manual">Publicacao manual</option>{sources.map(item => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.label}</option>)}</select></Field>
        <Field label="Orcamento"><select value={budgetId} onChange={event => setBudgetId(event.target.value)} className="input-base min-h-11 w-full"><option value="">Geral da obra</option>{budgets.map(item => <option key={item.id} value={item.id}>{item.nome || `Orcamento v${item.versao}`}</option>)}</select></Field>
        <Field label="Titulo" wide><input value={title} onChange={event => setTitle(event.target.value)} className="input-base min-h-11 w-full" placeholder="Ex.: Concretagem da laje concluida" maxLength={140} /></Field>
        <Field label="Texto" wide><textarea value={content} onChange={event => setContent(event.target.value)} className="input-base min-h-28 w-full resize-y py-3" placeholder="Conte a atualizacao de forma clara para o cliente." maxLength={4000} /></Field>
        <Field label="Visibilidade"><select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)} className="input-base min-h-11 w-full"><option value="client">Cliente</option><option value="shared">Equipe e cliente</option><option value="internal">Somente equipe</option></select></Field>
        <Field label="Album (opcional)"><input value={album} onChange={event => setAlbum(event.target.value)} className="input-base min-h-11 w-full" placeholder="Ex.: Agosto 2026" /></Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => uploadRef.current?.click()} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium" style={{ border: '1px solid var(--border)' }}><ImagePlus size={17} /> Enviar novas fotos</button>
        <button type="button" onClick={() => setShowPhotoLibrary(value => !value)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium" style={{ border: '1px solid var(--border)' }}><ChevronDown size={17} className={showPhotoLibrary ? 'rotate-180' : ''} /> Escolher do acervo</button>
        <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void uploadImages(event.target.files)} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm" style={{ border: '1px solid var(--border)', background: isStory ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}><input type="checkbox" checked={isStory} onChange={event => setIsStory(event.target.checked)} /><Star size={16} style={{ color: isStory ? 'var(--accent)' : 'var(--text-secondary)' }} /> Destacar como Story</label>
      </div>

      {selectedFiles.length > 0 && <PhotoStrip title={`${selectedFiles.length} foto(s) nesta publicacao`} hint="Remova, recorte ou envie ao Board antes de publicar.">{files.filter(file => selectedFiles.includes(file.id)).map(file => <div key={file.id} className="w-24 shrink-0"><div className="relative size-24 overflow-hidden rounded-lg" style={{ border: '2px solid var(--accent)' }}>{file.url && <Image src={file.url} alt={file.nome} fill unoptimized sizes="96px" className="object-cover" />}<button type="button" onClick={() => setSelectedFiles(current => current.filter(id => id !== file.id))} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/75 text-white" title="Remover da publicacao"><X size={15} /></button></div><div className="mt-1 grid grid-cols-2 gap-1"><button type="button" onClick={() => setEditingFile(file)} className="grid min-h-9 place-items-center rounded-lg" style={{ border: '1px solid var(--border)' }} title="Recortar foto"><Crop size={15} /></button><button type="button" onClick={() => void sendToBoard(file)} className="grid min-h-9 place-items-center rounded-lg" style={{ border: '1px solid var(--border)' }} title="Enviar ao Board"><LayoutDashboard size={15} /></button></div></div>)}</PhotoStrip>}

      {showPhotoLibrary && rdoPhotos.length > 0 && <PhotoStrip title="Fotos recebidas no Diario" hint="Adicione ao acervo para recortar e publicar.">{rdoPhotos.map(photo => <button type="button" key={`${photo.rdoId}:${photo.index}`} onClick={() => void importRdoPhoto(photo)} className="group relative size-24 shrink-0 overflow-hidden rounded-lg" style={{ border: '1px solid var(--border)' }}><Image src={photo.url} alt={photo.titulo} fill unoptimized sizes="96px" className="object-cover" /><span className="absolute inset-x-1 bottom-1 rounded bg-black/75 px-1 py-1 text-[10px] text-white">Adicionar</span></button>)}</PhotoStrip>}

      {showPhotoLibrary && files.some(file => !selectedFiles.includes(file.id)) && <PhotoStrip title="Fotos da obra" hint="Toque para adicionar ao rascunho.">{files.filter(file => !selectedFiles.includes(file.id)).map(file => <button type="button" key={file.id} onClick={() => setSelectedFiles(current => [...current, file.id])} className="relative size-24 shrink-0 overflow-hidden rounded-lg" style={{ border: '1px solid var(--border)' }}>{file.url && <Image src={file.url} alt={file.nome} fill unoptimized sizes="96px" className="object-cover" />}<span className="absolute inset-x-1 bottom-1 rounded bg-black/75 px-1 py-1 text-[10px] text-white">Adicionar</span></button>)}</PhotoStrip>}

      {message && <p className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => void publish()} disabled={!title.trim() || saving} className="flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>{saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Publicar</button></div>
    </div>

    <div><h3 className="font-semibold">Publicacoes</h3><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{items.length} no historico</p></div>
    {loading ? <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin" /></div> : items.length === 0 ? <div className="card border-dashed p-10 text-center"><Megaphone className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhuma publicacao ainda</p></div> : <div className="grid gap-3 lg:grid-cols-2">{items.map(item => <article key={item.id} className="card overflow-hidden" style={{ opacity: item.archivedAt ? 0.55 : 1 }}>
      {item.files[0]?.url && <div className="relative aspect-[16/9]"><Image src={item.files[0].url} alt="" fill unoptimized sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" /><button type="button" onClick={() => setEditingFile(item.files[0] as FileOption)} className="absolute bottom-2 right-2 flex min-h-9 items-center gap-1.5 rounded-lg bg-black/70 px-2.5 text-xs text-white"><Crop size={14} /> Editar foto</button></div>}
      <div className="p-4"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>{item.sourceType === 'diario' ? <BookOpen size={17} /> : <Newspaper size={17} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{item.titulo}</h4>{item.isStory && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>STORY</span>}</div><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(item.publicadoEm).toLocaleString('pt-BR')} - {item.visibility}</p></div><button type="button" onClick={() => void archive(item.id, !item.archivedAt)} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs" style={{ border: '1px solid var(--border)', color: item.archivedAt ? 'var(--text-secondary)' : 'var(--danger)' }} title={item.archivedAt ? 'Restaurar' : 'Excluir do Feed'}>{item.archivedAt ? <Archive size={15} /> : <Trash2 size={15} />}{item.archivedAt ? 'Restaurar' : 'Excluir'}</button></div>{item.conteudo && <p className="mt-3 line-clamp-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.conteudo}</p>}<p className="mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{item.files.length} foto(s) - {item.likes} curtida(s) - {item.comments.length} comentario(s)</p></div>
    </article>)}</div>}

    {editingFile?.url && <PhotoCropEditor imageUrl={editingFile.url} imageName={editingFile.nome} onClose={() => setEditingFile(null)} onSave={saveCrop} />}
  </section>
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? 'md:col-span-2' : ''}><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>{children}</label>
}

function PhotoStrip({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <div className="mt-4"><div className="mb-2"><p className="text-xs font-medium">{title}</p><p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{hint}</p></div><div className="flex gap-2 overflow-x-auto pb-1">{children}</div></div>
}

function normalizePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && (item.startsWith('data:image/') || item.startsWith('http')))
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
}
