'use client'

import { Fragment, useEffect, useState } from 'react'
import {
  Plus, Calendar, Pencil, Trash2, ChevronDown, ChevronRight,
  LayoutList, BarChart2, KanbanSquare, Check, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, SubetapaCronograma, ServicoCronograma } from '@/lib/types'
import { STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

type Tab = 'kanban' | 'cascata' | 'gantt'

type EtapaForm = { nome: string; data_inicio: string; data_fim: string; status: Etapa['status']; percentual_executado: number }
type SubForm   = { nome: string; data_inicio: string; data_fim: string; status: SubetapaCronograma['status']; percentual_executado: number; responsavel: string }
type SvcForm   = { nome: string; data_inicio: string; data_fim: string; percentual_executado: number; responsavel: string }

type EditField = { id: string; table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma'; field: 'data_inicio' | 'data_fim' } | null

const EMPTY_ETAPA: EtapaForm = { nome: '', data_inicio: '', data_fim: '', status: 'planejada', percentual_executado: 0 }
const EMPTY_SUB   = (responsavel = ''): SubForm => ({ nome: '', data_inicio: '', data_fim: '', status: 'planejada', percentual_executado: 0, responsavel })
const EMPTY_SVC   = (responsavel = ''): SvcForm => ({ nome: '', data_inicio: '', data_fim: '', percentual_executado: 0, responsavel })

const fmtBR = (v: string | null | undefined) => {
  if (!v) return null
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${String(y).slice(2)}`
}

export function ObraCronograma({ obraId, projetoId }: { obraId?: string; projetoId?: string }) {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('kanban')
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaCronograma[]>([])
  const [servicos, setServicos] = useState<ServicoCronograma[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editField, setEditField] = useState<EditField>(null)
  const [empreiteiro, setEmpreiteiro] = useState('')

  const [etapaModal, setEtapaModal] = useState<{ open: boolean; editando: Etapa | null }>({ open: false, editando: null })
  const [subModal,   setSubModal]   = useState<{ open: boolean; etapaId: string | null; editando: SubetapaCronograma | null }>({ open: false, etapaId: null, editando: null })
  const [svcModal,   setSvcModal]   = useState<{ open: boolean; subetapaId: string | null; editando: ServicoCronograma | null }>({ open: false, subetapaId: null, editando: null })

  const [etapaForm, setEtapaForm] = useState<EtapaForm>(EMPTY_ETAPA)
  const [subForm,   setSubForm]   = useState<SubForm>(EMPTY_SUB())
  const [svcForm,   setSvcForm]   = useState<SvcForm>(EMPTY_SVC())
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadData() }, [obraId, projetoId])

  useEffect(() => {
    if (!obraId) return
    supabase.from('obras').select('responsavel').eq('id', obraId).single()
      .then(({ data }: { data: { responsavel: string | null } | null }) => { if (data?.responsavel) setEmpreiteiro(data.responsavel) })
  }, [obraId])

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
        .from('subetapas_cronograma').select('*').in('etapa_id', etapaIds).order('ordem')
      subsData = (subs ?? []) as SubetapaCronograma[]
      const subIds = subsData.map(s => s.id)
      if (subIds.length > 0) {
        const { data: svcs } = await supabase
          .from('servicos_cronograma').select('*').in('subetapa_id', subIds).order('ordem')
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

  // ── Atualização inline de datas ───────────────────────────────────────────────

  async function updateDateInline(
    table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma',
    id: string,
    field: 'data_inicio' | 'data_fim',
    value: string
  ) {
    const val = value || null
    if (table === 'etapas') setEtapas(prev => prev.map(e => e.id === id ? { ...e, [field]: val } : e))
    if (table === 'subetapas_cronograma') setSubetapas(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s))
    if (table === 'servicos_cronograma') setServicos(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s))
    await supabase.from(table).update({ [field]: val }).eq('id', id)
    setEditField(null)
  }

  async function updateStatus(
    table: 'etapas' | 'subetapas_cronograma',
    id: string,
    status: string
  ) {
    if (table === 'etapas') setEtapas(prev => prev.map(e => e.id === id ? { ...e, status: status as Etapa['status'] } : e))
    if (table === 'subetapas_cronograma') setSubetapas(prev => prev.map(s => s.id === id ? { ...s, status: status as SubetapaCronograma['status'] } : s))
    await supabase.from(table).update({ status }).eq('id', id)
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
    const subIds = subsDaEtapa(id).map(s => s.id)
    setEtapas(prev => prev.filter(e => e.id !== id))
    setSubetapas(prev => prev.filter(s => s.etapa_id !== id))
    setServicos(prev => prev.filter(s => !subIds.includes(s.subetapa_id)))
  }

  // ── CRUD Subetapa ─────────────────────────────────────────────────────────────

  function openNewSub(etapaId: string) {
    setSubForm(EMPTY_SUB(empreiteiro))
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
    const subIds = [sub.id]
    await supabase.from('subetapas_cronograma').delete().eq('id', sub.id)
    setSubetapas(prev => prev.filter(s => s.id !== sub.id))
    setServicos(prev => prev.filter(s => !subIds.includes(s.subetapa_id)))
  }

  // ── CRUD Serviço ──────────────────────────────────────────────────────────────

  function openNewSvc(subetapaId: string) {
    setSvcForm(EMPTY_SVC(empreiteiro))
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
          {([
            { key: 'kanban',  label: 'Kanban',  icon: KanbanSquare },
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
      ) : tab === 'kanban' ? (
        <KanbanObraView
          etapas={etapas}
          subetapas={subetapas}
          servicos={servicos}
          onUpdateStatus={updateStatus}
          onUpdatePct={updatePct}
          onEditSub={openEditSub}
          onEditEtapa={openEditEtapa}
          onNewSub={openNewSub}
          editField={editField}
          onSetEditField={setEditField}
          onUpdateDate={updateDateInline}
        />
      ) : tab === 'cascata' ? (
        /* ── CASCATA ── */
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
                    <div className="flex items-center gap-1 mt-0.5">
                      <DateCell
                        value={etapa.data_inicio}
                        isEditing={editField?.id === etapa.id && editField.field === 'data_inicio'}
                        onStartEdit={() => setEditField({ id: etapa.id, table: 'etapas', field: 'data_inicio' })}
                        onCommit={v => updateDateInline('etapas', etapa.id, 'data_inicio', v)}
                      />
                      <span className="text-[10px] opacity-30" style={{ color: 'var(--text-secondary)' }}>→</span>
                      <DateCell
                        value={etapa.data_fim}
                        isEditing={editField?.id === etapa.id && editField.field === 'data_fim'}
                        onStartEdit={() => setEditField({ id: etapa.id, table: 'etapas', field: 'data_fim' })}
                        onCommit={v => updateDateInline('etapas', etapa.id, 'data_fim', v)}
                      />
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${prog}%`, background: prog >= 100 ? '#10b981' : 'var(--accent)' }} />
                    </div>
                    <PctInput value={prog} onChange={v => updatePct('etapas', etapa.id, v)} />
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openNewSub(etapa.id)} className="p-1.5 rounded text-xs hover:bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }} title="Adicionar subetapa">
                      <Plus size={13} />
                    </button>
                    <button onClick={() => openEditEtapa(etapa)} className="p-1.5 rounded hover:bg-[var(--bg-card)]">
                      <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button onClick={() => deleteEtapa(etapa.id)} className="p-1.5 rounded hover:bg-red-500/10">
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
                        <button onClick={() => toggle(sub.id)} className="p-1 rounded flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                          {isCollapsedSub ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sub.nome}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[sub.status]}`}>
                              {STATUS_ETAPA_LABEL[sub.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <DateCell
                              value={sub.data_inicio}
                              isEditing={editField?.id === sub.id && editField.field === 'data_inicio'}
                              onStartEdit={() => setEditField({ id: sub.id, table: 'subetapas_cronograma', field: 'data_inicio' })}
                              onCommit={v => updateDateInline('subetapas_cronograma', sub.id, 'data_inicio', v)}
                            />
                            <span className="text-[10px] opacity-30" style={{ color: 'var(--text-secondary)' }}>→</span>
                            <DateCell
                              value={sub.data_fim}
                              isEditing={editField?.id === sub.id && editField.field === 'data_fim'}
                              onStartEdit={() => setEditField({ id: sub.id, table: 'subetapas_cronograma', field: 'data_fim' })}
                              onCommit={v => updateDateInline('subetapas_cronograma', sub.id, 'data_fim', v)}
                            />
                            {sub.responsavel && (
                              <span className="text-[10px] ml-2 opacity-60" style={{ color: 'var(--text-secondary)' }}>· {sub.responsavel}</span>
                            )}
                          </div>
                        </div>

                        <PctInput value={sub.percentual_executado} onChange={v => updatePct('subetapas_cronograma', sub.id, v)} />

                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openNewSvc(sub.id)} className="p-1.5 rounded" style={{ color: 'var(--accent)' }}>
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
                            <div className="flex items-center gap-1 mt-0.5">
                              <DateCell
                                value={svc.data_inicio}
                                isEditing={editField?.id === svc.id && editField.field === 'data_inicio'}
                                onStartEdit={() => setEditField({ id: svc.id, table: 'servicos_cronograma', field: 'data_inicio' })}
                                onCommit={v => updateDateInline('servicos_cronograma', svc.id, 'data_inicio', v)}
                              />
                              <span className="text-[10px] opacity-30" style={{ color: 'var(--text-secondary)' }}>→</span>
                              <DateCell
                                value={svc.data_fim}
                                isEditing={editField?.id === svc.id && editField.field === 'data_fim'}
                                onStartEdit={() => setEditField({ id: svc.id, table: 'servicos_cronograma', field: 'data_fim' })}
                                onCommit={v => updateDateInline('servicos_cronograma', svc.id, 'data_fim', v)}
                              />
                              {svc.responsavel && (
                                <span className="text-[10px] ml-1 opacity-60" style={{ color: 'var(--text-secondary)' }}>· {svc.responsavel}</span>
                              )}
                            </div>
                          </div>

                          <PctInput value={svc.percentual_executado} onChange={v => updatePct('servicos_cronograma', svc.id, v)} small />

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

                      {!isCollapsedSub && (
                        <div className="pl-16 pr-4 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                          <button onClick={() => openNewSvc(sub.id)} className="text-xs opacity-40 hover:opacity-70 transition-opacity" style={{ color: 'var(--accent)' }}>
                            + Serviço
                          </button>
                        </div>
                      )}
                    </Fragment>
                  )
                })}

                {!isCollapsedEtapa && (
                  <div className="pl-10 pr-4 py-1.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <button onClick={() => openNewSub(etapa.id)} className="text-xs opacity-40 hover:opacity-70 transition-opacity" style={{ color: 'var(--accent)' }}>
                      + Subetapa
                    </button>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      ) : (
        /* ── GANTT ── */
        <ObraGanttView
          etapas={etapas}
          subetapas={subetapas}
          servicos={servicos}
          onUpdateDate={updateDateInline}
          onUpdatePct={updatePct}
        />
      )}

      {/* ── Modal Etapa ── */}
      <Modal open={etapaModal.open} onClose={() => setEtapaModal({ open: false, editando: null })} title={etapaModal.editando ? 'Editar Etapa' : 'Nova Etapa'} size="md">
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
            <input type="number" min={0} max={100} className="input-base" value={etapaForm.percentual_executado}
              onChange={e => setEtapaForm(f => ({ ...f, percentual_executado: Math.min(100, Math.max(0, Number(e.target.value))) }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEtapaModal({ open: false, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!etapaForm.nome} onClick={saveEtapa}>{etapaModal.editando ? 'Salvar' : 'Adicionar'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Subetapa ── */}
      <Modal open={subModal.open} onClose={() => setSubModal({ open: false, etapaId: null, editando: null })} title={subModal.editando ? 'Editar Subetapa' : 'Nova Subetapa'} size="md">
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
              <input type="number" min={0} max={100} className="input-base" value={subForm.percentual_executado}
                onChange={e => setSubForm(f => ({ ...f, percentual_executado: Math.min(100, Math.max(0, Number(e.target.value))) }))} />
            </div>
            <Input label="Responsável" value={subForm.responsavel} onChange={e => setSubForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Empreiteiro ou equipe" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSubModal({ open: false, etapaId: null, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!subForm.nome} onClick={saveSub}>{subModal.editando ? 'Salvar' : 'Adicionar'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal Serviço ── */}
      <Modal open={svcModal.open} onClose={() => setSvcModal({ open: false, subetapaId: null, editando: null })} title={svcModal.editando ? 'Editar Serviço' : 'Novo Serviço'} size="md">
        <div className="flex flex-col gap-4">
          <Input label="Nome *" value={svcForm.nome} onChange={e => setSvcForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Instalação elétrica sala..." autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="date" value={svcForm.data_inicio} onChange={e => setSvcForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Término" type="date" value={svcForm.data_fim} onChange={e => setSvcForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>% Executado</label>
              <input type="number" min={0} max={100} className="input-base" value={svcForm.percentual_executado}
                onChange={e => setSvcForm(f => ({ ...f, percentual_executado: Math.min(100, Math.max(0, Number(e.target.value))) }))} />
            </div>
            <Input label="Responsável" value={svcForm.responsavel} onChange={e => setSvcForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Empreiteiro ou equipe" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSvcModal({ open: false, subetapaId: null, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!svcForm.nome} onClick={saveSvc}>{svcModal.editando ? 'Salvar' : 'Adicionar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── DateCell: clique para editar data inline ──────────────────────────────────
function DateCell({ value, isEditing, onStartEdit, onCommit }: {
  value: string | null | undefined
  isEditing: boolean
  onStartEdit: () => void
  onCommit: (v: string) => void
}) {
  if (isEditing) {
    return (
      <input
        type="date"
        autoFocus
        className="rounded border px-1 py-0.5 outline-none"
        style={{ fontSize: 11, background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
        defaultValue={value ?? ''}
        onBlur={e => onCommit(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') onCommit(value ?? '')
        }}
      />
    )
  }
  return (
    <button
      onClick={onStartEdit}
      className="rounded px-1 py-0.5 hover:bg-[var(--bg-card)] transition-colors"
      title="Clique para editar data"
      style={{ fontSize: 11, color: 'var(--text-secondary)' }}
    >
      {value ? fmtBR(value) : <span style={{ opacity: 0.3 }}>—</span>}
    </button>
  )
}

// ── PctInput: % editável inline ───────────────────────────────────────────────
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
      <input autoFocus type="number" min={0} max={100}
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
    <button onClick={() => { setVal(String(value)); setEditing(true) }} className="flex-shrink-0 text-right" title="Clique para editar %" style={{ minWidth: small ? 36 : 44 }}>
      <span className="text-xs font-medium" style={{ color: value >= 100 ? '#10b981' : 'var(--accent)' }}>{value}%</span>
    </button>
  )
}

// ── KanbanObraView ────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { key: 'planejada',    label: 'A executar',    color: '#6B7280', bg: 'rgba(107,114,128,0.1)', Icon: Clock },
  { key: 'em_andamento', label: 'Em execução',   color: '#3B7BF8', bg: 'rgba(59,123,248,0.1)',  Icon: BarChart2 },
  { key: 'atrasada',     label: 'Atenção',        color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', Icon: AlertTriangle },
  { key: 'concluida',    label: 'Concluída',      color: '#10B981', bg: 'rgba(16,185,129,0.1)', Icon: CheckCircle2 },
] as const

type KStatus = typeof KANBAN_COLS[number]['key']

function KanbanObraView({ etapas, subetapas, servicos, onUpdateStatus, onUpdatePct, onEditSub, onEditEtapa, onNewSub, editField, onSetEditField, onUpdateDate }: {
  etapas: Etapa[]
  subetapas: SubetapaCronograma[]
  servicos: ServicoCronograma[]
  onUpdateStatus: (table: 'etapas' | 'subetapas_cronograma', id: string, status: string) => void
  onUpdatePct: (table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma', id: string, pct: number) => void
  onEditSub: (sub: SubetapaCronograma) => void
  onEditEtapa: (etapa: Etapa) => void
  onNewSub: (etapaId: string) => void
  editField: EditField
  onSetEditField: (f: EditField) => void
  onUpdateDate: (table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma', id: string, field: 'data_inicio' | 'data_fim', value: string) => void
}) {
  // Agrupar subetapas por status; etapas sem subetapas também aparecem
  const byStatus: Record<KStatus, { type: 'etapa'; item: Etapa; subsCount: number }[] | { type: 'sub'; item: SubetapaCronograma; etapaNome: string }[]> = {
    planejada: [], em_andamento: [], atrasada: [], concluida: [],
  }

  // Mapa de nome das etapas
  const etapaNome: Record<string, string> = {}
  etapas.forEach(e => { etapaNome[e.id] = e.nome })

  // Subetapas como cards principais
  subetapas.forEach(sub => {
    const st = (sub.status as KStatus) ?? 'planejada'
    ;(byStatus[st] as { type: 'sub'; item: SubetapaCronograma; etapaNome: string }[]).push({
      type: 'sub', item: sub, etapaNome: etapaNome[sub.etapa_id] ?? '',
    })
  })

  // Etapas sem subetapas também como cards
  etapas.forEach(etapa => {
    const hasSubs = subetapas.some(s => s.etapa_id === etapa.id)
    if (!hasSubs) {
      const st = (etapa.status as KStatus) ?? 'planejada'
      const subsCount = subetapas.filter(s => s.etapa_id === etapa.id).length
      ;(byStatus[st] as { type: 'etapa'; item: Etapa; subsCount: number }[]).push({
        type: 'etapa', item: etapa, subsCount,
      })
    }
  })

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
      {KANBAN_COLS.map(col => {
        const cards = byStatus[col.key] as ({ type: 'etapa'; item: Etapa; subsCount: number } | { type: 'sub'; item: SubetapaCronograma; etapaNome: string })[]
        return (
          <div key={col.key} className="flex flex-col gap-2 min-h-[120px] min-w-[78vw] max-w-[78vw] snap-start sm:min-w-0 sm:max-w-none">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: col.bg }}>
              <div className="flex items-center gap-1.5">
                <col.Icon size={13} style={{ color: col.color }} />
                <span className="text-xs font-semibold" style={{ color: col.color }}>{col.label}</span>
              </div>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full" style={{ background: col.color, color: '#fff' }}>
                {cards.length}
              </span>
            </div>

            {/* Cards */}
            {cards.map(c => {
              if (c.type === 'etapa') {
                const etapa = c.item
                const prog = etapa.percentual_executado ?? 0
                return (
                  <div key={etapa.id} className="card p-3 flex flex-col gap-2 hover:shadow-md transition-shadow">
                    <span className="text-[10px] px-1.5 py-0.5 rounded w-fit font-medium" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>Etapa</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
                    <div className="flex items-center gap-1">
                      <DateCell
                        value={etapa.data_inicio}
                        isEditing={editField?.id === etapa.id && editField.field === 'data_inicio'}
                        onStartEdit={() => onSetEditField({ id: etapa.id, table: 'etapas', field: 'data_inicio' })}
                        onCommit={v => onUpdateDate('etapas', etapa.id, 'data_inicio', v)}
                      />
                      <span className="text-[10px] opacity-30" style={{ color: 'var(--text-secondary)' }}>→</span>
                      <DateCell
                        value={etapa.data_fim}
                        isEditing={editField?.id === etapa.id && editField.field === 'data_fim'}
                        onStartEdit={() => onSetEditField({ id: etapa.id, table: 'etapas', field: 'data_fim' })}
                        onCommit={v => onUpdateDate('etapas', etapa.id, 'data_fim', v)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${prog}%`, background: prog >= 100 ? '#10b981' : 'var(--accent)' }} />
                      </div>
                      <PctInput value={prog} onChange={v => onUpdatePct('etapas', etapa.id, v)} small />
                    </div>
                    <StatusButtons current={etapa.status as KStatus} onMove={s => onUpdateStatus('etapas', etapa.id, s)} />
                    <div className="flex gap-1 pt-0.5 border-t" style={{ borderColor: 'var(--border)' }}>
                      <button onClick={() => onEditEtapa(etapa)} className="text-[10px] opacity-50 hover:opacity-100 flex items-center gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                        <Pencil size={9} /> Editar
                      </button>
                      <span className="opacity-20" style={{ color: 'var(--border)' }}>·</span>
                      <button onClick={() => onNewSub(etapa.id)} className="text-[10px] opacity-50 hover:opacity-100 flex items-center gap-0.5" style={{ color: 'var(--accent)' }}>
                        <Plus size={9} /> Subetapa
                      </button>
                    </div>
                  </div>
                )
              }

              const sub = c.item
              const prog = sub.percentual_executado
              return (
                <div key={sub.id} className="card p-3 flex flex-col gap-2 hover:shadow-md transition-shadow">
                  {c.etapaNome && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded w-fit" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
                      {c.etapaNome}
                    </span>
                  )}
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sub.nome}</span>
                  <div className="flex items-center gap-1">
                    <DateCell
                      value={sub.data_inicio}
                      isEditing={editField?.id === sub.id && editField.field === 'data_inicio'}
                      onStartEdit={() => onSetEditField({ id: sub.id, table: 'subetapas_cronograma', field: 'data_inicio' })}
                      onCommit={v => onUpdateDate('subetapas_cronograma', sub.id, 'data_inicio', v)}
                    />
                    <span className="text-[10px] opacity-30" style={{ color: 'var(--text-secondary)' }}>→</span>
                    <DateCell
                      value={sub.data_fim}
                      isEditing={editField?.id === sub.id && editField.field === 'data_fim'}
                      onStartEdit={() => onSetEditField({ id: sub.id, table: 'subetapas_cronograma', field: 'data_fim' })}
                      onCommit={v => onUpdateDate('subetapas_cronograma', sub.id, 'data_fim', v)}
                    />
                  </div>
                  {sub.responsavel && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>👷 {sub.responsavel}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${prog}%`, background: prog >= 100 ? '#10b981' : 'var(--accent)' }} />
                    </div>
                    <PctInput value={prog} onChange={v => onUpdatePct('subetapas_cronograma', sub.id, v)} small />
                  </div>
                  <StatusButtons current={sub.status as KStatus} onMove={s => onUpdateStatus('subetapas_cronograma', sub.id, s)} />
                  <button onClick={() => onEditSub(sub)} className="text-[10px] opacity-50 hover:opacity-100 flex items-center gap-0.5 pt-0.5 border-t" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                    <Pencil size={9} /> Editar
                  </button>
                </div>
              )
            })}

            {cards.length === 0 && (
              <div className="flex-1 rounded-lg border-2 border-dashed flex items-center justify-center py-6" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs opacity-30" style={{ color: 'var(--text-secondary)' }}>vazio</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusButtons({ current, onMove }: { current: KStatus; onMove: (s: KStatus) => void }) {
  const opts = KANBAN_COLS.filter(c => c.key !== current).slice(0, 2)
  return (
    <div className="flex gap-1.5 flex-wrap border-t pt-2" style={{ borderColor: 'var(--border)' }}>
      {opts.map(opt => (
        <button
          key={opt.key}
          onClick={() => onMove(opt.key)}
          className="text-[11px] sm:text-[9px] px-2 py-1.5 sm:px-1.5 sm:py-0.5 rounded border transition-colors hover:opacity-80 flex-1 sm:flex-none text-center"
          style={{ borderColor: opt.color + '55', color: opt.color }}
        >
          → {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Gantt no padrão do Gantt de projetos ─────────────────────────────────────
type ObraGanttTable = 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma'
type ObraGanttNode = {
  id: string
  nome: string
  table: ObraGanttTable
  nivel: 1 | 2 | 3
  data_inicio: string | null
  data_fim: string | null
  percentual_executado: number
  status?: Etapa['status'] | SubetapaCronograma['status']
  responsavel?: string | null
  children: ObraGanttNode[]
}

type GanttEff = { inicio: string | null; fim: string | null; pct: number }

const GANTT_ROW_H = 52
const GANTT_HDR_H = 48
const GANTT_LEFT_W = 250
const GANTT_PAD_DAYS = 10
const GANTT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const GANTT_COLORS = ['#3B7BF8', '#8B5CF6', '#10B981', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16', '#F97316']

function addDaysCrono(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function daysBetweenCrono(a: Date, b: Date) { return Math.round((a.getTime() - b.getTime()) / 86400000) }
function startOfMonthCrono(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function fmtGanttDate(v: string | null | undefined) { return fmtBR(v) ?? '--' }

function buildObraGanttTree(etapas: Etapa[], subetapas: SubetapaCronograma[], servicos: ServicoCronograma[]) {
  return etapas.map(etapa => {
    const subs = subetapas
      .filter(sub => sub.etapa_id === etapa.id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(sub => ({
        id: sub.id,
        nome: sub.nome,
        table: 'subetapas_cronograma' as const,
        nivel: 2 as const,
        data_inicio: sub.data_inicio,
        data_fim: sub.data_fim,
        percentual_executado: sub.percentual_executado ?? 0,
        status: sub.status,
        responsavel: sub.responsavel,
        children: servicos
          .filter(svc => svc.subetapa_id === sub.id)
          .sort((a, b) => a.ordem - b.ordem)
          .map(svc => ({
            id: svc.id,
            nome: svc.nome,
            table: 'servicos_cronograma' as const,
            nivel: 3 as const,
            data_inicio: svc.data_inicio,
            data_fim: svc.data_fim,
            percentual_executado: svc.percentual_executado ?? 0,
            responsavel: svc.responsavel,
            children: [],
          })),
      }))

    return {
      id: etapa.id,
      nome: etapa.nome,
      table: 'etapas' as const,
      nivel: 1 as const,
      data_inicio: etapa.data_inicio,
      data_fim: etapa.data_fim,
      percentual_executado: etapa.percentual_executado ?? 0,
      status: etapa.status,
      children: subs,
    }
  })
}

function rollupObraGantt(node: ObraGanttNode, map: Map<string, GanttEff>): GanttEff {
  if (node.children.length === 0) {
    const eff = { inicio: node.data_inicio, fim: node.data_fim, pct: node.percentual_executado ?? 0 }
    map.set(node.id, eff)
    return eff
  }

  const childEffs = node.children.map(child => rollupObraGantt(child, map))
  const inicios = childEffs.map(e => e.inicio).filter(Boolean) as string[]
  const fims = childEffs.map(e => e.fim).filter(Boolean) as string[]
  const pct = childEffs.length
    ? Math.round(childEffs.reduce((sum, e) => sum + e.pct, 0) / childEffs.length)
    : node.percentual_executado ?? 0
  const eff = {
    inicio: inicios.length ? inicios.reduce((a, b) => (a < b ? a : b)) : node.data_inicio,
    fim: fims.length ? fims.reduce((a, b) => (a > b ? a : b)) : node.data_fim,
    pct,
  }
  map.set(node.id, eff)
  return eff
}

function ObraGanttView({
  etapas,
  subetapas,
  servicos,
  onUpdateDate,
  onUpdatePct,
}: {
  etapas: Etapa[]
  subetapas: SubetapaCronograma[]
  servicos: ServicoCronograma[]
  onUpdateDate: (table: ObraGanttTable, id: string, field: 'data_inicio' | 'data_fim', value: string) => void
  onUpdatePct: (table: ObraGanttTable, id: string, pct: number) => void
}) {
  const tree = buildObraGanttTree(etapas, subetapas, servicos)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(tree.flatMap(etapa => [etapa.id, ...etapa.children.map(sub => sub.id)]))
  )
  const today = new Date()

  const effMap = new Map<string, GanttEff>()
  tree.forEach(node => rollupObraGantt(node, effMap))

  const rootEffs = tree.map(node => effMap.get(node.id)).filter(Boolean) as GanttEff[]
  const totalInicios = rootEffs.map(e => e.inicio).filter((v): v is string => Boolean(v))
  const totalFims = rootEffs.map(e => e.fim).filter((v): v is string => Boolean(v))
  const totalInicio = totalInicios.reduce<string | null>((acc, v) => !acc || v < acc ? v : acc, null)
  const totalFim = totalFims.reduce<string | null>((acc, v) => !acc || v > acc ? v : acc, null)
  const totalPct = rootEffs.length ? Math.round(rootEffs.reduce((sum, e) => sum + e.pct, 0) / rootEffs.length) : 0

  const allDates = [
    ...etapas.flatMap(e => [e.data_inicio, e.data_fim]),
    ...subetapas.flatMap(s => [s.data_inicio, s.data_fim]),
    ...servicos.flatMap(s => [s.data_inicio, s.data_fim]),
  ].filter(Boolean) as string[]

  if (allDates.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <p className="text-sm font-medium">Nenhum periodo definido</p>
        <p className="text-xs mt-1 opacity-60">Defina inicio e fim nas etapas para visualizar o Gantt.</p>
      </div>
    )
  }

  const dates = allDates.map(d => new Date(`${d}T12:00:00`))
  const minDate = addDaysCrono(new Date(Math.min(...dates.map(d => d.getTime()))), -GANTT_PAD_DAYS)
  const maxDate = addDaysCrono(new Date(Math.max(...dates.map(d => d.getTime()))), GANTT_PAD_DAYS)
  const totalDays = Math.max(1, daysBetweenCrono(maxDate, minDate))
  const pxPerDay = 18
  const timelineW = Math.max(totalDays * pxPerDay, 460)
  const ganttW = GANTT_LEFT_W + timelineW
  const todayX = daysBetweenCrono(today, minDate) * pxPerDay

  const nodeColorMap = new Map<string, string>()
  tree.forEach((etapa, idx) => {
    const color = GANTT_COLORS[idx % GANTT_COLORS.length]
    function assign(node: ObraGanttNode) {
      nodeColorMap.set(node.id, color)
      node.children.forEach(assign)
    }
    assign(etapa)
  })

  function visibleRows(nodes: ObraGanttNode[], depth = 0): { node: ObraGanttNode; depth: number; eff: GanttEff }[] {
    return nodes.flatMap(node => {
      const own = [{ node, depth, eff: effMap.get(node.id) ?? { inicio: node.data_inicio, fim: node.data_fim, pct: node.percentual_executado ?? 0 } }]
      return collapsed.has(node.id) ? own : [...own, ...visibleRows(node.children, depth + 1)]
    })
  }

  const rows = [
    { id: '__total__', nome: 'Obra (total)', depth: 0, isTotal: true, node: null as ObraGanttNode | null, inicio: totalInicio, fim: totalFim, pct: totalPct, hasKids: false },
    ...visibleRows(tree).map(({ node, depth, eff }) => ({
      id: node.id,
      nome: node.nome,
      depth: depth + 1,
      isTotal: false,
      node,
      inicio: eff.inicio,
      fim: eff.fim,
      pct: eff.pct,
      hasKids: node.children.length > 0,
    })),
  ]

  const svgH = GANTT_HDR_H + rows.length * GANTT_ROW_H + 4
  const months: { label: string; x: number; w: number }[] = []
  let cursor = startOfMonthCrono(minDate)
  while (cursor <= maxDate) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    const x = Math.max(0, daysBetweenCrono(cursor, minDate) * pxPerDay)
    const w = Math.min(timelineW - x, daysBetweenCrono(next, cursor) * pxPerDay)
    if (w > 0) months.push({ label: `${GANTT_MONTHS[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`, x, w })
    cursor = next
  }

  function xOf(dateStr: string | null, fallback: Date) {
    return daysBetweenCrono(dateStr ? new Date(`${dateStr}T12:00:00`) : fallback, minDate) * pxPerDay
  }

  function toggleRow(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
        <div className="flex" style={{ width: ganttW, minWidth: ganttW }}>
          <div style={{ width: GANTT_LEFT_W, minWidth: GANTT_LEFT_W, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
            <div className="flex items-end px-3 pb-2 text-xs font-semibold" style={{ height: GANTT_HDR_H, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
              Item
            </div>
            {rows.map(row => {
              const node = row.node
              const isCollapsed = collapsed.has(row.id)
              const atrasado = !!(row.fim && row.pct < 100 && new Date(`${row.fim}T12:00:00`) < today)
              return (
                <div
                  key={row.id}
                  className="flex flex-col justify-center border-b"
                  style={{
                    height: GANTT_ROW_H,
                    paddingLeft: 8 + row.depth * 14,
                    paddingRight: 8,
                    borderColor: 'var(--border)',
                    background: row.isTotal ? 'rgba(59,123,248,0.08)' : node?.nivel === 1 ? 'rgba(59,123,248,0.04)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-1">
                    {row.hasKids && node ? (
                      <button
                        onClick={() => toggleRow(node.id)}
                        className="text-[10px] w-4 h-4 flex items-center justify-center flex-shrink-0 rounded"
                        style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
                      >
                        {isCollapsed ? '>' : 'v'}
                      </button>
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <span
                      className="text-xs truncate flex-1"
                      style={{
                        color: row.isTotal || node?.nivel === 1 ? 'var(--accent)' : 'var(--text-primary)',
                        fontWeight: row.isTotal ? 700 : node?.nivel === 1 ? 600 : 400,
                      }}
                      title={row.nome}
                    >
                      {row.nome}
                    </span>
                    {atrasado && <span className="text-[9px] flex-shrink-0" style={{ color: '#EF4444' }}>!</span>}
                  </div>

                  <div className="flex items-center gap-1 pl-5">
                    {!row.isTotal && node ? (
                      <>
                        <input
                          type="date"
                          value={node.data_inicio ?? ''}
                          className="text-[10px] rounded border px-1 py-0.5"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 78 }}
                          onChange={e => onUpdateDate(node.table, node.id, 'data_inicio', e.target.value)}
                        />
                        <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>-&gt;</span>
                        <input
                          type="date"
                          value={node.data_fim ?? ''}
                          className="text-[10px] rounded border px-1 py-0.5"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)', width: 78 }}
                          onChange={e => onUpdateDate(node.table, node.id, 'data_fim', e.target.value)}
                        />
                      </>
                    ) : (
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {fmtGanttDate(row.inicio)} -&gt; {fmtGanttDate(row.fim)}
                      </span>
                    )}
                    {!row.isTotal && node && (
                      <PctInput value={node.percentual_executado ?? 0} onChange={v => onUpdatePct(node.table, node.id, v)} small />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ width: timelineW, minWidth: timelineW, flexShrink: 0 }}>
            <svg width={timelineW} height={svgH} style={{ display: 'block' }}>
              {rows.map((row, idx) => (
                <rect
                  key={row.id}
                  x={0}
                  y={GANTT_HDR_H + idx * GANTT_ROW_H}
                  width={timelineW}
                  height={GANTT_ROW_H}
                  fill={row.isTotal ? 'rgba(59,123,248,0.06)' : row.node?.nivel === 1 ? 'rgba(59,123,248,0.04)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
                />
              ))}

              {months.map((m, i) => (
                <g key={i}>
                  <rect x={m.x} y={0} width={m.w} height={GANTT_HDR_H} fill={i % 2 === 0 ? 'rgba(59,123,248,0.04)' : 'transparent'} />
                  <text x={m.x + m.w / 2} y={GANTT_HDR_H / 2 + 5} textAnchor="middle" fontSize={10} fill="var(--text-secondary)" fontFamily="var(--font-sans)">{m.label}</text>
                  <line x1={m.x} y1={0} x2={m.x} y2={svgH} stroke="var(--border)" strokeWidth={0.5} />
                </g>
              ))}

              <line x1={0} y1={GANTT_HDR_H} x2={timelineW} y2={GANTT_HDR_H} stroke="var(--border)" strokeWidth={1} />

              {todayX >= 0 && todayX <= timelineW && (
                <g>
                  <line x1={todayX} y1={GANTT_HDR_H} x2={todayX} y2={svgH} stroke="#3B7BF8" strokeWidth={1.5} strokeDasharray="4 3" />
                  <rect x={todayX - 18} y={GANTT_HDR_H - 18} width={36} height={15} rx={4} fill="#3B7BF8" />
                  <text x={todayX} y={GANTT_HDR_H - 7} textAnchor="middle" fontSize={8} fill="white" fontFamily="var(--font-sans)">hoje</text>
                </g>
              )}

              {rows.map((row, idx) => {
                if (!row.inicio && !row.fim) return null
                const y = GANTT_HDR_H + idx * GANTT_ROW_H
                const barH = GANTT_ROW_H - 18
                const barY = y + 9
                const x1 = xOf(row.inicio, row.fim ? addDaysCrono(new Date(`${row.fim}T12:00:00`), -1) : today)
                const x2 = xOf(row.fim, row.inicio ? addDaysCrono(new Date(`${row.inicio}T12:00:00`), 1) : today)
                const barW = Math.max(x2 - x1, 8)
                const pct = Math.min(100, Math.max(0, row.pct ?? 0))
                const atrasado = !!(row.fim && pct < 100 && new Date(`${row.fim}T12:00:00`) < today)
                const baseColor = row.isTotal ? '#1D4ED8' : (row.node ? nodeColorMap.get(row.node.id) : '#3B7BF8') ?? '#3B7BF8'
                const color = pct >= 100 ? '#10B981' : atrasado ? '#EF4444' : baseColor
                const opacity = row.isTotal || row.node?.nivel === 1 ? 1 : row.node?.nivel === 2 ? 0.75 : 0.55

                return (
                  <g key={row.id} opacity={opacity}>
                    <rect x={x1} y={barY} width={barW} height={barH} rx={row.isTotal ? 3 : barH / 2} fill={color} />
                    {pct > 0 && pct < 100 && (
                      <rect x={x1} y={barY} width={Math.max(2, barW * pct / 100)} height={barH} rx={row.isTotal ? 3 : barH / 2} fill="rgba(0,0,0,0.25)" />
                    )}
                    {row.isTotal && barW > 90 ? (
                      <text x={x1 + barW / 2} y={barY + barH / 2 + 3.5} textAnchor="middle" fontSize={9} fill="white" fontFamily="var(--font-sans)" style={{ pointerEvents: 'none' }}>
                        {fmtGanttDate(row.inicio)} - {fmtGanttDate(row.fim)}
                      </text>
                    ) : row.fim && (
                      <text x={x2 + 4} y={barY + barH / 2 + 3.5} fontSize={8} fill={atrasado ? '#EF4444' : 'var(--text-secondary)'} fontFamily="var(--font-sans)">
                        {fmtGanttDate(row.fim)}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
