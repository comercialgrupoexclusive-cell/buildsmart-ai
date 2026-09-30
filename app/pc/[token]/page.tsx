'use client'

// Página pública do cliente (link "Compartilhar com o cliente"). Sem login,
// só leitura: mostra o Feed do Processo marcado como visível ao cliente,
// via RPC processo_portal_publico (SECURITY DEFINER, anon).

import { use, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Newspaper, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Comentario = { texto: string; autor: string; criadoEm: string }
type Post = {
  id: string; titulo: string | null; conteudo: string | null; fotoUrls: string[]
  isStory: boolean; criadoEm: string; autor: string; curtidas: number; comentarios: Comentario[]
}
type Dados = {
  processo: { nome: string; endereco: string | null; cidade: string | null; uf: string | null; capaUrl: string | null }
  posts: Post[]
}

export default function PortalClientePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase = useMemo(() => createClient(), [])
  const [dados, setDados] = useState<Dados | null | undefined>(undefined)
  const [slide, setSlide] = useState<number | null>(null)

  useEffect(() => {
    void supabase.rpc('processo_portal_publico', { p_token: token }).then((res: { data: unknown; error: unknown }) => {
      setDados(res.error ? null : (res.data as Dados))
    })
  }, [supabase, token])

  if (dados === undefined) {
    return <main className="grid min-h-dvh place-items-center bg-[#080e1b]"><div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#334', borderTopColor: '#67e8f9' }} /></main>
  }
  if (!dados) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#080e1b] p-6 text-center text-slate-200">
        <div>
          <Newspaper className="mx-auto mb-3 opacity-60" />
          <p className="font-medium">Link indisponível</p>
          <p className="mt-1 text-sm text-slate-400">Este link de acompanhamento não está mais ativo.</p>
        </div>
      </main>
    )
  }

  const { processo, posts } = dados
  const storyPosts = posts.filter(p => p.isStory && p.fotoUrls.length > 0)
  const storySlides = storyPosts.flatMap(p => p.fotoUrls.map(url => ({ url, titulo: processo.nome })))

  return (
    <main className="min-h-dvh bg-[#080e1b] text-slate-100">
      <div className="mx-auto max-w-2xl p-4 pb-16">
        <header className="mb-5">
          {processo.capaUrl && (
            <div className="relative mb-3 h-40 w-full overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={processo.capaUrl} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <h1 className="text-2xl font-semibold">{processo.nome}</h1>
          {(processo.endereco || processo.cidade) && (
            <p className="mt-0.5 text-sm text-slate-400">{[processo.endereco, processo.cidade, processo.uf].filter(Boolean).join(', ')}</p>
          )}
        </header>

        {storyPosts.length > 0 && (
          <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
            {storyPosts.map(p => {
              const start = storySlides.findIndex(s => s.url === p.fotoUrls[0])
              return (
                <button key={p.id} type="button" onClick={() => setSlide(start)} className="flex w-[72px] shrink-0 flex-col items-center gap-1">
                  <span className="grid size-16 place-items-center rounded-full p-[3px]" style={{ background: 'conic-gradient(from 0deg, #67e8f9, #22c55e, #67e8f9)' }}>
                    <span className="relative block size-full overflow-hidden rounded-full border-2 border-[#080e1b]">
                      <Image src={p.fotoUrls[0]} alt="" fill unoptimized sizes="60px" className="object-cover" />
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-[11px] text-slate-400">{p.titulo || 'Story'}</span>
                </button>
              )
            })}
          </div>
        )}

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 px-6 py-16 text-center">
            <Newspaper className="mx-auto text-slate-500" />
            <p className="mt-3 font-medium">Ainda não há novidades</p>
            <p className="mt-1 text-sm text-slate-400">As atualizações da equipe aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <article key={post.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                <div className="p-4 pb-2">
                  <p className="text-xs text-slate-400">{post.autor} · {new Date(post.criadoEm).toLocaleString('pt-BR')}</p>
                  {post.titulo && <h3 className="mt-1 font-semibold">{post.titulo}</h3>}
                </div>
                {post.conteudo && <p className="px-4 text-sm leading-6 text-slate-200">{post.conteudo}</p>}
                {post.fotoUrls.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-1 px-4">
                    {post.fotoUrls.map(u => (
                      <div key={u} className="relative aspect-square overflow-hidden rounded-lg">
                        <Image src={u} alt="" fill unoptimized sizes="(max-width:640px) 50vw, 300px" className="object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-4 border-t border-white/10 px-4 py-2 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5"><Heart size={16} /> {post.curtidas || ''}</span>
                  <span className="flex items-center gap-1.5"><MessageCircle size={16} /> {post.comentarios.length || ''}</span>
                </div>
                {post.comentarios.length > 0 && (
                  <div className="space-y-1.5 px-4 pb-3">
                    {post.comentarios.map((c, i) => (
                      <p key={i} className="text-sm text-slate-300"><span className="font-medium text-slate-100">{c.autor}:</span> {c.texto}</p>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {slide !== null && storySlides[slide] && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-0 sm:p-4">
          <button type="button" onClick={() => setSlide(null)} className="absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full bg-black/60 text-white"><X size={18} /></button>
          {slide > 0 && <button type="button" onClick={() => setSlide(s => (s ?? 0) - 1)} className="absolute left-2 z-10 grid size-9 place-items-center rounded-full bg-black/50 text-white"><ChevronLeft size={20} /></button>}
          <div className="relative h-full w-full sm:h-[85vh] sm:w-auto sm:aspect-[9/16]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={storySlides[slide].url} alt="" className="h-full w-full object-contain" />
          </div>
          {slide < storySlides.length - 1 && <button type="button" onClick={() => setSlide(s => (s ?? 0) + 1)} className="absolute right-2 z-10 grid size-9 place-items-center rounded-full bg-black/50 text-white"><ChevronRight size={20} /></button>}
        </div>
      )}
    </main>
  )
}
