'use client'

// Feed do Processo / da Organização (seção 12). Acesso direto via RLS
// (processo_feed + processo_is_accessible) — NÃO usa o proxy /api/portal-admin,
// que está desligado. Sem processoId => feed da organização (todos os processos
// acessíveis + posts gerais da org). Com processoId => feed daquele processo.
//
// A publicação não fica mais numa barra fixa: há um botão "Novo post" que abre
// o compositor em modal, onde se escolhe POST geral (organização) OU um processo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Heart, ImagePlus, Loader2, MessageCircle, Newspaper, Plus, Send, Star, Trash2, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Input'

const ALVO_GERAL = '__geral__'

type ProcessoOpcao = { id: string; nome: string }
type Comentario = { id: string; feed_id: string; texto: string; autor_profile_id: string | null; created_at: string }
type Post = {
  id: string
  processo_id: string | null
  autor_profile_id: string | null
  titulo: string | null
  conteudo: string | null
  foto_urls: string[]
  is_story: boolean
  created_at: string
  processo?: { nome: string } | null
}

export function ProcessoFeed({ processoId }: { processoId?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const { currentProfile } = useProfile()
  const meuId = currentProfile?.id ?? ''
  const uploadRef = useRef<HTMLInputElement>(null)

  const [processos, setProcessos] = useState<ProcessoOpcao[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [reacoes, setReacoes] = useState<Record<string, string[]>>({}) // feed_id -> profile_ids
  const [comentarios, setComentarios] = useState<Record<string, Comentario[]>>({})
  const [loading, setLoading] = useState(true)

  // Compositor (modal)
  const [compositorAberto, setCompositorAberto] = useState(false)
  const [alvoProcesso, setAlvoProcesso] = useState('')
  const [texto, setTexto] = useState('')
  const [isStory, setIsStory] = useState(false)
  const [fotos, setFotos] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [comentando, setComentando] = useState<Record<string, string>>({})
  const [slide, setSlide] = useState<number | null>(null) // índice no storySlides (visualizador)
  const [visivelCliente, setVisivelCliente] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('processo_feed')
      .select('id,processo_id,autor_profile_id,titulo,conteudo,foto_urls,is_story,created_at,processo:processos(nome)')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
    if (processoId) q = q.eq('processo_id', processoId)
    const { data } = await q
    const lista = (data ?? []) as unknown as Post[]
    setPosts(lista)

    const ids = lista.map(p => p.id)
    if (ids.length) {
      const [r, c] = await Promise.all([
        supabase.from('processo_feed_reacao').select('feed_id,profile_id').in('feed_id', ids),
        supabase.from('processo_feed_comentario').select('id,feed_id,texto,autor_profile_id,created_at').in('feed_id', ids).order('created_at'),
      ])
      const mapaR: Record<string, string[]> = {}
      for (const row of (r.data ?? []) as { feed_id: string; profile_id: string }[]) {
        ;(mapaR[row.feed_id] ??= []).push(row.profile_id)
      }
      setReacoes(mapaR)
      const mapaC: Record<string, Comentario[]> = {}
      for (const row of (c.data ?? []) as Comentario[]) {
        ;(mapaC[row.feed_id] ??= []).push(row)
      }
      setComentarios(mapaC)

      const perfilIds = Array.from(new Set([
        ...lista.map(p => p.autor_profile_id).filter(Boolean),
        ...Object.values(mapaC).flat().map(c => c.autor_profile_id).filter(Boolean),
      ])) as string[]
      if (perfilIds.length) {
        const { data: perfis } = await supabase.from('profiles').select('id,name').in('id', perfilIds)
        setNomes(Object.fromEntries(((perfis ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name])))
      }
    } else {
      setReacoes({}); setComentarios({}); setNomes({})
    }
    setLoading(false)
  }, [supabase, processoId])

  useEffect(() => { void carregar() }, [carregar])

  useEffect(() => {
    if (processoId) return
    void supabase.from('processos').select('id,nome').eq('status', 'ACTIVE').order('nome')
      .then(({ data }: { data: ProcessoOpcao[] | null }) => setProcessos(data ?? []))
  }, [supabase, processoId])

  function abrirCompositor() {
    setAlvoProcesso(processoId ?? '')
    setTexto(''); setFotos([]); setIsStory(false); setVisivelCliente(false)
    setCompositorAberto(true)
  }

  function fecharCompositor() {
    if (enviando) return
    setCompositorAberto(false)
  }

  // Alvo selecionado no modal (só quando não há processoId fixo):
  // '' = nada, ALVO_GERAL = post geral da organização, ou um id de processo.
  const geral = !processoId && alvoProcesso === ALVO_GERAL
  const podePublicar = !enviando
    && (processoId || alvoProcesso)
    && (texto.trim() || fotos.length > 0)

  async function subirFotos(files: FileList | null) {
    if (!files?.length) return
    setEnviando(true)
    const urls: string[] = []
    const proc = processoId || (geral ? 'org' : alvoProcesso) || 'org'
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `processos/${proc}/feed/${crypto.randomUUID()}-${safe}`
      const up = await supabase.storage.from('project-files').upload(path, file, { contentType: file.type })
      if (!up.error) urls.push(supabase.storage.from('project-files').getPublicUrl(path).data.publicUrl)
    }
    setFotos(prev => [...prev, ...urls])
    setEnviando(false)
    if (uploadRef.current) uploadRef.current.value = ''
  }

  async function publicar() {
    if (!podePublicar) return
    // processo_id: fixo pelo contexto, null para post geral, ou o processo escolhido.
    const processoAlvo = processoId ?? (geral ? null : alvoProcesso)
    setEnviando(true)
    const { error } = await supabase.from('processo_feed').insert({
      processo_id: processoAlvo,
      conteudo: texto.trim() || null,
      foto_urls: fotos,
      is_story: isStory,
      // Post geral da organização não tem cliente: sempre equipe.
      visibility: !geral && visivelCliente ? 'cliente' : 'equipe',
    })
    setEnviando(false)
    if (!error) {
      setCompositorAberto(false)
      setTexto(''); setFotos([]); setIsStory(false); setVisivelCliente(false)
      if (!processoId) setAlvoProcesso('')
      void carregar()
    }
  }

  async function alternarCurtida(post: Post) {
    const jaCurti = (reacoes[post.id] ?? []).includes(meuId)
    setReacoes(prev => ({
      ...prev,
      [post.id]: jaCurti ? (prev[post.id] ?? []).filter(id => id !== meuId) : [...(prev[post.id] ?? []), meuId],
    }))
    if (jaCurti) await supabase.from('processo_feed_reacao').delete().eq('feed_id', post.id).eq('profile_id', meuId)
    else await supabase.from('processo_feed_reacao').insert({ feed_id: post.id })
  }

  async function comentar(post: Post) {
    const t = (comentando[post.id] ?? '').trim()
    if (!t) return
    const { data } = await supabase.from('processo_feed_comentario').insert({ feed_id: post.id, texto: t })
      .select('id,feed_id,texto,autor_profile_id,created_at').single()
    if (data) {
      setComentarios(prev => ({ ...prev, [post.id]: [...(prev[post.id] ?? []), data as Comentario] }))
      setComentando(prev => ({ ...prev, [post.id]: '' }))
    }
  }

  async function arquivar(post: Post) {
    await supabase.from('processo_feed').update({ archived_at: new Date().toISOString() }).eq('id', post.id)
    setPosts(prev => prev.filter(p => p.id !== post.id))
  }

  // Posts gerais (sem processo) aparecem como "Organização".
  const nomePost = (p: { processo?: { nome: string } | null; processo_id: string | null }) =>
    p.processo?.nome ?? (p.processo_id ? 'Processo' : 'Organização')

  // Stories = publicações marcadas como Story que têm foto. Viram bolinhas no
  // topo; cada foto é um slide no visualizador em tela cheia.
  const storyPosts = posts.filter(p => p.is_story && p.foto_urls.length > 0)
  const storySlides = storyPosts.flatMap(p => p.foto_urls.map(url => ({ postId: p.id, url, titulo: nomePost(p) })))
  function abrirStory(postId: string) {
    const idx = storySlides.findIndex(s => s.postId === postId)
    if (idx >= 0) setSlide(idx)
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho: Novo post */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          <Newspaper size={16} style={{ color: 'var(--accent)' }} /> Feed
        </h2>
        <button
          type="button"
          onClick={abrirCompositor}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={15} /> Novo post
        </button>
      </div>

      {/* Compositor (modal) */}
      <Modal open={compositorAberto} onClose={fecharCompositor} title="Novo post" size="md">
        <div className="space-y-3">
          {!processoId && (
            <Select value={alvoProcesso} onChange={e => setAlvoProcesso(e.target.value)} aria-label="Onde publicar">
              <option value="">Onde publicar?</option>
              <option value={ALVO_GERAL}>📣 Geral (organização)</option>
              {processos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
          )}
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder={geral ? 'Compartilhe uma atualização com toda a organização…' : 'Compartilhe uma atualização…'}
            rows={4}
            autoFocus
            className="w-full resize-none rounded-lg p-3 text-sm outline-none placeholder:text-[var(--text-secondary)]"
            style={{ color: 'var(--text-primary)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          />
          {fotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {fotos.map(u => (
                <div key={u} className="relative size-16 flex-shrink-0 overflow-hidden rounded-lg">
                  <Image src={u} alt="" fill unoptimized sizes="64px" className="object-cover" />
                  <button type="button" onClick={() => setFotos(f => f.filter(x => x !== u))} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => uploadRef.current?.click()} disabled={enviando} title="Fotos" className="grid size-8 place-items-center rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><ImagePlus size={15} /></button>
              <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={e => void subirFotos(e.target.files)} />
              <button type="button" onClick={() => setIsStory(v => !v)} title="Story" className="grid size-8 place-items-center rounded-lg" style={{ border: '1px solid var(--border)', color: isStory ? 'var(--accent)' : 'var(--text-secondary)', background: isStory ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}><Star size={15} /></button>
              {!geral && (
                <button type="button" onClick={() => setVisivelCliente(v => !v)} className="flex items-center gap-1 rounded-lg px-2 h-8 text-xs" style={{ border: '1px solid var(--border)', color: visivelCliente ? 'var(--accent)' : 'var(--text-secondary)', background: visivelCliente ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }} title="Mostrar no link do cliente"><Users size={14} /> Cliente</button>
              )}
            </div>
            <button
              type="button"
              onClick={() => void publicar()}
              disabled={!podePublicar}
              className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publicar
            </button>
          </div>
        </div>
      </Modal>

      {/* Stories (bolinhas) */}
      {storyPosts.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {storyPosts.map(p => (
            <button key={p.id} type="button" onClick={() => abrirStory(p.id)} className="flex w-[72px] shrink-0 flex-col items-center gap-1">
              <span className="grid size-16 place-items-center rounded-full p-[3px]" style={{ background: 'conic-gradient(from 0deg, var(--accent), #22c55e, var(--accent))' }}>
                <span className="relative block size-full overflow-hidden rounded-full border-2" style={{ borderColor: 'var(--bg-card)' }}>
                  <Image src={p.foto_urls[0]} alt="" fill unoptimized sizes="60px" className="object-cover" />
                </span>
              </span>
              <span className="w-full truncate text-center text-[11px]" style={{ color: 'var(--text-secondary)' }}>{nomePost(p)}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: 'var(--text-secondary)' }} /></div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Newspaper} title="Nada no feed ainda" description="Toque em “Novo post” para compartilhar a primeira atualização." />
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const curtidas = reacoes[post.id] ?? []
            const curti = curtidas.includes(meuId)
            const coms = comentarios[post.id] ?? []
            return (
              <article key={post.id} className="card overflow-hidden">
                <div className="flex items-start justify-between gap-2 p-4 pb-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{nomePost(post)}</span>
                      {post.is_story && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>STORY</span>}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {(post.autor_profile_id && nomes[post.autor_profile_id]) || 'Equipe'} · {new Date(post.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {post.autor_profile_id === meuId && (
                    <button type="button" onClick={() => void arquivar(post)} title="Excluir" style={{ color: 'var(--text-secondary)' }}><Trash2 size={15} /></button>
                  )}
                </div>

                {post.conteudo && <p className="px-4 text-sm leading-6" style={{ color: 'var(--text-primary)' }}>{post.conteudo}</p>}

                {post.foto_urls.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-1 px-4">
                    {post.foto_urls.map(u => (
                      <div key={u} className="relative aspect-square overflow-hidden rounded-lg">
                        <Image src={u} alt="" fill unoptimized sizes="(max-width:640px) 50vw, 300px" className="object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 px-4 pb-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => void alternarCurtida(post)} className="flex items-center gap-1.5 text-sm" style={{ color: curti ? 'var(--danger)' : 'var(--text-secondary)' }}>
                    <Heart size={16} fill={curti ? 'currentColor' : 'none'} /> {curtidas.length || ''}
                  </button>
                  <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <MessageCircle size={16} /> {coms.length || ''}
                  </span>
                </div>

                {coms.length > 0 && (
                  <div className="space-y-1.5 px-4 pb-2">
                    {coms.map(c => (
                      <p key={c.id} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(c.autor_profile_id && nomes[c.autor_profile_id]) || 'Equipe'}:</span> {c.texto}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 px-4 pb-3">
                  <input
                    value={comentando[post.id] ?? ''}
                    onChange={e => setComentando(prev => ({ ...prev, [post.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') void comentar(post) }}
                    placeholder="Comentar…"
                    className="input-base flex-1 py-1.5 text-sm"
                  />
                  <button type="button" onClick={() => void comentar(post)} className="grid size-8 place-items-center rounded-lg" style={{ background: 'var(--accent)', color: 'white' }}><Send size={14} /></button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Visualizador de Stories em tela cheia */}
      {slide !== null && storySlides[slide] && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-0 sm:p-4" role="dialog" aria-modal="true">
          <button type="button" onClick={() => setSlide(null)} className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-black/60 text-white"><X size={18} /></button>
          {slide > 0 && (
            <button type="button" onClick={() => setSlide(s => (s ?? 0) - 1)} className="absolute left-2 z-10 grid size-9 place-items-center rounded-full bg-black/50 text-white"><ChevronLeft size={20} /></button>
          )}
          <div className="relative h-full w-full sm:h-[85vh] sm:w-auto sm:aspect-[9/16]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={storySlides[slide].url} alt="" className="h-full w-full object-contain" />
            <p className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white">{storySlides[slide].titulo}</p>
          </div>
          {slide < storySlides.length - 1 && (
            <button type="button" onClick={() => setSlide(s => (s ?? 0) + 1)} className="absolute right-2 z-10 grid size-9 place-items-center rounded-full bg-black/50 text-white"><ChevronRight size={20} /></button>
          )}
        </div>
      )}
    </div>
  )
}
