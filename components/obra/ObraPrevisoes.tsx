'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarClock, Check, Eye, EyeOff, Pencil, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'
import { formatCurrency } from '@/lib/utils'
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
type ForecastSuggestion = {
  key: string
  orcamentoId: string
  orcamentoNome: string | null
  etapaId: string | null
  etapaNome: string | null
  subetapaId: string | null
  subetapaNome: string | null
  servicoId: string | null
  servicoNome: string | null
  titulo: string
  descricao: string | null
  dataPrevista: string
  inicioOperacional: string
  valorSugerido: number | null
  tipoSugerido: PrevisaoTipo
  jaCriada: boolean
}

const EMPTY_FORM = {
  orcamentoId: '', etapaId: '', subetapaId: '', servicoId: '', tipo: 'desembolso_financeiro' as PrevisaoTipo,
  titulo: '', descricao: '', valorPrevisto: '', dataPrevista: '', valorRealizado: '', dataRealizada: '',
  tituloCliente: '', descricaoCliente: '',
  condicaoPagamento: '' as CondicaoPagamento | '', status: 'prevista' as PrevisaoStatus,
  origem: 'manual' as PrevisaoOrigem, baseline: false, publicadoCliente: false, observacaoInterna: '',
  fornecedorNome: '', externalKey: '',
}

function formatForecastDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0, 10)}T12:00:00`))
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
  const [suggestions, setSuggestions] = useState<ForecastSuggestion[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [forecastRes, budgetRes, stageRes, suggestionRes] = await Promise.all([
      supabase.rpc('obra_previsoes_list', { p_obra_id: obraId, p_orcamento_id: orcamentoId || TODOS_ORCAMENTOS }),
      supabase.from('orcamentos').select('id,nome,versao').eq('obra_id', obraId).order('versao'),
      supabase.from('etapas').select('id,nome').eq('obra_id', obraId).order('ordem'),
      supabase.rpc('obra_previsao_sugestoes', { p_obra_id: obraId, p_orcamento_id: orcamentoId || TODOS_ORCAMENTOS, p_antecedencia: 7 }),
    ])
    setItems((forecastRes.data || []) as ObraPrevisao[])
    setSuggestions((suggestionRes.data || []) as ForecastSuggestion[])
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
      if (!item.dataPrevista) return false
      const due = new Date(`${item.dataPrevista}T00:00:00`)
      return due >= today && due.getTime() <= today.getTime() + days * 86400000
    }).reduce((sum, item) => sum + Number(item.valorPrevisto || 0), 0)
    return { seven: totalUntil(7), thirty: totalUntil(30), sevenCount: countUntil(activeItems, 7), thirtyCount: countUntil(activeItems, 30) }
  }, [activeItems])

  const visible = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return items.filter(item => {
      if (!item.dataPrevista) return period === 'todos' && (typeFilter === 'todos' || item.tipo === typeFilter) && (stageFilter === 'todos' || item.etapaId === stageFilter) && (statusFilter === 'ativos' ? !['realizada', 'cancelada', 'substituida'].includes(item.status) : item.status === statusFilter)
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
      tituloCliente: item.tituloCliente || '', descricaoCliente: item.descricaoCliente || '',
      dataPrevista: item.dataPrevista || '', valorRealizado: item.valorRealizado == null ? '' : String(item.valorRealizado), dataRealizada: item.dataRealizada || '',
      condicaoPagamento: item.condicaoPagamento || '', status: item.status, origem: item.origem, baseline: item.baseline,
      publicadoCliente: item.publicadoCliente, observacaoInterna: item.observacaoInterna || '',
      fornecedorNome: item.fornecedorNome || '', externalKey: item.externalKey || '',
    })
    setModalOpen(true)
  }

  async function save(payload = form, id = editing?.id || null) {
    if (!payload.titulo.trim() || !payload.dataPrevista) return
    const nextPayload = ['confirmada', 'realizada'].includes(payload.status)
      ? payload
      : { ...payload, publicadoCliente: false }
    setSaving(true)
    const { error } = await supabase.rpc('obra_previsao_save', {
      p_obra_id: obraId, p_id: id, p_payload: nextPayload, p_profile_id: currentProfile?.id || null,
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
      tituloCliente: item.tituloCliente || '', descricaoCliente: item.descricaoCliente || '',
      dataPrevista: item.dataPrevista || '', valorRealizado: status === 'realizada' ? String(item.valorRealizado ?? item.valorPrevisto ?? '') : (item.valorRealizado == null ? '' : String(item.valorRealizado)),
      dataRealizada: status === 'realizada' ? (item.dataRealizada || today) : (item.dataRealizada || ''), condicaoPagamento: item.condicaoPagamento || '',
      status, origem: item.origem, baseline: item.baseline, publicadoCliente: item.publicadoCliente, observacaoInterna: item.observacaoInterna || '',
      fornecedorNome: item.fornecedorNome || '', externalKey: item.externalKey || '',
    }, item.id)
  }

  function suggestionPayload(item: ForecastSuggestion, status: PrevisaoStatus = 'prevista') {
    return {
      ...EMPTY_FORM,
      orcamentoId: item.orcamentoId || (orcamentoId === TODOS_ORCAMENTOS ? '' : orcamentoId),
      etapaId: item.etapaId || '', subetapaId: item.subetapaId || '', servicoId: item.servicoId || '',
      tipo: item.tipoSugerido, titulo: item.titulo, descricao: item.descricao || '',
      valorPrevisto: item.valorSugerido == null ? '' : String(item.valorSugerido), dataPrevista: item.dataPrevista,
      status, origem: 'orcamento' as PrevisaoOrigem, publicadoCliente: false, externalKey: item.key,
    }
  }

  function reviewSuggestion(item: ForecastSuggestion) {
    setEditing(null)
    setForm(suggestionPayload(item))
    setModalOpen(true)
  }

  async function confirmSuggestion(item: ForecastSuggestion) {
    await save(suggestionPayload(item, 'confirmada'), null)
  }

  async function togglePublish(item: ObraPrevisao) {
    await save({
      ...EMPTY_FORM,
      orcamentoId: item.orcamentoId || '', etapaId: item.etapaId || '', subetapaId: item.subetapaId || '', servicoId: item.servicoId || '',
      tipo: item.tipo, titulo: item.titulo, descricao: item.descricao || '', tituloCliente: item.tituloCliente || '', descricaoCliente: item.descricaoCliente || '',
      valorPrevisto: item.valorPrevisto == null ? '' : String(item.valorPrevisto), dataPrevista: item.dataPrevista || '',
      valorRealizado: item.valorRealizado == null ? '' : String(item.valorRealizado), dataRealizada: item.dataRealizada || '',
      condicaoPagamento: item.condicaoPagamento || '', status: item.status, origem: item.origem, baseline: item.baseline,
      publicadoCliente: !item.publicadoCliente, observacaoInterna: item.observacaoInterna || '', fornecedorNome: item.fornecedorNome || '', externalKey: item.externalKey || '',
    }, item.id)
  }

  if (loading) return <div className="flex justify-center py-14"><div className="size-7 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Planejamento financeiro e operacional</p><h2 className="mt-1 text-xl font-semibold">Previsões</h2></div>
        <Button icon={<Plus size={16} />} onClick={openNew}>Nova previsão</Button>
      </div>

      <div className="card p-4 sm:p-5">
        <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><BellRing size={18} /></div><div><h3 className="font-semibold">Próximos itens do orçamento</h3><p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>Gerados automaticamente a partir do orçamento da obra e das datas do cronograma. Compras são antecipadas em 7 dias; nada é publicado sem sua confirmação.</p></div></div>
        <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          {suggestions.filter(item => !item.jaCriada).length === 0 ? <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma sugestão nova. Confira se o orçamento está ativo e se o cronograma possui datas.</p> : suggestions.filter(item => !item.jaCriada).slice(0, 20).map(item => <div key={item.key} className="flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center" style={{ background: 'var(--bg-secondary)' }}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{item.titulo}</p><Badge variant="info">{PREVISAO_TIPO_LABEL[item.tipoSugerido]}</Badge></div><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{[item.etapaNome, item.subetapaNome, item.servicoNome].filter(Boolean).join(' · ')}</p><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Previsão {formatForecastDate(item.dataPrevista)} · início operacional {formatForecastDate(item.inicioOperacional)}{item.valorSugerido != null ? ` · ${formatCurrency(item.valorSugerido)}` : ''}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => reviewSuggestion(item)}>Revisar</Button><Button size="sm" onClick={() => void confirmSuggestion(item)}>Confirmar</Button></div></div>)}
          {suggestions.filter(item => !item.jaCriada).length > 20 && <p className="pt-1 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>Exibindo os 20 itens mais próximos.</p>}
        </div>
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
        <div className="space-y-3">{visible.map(item => <ForecastRow key={item.id} item={item} onEdit={() => openEdit(item)} onConfirm={() => changeStatus(item, 'confirmada')} onRealize={() => changeStatus(item, 'realizada')} onCancel={() => changeStatus(item, 'cancelada')} onTogglePublish={() => togglePublish(item)} />)}</div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar previsão · v${editing.versao + 1}` : 'Nova previsão'} size="lg">
        <div className="grid gap-4 sm:grid-cols-2">
          {orcamentoId === TODOS_ORCAMENTOS && <Select label="Orçamento relacionado" value={form.orcamentoId} onChange={event => setForm(current => ({ ...current, orcamentoId: event.target.value }))}><option value="">Geral da obra</option>{orcamentos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>}
          <Select label="Tipo" value={form.tipo} onChange={event => setForm(current => ({ ...current, tipo: event.target.value as PrevisaoTipo }))}>{Object.entries(PREVISAO_TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <div className={orcamentoId === TODOS_ORCAMENTOS ? 'sm:col-span-2' : 'sm:col-span-2'}><Input label="Título" required value={form.titulo} onChange={event => setForm(current => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Concreto usinado" /></div>
          <Input label="Valor previsto (opcional)" type="number" min="0" step="0.01" value={form.valorPrevisto} onChange={event => setForm(current => ({ ...current, valorPrevisto: event.target.value }))} placeholder="Valor a definir" />
          <Input label="Data prevista" type="date" required value={form.dataPrevista} onChange={event => setForm(current => ({ ...current, dataPrevista: event.target.value }))} />
          <Select label="Condição de pagamento" value={form.condicaoPagamento} onChange={event => setForm(current => ({ ...current, condicaoPagamento: event.target.value as CondicaoPagamento | '' }))}><option value="">Não informada</option>{Object.entries(CONDICAO_PAGAMENTO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Input label="Fornecedor (opcional)" value={form.fornecedorNome} onChange={event => setForm(current => ({ ...current, fornecedorNome: event.target.value }))} placeholder="Ex.: Petter Ferragem" />
          <Select label="Status" value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as PrevisaoStatus }))}>{Object.entries(PREVISAO_STATUS_LABEL).filter(([value]) => value !== 'substituida').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Select label="Etapa (opcional)" value={form.etapaId} onChange={event => setForm(current => ({ ...current, etapaId: event.target.value, subetapaId: '', servicoId: '' }))}><option value="">Sem etapa</option>{etapas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
          <Select label="Subetapa (opcional)" value={form.subetapaId} onChange={event => setForm(current => ({ ...current, subetapaId: event.target.value, servicoId: '' }))} disabled={!form.etapaId}><option value="">Sem subetapa</option>{subetapas.filter(item => item.parentId === form.etapaId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
          <Select label="Serviço (opcional)" value={form.servicoId} onChange={event => setForm(current => ({ ...current, servicoId: event.target.value }))} disabled={!form.subetapaId}><option value="">Sem serviço</option>{servicos.filter(item => item.parentId === form.subetapaId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>
          <Select label="Origem" value={form.origem} onChange={event => setForm(current => ({ ...current, origem: event.target.value as PrevisaoOrigem }))}>{Object.entries(PREVISAO_ORIGEM_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <div className="sm:col-span-2"><Textarea label="Descrição" rows={3} value={form.descricao} onChange={event => setForm(current => ({ ...current, descricao: event.target.value }))} /></div>
          <div className="sm:col-span-2"><Textarea label="Observação interna" rows={2} value={form.observacaoInterna} onChange={event => setForm(current => ({ ...current, observacaoInterna: event.target.value }))} /></div>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)' }}><input type="checkbox" checked={form.baseline} onChange={event => setForm(current => ({ ...current, baseline: event.target.checked }))} /> Preservar como baseline</label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)', opacity: ['confirmada', 'realizada'].includes(form.status) ? 1 : 0.55 }}><input type="checkbox" checked={form.publicadoCliente} disabled={!['confirmada', 'realizada'].includes(form.status)} onChange={event => setForm(current => ({ ...current, publicadoCliente: event.target.checked }))} /> Publicar no Portal do Cliente</label>
          {form.publicadoCliente && <><div className="sm:col-span-2"><Input label="Título para o cliente (opcional)" value={form.tituloCliente} onChange={event => setForm(current => ({ ...current, tituloCliente: event.target.value }))} placeholder={form.titulo || 'Usar título técnico'} /></div><div className="sm:col-span-2"><Textarea label="Texto para o cliente (opcional)" rows={3} value={form.descricaoCliente} onChange={event => setForm(current => ({ ...current, descricaoCliente: event.target.value }))} placeholder="Se ficar vazio, será usada a descrição técnica." /></div></>}
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button loading={saving} onClick={() => save()}>{editing ? 'Salvar nova versão' : 'Criar previsão'}</Button></div>
      </Modal>
    </div>
  )
}

function ForecastRow({ item, onEdit, onConfirm, onRealize, onCancel, onTogglePublish }: { item: ObraPrevisao; onEdit: () => void; onConfirm: () => void; onRealize: () => void; onCancel: () => void; onTogglePublish: () => void }) {
  const tone = previsaoTone(item.status, item.dataPrevista)
  const podePublicar = ['confirmada', 'realizada'].includes(item.status)
  return <StatusItemCard title={item.titulo} eyebrow={`${PREVISAO_TIPO_LABEL[item.tipo]} · ${item.orcamentoNome}`} value={item.valorPrevisto == null ? 'Valor a definir' : formatCurrency(item.valorPrevisto)} detail={previsaoPrazo(item.dataPrevista, item.status)} tone={tone} badge={<Badge variant={tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info'}>{PREVISAO_STATUS_LABEL[item.status]}</Badge>} meta={<div className="flex flex-wrap gap-x-4 gap-y-1"><span>{item.dataPrevista ? formatForecastDate(item.dataPrevista) : 'Data a definir'}</span>{item.etapaNome && <span>{item.etapaNome}</span>}{item.subetapaNome && <span>{item.subetapaNome}</span>}{item.fornecedorNome && <span>{item.fornecedorNome}</span>}{item.condicaoPagamento && <span>{CONDICAO_PAGAMENTO_LABEL[item.condicaoPagamento]}</span>}<span>Origem: {PREVISAO_ORIGEM_LABEL[item.origem]}</span>{item.baseline && <span>Baseline</span>}{item.publicadoCliente && <span>Visível no Portal</span>}</div>} actions={<div className="flex gap-1"><button type="button" onClick={onEdit} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg-secondary)]" title="Editar previsão"><Pencil size={15} /></button>{item.status === 'prevista' && <button type="button" onClick={onConfirm} className="grid size-9 place-items-center rounded-lg text-blue-400 hover:bg-blue-500/10" title="Confirmar previsão"><Check size={16} /></button>}{podePublicar && <button type="button" onClick={onTogglePublish} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg-secondary)]" title={item.publicadoCliente ? 'Remover do Portal' : 'Publicar no Portal'}>{item.publicadoCliente ? <EyeOff size={16} /> : <Eye size={16} />}</button>}{!['realizada', 'cancelada'].includes(item.status) && <><button type="button" onClick={onRealize} className="grid size-9 place-items-center rounded-lg text-green-400 hover:bg-green-500/10" title="Marcar realizada"><Check size={16} /></button><button type="button" onClick={onCancel} className="grid size-9 place-items-center rounded-lg text-red-400 hover:bg-red-500/10" title="Cancelar previsão"><X size={16} /></button></>}</div>} />
}

function countUntil(items: ObraPrevisao[], days: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return items.filter(item => {
    if (!item.dataPrevista) return false
    const due = new Date(`${item.dataPrevista}T00:00:00`)
    return due >= today && due.getTime() <= today.getTime() + days * 86400000
  }).length
}
