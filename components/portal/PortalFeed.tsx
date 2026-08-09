'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Archive, ChevronLeft, ChevronRight, Copy, Heart, ImageIcon, MessageCircle, X } from 'lucide-react'
import type { PortalFeedCommentDTO, PortalFeedItemDTO } from '@/lib/portal/types'

type Props = {
  token: string
  items: PortalFeedItemDTO[]
  obraNome: string
}

export function PortalFeed({ token, items: initialItems, obraNome }: Props) {
  const [items, setItems] = useState(initialItems)
  const [storyId, setStoryId] = useState<string | null>(null)
  const [showArchive, setShowArchive] = useState(false)
  const stories = useMemo(() => items.filter(item => item.isStory), [items])
  const highlighted = stories.filter(item => !item.storySeen)
  const archived = stories.filter(item => item.storySeen)
  const activeStories = showArchive ? archived : highlighted
  const activeStoryIndex = activeStories.findIndex(item => item.id === storyId)
  const activeStory = activeStoryIndex >= 0 ? activeStories[activeStoryIndex] : null

  useEffect(() => {
    const postId = new URLSearchParams(window.location.search).get('post')
    if (postId) document.getElementById(`feed-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  async function openStory(item: PortalFeedItemDTO) {
    setStoryId(item.id)
    if (!item.storySeen) {
      setItems(current => current.map(candidate => candidate.id === item.id ? { ...candidate, storySeen: true } : candidate))
      await fetch(`/api/portal/${token}/feed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'view_story', itemId: item.id }),
      })
    }
  }

  async function toggleLike(itemId: string) {
    setItems(current => current.map(item => item.id === itemId
      ? { ...item, likedByMe: !item.likedByMe, likes: Math.max(0, item.likes + (item.likedByMe ? -1 : 1)) }
      : item))
    const response = await fetch(`/api/portal/${token}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_like', itemId }),
    })
    if (!response.ok) setItems(initialItems)
  }

  async function addComment(itemId: string, texto: string) {
    const response = await fetch(`/api/portal/${token}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'comment', itemId, texto }),
    })
    if (!response.ok) throw new Error('Nao foi possivel comentar.')
    const payload = await response.json() as { comment: PortalFeedCommentDTO }
    setItems(current => current.map(item => item.id === itemId
      ? { ...item, comments: [...item.comments, payload.comment] }
      : item))
  }

  async function copyLink(itemId: string) {
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'feed')
    url.searchParams.set('post', itemId)
    await navigator.clipboard.writeText(url.toString())
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Atualizacoes da obra</p>
        <h1 className="mt-1 text-3xl font-semibold">Feed</h1>
      </div>

      {stories.length > 0 && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Destaques</p>
            {archived.length > 0 && <button type="button" onClick={() => setShowArchive(value => !value)} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Archive size={14} />{showArchive ? 'Novidades' : `Arquivo (${archived.length})`}</button>}
          </div>
          {activeStories.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {activeStories.map(item => <StoryButton key={item.id} item={item} onClick={() => openStory(item)} />)}
            </div>
          ) : <p className="py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{showArchive ? 'Nenhum destaque arquivado.' : 'Todas as novidades ja foram visualizadas. Consulte o arquivo quando quiser.'}</p>}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card border-dashed px-6 py-16 text-center">
          <ImageIcon className="mx-auto" style={{ color: 'var(--text-secondary)' }} />
          <p className="mt-3 font-semibold">O Feed de {obraNome} esta pronto</p>
          <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--text-secondary)' }}>As atualizacoes publicadas pela equipe aparecerao aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">{items.map(item => <FeedCard key={item.id} item={item} onLike={() => toggleLike(item.id)} onComment={texto => addComment(item.id, texto)} onCopy={() => copyLink(item.id)} />)}</div>
      )}

      {activeStory && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label={activeStory.titulo}>
          <article className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-[#101318] text-white shadow-2xl">
            <button type="button" onClick={() => setStoryId(null)} className="absolute right-3 top-3 z-20 grid size-10 place-items-center rounded-full bg-black/50" title="Fechar"><X size={20} /></button>
            <StoryMedia item={activeStory} />
            <div className="p-5"><p className="text-xs text-white/60">{formatDate(activeStory.publicadoEm)}</p><h2 className="mt-1 text-xl font-semibold">{activeStory.titulo}</h2>{activeStory.conteudo && <p className="mt-2 text-sm leading-6 text-white/75">{activeStory.conteudo}</p>}</div>
            {activeStories.length > 1 && <><button type="button" onClick={() => setStoryId(activeStories[(activeStoryIndex - 1 + activeStories.length) % activeStories.length].id)} className="absolute left-2 top-1/2 grid size-10 place-items-center rounded-full bg-black/45" title="Anterior"><ChevronLeft /></button><button type="button" onClick={() => setStoryId(activeStories[(activeStoryIndex + 1) % activeStories.length].id)} className="absolute right-2 top-1/2 grid size-10 place-items-center rounded-full bg-black/45" title="Proximo"><ChevronRight /></button></>}
          </article>
        </div>
      )}
    </section>
  )
}

