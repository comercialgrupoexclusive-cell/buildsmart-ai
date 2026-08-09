'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, ExternalLink, MessageSquareText, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { PortalBoardStatus, PortalCategoria } from '@/lib/portal/types'

type TeamBoardItem = {
  id: string
  titulo: string | null
  descricao: string | null
  categoria: PortalCategoria
  status: PortalBoardStatus
  ambiente: string | null
  created_by_type: 'equipe' | 'cliente' | 'ia'
  updated_at: string
}

const STATUS: Array<{ value: PortalBoardStatus; label: string }> = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'em_analise', label: 'Em analise' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'aguardando_equipe', label: 'Aguardando equipe' },
  { value: 'resolvido', label: 'Resolvido' },
  { value: 'arquivado', label: 'Arquivado' },
]

const CATEGORY_LABEL: Record<PortalCategoria, string> = {
  observacao: 'Observacao', duvida: 'Duvida', aprovacao: 'Aprovacao', alteracao: 'Alteracao solicitada',
  pendencia: 'Pendencia', nao_conformidade: 'Nao conformidade',
}

export function ObraPortalBoard({ obraId }: { obraId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<TeamBoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data: boards, error: boardError } = await supabase
      .from('boards').select('id').eq('obra_id', obraId).eq('scope', 'portal')
    if (boardError) { setError(boardError.message); setLoading(false); return }
    const ids = (boards || []).map((board: { id: string }) => board.id)
    if (ids.length === 0) { setItems([]); setLoading(false); return }
    const { data, error: itemError } = await supabase.from('board_items')
      .select('id,titulo,descricao,categoria,status,ambiente,created_by_type,updated_at')
      .in('board_id', ids).eq('visibility', 'client').is('archived_at', null).order('updated_at', { ascending: false })
    setError(itemError?.message || '')
    setItems((data || []) as TeamBoardItem[])
    setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { void Promise.resolve().then(loadItems) }, [loadItems])

  async function changeStatus(itemId: string, status: PortalBoardStatus) {
    const patch = { status, archived_at: status === 'arquivado' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
    const { error: updateError } = await supabase.from('board_items').update(patch).eq('id', itemId)
    if (updateError) { setError(updateError.message); return }
    await loadItems()
  }

  const pending = items.filter(item => !['resolvido', 'arquivado'].includes(item.status)).length

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Board do Cliente</h2>{pending > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400"><Bell size={13} /> {pending}</span>}</div>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Itens compartilhados pelo Portal. Itens internos continuam ocultos do cliente.</p>
        </div>
        <button type="button" onClick={() => loadItems()} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><RefreshCw size={15} /> Atualizar</button>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando itens do Portal...</p> : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center" style={{ borderColor: 'var(--border)' }}><MessageSquareText className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhum item compartilhado</p><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>As anotacoes criadas pelo cliente aparecerao aqui.</p></div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map(item => <article key={item.id} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>{item.status === 'resolvido' ? <CheckCircle2 size={18} /> : <MessageSquareText size={18} />}</div><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.titulo || 'Item sem titulo'}</h3><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{CATEGORY_LABEL[item.categoria]}{item.ambiente ? ` · ${item.ambiente}` : ''} · {item.created_by_type === 'ia' ? 'IA do Portal' : item.created_by_type === 'cliente' ? 'Cliente' : 'Equipe'}</p></div></div>
            {item.descricao && <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.descricao}</p>}
            <div className="mt-4 flex items-center gap-2"><select value={item.status} onChange={event => changeStatus(item.id, event.target.value as PortalBoardStatus)} className="input-base min-h-10 flex-1 text-sm">{STATUS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select><span className="grid size-10 place-items-center rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }} title="Item disponivel no Portal"><ExternalLink size={15} /></span></div>
          </article>)}
        </div>
      )}
    </section>
  )
}
