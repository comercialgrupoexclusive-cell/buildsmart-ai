'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  Plus, AlertTriangle, Calendar, Pencil, Trash2, ChevronDown, ChevronRight, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa } from '@/lib/types'
import { diasAteData, STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { CronogramaGantt, SubetapaGantt } from '@/components/obra/CronogramaGantt'

export function ObraCronograma({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaGantt[]>([])
  const [loading, setLoading] = useState(true)
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

  // ─── Edição de prazo da subetapa (cascata) ───────────────────────────────
  const [editandoSub, setEditandoSub] = useState<SubetapaGantt | null>(null)
  const [subForm, setSubForm] = useState({ data_inicio: '', data_fim: '' })
  const [savingSub, setSavingSub] = useState(false)

  const [ganttOffset] = useState(0)

  useEffect(() => { loadEtapas() }, [obraId])

  async function loadEtapas() {
    setLoading(true)
    const [{ data }, { data: orcamentos }] = await Promise.all([
      supabase
        .from('etapas')
        .select('*')
        .eq('obra_id', obraId)
        .order('ordem'),
      supabase
        .from('orcamentos')
        .select('id')
        .eq('obra_id', obraId),
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
    if (!form.nome || !form.data_inicio || !form.data_fim) return
    setSaving(true)
    if (editando) {
      await supabase.from('etapas').update({
        nome: form.nome, data_inicio: form.data_inicio,
        data_fim: form.data_fim, status: form.status,
      }).eq('id', editando.id)
      setEtapas(prev => prev.map(e => e.id === editando.id
        ? { ...e, ...form } : e))
    } else {
      const maxOrdem = etapas.reduce((max, e) => Math.max(max, e.ordem), 0)
      const { data } = await supabase.from('etapas').insert({
        obra_id: obraId, nome: form.nome, data_inicio: form.data_inicio,
        data_fim: form.data_fim, status: form.status, ordem: maxOrdem + 1,
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

  // Edição direta da data (inline, na planilha) — sem precisar abrir o modal
  async function handleEditarDataEtapa(etapaId: string, campo: 'data_inicio' | 'data_fim', valor: string) {
    if (!valor) return
    setEtapas(prev => prev.map(e => e.id === etapaId ? { ...e, [campo]: valor } : e))
    await supabase.from('etapas').update({ [campo]: valor }).eq('id', etapaId)
  }

  // ─── Edição de prazo da subetapa direto na cascata (Gantt) ───────────────
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
    const novaData = {
      data_inicio: subForm.data_inicio || null,
      data_fim: subForm.data_fim || null,
    }
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
    setForm({
      nome: etapa.nome,
      data_inicio: etapa.data_inicio || '',
      data_fim: etapa.data_fim || '',
      status: etapa.status,
    })
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

  // ─── Gantt visual ─────────────────────────────────────────────────────────
  const hoje = new Date()
  const ganttStart = new Date(hoje.getFullYear(), hoje.getMonth() + ganttOffset - 1, 1)
  const ganttEnd = new Date(hoje.getFullYear(), hoje.getMonth() + ganttOffset + 3, 0)
  const totalDias = Math.ceil((ganttEnd.getTime() - ganttStart.getTime()) / 86400000) + 1

  // Gerar cabeçalho de meses
  const meses: { label: string; pctStart: number; pctWidth: number }[] = []
  let cursorMes = new Date(ganttStart.getFullYear(), ganttStart.getMonth(), 1)
  while (cursorMes <= ganttEnd) {
    const mesStart = Math.max(0, Math.ceil((cursorMes.getTime() - ganttStart.getTime()) / 86400000))
    const mesEnd = new Date(cursorMes.getFullYear(), cursorMes.getMonth() + 1, 0)
    const mesFim = Math.min(totalDias - 1, Math.ceil((mesEnd.getTime() - ganttStart.getTime()) / 86400000))
    meses.push({
      label: cursorMes.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      pctStart: (mesStart / totalDias) * 100,
      pctWidth: ((mesFim - mesStart + 1) / totalDias) * 100,
    })
    cursorMes = new Date(cursorMes.getFullYear(), cursorMes.getMonth() + 1, 1)
  }

  // Calcular posição de cada etapa na barra
  const etapasGantt = etapas.filter(e => e.data_inicio && e.data_fim).map(e => {
    const inicio = new Date(e.data_inicio! + 'T12:00')
    const fim = new Date(e.data_fim! + 'T12:00')
    const startDia = Math.ceil((inicio.getTime() - ganttStart.getTime()) / 86400000)
    const endDia = Math.ceil((fim.getTime() - ganttStart.getTime()) / 86400000)
    const pctLeft = (Math.max(0, startDia) / totalDias) * 100
    const pctWidth = ((Math.min(totalDias, endDia) - Math.max(0, startDia) + 1) / totalDias) * 100
    const visivel = startDia <= totalDias && endDia >= 0 && pctWidth > 0
    return { etapa: e, pctLeft, pctWidth: Math.max(pctWidth, 0), visivel }
  })

  const hojeOffset = Math.ceil((hoje.getTime() - ganttStart.getTime()) / 86400000)
  const hojePercent = (hojeOffset / totalDias) * 100

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={16} />} onClick={openNew}>Nova Etapa</Button>
      </div>

      {etapas.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma etapa cadastrada"
          description="Adicione etapas com datas para visualizar o cronograma."
          action={<Button icon={<Plus size={16} />} onClick={openNew}>Nova Etapa</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* ── Gantt visual ── */}
          {etapasGantt.length > 0 ? (
            <CronogramaGantt etapas={etapas} subetapas={subetapas} onEditSubetapa={abrirEdicaoSubetapa} />
          ) : (
            <div className="card p-5 flex items-start gap-3">
              <Calendar size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Gantt pronto para montar</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Defina inicio e termino das etapas para exibir o grafico de Gantt.
                </p>
              </div>
            </div>
          )}

          {/* ── Tabela de etapas ── */}
          <div className="card overflow-hidden">
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ord.', 'Etapa', 'Início', 'Fim', 'Status', 'Alterar', ''].map(h => (
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
                            title={subs.length ? 'Abrir subetapas' : 'Sem subetapas'}
                          >
                            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {atrasada && <AlertTriangle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
                          {subs.length > 0 && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                              {subs.length} {subs.length === 1 ? 'subetapa' : 'subetapas'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <input
                          type="date"
                          value={etapa.data_inicio || ''}
                          onChange={e => handleEditarDataEtapa(etapa.id, 'data_inicio', e.target.value)}
                          className="text-xs rounded-lg px-2 py-1 w-[130px]"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <input
                          type="date"
                          value={etapa.data_fim || ''}
                          onChange={e => handleEditarDataEtapa(etapa.id, 'data_fim', e.target.value)}
                          className="text-xs rounded-lg px-2 py-1 w-[130px]"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                          {STATUS_ETAPA_LABEL[etapa.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={etapa.status}
                          onChange={e => updateStatus(etapa.id, e.target.value as Etapa['status'])}
                          className="text-xs rounded-lg px-2 py-1"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        >
                          <option value="planejada">A executar</option>
                          <option value="em_andamento">Em execucao</option>
                          <option value="concluida">Concluida</option>
                          <option value="atrasada">Ponto de atencao</option>
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
                        <td colSpan={2} className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {sub.data_inicio && sub.data_fim
                            ? <>{new Date(sub.data_inicio + 'T12:00').toLocaleDateString('pt-BR')} – {new Date(sub.data_fim + 'T12:00').toLocaleDateString('pt-BR')}</>
                            : 'Dentro do período da etapa'}
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {sub.quantidade ? `${sub.quantidade} ${sub.unidade || ''}` : '-'}
                        </td>
                        <td colSpan={2} className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          Item do orçamento
                        </td>
                        <td className="px-4 py-2">
                          <button onClick={() => abrirEdicaoSubetapa(sub)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Editar prazo da subetapa">
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

      {/* Modal */}
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
            <Input label="Início *" type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Término *" type="date" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <Select label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Etapa['status'] }))}>
            <option value="planejada">A executar</option>
            <option value="em_andamento">Em execucao</option>
            <option value="concluida">Concluida</option>
            <option value="atrasada">Ponto de atencao</option>
          </Select>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.nome || !form.data_inicio || !form.data_fim} onClick={handleSave}>
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal — prazo da subetapa (editado direto pela cascata ou pela planilha) */}
      <Modal
        open={!!editandoSub}
        onClose={() => setEditandoSub(null)}
        title="Prazo da subetapa"
        size="md"
      >
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
                  Defina um período próprio para esta subetapa, ou deixe em branco para que ela continue distribuída dentro do período da etapa-mãe.
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
                title="Remover prazo próprio e voltar a distribuir dentro da etapa"
              >
                <X size={14} /> Limpar prazo
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
