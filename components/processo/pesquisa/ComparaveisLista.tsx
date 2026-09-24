'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Search, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'

// Lista bruta do que a busca trouxe. O relatório só mostra o que está salvo
// ou favoritado — aqui é onde se decide isso. Um comparável ruim descartado
// aqui some do relatório sem ser apagado do histórico da pesquisa.

type Comparavel = {
  id: string
  titulo: string | null
  preco: number | null
  area: number | null
  preco_m2: number | null
  fonte: string | null
  url: string | null
  url_confirmada: boolean
  similaridade: 'mesmo_predio' | 'mesma_rua' | 'entorno' | 'bairro' | null
  disponibilidade: string | null
  possivel_duplicado: boolean
  salvo: boolean
  favorito: boolean
}

const SIMILARIDADE_LABEL: Record<string, string> = {
  mesmo_predio: 'Mesmo prédio',
  mesma_rua: 'Mesma rua',
  entorno: 'Entorno',
  bairro: 'Mesmo bairro',
}

export function ComparaveisLista({ prospeccaoId, recarregar, onMudou }: {
  prospeccaoId: string
  recarregar: number
  onMudou: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [itens, setItens] = useState<Comparavel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('prospeccao_comparaveis')
      .select('*')
      .eq('prospeccao_id', prospeccaoId)
      .order('preco_m2', { nullsFirst: false })
    setItens((data ?? []) as Comparavel[])
    setCarregando(false)
  }, [supabase, prospeccaoId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void carregar() }, 0)
    return () => window.clearTimeout(timer)
  }, [carregar, recarregar])

  async function alternar(item: Comparavel, campo: 'salvo' | 'favorito') {
    setOcupado(item.id)
    try {
      const valor = !item[campo]
      // Favoritar implica manter no relatório: favorito sem salvo sumiria da
      // própria lista que o alimenta.
      const patch = campo === 'favorito' && valor ? { favorito: true, salvo: true } : { [campo]: valor }
      await supabase.from('prospeccao_comparaveis').update(patch).eq('id', item.id)
      await carregar()
      onMudou()
    } finally {
      setOcupado(null)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="Nenhum comparável encontrado"
        description="Envie o print do leilão acima, ou use Ampliar busca para abrir o raio da pesquisa."
      />
    )
  }

  return (
    <div className="space-y-2">
      {itens.map(c => (
        <div key={c.id} className="card p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {c.titulo || 'Sem título'}
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {c.area && <span>{c.area} m²</span>}
                {c.preco && <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(c.preco)}</span>}
                {c.preco_m2 && <span>{formatCurrency(c.preco_m2)}/m²</span>}
                {c.fonte && <span>{c.fonte}</span>}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {c.similaridade && (
                  <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    {SIMILARIDADE_LABEL[c.similaridade]}
                  </span>
                )}
                {!c.url_confirmada && (
                  <span className="text-[10px]" style={{ color: '#f59e0b' }}>anúncio não confirmado</span>
                )}
                {c.disponibilidade && c.disponibilidade !== 'disponivel' && (
                  <span className="text-[10px]" style={{ color: '#f59e0b' }}>{c.disponibilidade}</span>
                )}
                {c.possivel_duplicado && (
                  <span className="text-[10px]" style={{ color: '#f59e0b' }}>possível duplicado</span>
                )}
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    ver anúncio <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void alternar(c, 'favorito')}
                disabled={ocupado === c.id}
                aria-label={c.favorito ? 'Desfavoritar' : 'Favoritar'}
                className="p-1.5 rounded-lg disabled:opacity-40"
                style={{ color: c.favorito ? '#f59e0b' : 'var(--text-secondary)' }}
              >
                <Star size={15} fill={c.favorito ? '#f59e0b' : 'none'} />
              </button>
              <button
                type="button"
                onClick={() => void alternar(c, 'salvo')}
                disabled={ocupado === c.id}
                className="rounded-full px-2.5 py-1 text-xs disabled:opacity-40"
                style={c.salvo
                  ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' }
                  : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {c.salvo ? 'No relatório' : 'Incluir'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
