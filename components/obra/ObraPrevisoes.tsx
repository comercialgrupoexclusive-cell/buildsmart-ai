'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Pencil, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { MetricCard, StatusItemCard } from '@/components/ui/InsightCard'
import { Modal } from '@/components/ui/Modal'
import {
  CONDICAO_PAGAMENTO_LABEL, PREVISAO_ORIGEM_LABEL, PREVISAO_STATUS_LABEL, PREVISAO_TIPO_LABEL,
  previsaoPrazo, previsaoTone, type CondicaoPagamento, type ObraPrevisao, type PrevisaoOrigem,
  type PrevisaoStatus, type PrevisaoTipo,
} from '@/lib/previsoes'

type Lookup = { id: string; nome: string; parentId?: string }
type BudgetRow = { id: string; nome: string | null; versao: number }
type ChildRow = { id: string; nome: string; etapa_id?: string; subetapa_id?: string }
type FilterPeriod = 'todos' | '7' | '30' | 'atrasadas'

const EMPTY_FORM = {
  orcamentoId: '', etapaId: '', subetapaId: '', servicoId: '', tipo: 'desembolso_financeiro' as PrevisaoTipo,
  titulo: '', descricao: '', valorPrevisto: '', dataPrevista: '', valorRealizado: '', dataRealizada: '',
  condicaoPagamento: '' as CondicaoPagamento | '', status: 'prevista' as PrevisaoStatus,
  origem: 'manual' as PrevisaoOrigem, baseline: false, publicadoCliente: false, observacaoInterna: '',
}

