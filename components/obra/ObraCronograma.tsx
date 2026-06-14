'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  Plus, AlertTriangle, Calendar, Pencil, Trash2, ChevronDown, ChevronRight, X,
  List, Columns, BarChart2, ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa } from '@/lib/types'
import { diasAteData, STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { CronogramaGantt, SubetapaGantt } from '@/components/obra/CronogramaGantt'

type ViewMode = 'lista' | 'kanban' | 'gantt'

const KANBAN_COLS: { status: Etapa['status']; label: string; cor: string }[] = [
  { status: 'planejada',    label: 'A executar',   cor: 'var(--accent)' },
  { status: 'em_andamento', label: 'Em execução',  cor: '#10B981' },
  { status: 'atrasada',     label: 'Atenção',       cor: '#F59E0B' },
  { status: 'concluida',    label: 'Concluída',    cor: '#6B7280' },
]

function shortDate(val: string | null) {
  if (!val) return '--'
  return new Date(val + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function ObraCronograma({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaGantt[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('lista')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Etapa | null>(null)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({
    nome: '',
    data_inicio: '',
    data_fim: '',
    status: 'planejada' as Etapa['status'],
  })

  const [editandoSub, setEditandoSub] = useState<SubetapaGantt | null>(null)
  const [subForm, setSubForm] = useState({ data_inicio: '', data_fim: '' })
  const [savingSub, setSavingSub] = useState(false)

  useEffect(() => { loadEtapas() }, [obraId])

  async function loadEtapas() {
    setLoading(true)
    const [{ data }, { data: orcamentos }] = await Promise.all([
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('orcamentos').select('id').eq('obra_id', obraId),
    ])
    setEtapas(data || [])

    const orcamentoIds = ((orcamentos || []) as { id: string }[]).map(o => o.id)
    if (orcamentoIds.length > 0) {
      const { data: itens } = await supabase
        .from('orcamento_itens')
        .select('*')
        .in('orcamento_id', orcamentoIds)
        .order('updated_at')
      setSubetapas(((itens || []) as any[])
        .filter(item => item.etapa_id)
        .map(item => ({
          id: item.id,
          etapa_id: item.etapa_id,
          nome: item.subetapa || item.descricao_snapshot || 'Item do orçamento',
          codigo: item.codigo_snapshot,
          quantidade: item.quantidade,
          unidade: item.unidade_snapshot,
          data_inicio: item.data_inicio ?? null,
          data_fim: item.data_fim ?? null,
        })))
    } else {
      setSubetapas([])
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    if (form.data_inicio && form.data_fim && form.data_inicio > form.data_fim) {
      alert('A data de início não pode ser depois da data de término.')
      return
    }
    setSaving(true)
    const payload = {
      nome: form.nome,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      status: form.status,
    }
    if (editando) {
      await supabase.from('etapas').update(payload).eq('id', editando.id)
      setEtapas(prev => prev.map(e => e.id === editando.id ? { ...e, ...payload } : e))
    } else {
      const maxOrdem = etapas.reduce((max, e) => Math.max(max, e.ordem), 0)
      const { data } = await supabase.from('etapas').insert({
        obra_id: obraId, ...payload, ordem: maxOrdem + 1,
      }).select().single()
      if (data) setEtapas(prev => [...prev, data])
    }
    setSaving(false)
    setShowModal(false)
    setEditando(null)
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta etapa? Os itens de orçamento vinculados serão desvinculados.')) return
    await supabase.from('etapas').delete().eq('id', id)
    setEtapas(prev => prev.filter(e => e.id !== id))
  }

  async function updateStatus(etapaId: string, status: Etapa['status']) {
    await supabase.from('etapas').update({ status }).eq('id', etapaId)
    setEtapas(prev => prev.map(e => e.id === etapaId ? { ...e, status } : e))
  }

  function abrirEdicaoSubetapa(sub: SubetapaGantt) {
    setEditandoSub(sub)
    setSubForm({ data_inicio: sub.data_inicio || '', data_fim: sub.data_fim || '' })
  }

  async function salvarPrazoSubetapa() {
    if (!editandoSub) return
    if (subForm.data_inicio && subForm.data_fim && subForm.data_inicio > subForm.data_fim) {
      alert('A data de início não pode ser depois da data de término.')
      return
    }
    setSavingSub(true)
    const novaData = { data_inicio: subForm.data_inicio || null, data_fim: subForm.data_fim || null }
    await supabase.from('orcamento_itens').update(novaData).eq('id', editandoSub.id)
    setSubetapas(prev => prev.map(s => s.id === editandoSub.id ? { ...s, ...novaData } : s))
    setSavingSub(false)
    setEditandoSub(null)
  }

  async function limparPrazoSubetapa() {
    if (!editandoSub) return
    setSavingSub(true)
    await supabase.from('orcamento_itens').update({ data_inicio: null, data_fim: null }).eq('id', editandoSub.id)
    setSubetapas(prev => prev.map(s => s.id === editandoSub.id ? { ...s, data_inicio: null, data_fim: null } : s))
    setSavingSub(false)
    setEditandoSub(null)
  }

  function openEdit(etapa: Etapa) {
    setEditando(etapa)
    setForm({ nome: etapa.nome, data_inicio: etapa.data_inicio || '', data_fim: etapa.data_fim || '', status: etapa.status })
    setShowModal(true)
  }

  function openNew() {
    setEditando(null)
    resetForm()
    setShowModal(true)
  }

  function resetForm() {
    setForm({ nome: '', data_inicio: '', data_fim: '', status: 'planejada' })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header: seletor de visualização + botão nova etapa ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {([
            { mode: 'lista',  label: 'Lista',  Icon: List },
            { mode: 'kanban', label: 'Kanban', Icon: Columns },
            { mode: 'gantt',  label: 'Gantt',  Icon: BarChart2 },
          ] as { mode: ViewMode; label: string; Icon: React.ElementType }[]).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={viewMode === mode
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }
              }
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <Button icon={<Plus size={16} />} onClick={openNew}>Nova Etapa</Button>
      </div>

      {etapas.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma etapa cadastrada"
          description="Adicione etapas para organizar o cronograma da obra."
          action={<Button icon={<Plus size={16} />} onClick={openNew}>Nova Etapa</Button>}
        />
      ) : (
        <>
          {/* ── LISTA ── */}
          {viewMode === 'lista' && (
            <div className="flex flex-col gap-3">
              {etapas.map(etapa => {
                const dias = etapa.data_inicio ? diasAteData(etapa.data_inicio) : null
                const atrasada = dias !== null && dias < 0 && etapa.status !== 'concluida'
                const subs = subetapas.filter(s => s.etapa_id === etapa.id)
                const isCollapsed = collapsed[etapa.id] ?? true
                const semDatas = !etapa.data_inicio && !etapa.data_fim

                return (
                  <div key={etapa.id} className="card overflow-hidden">
                    <div className="p-4 flex flex-col gap-3">
                      {/* Linha 1: status + ações */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                          {STATUS_ETAPA_LABEL[etapa.status]}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(etapa)}
                            className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                            title="Editar etapa e datas"
                          >
                            <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button
                            onClick={() => handleDelete(etapa.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
                            title="Remover etapa"
                          >
                            <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>
                      </div>

                      {/* Linha 2: nome + alerta */}
                      <div className="flex items-center gap-2">
                        {atrasada && <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                        <span className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                          {etapa.nome}
                        </span>
                      </div>

                      {/* Linha 3: datas */}
                      <div className="flex items-center gap-2">
                        <Calendar size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        {semDatas ? (
                          <button
                            onClick={() => openEdit(etapa)}
                            className="text-xs font-medium hover:opacity-80 transition-opacity"
                            style={{ color: 'var(--accent)' }}
                          >
                            Definir datas
                          </button>
                        ) : (
                          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {shortDate(etapa.data_inicio)} → {shortDate(etapa.data_fim)}
                          </span>
                        )}
                      </div>

                      {/* Linha 4: alterar status rápido */}
                      <div className="flex items-center gap-2 flex-wrap pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Mover para:</span>
                        {KANBAN_COLS.filter(c => c.status !== etapa.status).map(col => (
                          <button
                            key={col.status}
                            onClick={() => updateStatus(etapa.id, col.status)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                          >
                            <ArrowRight size={10} />
                            {col.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subetapas */}
                    {subs.length > 0 && (
                      <>
                        <button
                          onClick={() => setCollapsed(prev => ({ ...prev, [etapa.id]: !isCollapsed }))}
                          className="w-full flex items-center gap-2 px-4 py-2 text-xs transition-colors hover:bg-[var(--bg-secondary)]"
                          style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}
                        >
                          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          {subs.length} subetapa{subs.length !== 1 ? 's' : ''}
                        </button>
                        {!isCollapsed && (
                          <div style={{ borderTop: '1px solid var(--border)' }}>
                            {subs.map(sub => (
                              <div
                                key={sub.id}
                                className="flex items-center justify-between px-4 py-2.5 text-xs"
                                style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
                              >
                                <div>
                                  <span style={{ color: 'var(--text-secondary)' }}>{sub.codigo && `${sub.codigo} - `}</span>
                                  <span style={{ color: 'var(--text-primary)' }}>{sub.nome}</span>
                                  <div className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {sub.data_inicio && sub.data_fim
                                      ? `${shortDate(sub.data_inicio)} → ${shortDate(sub.data_fim)}`
                                      : 'Dentro do período da etapa'}
                                  </div>
                                </div>
                                <button onClick={() => abrirEdicaoSubetapa(sub)} className="p-1 rounded hover:bg-[var(--border)] transition-colors ml-2">
                                  <Pencil size={11} style={{ color: 'var(--text-secondary)' }} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── KANBAN ── */}
          {viewMode === 'kanban' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {KANBAN_COLS.map(col => {
                const itens = etapas.filter(e => e.status === col.status)
                return (
                  <div key={col.status} className="flex flex-col gap-2">
                    {/* Cabeçalho coluna */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold" style={{ color: col.cor }}>{col.label}</span>
                      <span
                        className="text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold"
                        style={{ background: `${col.cor}25`, color: col.cor }}
                      >
                        {itens.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col gap-2 min-h-[80px] rounded-xl p-1.5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                      {itens.length === 0 && (
                        <div className="flex items-center justify-center py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          vazio
                        </div>
                      )}
                      {itens.map(etapa => {
                        const semDatas = !etapa.data_inicio && !etapa.data_fim
                        const subs = subetapas.filter(s => s.etapa_id === etapa.id)
                        return (
                          <div key={etapa.id} className="card p-3 flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                                {etapa.nome}
                              </span>
                              <button
                                onClick={() => openEdit(etapa)}
                                className="p-1 rounded hover:bg-[var(--bg-secondary)] flex-shrink-0"
                              >
                                <Pencil size={11} style={{ color: 'var(--text-secondary)' }} />
                              </button>
                            </div>

                            {subs.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full w-fit" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                                {subs.length} subetapa{subs.length !== 1 ? 's' : ''}
                              </span>
                            )}

                            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <Calendar size={10} />
                              {semDatas ? (
                                <button onClick={() => openEdit(etapa)} className="hover:opacity-80" style={{ color: 'var(--accent)' }}>
                                  Definir datas
                                </button>
                              ) : (
                                <span>{shortDate(etapa.data_inicio)} → {shortDate(etapa.data_fim)}</span>
                              )}
                            </div>

                            {/* Próximo status */}
                            {col.status !== 'concluida' && (
                              <div className="flex flex-wrap gap-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                                {KANBAN_COLS.filter(c => c.status !== col.status && c.status !== 'planejada').map(c => (
                                  <button
                                    key={c.status}
                                    onClick={() => updateStatus(etapa.id, c.status)}
                                    className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-md transition-colors hover:opacity-80"
                                    style={{ background: `${c.cor}18`, color: c.cor, border: `1px solid ${c.cor}40` }}
                                  >
                                    <ArrowRight size={8} />
                                    {c.label}
                                  </button>
                                ))}
                                <button
                                  onClick={() => handleDelete(etapa.id)}
                                  className="text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-md transition-colors hover:opacity-80 ml-auto"
                                  style={{ color: 'var(--danger)' }}
                                >
                                  <Trash2 size={8} />
                                </button>
                              </div>
                            )}
                            {col.status === 'concluida' && (
                              <button
                                onClick={() => updateStatus(etapa.id, 'planejada')}
                                className="text-[10px] px-1.5 py-0.5 rounded-md pt-1 border-t w-full text-left transition-colors hover:opacity-80"
                                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                              >
                                ↩ Reabrir
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── GANTT ── */}
          {viewMode === 'gantt' && (
            <div className="flex flex-col gap-4">
              {etapas.some(e => e.data_inicio && e.data_fim) ? (
                <CronogramaGantt etapas={etapas} subetapas={subetapas} onEditSubetapa={abrirEdicaoSubetapa} />
              ) : (
                <div className="card p-5 flex items-start gap-3">
                  <Calendar size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Gantt pronto para montar</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Defina início e término das etapas (clique em ✏️) para exibir o Gantt.
                    </p>
                  </div>
                </div>
              )}

              {/* Tabela compacta */}
              <div className="card overflow-x-auto">
                <table className="w-full table-zebra">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Ord.', 'Etapa', 'Início', 'Fim', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {etapas.map(etapa => {
                      const dias = etapa.data_inicio ? diasAteData(etapa.data_inicio) : null
                      const atrasada = dias !== null && dias < 0 && etapa.status !== 'concluida'
                      const subs = subetapas.filter(s => s.etapa_id === etapa.id)
                      const isCollapsed = collapsed[etapa.id] ?? false
                      return (
                        <Fragment key={etapa.id}>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{etapa.ordem}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setCollapsed(prev => ({ ...prev, [etapa.id]: !isCollapsed }))}
                                  disabled={subs.length === 0}
                                  className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                                  style={{ color: 'var(--text-secondary)', opacity: subs.length ? 1 : 0.35 }}
                                >
                                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {atrasada && <AlertTriangle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                              {shortDate(etapa.data_inicio)}
                            </td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                              {shortDate(etapa.data_fim)}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={etapa.status}
                                onChange={e => updateStatus(etapa.id, e.target.value as Etapa['status'])}
                                className="text-xs rounded-lg px-2 py-1"
                                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                              >
                                <option value="planejada">A executar</option>
                                <option value="em_andamento">Em execução</option>
                                <option value="concluida">Concluída</option>
                                <option value="atrasada">Atenção</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button onClick={() => openEdit(etapa)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                                  <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                                </button>
                                <button onClick={() => handleDelete(etapa.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                                  <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {!isCollapsed && subs.map(sub => (
                            <tr key={sub.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                              <td />
                              <td className="px-4 py-2 pl-12 text-xs" style={{ color: 'var(--text-primary)' }}>
                                {sub.codigo && <span style={{ color: 'var(--text-secondary)' }}>{sub.codigo} - </span>}
                                {sub.nome}
                              </td>
                              <td colSpan={3} className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {sub.data_inicio && sub.data_fim
                                  ? `${shortDate(sub.data_inicio)} → ${shortDate(sub.data_fim)}`
                                  : 'Dentro do período da etapa'}
                              </td>
                              <td className="px-4 py-2">
                                <button onClick={() => abrirEdicaoSubetapa(sub)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                                  <Pencil size={12} style={{ color: 'var(--text-secondary)' }} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal: adicionar / editar etapa ── */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null); resetForm() }}
        title={editando ? 'Editar etapa' : 'Nova Etapa'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da etapa *"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Fundação, Alvenaria, Cobertura..."
            autoFocus
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Início"
              type="date"
              value={form.data_inicio}
              onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
              hint="Opcional"
            />
            <Input
              label="Término"
              type="date"
              value={form.data_fim}
              onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))}
              hint="Opcional"
            />
          </div>
          {form.data_inicio && (
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, data_inicio: '', data_fim: '' }))}
              className="text-xs self-start flex items-center gap-1 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X size={12} /> Limpar datas
            </button>
          )}
          <Select
            label="Status"
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as Etapa['status'] }))}
          >
            <option value="planejada">A executar</option>
            <option value="em_andamento">Em execução</option>
            <option value="concluida">Concluída</option>
            <option value="atrasada">Atenção</option>
          </Select>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>
              Cancelar
            </Button>
            <Button className="flex-1" loading={saving} disabled={!form.nome.trim()} onClick={handleSave}>
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: prazo da subetapa ── */}
      <Modal open={!!editandoSub} onClose={() => setEditandoSub(null)} title="Prazo da subetapa" size="md">
        {editandoSub && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <Calendar size={16} style={{ color: 'var(--accent)', marginTop: 2, flexShrink: 0 }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {editandoSub.codigo && <span style={{ color: 'var(--text-secondary)' }}>{editandoSub.codigo} - </span>}
                  {editandoSub.nome}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Deixe em branco para distribuir dentro do período da etapa-mãe.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Início" type="date" value={subForm.data_inicio} onChange={e => setSubForm(f => ({ ...f, data_inicio: e.target.value }))} />
              <Input label="Término" type="date" value={subForm.data_fim} onChange={e => setSubForm(f => ({ ...f, data_fim: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex items-center gap-1.5"
                onClick={limparPrazoSubetapa}
                disabled={savingSub || (!editandoSub.data_inicio && !editandoSub.data_fim)}
              >
                <X size={14} /> Limpar
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setEditandoSub(null)}>Cancelar</Button>
              <Button className="flex-1" loading={savingSub} onClick={salvarPrazoSubetapa}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
