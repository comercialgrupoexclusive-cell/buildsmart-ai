'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  Plus, Calendar, Pencil, Trash2, ChevronDown, ChevronRight,
  LayoutList, BarChart2, Check, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, SubetapaCronograma, ServicoCronograma } from '@/lib/types'
import { STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { CronogramaGantt } from '@/components/obra/CronogramaGantt'

type Tab = 'cascata' | 'gantt'

// ── Tipos de form ──
type EtapaForm = { nome: string; data_inicio: string; data_fim: string; status: Etapa['status']; percentual_executado: number }
type SubForm   = { nome: string; data_inicio: string; data_fim: string; status: SubetapaCronograma['status']; percentual_executado: number; responsavel: string }
type SvcForm   = { nome: string; data_inicio: string; data_fim: string; percentual_executado: number; responsavel: string }

const EMPTY_ETAPA: EtapaForm = { nome: '', data_inicio: '', data_fim: '', status: 'planejada', percentual_executado: 0 }
const EMPTY_SUB:   SubForm   = { nome: '', data_inicio: '', data_fim: '', status: 'planejada', percentual_executado: 0, responsavel: '' }
const EMPTY_SVC:   SvcForm   = { nome: '', data_inicio: '', data_fim: '', percentual_executado: 0, responsavel: '' }

export function ObraCronograma({ obraId, projetoId }: { obraId?: string; projetoId?: string }) {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('cascata')
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaCronograma[]>([])
  const [servicos, setServicos] = useState<ServicoCronograma[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Modais
  const [etapaModal, setEtapaModal] = useState<{ open: boolean; editando: Etapa | null }>({ open: false, editando: null })
  const [subModal, setSubModal]     = useState<{ open: boolean; etapaId: string | null; editando: SubetapaCronograma | null }>({ open: false, etapaId: null, editando: null })
  const [svcModal, setSvcModal]     = useState<{ open: boolean; subetapaId: string | null; editando: ServicoCronograma | null }>({ open: false, subetapaId: null, editando: null })

  const [etapaForm, setEtapaForm] = useState<EtapaForm>(EMPTY_ETAPA)
  const [subForm,   setSubForm]   = useState<SubForm>(EMPTY_SUB)
  const [svcForm,   setSvcForm]   = useState<SvcForm>(EMPTY_SVC)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [obraId, projetoId])

  async function loadData() {
    setLoading(true)
    const etapasQuery = supabase.from('etapas').select('*').order('ordem')
    if (obraId) etapasQuery.eq('obra_id', obraId)
    else if (projetoId) etapasQuery.eq('projeto_id', projetoId)
    const { data: etps } = await etapasQuery

    const etapasData = (etps ?? []) as Etapa[]
    const etapaIds = etapasData.map(e => e.id)
    let subsData: SubetapaCronograma[] = []
    let svcsData: ServicoCronograma[] = []

    if (etapaIds.length > 0) {
      const { data: subs } = await supabase
        .from('subetapas_cronograma')
        .select('*')
        .in('etapa_id', etapaIds)
        .order('ordem')

      subsData = (subs ?? []) as SubetapaCronograma[]
      const subIds = subsData.map(s => s.id)

      if (subIds.length > 0) {
        const { data: svcs } = await supabase
          .from('servicos_cronograma')
          .select('*')
          .in('subetapa_id', subIds)
          .order('ordem')
        svcsData = (svcs ?? []) as ServicoCronograma[]
      }
    }

    setEtapas(etapasData)
    setSubetapas(subsData)
    setServicos(svcsData)
    setLoading(false)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function toggle(id: string) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function subsDaEtapa(etapaId: string) {
    return subetapas.filter(s => s.etapa_id === etapaId).sort((a, b) => a.ordem - b.ordem)
  }

  function svcsDaSub(subId: string) {
    return servicos.filter(s => s.subetapa_id === subId).sort((a, b) => a.ordem - b.ordem)
  }

  function progressoEtapa(etapaId: string): number {
    const subs = subsDaEtapa(etapaId)
    if (subs.length === 0) return etapas.find(e => e.id === etapaId)?.percentual_executado ?? 0
    return Math.round(subs.reduce((acc, s) => acc + s.percentual_executado, 0) / subs.length)
  }

  // ── CRUD Etapa ────────────────────────────────────────────────────────────────

  function openNewEtapa() {
    setEtapaForm(EMPTY_ETAPA)
    setEtapaModal({ open: true, editando: null })
  }

  function openEditEtapa(etapa: Etapa) {
    setEtapaForm({
      nome: etapa.nome, data_inicio: etapa.data_inicio ?? '',
      data_fim: etapa.data_fim ?? '', status: etapa.status,
      percentual_executado: etapa.percentual_executado ?? 0,
    })
    setEtapaModal({ open: true, editando: etapa })
  }

  async function saveEtapa() {
    if (!etapaForm.nome) return
    setSaving(true)
    const { editando } = etapaModal
    const payload = {
      nome: etapaForm.nome.trim(),
      data_inicio: etapaForm.data_inicio || null,
      data_fim: etapaForm.data_fim || null,
      status: etapaForm.status,
      percentual_executado: etapaForm.percentual_executado,
    }
    if (editando) {
      await supabase.from('etapas').update(payload).eq('id', editando.id)
      setEtapas(prev => prev.map(e => e.id === editando.id ? { ...e, ...payload } : e))
    } else {
      const maxOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0)
      const fk = obraId ? { obra_id: obraId } : { projeto_id: projetoId }
      const { data } = await supabase.from('etapas').insert({ ...fk, ...payload, ordem: maxOrdem + 1 }).select().single()
      if (data) setEtapas(prev => [...prev, data as Etapa])
    }
    setSaving(false)
    setEtapaModal({ open: false, editando: null })
  }

  async function deleteEtapa(id: string) {
    if (!confirm('Remover etapa e todas as subetapas?')) return
    await supabase.from('etapas').delete().eq('id', id)
    setEtapas(prev => prev.filter(e => e.id !== id))
    const subIds = subsDaEtapa(id).map(s => s.id)
    setSubetapas(prev => prev.filter(s => s.etapa_id !== id))
    setServicos(prev => prev.filter(s => !subIds.includes(s.subetapa_id)))
  }

  // ── CRUD Subetapa ─────────────────────────────────────────────────────────────

  function openNewSub(etapaId: string) {
    setSubForm(EMPTY_SUB)
    setSubModal({ open: true, etapaId, editando: null })
  }

  function openEditSub(sub: SubetapaCronograma) {
    setSubForm({
      nome: sub.nome, data_inicio: sub.data_inicio ?? '',
      data_fim: sub.data_fim ?? '', status: sub.status,
      percentual_executado: sub.percentual_executado, responsavel: sub.responsavel ?? '',
    })
    setSubModal({ open: true, etapaId: sub.etapa_id, editando: sub })
  }

  async function saveSub() {
    if (!subForm.nome) return
    setSaving(true)
    const { editando, etapaId } = subModal
    const payload = {
      nome: subForm.nome.trim(),
      data_inicio: subForm.data_inicio || null,
      data_fim: subForm.data_fim || null,
      status: subForm.status,
      percentual_executado: subForm.percentual_executado,
      responsavel: subForm.responsavel || null,
    }
    if (editando) {
      await supabase.from('subetapas_cronograma').update(payload).eq('id', editando.id)
      setSubetapas(prev => prev.map(s => s.id === editando.id ? { ...s, ...payload } : s))
    } else {
      const maxOrdem = subsDaEtapa(etapaId!).reduce((m, s) => Math.max(m, s.ordem), 0)
      const { data } = await supabase.from('subetapas_cronograma').insert({ etapa_id: etapaId, ...payload, ordem: maxOrdem + 1 }).select().single()
      if (data) setSubetapas(prev => [...prev, data as SubetapaCronograma])
    }
    setSaving(false)
    setSubModal({ open: false, etapaId: null, editando: null })
  }

  async function deleteSub(sub: SubetapaCronograma) {
    if (!confirm('Remover subetapa e serviços vinculados?')) return
    await supabase.from('subetapas_cronograma').delete().eq('id', sub.id)
    setSubetapas(prev => prev.filter(s => s.id !== sub.id))
    setServicos(prev => prev.filter(s => s.subetapa_id !== sub.id))
  }

  // ── CRUD Serviço ──────────────────────────────────────────────────────────────

  function openNewSvc(subetapaId: string) {
    setSvcForm(EMPTY_SVC)
    setSvcModal({ open: true, subetapaId, editando: null })
  }

  function openEditSvc(svc: ServicoCronograma) {
    setSvcForm({
      nome: svc.nome, data_inicio: svc.data_inicio ?? '',
      data_fim: svc.data_fim ?? '',
      percentual_executado: svc.percentual_executado, responsavel: svc.responsavel ?? '',
    })
    setSvcModal({ open: true, subetapaId: svc.subetapa_id, editando: svc })
  }

  async function saveSvc() {
    if (!svcForm.nome) return
    setSaving(true)
    const { editando, subetapaId } = svcModal
    const payload = {
      nome: svcForm.nome.trim(),
      data_inicio: svcForm.data_inicio || null,
      data_fim: svcForm.data_fim || null,
      percentual_executado: svcForm.percentual_executado,
      responsavel: svcForm.responsavel || null,
    }
    if (editando) {
      await supabase.from('servicos_cronograma').update(payload).eq('id', editando.id)
      setServicos(prev => prev.map(s => s.id === editando.id ? { ...s, ...payload } : s))
    } else {
      const maxOrdem = svcsDaSub(subetapaId!).reduce((m, s) => Math.max(m, s.ordem), 0)
      const { data } = await supabase.from('servicos_cronograma').insert({ subetapa_id: subetapaId, ...payload, ordem: maxOrdem + 1 }).select().single()
      if (data) setServicos(prev => [...prev, data as ServicoCronograma])
    }
    setSaving(false)
    setSvcModal({ open: false, subetapaId: null, editando: null })
  }

  async function deleteSvc(id: string) {
    if (!confirm('Remover serviço?')) return
    await supabase.from('servicos_cronograma').delete().eq('id', id)
    setServicos(prev => prev.filter(s => s.id !== id))
  }

  // ── Inline % update ───────────────────────────────────────────────────────────

  async function updatePct(
    table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma',
    id: string,
    pct: number
  ) {
    await supabase.from(table).update({ percentual_executado: pct }).eq('id', id)
    if (table === 'etapas') setEtapas(prev => prev.map(e => e.id === id ? { ...e, percentual_executado: pct } : e))
    if (table === 'subetapas_cronograma') setSubetapas(prev => prev.map(s => s.id === id ? { ...s, percentual_executado: pct } : s))
    if (table === 'servicos_cronograma') setServicos(prev => prev.map(s => s.id === id ? { ...s, percentual_executado: pct } : s))
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
      {/* ── Tabs ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
          {([
            { key: 'cascata', label: 'Cascata', icon: LayoutList },
            { key: 'gantt',   label: 'Gantt',   icon: BarChart2 },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
              style={tab === key
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              <Icon size={15} />{label}
            </button>
          ))}
        </div>
        <Button icon={<Plus size={16} />} onClick={openNewEtapa}>Nova Etapa</Button>
      </div>

      {etapas.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma etapa cadastrada"
          description="Adicione etapas com datas para visualizar o cronograma."
          action={<Button icon={<Plus size={16} />} onClick={openNewEtapa}>Nova Etapa</Button>}
        />
      ) : tab === 'cascata' ? (
        /* ────────────────────────────────────────────────────────────────────
           ABA: CASCATA 3 NÍVEIS
        ──────────────────────────────────────────────────────────────────── */
        <div className="card overflow-hidden">
          {etapas.map((etapa, eIdx) => {
            const subs = subsDaEtapa(etapa.id)
            const isCollapsedEtapa = collapsed[etapa.id] ?? false
            const prog = progressoEtapa(etapa.id)

            return (
              <Fragment key={etapa.id}>
                {/* ── Linha Etapa (nível 1) ── */}
                <div
                  className="flex items-center gap-2 px-4 py-3 group hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ borderBottom: '1px solid var(--border)', background: eIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}
                >
                  <button
                    onClick={() => toggle(etapa.id)}
                    className="p-1 rounded hover:bg-[var(--bg-card)] flex-shrink-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {isCollapsedEtapa ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                        {STATUS_ETAPA_LABEL[etapa.status]}
                      </span>
                    </div>
                    {(etapa.data_inicio || etapa.data_fim) && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {etapa.data_inicio ? new Date(etapa.data_inicio + 'T12:00').toLocaleDateString('pt-BR') : '—'}
                        {' → '}
                        {etapa.data_fim ? new Date(etapa.data_fim + 'T12:00').toLocaleDateString('pt-BR') : '—'}
                      </p>
                    )}
                  </div>

                  {/* Barra de progresso da etapa */}
                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${prog}%`, background: prog >= 100 ? '#10b981' : 'var(--accent)' }} />
                    </div>
                    <span className="text-xs w-9 text-right" style={{ color: 'var(--text-secondary)' }}>{prog}%</span>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openNewSub(etapa.id)}
                      className="p-1.5 rounded text-xs hover:bg-[var(--bg-card)]"
                      style={{ color: 'var(--accent)' }}
                      title="Adicionar subetapa"
                    >
                      <Plus size={13} />
                    </button>
                    <button onClick={() => openEditEtapa(etapa)} className="p-1.5 rounded hover:bg-[var(--bg-card)]" title="Editar">
                      <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button onClick={() => deleteEtapa(etapa.id)} className="p-1.5 rounded hover:bg-red-500/10" title="Excluir">
                      <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>

                {/* ── Subetapas (nível 2) ── */}
                {!isCollapsedEtapa && subs.map(sub => {
                  const svcs = svcsDaSub(sub.id)
                  const isCollapsedSub = collapsed[sub.id] ?? false
                  return (
                    <Fragment key={sub.id}>
                      <div
                        className="flex items-center gap-2 pl-10 pr-4 py-2.5 group hover:bg-[var(--bg-secondary)] transition-colors"
                        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
                      >
                        <button
                          onClick={() => toggle(sub.id)}
                          className="p-1 rounded flex-shrink-0"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {isCollapsedSub ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sub.nome}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[sub.status]}`}>
                              {STATUS_ETAPA_LABEL[sub.status]}
                            </span>
                          </div>
                          {(sub.data_inicio || sub.data_fim) && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              {sub.data_inicio ? new Date(sub.data_inicio + 'T12:00').toLocaleDateString('pt-BR') : '—'}
                              {' → '}
                              {sub.data_fim ? new Date(sub.data_fim + 'T12:00').toLocaleDateString('pt-BR') : '—'}
                            </p>
                          )}
                        </div>

                        {/* % inline editável */}
                        <PctInput
                          value={sub.percentual_executado}
                          onChange={v => updatePct('subetapas_cronograma', sub.id, v)}
                        />

                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openNewSvc(sub.id)} className="p-1.5 rounded" style={{ color: 'var(--accent)' }} title="Adicionar serviço">
                            <Plus size={12} />
                          </button>
                          <button onClick={() => openEditSub(sub)} className="p-1.5 rounded">
                            <Pencil size={12} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button onClick={() => deleteSub(sub)} className="p-1.5 rounded hover:bg-red-500/10">
                            <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>
                      </div>

                      {/* ── Serviços (nível 3) ── */}
                      {!isCollapsedSub && svcs.map(svc => (
                        <div
                          key={svc.id}
                          className="flex items-center gap-2 pl-16 pr-4 py-2 group hover:bg-[var(--bg-card)] transition-colors"
                          style={{ borderBottom: '1px solid var(--border)' }}
                        >
                          <Check size={12} className="flex-shrink-0" style={{ color: svc.percentual_executado >= 100 ? '#10b981' : 'var(--border)' }} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>{svc.nome}</span>
                            {(svc.data_inicio || svc.data_fim || svc.responsavel) && (
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                {svc.data_inicio ? new Date(svc.data_inicio + 'T12:00').toLocaleDateString('pt-BR') : ''}
                                {svc.data_inicio && svc.data_fim ? ' → ' : ''}
                                {svc.data_fim ? new Date(svc.data_fim + 'T12:00').toLocaleDateString('pt-BR') : ''}
                                {svc.responsavel ? `  · ${svc.responsavel}` : ''}
                              </p>
                            )}
                          </div>

                          <PctInput
                            value={svc.percentual_executado}
                            onChange={v => updatePct('servicos_cronograma', svc.id, v)}
                            small
                          />

                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditSvc(svc)} className="p-1 rounded">
                              <Pencil size={11} style={{ color: 'var(--text-secondary)' }} />
                            </button>
                            <button onClick={() => deleteSvc(svc.id)} className="p-1 rounded hover:bg-red-500/10">
                              <Trash2 size={11} style={{ color: 'var(--danger)' }} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Adicionar serviço inline */}
                      {!isCollapsedSub && (
                        <div
                          className="pl-16 pr-4 py-1.5"
                          style={{ borderBottom: '1px solid var(--border)', background: 'transparent' }}
                        >
                          <button
                            onClick={() => openNewSvc(sub.id)}
                            className="text-xs opacity-40 hover:opacity-70 transition-opacity"
                            style={{ color: 'var(--accent)' }}
                          >
                            + Serviço
                          </button>
                        </div>
                      )}
                    </Fragment>
                  )
                })}

                {/* Adicionar subetapa inline */}
                {!isCollapsedEtapa && (
                  <div
                    className="pl-10 pr-4 py-1.5"
                    style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
                  >
                    <button
                      onClick={() => openNewSub(etapa.id)}
                      className="text-xs opacity-40 hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                    >
                      + Subetapa
                    </button>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      ) : (
        /* ────────────────────────────────────────────────────────────────────
           ABA: GANTT
        ──────────────────────────────────────────────────────────────────── */
        <CronogramaGantt
          etapas={etapas}
          subetapas={subetapas}
        />
      )}

      {/* ── Modal Etapa ── */}
      <Modal
        open={etapaModal.open}
        onClose={() => setEtapaModal({ open: false, editando: null })}
        title={etapaModal.editando ? 'Editar Etapa' : 'Nova Etapa'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input label="Nome *" value={etapaForm.nome} onChange={e => setEtapaForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Fundação, Estrutura..." autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="date" value={etapaForm.data_inicio} onChange={e => setEtapaForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Término" type="date" value={etapaForm.data_fim} onChange={e => setEtapaForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <Select label="Status" value={etapaForm.status} onChange={e => setEtapaForm(f => ({ ...f, status: e.target.value as Etapa['status'] }))}>
            <option value="planejada">A executar</option>
            <option value="em_andamento">Em execução</option>
            <option value="concluida">Concluída</option>
            <option value="atrasada">Ponto de atenção</option>
          </Select>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>% Executado</label>
            <input type="number" min={0} max={100} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              value={etapaForm.percentual_executado}
              onChange={e => setEtapaForm(f => ({ ...f, percentual_executado: Math.min(100, Math.max(0, Number(e.target.value))) }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEtapaModal({ open: false, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!etapaForm.nome} onClick={saveEtapa}>
              {etapaModal.editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Subetapa ── */}
      <Modal
        open={subModal.open}
        onClose={() => setSubModal({ open: false, etapaId: null, editando: null })}
        title={subModal.editando ? 'Editar Subetapa' : 'Nova Subetapa'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input label="Nome *" value={subForm.nome} onChange={e => setSubForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Escavação, Forma, Concretagem..." autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="date" value={subForm.data_inicio} onChange={e => setSubForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Término" type="date" value={subForm.data_fim} onChange={e => setSubForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <Select label="Status" value={subForm.status} onChange={e => setSubForm(f => ({ ...f, status: e.target.value as SubetapaCronograma['status'] }))}>
            <option value="planejada">A executar</option>
            <option value="em_andamento">Em execução</option>
            <option value="concluida">Concluída</option>
            <option value="atrasada">Ponto de atenção</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>% Executado</label>
              <input type="number" min={0} max={100} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={subForm.percentual_executado}
                onChange={e => setSubForm(f => ({ ...f, percentual_executado: Math.min(100, Math.max(0, Number(e.target.value))) }))}
              />
            </div>
            <Input label="Responsável" value={subForm.responsavel} onChange={e => setSubForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Nome ou equipe" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSubModal({ open: false, etapaId: null, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!subForm.nome} onClick={saveSub}>
              {subModal.editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Serviço ── */}
      <Modal
        open={svcModal.open}
        onClose={() => setSvcModal({ open: false, subetapaId: null, editando: null })}
        title={svcModal.editando ? 'Editar Serviço' : 'Novo Serviço'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input label="Nome *" value={svcForm.nome} onChange={e => setSvcForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Instalação elétrica sala..." autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="date" value={svcForm.data_inicio} onChange={e => setSvcForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Término" type="date" value={svcForm.data_fim} onChange={e => setSvcForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>% Executado</label>
              <input type="number" min={0} max={100} className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                value={svcForm.percentual_executado}
                onChange={e => setSvcForm(f => ({ ...f, percentual_executado: Math.min(100, Math.max(0, Number(e.target.value))) }))}
              />
            </div>
            <Input label="Responsável" value={svcForm.responsavel} onChange={e => setSvcForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Nome ou equipe" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSvcModal({ open: false, subetapaId: null, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!svcForm.nome} onClick={saveSvc}>
              {svcModal.editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Componente inline de porcentagem ─────────────────────────────────────────
function PctInput({ value, onChange, small = false }: { value: number; onChange: (v: number) => void; small?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))

  function commit() {
    const n = Math.min(100, Math.max(0, Number(val) || 0))
    onChange(n)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0} max={100}
        className="w-14 text-center rounded border px-1 py-0.5 text-xs outline-none"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  return (
    <button
      onClick={() => { setVal(String(value)); setEditing(true) }}
      className="flex-shrink-0 text-right"
      title="Clique para editar %"
      style={{ minWidth: small ? 36 : 44 }}
    >
      <span className="text-xs font-medium" style={{ color: value >= 100 ? '#10b981' : 'var(--accent)' }}>{value}%</span>
    </button>
  )
}
