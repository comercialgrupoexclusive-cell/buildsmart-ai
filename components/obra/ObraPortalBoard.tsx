'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, LayoutDashboard, ListChecks, MessageSquareText, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { PortalBoardStatus, PortalCategoria } from '@/lib/portal/types'

const ExcalidrawBoard = dynamic(() => import('@/components/board/ExcalidrawBoard').then(module => module.ExcalidrawBoard), { ssr: false })

type TeamBoardItem = { id: string; titulo: string | null; descricao: string | null; categoria: PortalCategoria; status: PortalBoardStatus; ambiente: string | null; created_by_type: 'equipe' | 'cliente' | 'ia'; updated_at: string }
const STATUS: Array<{ value: PortalBoardStatus; label: string }> = [
  { value: 'aberto', label: 'Aberto' }, { value: 'em_analise', label: 'Em analise' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' }, { value: 'aguardando_equipe', label: 'Aguardando equipe' },
  { value: 'resolvido', label: 'Resolvido' }, { value: 'arquivado', label: 'Arquivado' },
]
const CATEGORY_LABEL: Record<PortalCategoria, string> = { observacao: 'Observacao', duvida: 'Duvida', aprovacao: 'Aprovacao', alteracao: 'Alteracao solicitada', pendencia: 'Pendencia', nao_conformidade: 'Nao conformidade' }

export function ObraPortalBoard({ obraId }: { obraId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [mode, setMode] = useState<'canvas' | 'items'>('canvas')
  const [items, setItems] = useState<TeamBoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data: boards, error: boardError } = await supabase.from('boards').select('id').eq('obra_id', obraId).eq('scope', 'portal')
    if (boardError) { setError(boardError.message); setLoading(false); return }
    const ids = (boards || []).map((board: { id: string }) => board.id)
    if (!ids.length) { setItems([]); setLoading(false); return }
    const { data, error: itemError } = await supabase.from('board_items')
      .select('id,titulo,descricao,categoria,status,ambiente,created_by_type,updated_at')
      .in('board_id', ids).eq('visibility', 'client').is('archived_at', null).order('updated_at', { ascending: false })
    setError(itemError?.message || ''); setItems((data || []) as TeamBoardItem[]); setLoading(false)
  }, [obraId, supabase])
  useEffect(() => { void Promise.resolve().then(loadItems) }, [loadItems])

  async function changeStatus(itemId: string, status: PortalBoardStatus) {
    const { error: updateError } = await supabase.from('board_items').update({ status, archived_at: status === 'arquivado' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', itemId)
    if (updateError) { setError(updateError.message); return }
    await loadItems()
  }
  const pending = items.filter(item => !['resolvido', 'arquivado'].includes(item.status)).length

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold">Board do Cliente</h2>{pending > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400"><Bell size={13} /> {pending}</span>}</div><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>O quadro visual e as pendencias abaixo sao compartilhados com o Portal.</p></div>
      <div className="flex rounded-lg p-1" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <button type="button" onClick={() => setMode('canvas')} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium" style={mode === 'canvas' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}><LayoutDashboard size={15} /> Quadro</button>
        <button type="button" onClick={() => setMode('items')} className="flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium" style={mode === 'items' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}><ListChecks size={15} /> Pendencias</button>
      </div>
    </div>
    {mode === 'canvas' ? <div className="card overflow-hidden" style={{ height: 'min(72vh, 760px)', minHeight: 560 }}><ExcalidrawBoard obraId={obraId} /></div> : <>
      <div className="flex justify-end"><button type="button" onClick={() => loadItems()} className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><RefreshCw size={15} /> Atualizar</button></div>
      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando itens...</p> : !items.length ? <div className="rounded-lg border border-dashed p-10 text-center" style={{ borderColor: 'var(--border)' }}><MessageSquareText className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhum item compartilhado</p></div> : <div className="grid gap-3 lg:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}>{item.status === 'resolvido' ? <CheckCircle2 size={18} /> : <MessageSquareText size={18} />}</div><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.titulo || 'Item sem titulo'}</h3><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{CATEGORY_LABEL[item.categoria]}{item.ambiente ? ` · ${item.ambiente}` : ''} · {item.created_by_type === 'ia' ? 'IA' : item.created_by_type === 'cliente' ? 'Cliente' : 'Equipe'}</p></div></div>{item.descricao && <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.descricao}</p>}<select value={item.status} onChange={event => changeStatus(item.id, event.target.value as PortalBoardStatus)} className="input-base mt-4 min-h-10 w-full text-sm">{STATUS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></article>)}</div>}
    </>}
  </section>
}
