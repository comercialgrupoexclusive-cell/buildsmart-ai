'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, BookOpen, ImagePlus, Loader2, Megaphone, Newspaper, Send, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import type { PortalFeedItemDTO } from '@/lib/portal/types'

type FileOption = { id: string; nome: string; url: string | null; tipo: string }
type BudgetOption = { id: string; nome: string | null; versao: number }
type SourceOption = { id: string; type: 'diario' | 'comunicado'; label: string; titulo: string; conteudo: string }
type DiarioRow = { id: string; data: string; atividades: string | null; observacoes: string | null }
type ComunicadoRow = { id: string; titulo: string; conteudo: string }

export function ObraFeedManager({ obraId }: { obraId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const uploadRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<PortalFeedItemDTO[]>([])
  const [files, setFiles] = useState<FileOption[]>([])
  const [budgets, setBudgets] = useState<BudgetOption[]>([])
  const [sources, setSources] = useState<SourceOption[]>([])
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'internal' | 'client' | 'shared'>('client')
  const [budgetId, setBudgetId] = useState('')
  const [album, setAlbum] = useState('')
  const [isStory, setIsStory] = useState(false)
  const [source, setSource] = useState('manual')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!currentProfile) return
    setLoading(true)
    const [feedResult, fileResult, budgetResult, diarioResult, comunicadoResult] = await Promise.all([
      supabase.rpc('feed_admin_list', { p_obra_id: obraId, p_profile_id: currentProfile.id }),
      supabase.from('obra_files').select('id,nome,url,tipo').eq('obra_id', obraId).not('url', 'is', null).order('criado_em', { ascending: false }),
      supabase.from('orcamentos').select('id,nome,versao').eq('obra_id', obraId).neq('status', 'arquivado').order('versao', { ascending: false }),
      supabase.from('diario_obra').select('id,data,atividades,observacoes').eq('obra_id', obraId).order('data', { ascending: false }).limit(30),
      supabase.from('comunicados_obra').select('id,titulo,conteudo,created_at').eq('obra_id', obraId).order('created_at', { ascending: false }).limit(30),
    ])
    setItems((feedResult.data || []) as PortalFeedItemDTO[])
    setFiles((fileResult.data || []) as FileOption[])
    setBudgets((budgetResult.data || []) as BudgetOption[])
    setSources([
      ...((diarioResult.data || []) as DiarioRow[]).map(row => ({ id: row.id, type: 'diario' as const, label: `Diario · ${new Date(`${row.data}T12:00:00`).toLocaleDateString('pt-BR')}`, titulo: row.atividades || 'Atualizacao da obra', conteudo: row.observacoes || row.atividades || '' })),
      ...((comunicadoResult.data || []) as ComunicadoRow[]).map(row => ({ id: row.id, type: 'comunicado' as const, label: `Comunicado · ${row.titulo}`, titulo: row.titulo, conteudo: row.conteudo })),
    ])
    setError(feedResult.error?.message || fileResult.error?.message || '')
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
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `obras/${obraId}/feed/${crypto.randomUUID()}-${safeName}`
      const uploaded = await supabase.storage.from('project-files').upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploaded.error) { setError(uploaded.error.message); continue }
      const url = supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl
      const inserted = await supabase.from('obra_files').insert({
        obra_id: obraId, nome: file.name, tipo: file.type, tamanho: file.size,
        categoria: 'imagem', url, uploaded_by: currentProfile.id, publicado_cliente: visibility !== 'internal',
      }).select('id,nome,url,tipo').single()
      if (inserted.data) { uploadedIds.push(inserted.data.id); setFiles(current => [inserted.data as FileOption, ...current]) }
    }
    setSelectedFiles(current => [...current, ...uploadedIds])
    setSaving(false)
    if (uploadRef.current) uploadRef.current.value = ''
  }

  async function publish() {
    if (!currentProfile || !title.trim() || saving) return
    setSaving(true)
    setError('')
    const [sourceType, sourceId] = source === 'manual' ? ['manual', null] : source.split(':')
    const { error: publishError } = await supabase.rpc('feed_admin_publish', {
      p_obra_id: obraId,
      p_profile_id: currentProfile.id,
      p_orcamento_id: budgetId || null,
      p_titulo: title.trim(),
      p_conteudo: content.trim() || null,
      p_visibility: visibility,
      p_is_story: isStory,
      p_album_nome: album.trim() || null,
      p_file_ids: selectedFiles,
      p_source_type: sourceType,
      p_source_id: sourceId,
    })
    setSaving(false)
    if (publishError) { setError(publishError.message); return }
    setTitle(''); setContent(''); setSelectedFiles([]); setAlbum(''); setIsStory(false); setSource('manual')
    await load()
  }

  async function archive(itemId: string, archived: boolean) {
    if (!currentProfile) return
    await supabase.rpc('feed_admin_archive', { p_item_id: itemId, p_profile_id: currentProfile.id, p_archived: archived })
    await load()
  }

  return <section className="space-y-4">
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><Newspaper size={19} /></div><div><h3 className="font-semibold">Publicar no Feed</h3><p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>Escolha o que o cliente vera. Nada do Diario vira publicacao ou Story automaticamente.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Origem</span><select value={source} onChange={event => chooseSource(event.target.value)} className="input-base min-h-11 w-full"><option value="manual">Publicacao manual</option>{sources.map(item => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.label}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Orcamento</span><select value={budgetId} onChange={event => setBudgetId(event.target.value)} className="input-base min-h-11 w-full"><option value="">Geral da obra</option>{budgets.map(item => <option key={item.id} value={item.id}>{item.nome || `Orcamento v${item.versao}`}</option>)}</select></label>
        <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Titulo</span><input value={title} onChange={event => setTitle(event.target.value)} className="input-base min-h-11 w-full" placeholder="Ex.: Concretagem da laje concluida" maxLength={140} /></label>
        <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Texto</span><textarea value={content} onChange={event => setContent(event.target.value)} className="input-base min-h-28 w-full resize-y py-3" placeholder="Conte a atualizacao de forma clara para o cliente." maxLength={4000} /></label>
        <label><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Visibilidade</span><select value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)} className="input-base min-h-11 w-full"><option value="client">Cliente</option><option value="shared">Equipe e cliente</option><option value="internal">Somente equipe</option></select></label>
        <label><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Album (opcional)</span><input value={album} onChange={event => setAlbum(event.target.value)} className="input-base min-h-11 w-full" placeholder="Ex.: Agosto 2026" /></label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => uploadRef.current?.click()} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium" style={{ border: '1px solid var(--border)' }}><ImagePlus size={17} /> Anexar fotos</button>
        <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void uploadImages(event.target.files)} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm" style={{ border: '1px solid var(--border)', background: isStory ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}><input type="checkbox" checked={isStory} onChange={event => setIsStory(event.target.checked)} /><Star size={16} style={{ color: isStory ? 'var(--accent)' : 'var(--text-secondary)' }} /> Destacar como Story</label>
      </div>
      {files.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Fotos da obra</p><div className="flex gap-2 overflow-x-auto pb-1">{files.map(file => <button type="button" key={file.id} onClick={() => setSelectedFiles(current => current.includes(file.id) ? current.filter(id => id !== file.id) : [...current, file.id])} className="relative size-20 shrink-0 overflow-hidden rounded-lg" style={{ border: `2px solid ${selectedFiles.includes(file.id) ? 'var(--accent)' : 'var(--border)'}` }}>{file.url && <Image src={file.url} alt={file.nome} fill unoptimized sizes="80px" className="object-cover" />}</button>)}</div></div>}
      {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => void publish()} disabled={!title.trim() || saving} className="flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>{saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} Publicar</button></div>
    </div>

    <div className="flex items-center justify-between"><div><h3 className="font-semibold">Publicacoes</h3><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{items.length} no historico</p></div></div>
    {loading ? <div className="grid min-h-32 place-items-center"><Loader2 className="animate-spin" /></div> : items.length === 0 ? <div className="card border-dashed p-10 text-center"><Megaphone className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhuma publicacao ainda</p></div> : <div className="grid gap-3 lg:grid-cols-2">{items.map(item => <article key={item.id} className="card p-4 opacity-100" style={{ opacity: item.archivedAt ? 0.55 : 1 }}><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>{item.sourceType === 'diario' ? <BookOpen size={17} /> : <Newspaper size={17} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{item.titulo}</h4>{item.isStory && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>STORY</span>}</div><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(item.publicadoEm).toLocaleString('pt-BR')} · {item.visibility}</p></div><button type="button" onClick={() => void archive(item.id, !item.archivedAt)} className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }} title={item.archivedAt ? 'Restaurar' : 'Arquivar'}><Archive size={16} /></button></div>{item.conteudo && <p className="mt-3 line-clamp-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.conteudo}</p>}<p className="mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{item.files.length} foto(s) · {item.likes} curtida(s) · {item.comments.length} comentario(s)</p></article>)}</div>}
  </section>
}