function StoryButton({ item, onClick }: { item: PortalFeedItemDTO; onClick: () => void }) {
  const image = item.files.find(file => file.url)?.url
  return <button type="button" onClick={onClick} className="w-[76px] shrink-0 text-center"><span className="mx-auto grid size-16 place-items-center overflow-hidden rounded-full p-[3px]" style={{ background: item.storySeen ? 'var(--border)' : 'var(--accent)' }}><span className="relative block size-full overflow-hidden rounded-full border-2" style={{ borderColor: 'var(--bg-card)', background: 'var(--bg-secondary)' }}>{image ? <Image src={image} alt="" fill unoptimized sizes="64px" className="object-cover" /> : <ImageIcon className="absolute inset-0 m-auto" size={22} />}</span></span><span className="mt-1 block truncate text-[11px] font-medium">{item.titulo}</span></button>
}

function StoryMedia({ item }: { item: PortalFeedItemDTO }) {
  const image = item.files.find(file => file.url)?.url
  return <div className="relative aspect-[4/5] max-h-[62vh] bg-black">{image ? <Image src={image} alt={item.titulo} fill unoptimized sizes="430px" className="object-contain" /> : <div className="grid h-full place-items-center"><ImageIcon size={38} className="text-white/40" /></div>}</div>
}

function FeedCard({ item, onLike, onComment, onCopy }: { item: PortalFeedItemDTO; onLike: () => void; onComment: (texto: string) => Promise<void>; onCopy: () => void }) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  async function submit() {
    if (!draft.trim() || sending) return
    setSending(true)
    try { await onComment(draft.trim()); setDraft('') } finally { setSending(false) }
  }
  return <article id={`feed-${item.id}`} className="card scroll-mt-36 overflow-hidden">
    <header className="flex items-start gap-3 p-4 sm:p-5"><div className="grid size-10 shrink-0 place-items-center rounded-lg font-bold text-white" style={{ background: 'var(--accent)' }}>B</div><div className="min-w-0 flex-1"><p className="font-semibold">{item.autor}</p><p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(item.publicadoEm)}{item.albumNome ? ` · ${item.albumNome}` : ''}</p></div>{item.isStory && <span className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>Destaque</span>}</header>
    <div className="px-4 pb-4 sm:px-5"><h2 className="text-lg font-semibold">{item.titulo}</h2>{item.conteudo && <p className="mt-2 whitespace-pre-line text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.conteudo}</p>}</div>
    <FeedMedia item={item} />
    <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}><div className="flex items-center gap-1"><ActionButton active={item.likedByMe} label={`${item.likes || ''}`} title="Curtir" onClick={onLike} icon={<Heart size={19} fill={item.likedByMe ? 'currentColor' : 'none'} />} /><ActionButton label={`${item.comments.length || ''}`} title="Comentar" onClick={() => document.getElementById(`comment-${item.id}`)?.focus()} icon={<MessageCircle size={19} />} /><ActionButton label="" title="Copiar link" onClick={onCopy} icon={<Copy size={18} />} /></div></div>
    {item.comments.length > 0 && <div className="space-y-2 border-t px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>{item.comments.map(comment => <p key={comment.id} className="text-sm"><strong>{comment.autor}</strong> <span style={{ color: 'var(--text-secondary)' }}>{comment.texto}</span></p>)}</div>}
    <div className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--border)' }}><input id={`comment-${item.id}`} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit() }} className="input-base min-h-10 min-w-0 flex-1 text-sm" placeholder="Escreva um comentario..." maxLength={2000} /><button type="button" onClick={() => void submit()} disabled={!draft.trim() || sending} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Enviar</button></div>
  </article>
}

function FeedMedia({ item }: { item: PortalFeedItemDTO }) {
  const files = item.files.filter(file => file.url).slice(0, 4)
  if (!files.length) return null
  return <div className={`grid gap-0.5 ${files.length > 1 ? 'grid-cols-2' : ''}`}>{files.map((file, index) => <a key={file.id} href={file.url || undefined} target="_blank" rel="noreferrer" className={`relative block overflow-hidden bg-[var(--bg-secondary)] ${files.length === 1 ? 'aspect-[4/3]' : 'aspect-square'} ${files.length === 3 && index === 0 ? 'row-span-2 h-full' : ''}`}><Image src={file.url!} alt={file.nome} fill unoptimized sizes="(min-width: 768px) 650px, 100vw" className="object-cover" /></a>)}</div>
}

function ActionButton({ active, label, title, onClick, icon }: { active?: boolean; label: string; title: string; onClick: () => void; icon: React.ReactNode }) {
  return <button type="button" onClick={onClick} title={title} className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-[var(--bg-secondary)]" style={{ color: active ? 'var(--danger)' : 'var(--text-secondary)' }}>{icon}{label}</button>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