export function ObraPrevisoes({ obraId, orcamentoId }: { obraId: string; orcamentoId: string }) {
  const [supabase] = useState(createClient)
  const { currentProfile } = useProfile()
  const [items, setItems] = useState<ObraPrevisao[]>([])
  const [orcamentos, setOrcamentos] = useState<Lookup[]>([])
  const [etapas, setEtapas] = useState<Lookup[]>([])
  const [subetapas, setSubetapas] = useState<Lookup[]>([])
  const [servicos, setServicos] = useState<Lookup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ObraPrevisao | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [period, setPeriod] = useState<FilterPeriod>('30')
  const [typeFilter, setTypeFilter] = useState<'todos' | PrevisaoTipo>('todos')
  const [stageFilter, setStageFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState<'ativos' | PrevisaoStatus>('ativos')

  const load = useCallback(async () => {
    setLoading(true)
    const [forecastRes, budgetRes, stageRes] = await Promise.all([
      supabase.rpc('obra_previsoes_list', { p_obra_id: obraId, p_orcamento_id: orcamentoId || TODOS_ORCAMENTOS }),
      supabase.from('orcamentos').select('id,nome,versao').eq('obra_id', obraId).order('versao'),
      supabase.from('etapas').select('id,nome').eq('obra_id', obraId).order('ordem'),
    ])
    setItems((forecastRes.data || []) as ObraPrevisao[])
    setOrcamentos(((budgetRes.data || []) as BudgetRow[]).map(row => ({ id: row.id, nome: row.nome || `Orçamento v${row.versao}` })))
    const stageRows = (stageRes.data || []) as Lookup[]
    setEtapas(stageRows)
    const stageIds = stageRows.map(row => row.id)
    if (stageIds.length) {
      const { data: subRows } = await supabase.from('subetapas_cronograma').select('id,nome,etapa_id').in('etapa_id', stageIds).order('ordem')
      const nextSub = ((subRows || []) as ChildRow[]).map(row => ({ id: row.id, nome: row.nome, parentId: row.etapa_id }))
      setSubetapas(nextSub)
      const subIds = nextSub.map(row => row.id)
      if (subIds.length) {
        const { data: serviceRows } = await supabase.from('servicos_cronograma').select('id,nome,subetapa_id').in('subetapa_id', subIds).order('ordem')
        setServicos(((serviceRows || []) as ChildRow[]).map(row => ({ id: row.id, nome: row.nome, parentId: row.subetapa_id })))
      } else setServicos([])
    } else {
      setSubetapas([]); setServicos([])
    }
    setLoading(false)
  }, [obraId, orcamentoId, supabase])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const activeItems = useMemo(() => items.filter(item => !['cancelada', 'substituida', 'realizada'].includes(item.status)), [items])
  const totals = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const totalUntil = (days: number) => activeItems.filter(item => {
      const due = new Date(`${item.dataPrevista}T00:00:00`)
      return due >= today && due.getTime() <= today.getTime() + days * 86400000
    }).reduce((sum, item) => sum + Number(item.valorPrevisto || 0), 0)
    return { seven: totalUntil(7), thirty: totalUntil(30), sevenCount: countUntil(activeItems, 7), thirtyCount: countUntil(activeItems, 30) }
  }, [activeItems])

  const visible = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return items.filter(item => {
      const due = new Date(`${item.dataPrevista}T00:00:00`)
      if (period === '7' && (due < today || due.getTime() > today.getTime() + 7 * 86400000)) return false
      if (period === '30' && (due < today || due.getTime() > today.getTime() + 30 * 86400000)) return false
      if (period === 'atrasadas' && (due >= today || ['realizada', 'cancelada'].includes(item.status))) return false
      if (typeFilter !== 'todos' && item.tipo !== typeFilter) return false
      if (stageFilter !== 'todos' && item.etapaId !== stageFilter) return false
      if (statusFilter === 'ativos' && ['realizada', 'cancelada', 'substituida'].includes(item.status)) return false
      if (statusFilter !== 'ativos' && item.status !== statusFilter) return false
      return true
    })
  }, [items, period, typeFilter, stageFilter, statusFilter])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, orcamentoId: orcamentoId === TODOS_ORCAMENTOS ? '' : orcamentoId })
    setModalOpen(true)
  }

  function openEdit(item: ObraPrevisao) {
    setEditing(item)
    setForm({
      orcamentoId: item.orcamentoId || '', etapaId: item.etapaId || '', subetapaId: item.subetapaId || '', servicoId: item.servicoId || '',
      tipo: item.tipo, titulo: item.titulo, descricao: item.descricao || '', valorPrevisto: item.valorPrevisto == null ? '' : String(item.valorPrevisto),
      dataPrevista: item.dataPrevista, valorRealizado: item.valorRealizado == null ? '' : String(item.valorRealizado), dataRealizada: item.dataRealizada || '',
      condicaoPagamento: item.condicaoPagamento || '', status: item.status, origem: item.origem, baseline: item.baseline,
      publicadoCliente: item.publicadoCliente, observacaoInterna: item.observacaoInterna || '',
    })
    setModalOpen(true)
  }

  async function save(payload = form, id = editing?.id || null) {
    if (!payload.titulo.trim() || !payload.dataPrevista) return
    setSaving(true)
    const { error } = await supabase.rpc('obra_previsao_save', {
      p_obra_id: obraId, p_id: id, p_payload: payload, p_profile_id: currentProfile?.id || null,
    })
    setSaving(false)
    if (error) { alert(`Não foi possível salvar a previsão.\n\n${error.message}`); return }
    setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); await load()
  }

  async function changeStatus(item: ObraPrevisao, status: PrevisaoStatus) {
    const today = new Date().toISOString().slice(0, 10)
    await save({
      ...EMPTY_FORM,
      orcamentoId: item.orcamentoId || '', etapaId: item.etapaId || '', subetapaId: item.subetapaId || '', servicoId: item.servicoId || '',
      tipo: item.tipo, titulo: item.titulo, descricao: item.descricao || '', valorPrevisto: item.valorPrevisto == null ? '' : String(item.valorPrevisto),
      dataPrevista: item.dataPrevista, valorRealizado: status === 'realizada' ? String(item.valorRealizado ?? item.valorPrevisto ?? '') : (item.valorRealizado == null ? '' : String(item.valorRealizado)),
      dataRealizada: status === 'realizada' ? (item.dataRealizada || today) : (item.dataRealizada || ''), condicaoPagamento: item.condicaoPagamento || '',
      status, origem: item.origem, baseline: item.baseline, publicadoCliente: item.publicadoCliente, observacaoInterna: item.observacaoInterna || '',
    }, item.id)
  }

  if (loading) return <div className="flex justify-center py-14"><div className="size-7 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Planejamento financeiro e operacional</p><h2 className="mt-1 text-xl font-semibold">Previsões</h2></div>
        <Button icon={<Plus size={16} />} onClick={openNew}>Nova previsão</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard label="Próximos 7 dias" value={formatCurrency(totals.seven)} detail={`${totals.sevenCount} compromisso${totals.sevenCount === 1 ? '' : 's'}`} tone="warning" />
        <MetricCard label="Próximos 30 dias" value={formatCurrency(totals.thirty)} detail={`${totals.thirtyCount} compromisso${totals.thirtyCount === 1 ? '' : 's'}`} />
      </div>

      <div className="card grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <Select label="Período" value={period} onChange={event => setPeriod(event.target.value as FilterPeriod)}><option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option><option value="atrasadas">Atrasadas</option><option value="todos">Todo o período</option></Select>
        <Select label="Tipo" value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}><option value="todos">Todos</option>{Object.entries(PREVISAO_TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Select label="Etapa" value={stageFilter} onChange={event => setStageFilter(event.target.value)}><option value="todos">Todas</option>{etapas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
        <Select label="Status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="ativos">Ativos</option>{Object.entries(PREVISAO_STATUS_LABEL).filter(([value]) => value !== 'substituida').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      </div>

      {visible.length === 0 ? <div className="card px-5 py-12 text-center"><CalendarClock className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhuma previsão neste filtro</p><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Crie previsões manuais ou altere o período selecionado.</p></div> : (
        <div className="space-y-3">{visible.map(item => <ForecastRow key={item.id} item={item} onEdit={() => openEdit(item)} onRealize={() => changeStatus(item, 'realizada')} onCancel={() => changeStatus(item, 'cancelada')} />)}</div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar previsão · v${editing.versao + 1}` : 'Nova previsão'} size="lg">
        <div className="grid gap-4 sm:grid-cols-2">
          {orcamentoId === TODOS_ORCAMENTOS && <Select label="Orçamento relacionado" value={form.orcamentoId} onChange={event => setForm(current => ({ ...current, orcamentoId: event.target.value }))}><option value="">Geral da obra</option>{orcamentos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>}
          <Select label="Tipo" value={form.tipo} onChange={event => setForm(current => ({ ...current, tipo: event.target.value as PrevisaoTipo }))}>{Object.entries(PREVISAO_TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <div className={orcamentoId === TODOS_ORCAMENTOS ? 'sm:col-span-2' : 'sm:col-span-2'}><Input label="Título" required value={form.titulo} onChange={event => setForm(current => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Concreto usinado" /></div>
          <Input label="Valor previsto" type="number" min="0" step="0.01" value={form.valorPrevisto} onChange={event => setForm(current => ({ ...current, valorPrevisto: event.target.value }))} placeholder="R$ 0,00" />
          <Input label="Data prevista" type="date" required value={form.dataPrevista} onChange={event => setForm(current => ({ ...current, dataPrevista: event.target.value }))} />
          <Select label="Condição de pagamento" value={form.condicaoPagamento} onChange={event => setForm(current => ({ ...current, condicaoPagamento: event.target.value as CondicaoPagamento | '' }))}><option value="">Não informada</option>{Object.entries(CONDICAO_PAGAMENTO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select label="Status" value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as PrevisaoStatus }))}>{Object.entries(PREVISAO_STATUS_LABEL).filter(([value]) => value !== 'substituida').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select label="Etapa (opcional)" value={form.etapaId} onChange={event => setForm(current => ({ ...current, etapaId: event.target.value, subetapaId: '', servicoId: '' }))}><option value="">Sem etapa</option>{etapas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
          <Select label="Subetapa (opcional)" value={form.subetapaId} onChange={event => setForm(current => ({ ...current, subetapaId: event.target.value, servicoId: '' }))} disabled={!form.etapaId}><option value="">Sem subetapa</option>{subetapas.filter(item => item.parentId === form.etapaId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
          <Select label="Serviço (opcional)" value={form.servicoId} onChange={event => setForm(current => ({ ...current, servicoId: event.target.value }))} disabled={!form.subetapaId}><option value="">Sem serviço</option>{servicos.filter(item => item.parentId === form.subetapaId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
          <Select label="Origem" value={form.origem} onChange={event => setForm(current => ({ ...current, origem: event.target.value as PrevisaoOrigem }))}>{Object.entries(PREVISAO_ORIGEM_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <div className="sm:col-span-2"><Textarea label="Descrição" rows={3} value={form.descricao} onChange={event => setForm(current => ({ ...current, descricao: event.target.value }))} /></div>
          <div className="sm:col-span-2"><Textarea label="Observação interna" rows={2} value={form.observacaoInterna} onChange={event => setForm(current => ({ ...current, observacaoInterna: event.target.value }))} /></div>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)' }}><input type="checkbox" checked={form.baseline} onChange={event => setForm(current => ({ ...current, baseline: event.target.checked }))} /> Preservar como baseline</label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)' }}><input type="checkbox" checked={form.publicadoCliente} onChange={event => setForm(current => ({ ...current, publicadoCliente: event.target.checked }))} /> Publicar no Portal do Cliente</label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button loading={saving} onClick={() => save()}>{editing ? 'Salvar nova versão' : 'Criar previsão'}</Button></div>
      </Modal>
    </div>
  )
}

function ForecastRow({ item, onEdit, onRealize, onCancel }: { item: ObraPrevisao; onEdit: () => void; onRealize: () => void; onCancel: () => void }) {
  const tone = previsaoTone(item.status, item.dataPrevista)
  return <StatusItemCard title={item.titulo} eyebrow={`${PREVISAO_TIPO_LABEL[item.tipo]} · ${item.orcamentoNome}`} value={item.valorPrevisto == null ? undefined : formatCurrency(item.valorPrevisto)} detail={previsaoPrazo(item.dataPrevista, item.status)} tone={tone} badge={<Badge variant={tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info'}>{PREVISAO_STATUS_LABEL[item.status]}</Badge>} meta={<div className="flex flex-wrap gap-x-4 gap-y-1"><span>{formatDate(item.dataPrevista)}</span>{item.etapaNome && <span>{item.etapaNome}</span>}{item.condicaoPagamento && <span>{CONDICAO_PAGAMENTO_LABEL[item.condicaoPagamento]}</span>}<span>Origem: {PREVISAO_ORIGEM_LABEL[item.origem]}</span>{item.baseline && <span>Baseline</span>}{item.publicadoCliente && <span>Visível no Portal</span>}</div>} actions={<div className="flex gap-1"><button type="button" onClick={onEdit} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg-secondary)]" title="Editar previsão"><Pencil size={15} /></button>{!['realizada', 'cancelada'].includes(item.status) && <><button type="button" onClick={onRealize} className="grid size-9 place-items-center rounded-lg text-green-400 hover:bg-green-500/10" title="Marcar realizada"><Check size={16} /></button><button type="button" onClick={onCancel} className="grid size-9 place-items-center rounded-lg text-red-400 hover:bg-red-500/10" title="Cancelar previsão"><X size={16} /></button></>}</div>} />
}

function countUntil(items: ObraPrevisao[], days: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return items.filter(item => {
    const due = new Date(`${item.dataPrevista}T00:00:00`)
    return due >= today && due.getTime() <= today.getTime() + days * 86400000
  }).length
}
