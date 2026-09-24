'use client'

// Seção 12 canônica: FEED DA ORGANIZAÇÃO — linha do tempo unificada de todas
// as obras e processos da org. Agrega feed_items (linked to obra_id) em ordem
// cronológica reversa.

import { useCallback, useEffect, useState } from 'react'
import { Newspaper, ImageIcon, MessageCircle, Megaphone, FileBarChart, LayoutGrid, Album } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

type FeedItem = {
  id: string
  obra_id: string
  obra_nome: string
  source_type: string
  titulo: string
  conteudo: string | null
  visibility: string
  is_story: boolean
  publicado_em: string
  publicado_por_nome: string | null
}

const SOURCE_ICON: Record<string, typeof Newspaper> = {
  manual: Newspaper,
  diario: FileBarChart,
  comunicado: Megaphone,
  board: LayoutGrid,
  relatorio: FileBarChart,
  album: Album,
  etapa: LayoutGrid,
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Publicação',
  diario: 'Diário',
  comunicado: 'Comunicado',
  board: 'Board',
  relatorio: 'Relatório',
  album: 'Álbum',
  etapa: 'Etapa',
}

const VISIBILITY_LABEL: Record<string, string> = {
  internal: 'Interno',
  client: 'Cliente',
  shared: 'Compartilhado',
}

export default function FeedPage() {
  const supabase = createClient()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroVisibility, setFiltroVisibility] = useState<string>('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('feed_items')
      .select(`
        id, obra_id, source_type, titulo, conteudo, visibility, is_story, publicado_em, archived_at,
        obras!inner(nome),
        profiles(nome_completo)
      `)
      .is('archived_at', null)
      .order('publicado_em', { ascending: false })
      .limit(100)

    if (data) {
      setItems(data.map((d: any) => ({
        id: d.id,
        obra_id: d.obra_id,
        obra_nome: d.obras?.nome ?? 'Obra',
        source_type: d.source_type,
        titulo: d.titulo,
        conteudo: d.conteudo,
        visibility: d.visibility,
        is_story: d.is_story,
        publicado_em: d.publicado_em,
        publicado_por_nome: d.profiles?.nome_completo ?? null,
      })))
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void carregar() }, [carregar])

  const filtrados = filtroVisibility === 'todos'
    ? items
    : items.filter(i => i.visibility === filtroVisibility)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Feed</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Linha do tempo unificada de todas as obras
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-lg self-start" style={{ background: 'var(--bg-secondary)' }}>
        {['todos', 'internal', 'client', 'shared'].map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setFiltroVisibility(v)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={filtroVisibility === v
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            {v === 'todos' ? 'Todos' : VISIBILITY_LABEL[v]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={Newspaper} title="Nenhuma publicação" description="As publicações das obras aparecerão aqui." />
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map(item => {
            const Icon = SOURCE_ICON[item.source_type] ?? Newspaper
            return (
              <div key={item.id} className="card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Icon size={15} style={{ color: 'var(--accent)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                      {SOURCE_LABEL[item.source_type] ?? item.source_type}
                    </span>
                    {item.is_story && (
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        Story
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      {VISIBILITY_LABEL[item.visibility] ?? item.visibility}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(item.publicado_em)}
                    </span>
                  </div>
                </div>

                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{item.titulo}</p>
                {item.conteudo && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.conteudo}</p>
                )}

                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.obra_nome}</span>
                  {item.publicado_por_nome && (
                    <>
                      <span>·</span>
                      <span>{item.publicado_por_nome}</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
