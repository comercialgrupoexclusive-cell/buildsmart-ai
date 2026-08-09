'use client'

import { useState } from 'react'
import { Archive, ChevronDown, ChevronUp, MapPin, MessageCircle, Plus, Send, X } from 'lucide-react'
import type { PortalBoardItemDTO, PortalBoardStatus, PortalCategoria, PortalTourPosition } from '@/lib/portal/types'
import { Button } from '@/components/ui/Button'

const CATEGORIAS: Array<{ value: PortalCategoria; label: string }> = [
  { value: 'observacao', label: 'Observação' },
  { value: 'duvida', label: 'Dúvida' },
  { value: 'aprovacao', label: 'Aprovação' },
  { value: 'alteracao', label: 'Alteração solicitada' },
  { value: 'pendencia', label: 'Pendência' },
  { value: 'nao_conformidade', label: 'Não conformidade' },
]

const STATUS: Array<{ value: PortalBoardStatus; label: string }> = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'aguardando_equipe', label: 'Aguardando equipe' },
  { value: 'resolvido', label: 'Resolvido' },
]

type Props = {
  token: string
  orcamentoId: string
  items: PortalBoardItemDTO[]
  draftTour: PortalTourPosition | null
  focusItemId?: string | null
  onDraftConsumed: () => void
  onChanged: () => Promise<void>
  onOpenTour: (item: PortalBoardItemDTO) => void
}

export function PortalBoard({ token, orcamentoId, items, draftTour, focusItemId, onDraftConsumed, onChanged, onOpenTour }: Props) {
  const [showForm, setShowForm] = useState(Boolean(draftTour))
  const [expandedId, setExpandedId] = useState<string | null>(focusItemId || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'observacao' as PortalCategoria, ambiente: draftTour?.ambiente || '' })

  async function request(body: Record<string, unknown>) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/portal/${token}/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.')
      await onChanged()
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function createItem(event: React.FormEvent) {
    event.preventDefault()
    const ok = await request({
      action: 'create',
      input: {
        ...form,
        orcamentoId,
        tour: draftTour,
      },
    })
    if (!ok) return
    setForm({ titulo: '', descricao: '', categoria: 'observacao', ambiente: '' })
    setShowForm(false)
    onDraftConsumed()
  }

  async function changeStatus(itemId: string, status: PortalBoardStatus) {
    await request({ action: 'change_status', itemId, status })
  }

  async function addComment(itemId: string) {
    if (!comment.trim()) return
    const ok = await request({ action: 'comment', itemId, mensagem: comment })
    if (ok) setComment('')
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>Decisões e pendências</p>
          <h2 className="mt-1 text-2xl font-semibold">Board da obra</h2>
        </div>
        <Button type="button" onClick={() => setShowForm(true)} icon={<Plus size={18} />}><span className="hidden sm:inline">Nova anotação</span><span className="sm:hidden">Nova</span></Button>
      </div>

      {showForm && (
        <form onSubmit={createItem} className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{draftTour ? 'Anotação no Tour' : 'Nova anotação'}</h3>
            <button type="button" onClick={() => { setShowForm(false); onDraftConsumed() }} className="grid size-10 place-items-center" aria-label="Fechar"><X size={18} /></button>
          </div>
          {draftTour && <p className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}><MapPin size={14} /> Posição do panorama será vinculada ao item.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Título</span><input required maxLength={160} value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} className="input-base min-h-11" placeholder="O que você gostaria de registrar?" /></label>
            <label><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Categoria</span><select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as PortalCategoria }))} className="input-base min-h-11">{CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Ambiente</span><input value={form.ambiente} onChange={e => setForm(f => ({ ...f, ambiente: e.target.value }))} className="input-base min-h-11" placeholder="Ex.: Cozinha" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Detalhes</span><textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className="input-base min-h-24 resize-y" placeholder="Descreva a dúvida, decisão ou alteração." /></label>
          </div>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          <div className="mt-4 flex justify-end"><Button loading={saving}>{saving ? 'Salvando...' : 'Criar anotação'}</Button></div>
        </form>
      )}

      {items.length === 0 ? (
        <div className="card border-dashed px-5 py-12 text-center">
          <MessageCircle className="mx-auto" style={{ color: 'var(--text-secondary)' }} />
          <p className="mt-3 font-medium">Nenhuma anotação compartilhada</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Dúvidas, aprovações e pendências aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const expanded = expandedId === item.id
            return (
              <article key={item.id} id={`board-item-${item.id}`} className="card overflow-hidden">
                <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.titulo}</span><span className="mt-0.5 block text-xs" style={{ color: 'var(--text-secondary)' }}>{CATEGORIAS.find(c => c.value === item.categoria)?.label}{item.ambiente ? ` · ${item.ambiente}` : ''}</span></span>
                  <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }}>{STATUS.find(s => s.value === item.status)?.label || item.status}</span>
                  {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {expanded && (
                  <div className="border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
                    {item.descricao && <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>{item.descricao}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select value={item.status} onChange={e => changeStatus(item.id, e.target.value as PortalBoardStatus)} disabled={saving} className="input-base min-h-10 w-auto text-sm">{STATUS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
                      {item.tour && <button type="button" onClick={() => onOpenTour(item)} className="flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium" style={{ borderColor: 'var(--border)' }}><MapPin size={15} /> Ver no Tour</button>}
                      <button type="button" onClick={() => request({ action: 'archive', itemId: item.id })} className="ml-auto grid size-10 place-items-center rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} title="Arquivar"><Archive size={16} /></button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {item.comments.map(entry => <div key={entry.id} className="rounded-lg px-3 py-2" style={{ background: 'var(--bg-secondary)' }}><p className="text-sm">{entry.mensagem}</p><p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>{entry.autorTipo === 'cliente' ? 'Cliente' : entry.autorTipo === 'ia' ? 'IA do Portal' : 'Equipe'}</p></div>)}
                    </div>
                    <div className="mt-3 flex gap-2"><input value={comment} onChange={e => setComment(e.target.value)} className="input-base min-h-11 min-w-0 flex-1 text-sm" placeholder="Escreva uma resposta" /><button type="button" disabled={saving || !comment.trim()} onClick={() => addComment(item.id)} className="grid size-11 place-items-center rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--accent)' }} aria-label="Enviar comentário"><Send size={17} /></button></div>
                    {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
