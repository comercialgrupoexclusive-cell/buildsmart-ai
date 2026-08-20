'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronDown, Eye, Pencil, Plus, RefreshCw, Truck, Undo2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { adminRpc } from '@/lib/portal-admin-client'
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
  dataNecessidade: string
  prazoFornecimentoDias: number
  valorSugerido: number | null
  tipoSugerido: PrevisaoTipo
  compraVinculada: boolean
  origemCronograma: { fonte: string | null; subetapaOrcamentoItemId: string | null; orcamentoItemId: string | null; planejamentoItemId: string | null }
  jaCriada: boolean
}

const EMPTY_FORM = {
  orcamentoId: '', etapaId: '', subetapaId: '', servicoId: '', tipo: 'desembolso_financeiro' as PrevisaoTipo,
  titulo: '', descricao: '', valorPrevisto: '', dataPrevista: '', valorRealizado: '', dataRealizada: '',
  tituloCliente: '', descricaoCliente: '',
  condicaoPagamento: '' as CondicaoPagamento | '', status: 'prevista' as PrevisaoStatus,
  origem: 'manual' as PrevisaoOrigem, baseline: false, publicadoCliente: false, observacaoInterna: '',
  fornecedorNome: '', externalKey: '',
  metadados: undefined as Record<string, unknown> | undefined,
}

function formatForecastDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0, 10)}T12:00:00`))
}

function subtractDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function ObraPrevisoes({ obraId, orcamentoId }: { obraId: string; orcamentoId: string }) {
  const [supabase] = useState(createClient)
  const [items, setItems] = useState<ObraPrevisao[]>([])
  const [orcamentos, setOrcamentos] = useState<Lookup[]>([])
  const [etapas, setEtapas] = useState<Lookup[]>([])
  const [subetapas, setSubetapas] = useState<Lookup[]>([])
  const [servicos, setServicos] = useState<Lookup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ObraPrevisao | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [period, setPeriod] = useState<FilterPeriod>('30')
  const [typeFilter, setTypeFilter] = useState<'todos' | PrevisaoTipo>('todos')
  const [stageFilter, setStageFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState<'ativos' | PrevisaoStatus>('ativos')
  const [suggestions, setSuggestions] = useState<ForecastSuggestion[]>([])
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [showOtherSuggestions, setShowOtherSuggestions] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [materialPeriod, setMaterialPeriod] = useState<'30' | '60' | '90' | 'todos'>('30')
  const [prazoEdits, setPrazoEdits] = useState<Record<string, number>>({})
  const [usingKey, setUsingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [forecastRes, budgetRes, stageRes, suggestionRes] = await Promise.all([
      adminRpc<ObraPrevisao[]>('obra_previsoes_list', { p_obra_id: obraId, p_orcamento_id: orcamentoId || TODOS_ORCAMENTOS }),
      supabase.from('orcamentos').select('id,nome,versao').eq('obra_id', obraId).order('versao'),
      supabase.from('etapas').select('id,nome').eq('obra_id', obraId).order('ordem'),
      adminRpc<ForecastSuggestion[]>('obra_previsao_sugestoes', { p_obra_id: obraId, p_orcamento_id: orcamentoId || TODOS_ORCAMENTOS, p_antecedencia: 7 }),
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
  // Alerta operacional: previsão vigente, não realizada/cancelada, com data
  // para providenciar vencida ou próxima, e sem evidência estrutural de
  // compra já feita (compraVinculada === true). Ausência de vínculo (null)
  // conta como "ainda não comprado" -- nunca escondemos por falta de dado.
  const materialAlerts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const buckets: { atrasados: ObraPrevisao[]; hoje: ObraPrevisao[]; semana: ObraPrevisao[]; mes: ObraPrevisao[] } = { atrasados: [], hoje: [], semana: [], mes: [] }
    for (const item of activeItems) {
      if (item.tipo !== 'compra_material' || !item.dataPrevista || item.compraVinculada === true) continue
      const due = new Date(`${item.dataPrevista}T00:00:00`)
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
      if (diffDays < 0) buckets.atrasados.push(item)
      else if (diffDays === 0) buckets.hoje.push(item)
      else if (diffDays <= 7) buckets.semana.push(item)
      else if (diffDays <= 30) buckets.mes.push(item)
    }
    return buckets
  }, [activeItems])
  const totalAlertas = materialAlerts.atrasados.length + materialAlerts.hoje.length + materialAlerts.semana.length + materialAlerts.mes.length
  const pendingSuggestions = useMemo(() => suggestions.filter(item => !item.jaCriada), [suggestions])
  const materialSuggestions = useMemo(() => pendingSuggestions.filter(item => item.tipoSugerido === 'compra_material'), [pendingSuggestions])
  const otherSuggestions = useMemo(() => pendingSuggestions.filter(item => item.tipoSugerido !== 'compra_material'), [pendingSuggestions])

  function effectivePrazo(item: ForecastSuggestion) {
    return prazoEdits[item.key] ?? item.prazoFornecimentoDias
  }
  function effectiveDataPrevista(item: ForecastSuggestion) {
    return subtractDays(item.dataNecessidade, effectivePrazo(item))
  }

  const visibleMaterialSuggestions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const withDates = materialSuggestions.map(item => ({ item, providenciar: effectiveDataPrevista(item) }))
    const filtered = materialPeriod === 'todos' ? withDates : withDates.filter(({ providenciar }) => {
      const due = new Date(`${providenciar}T00:00:00`)
      return due.getTime() <= today.getTime() + Number(materialPeriod) * 86400000
    })
    return filtered.sort((a, b) => a.providenciar.localeCompare(b.providenciar)).map(({ item }) => item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialSuggestions, materialPeriod, prazoEdits])
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
    setShowAdvanced(false)
    setForm({ ...EMPTY_FORM, orcamentoId: orcamentoId === TODOS_ORCAMENTOS ? '' : orcamentoId })
    setModalOpen(true)
  }

  function openEdit(item: ObraPrevisao) {
    setEditing(item)
    setShowAdvanced(false)
    setForm({
      ...EMPTY_FORM,
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
    const normalizedPayload = id ? payload : { ...payload, status: 'confirmada' as PrevisaoStatus }
    const nextPayload = ['confirmada', 'realizada'].includes(normalizedPayload.status)
      ? normalizedPayload
      : { ...normalizedPayload, publicadoCliente: false }
    setSaving(true)
    const { error } = await adminRpc('obra_previsao_save', { p_obra_id: obraId, p_id: id, p_payload: nextPayload })
    setSaving(false)
    if (error) { alert(`Não foi possível salvar a previsão.\n\n${error.message}`); return }
    setFeedback('Previsão salva. Use Desfazer se precisar voltar esta ação.')
    setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); await load()
  }

  async function undoLast() {
    setUndoing(true)
    const { data, error } = await adminRpc<{ titulo?: string }>('obra_previsao_undo_last', { p_obra_id: obraId })
    setUndoing(false)
    if (error) {
      setFeedback(error.message.includes('nenhuma_acao_para_desfazer') ? 'Não há mais ações para desfazer.' : `Não foi possível desfazer: ${error.message}`)
      return
    }
    setFeedback(data?.titulo ? `Desfeito: ${data.titulo}` : 'Última ação desfeita.')
    await load()
  }

  function suggestionPayload(item: ForecastSuggestion) {
    return {
      ...EMPTY_FORM,
      orcamentoId: item.orcamentoId || (orcamentoId === TODOS_ORCAMENTOS ? '' : orcamentoId),
      etapaId: item.etapaId || '', subetapaId: item.subetapaId || '', servicoId: item.servicoId || '',
      tipo: item.tipoSugerido, titulo: item.titulo, descricao: item.descricao || '',
      valorPrevisto: item.valorSugerido == null ? '' : String(item.valorSugerido), dataPrevista: item.dataPrevista,
      status: 'confirmada' as PrevisaoStatus, origem: 'orcamento' as PrevisaoOrigem, publicadoCliente: false, externalKey: item.key,
    }
  }

  function reviewSuggestion(item: ForecastSuggestion) {
    setEditing(null)
    setShowAdvanced(false)
    setForm(suggestionPayload(item))
    setModalOpen(true)
  }

  async function acceptMaterialSuggestion(item: ForecastSuggestion) {
    const prazo = effectivePrazo(item)
    const dataPrevista = effectiveDataPrevista(item)
    setUsingKey(item.key)
    await save({
      ...EMPTY_FORM,
      orcamentoId: item.orcamentoId || (orcamentoId === TODOS_ORCAMENTOS ? '' : orcamentoId),
      etapaId: item.etapaId || '', subetapaId: item.subetapaId || '', servicoId: item.servicoId || '',
      tipo: item.tipoSugerido, titulo: item.titulo, descricao: item.descricao || '',
      valorPrevisto: item.valorSugerido == null ? '' : String(item.valorSugerido), dataPrevista,
      status: 'confirmada' as PrevisaoStatus, origem: 'orcamento' as PrevisaoOrigem, publicadoCliente: false, externalKey: item.key,
      metadados: { prazoFornecimentoDias: prazo, dataNecessidade: item.dataNecessidade, origemCronograma: item.origemCronograma },
    }, null)
    setUsingKey(null)
  }

  if (loading) return <div className="flex justify-center py-14"><div className="size-7 animate-spin rounded-full border-2" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Planejamento financeiro e operacional</p><h2 className="mt-1 text-xl font-semibold">Previsões</h2></div>
        <div className="flex gap-2"><Button variant="secondary" icon={<Undo2 size={16} />} loading={undoing} onClick={() => void undoLast()}>Desfazer</Button><Button icon={<Plus size={16} />} onClick={openNew}>Nova previsão</Button></div>
      </div>
      {feedback && <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>{feedback}</div>}

      {totalAlertas > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--danger)' }}><CalendarClock size={18} /></div>
              <div><h3 className="font-semibold">Materiais a providenciar</h3><p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Previsões de compra confirmadas, agrupadas pela data limite para providenciar.</p></div>
            </div>
            <Badge variant="danger">{totalAlertas} alerta{totalAlertas === 1 ? '' : 's'}</Badge>
          </div>
          <div className="divide-y border-t" style={{ borderColor: 'var(--border)' }}>
            {([
              ['Atrasados', materialAlerts.atrasados],
              ['Hoje', materialAlerts.hoje],
              ['Próximos 7 dias', materialAlerts.semana],
              ['Próximos 30 dias', materialAlerts.mes],
            ] as const).filter(([, list]) => list.length > 0).map(([label, list]) => (
              <div key={label}>
                <div className="px-4 pt-3 text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{label} · {list.length}</div>
                {list.map(item => <AlertRow key={item.id} item={item} />)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--accent)' }}><Truck size={18} /></div><div className="min-w-0"><h3 className="font-semibold">Próximos materiais</h3><p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>Necessário em = início no cronograma. Providenciar até = necessário em − prazo de fornecimento.</p></div></div>
          <div className="flex items-center gap-2"><Badge variant="info">{materialSuggestions.length} materiais</Badge><Select value={materialPeriod} onChange={event => setMaterialPeriod(event.target.value as typeof materialPeriod)} className="min-h-9 w-auto"><option value="30">30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="todos">Todo o período</option></Select></div>
        </div>
        <div className="divide-y border-t" style={{ borderColor: 'var(--border)' }}>
          {visibleMaterialSuggestions.length === 0 ? <p className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum material a providenciar neste período.</p> : visibleMaterialSuggestions.map(item => {
            const prazo = effectivePrazo(item)
            const providenciar = effectiveDataPrevista(item)
            const overdue = providenciar < new Date().toISOString().slice(0, 10)
            return (
              <div key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-sm font-medium">{item.titulo}</p>{item.compraVinculada && <Badge variant="success">Já em compras</Badge>}</div>
                  <p className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{[item.etapaNome, item.subetapaNome].filter(Boolean).join(' · ') || 'Sem etapa'}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Necessário em <strong style={{ color: 'var(--text-primary)' }}>{formatForecastDate(item.dataNecessidade)}</strong> · {item.valorSugerido != null ? formatCurrency(item.valorSugerido) : 'Valor a definir'}</p>
                </div>
                <div className="flex shrink-0 items-end gap-3">
                  <label className="flex flex-col gap-1"><span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Prazo (dias)</span><input type="number" min={0} max={180} value={prazo} onChange={event => setPrazoEdits(current => ({ ...current, [item.key]: Math.max(0, Number(event.target.value) || 0) }))} className="input-base h-9 w-20 px-2 text-sm" /></label>
                  <div className="flex flex-col gap-1"><span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Providenciar até</span><span className="text-sm font-semibold tabular-nums" style={{ color: overdue ? 'var(--danger)' : 'var(--text-primary)' }}>{formatForecastDate(providenciar)}</span></div>
                  <Button size="sm" variant="secondary" loading={usingKey === item.key} onClick={() => void acceptMaterialSuggestion(item)}>Usar</Button>
                </div>
              </div>
            )
          })}
        </div>
        {otherSuggestions.length > 0 && (
          <div className="border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={() => setShowOtherSuggestions(value => !value)} className="flex w-full items-center justify-between gap-1 px-4 py-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>Outras sugestões (mão de obra e desembolsos) · {otherSuggestions.length}<ChevronDown size={14} className={showOtherSuggestions ? 'rotate-180' : ''} /></button>
            {showOtherSuggestions && <div className="divide-y border-t" style={{ borderColor: 'var(--border)' }}>
              {otherSuggestions.slice(0, showAllSuggestions ? 30 : 5).map(item => <div key={item.key} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.titulo}</p><p className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{formatForecastDate(item.dataPrevista)}{item.valorSugerido != null ? ` · ${formatCurrency(item.valorSugerido)}` : ' · Valor a definir'}{item.etapaNome ? ` · ${item.etapaNome}` : ''}</p></div><Button size="sm" variant="secondary" onClick={() => reviewSuggestion(item)}>Usar previsão</Button></div>)}
              {otherSuggestions.length > 5 && <button type="button" onClick={() => setShowAllSuggestions(value => !value)} className="flex w-full items-center justify-center gap-1 px-4 py-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>{showAllSuggestions ? 'Mostrar menos' : `Ver mais ${Math.min(otherSuggestions.length - 5, 25)} itens`}</button>}
            </div>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard label="Próximos 7 dias" value={formatCurrency(totals.seven)} detail={`${totals.sevenCount} compromisso${totals.sevenCount === 1 ? '' : 's'}`} tone="warning" />
        <MetricCard label="Próximos 30 dias" value={formatCurrency(totals.thirty)} detail={`${totals.thirtyCount} compromisso${totals.thirtyCount === 1 ? '' : 's'}`} />
      </div>

      <div className="card p-3">
        <div className="grid grid-cols-2 gap-2"><Select label="Período" value={period} onChange={event => setPeriod(event.target.value as FilterPeriod)}><option value="7">Próximos 7 dias</option><option value="30">Próximos 30 dias</option><option value="atrasadas">Atrasadas</option><option value="todos">Todo o período</option></Select><Select label="Tipo" value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}><option value="todos">Todos</option>{Object.entries(PREVISAO_TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <details className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border)' }}><summary className="cursor-pointer text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Mais filtros</summary><div className="mt-3 grid grid-cols-2 gap-2"><Select label="Etapa" value={stageFilter} onChange={event => setStageFilter(event.target.value)}><option value="todos">Todas</option>{etapas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select><Select label="Situação" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="ativos">Ativas</option>{Object.entries(PREVISAO_STATUS_LABEL).filter(([value]) => value !== 'substituida').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div></details>
      </div>

      {visible.length === 0 ? <div className="card px-5 py-12 text-center"><CalendarClock className="mx-auto" style={{ color: 'var(--text-secondary)' }} /><p className="mt-3 font-medium">Nenhuma previsão neste filtro</p><p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Crie previsões manuais ou altere o período selecionado.</p></div> : (
        <div className="space-y-3">{visible.map(item => <ForecastRow key={item.id} item={item} onEdit={() => openEdit(item)} />)}</div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar previsão · v${editing.versao + 1}` : 'Nova previsão'} size="lg">
        <div className="grid gap-4 sm:grid-cols-2">
          {orcamentoId === TODOS_ORCAMENTOS && <Select label="Orçamento relacionado" value={form.orcamentoId} onChange={event => setForm(current => ({ ...current, orcamentoId: event.target.value }))}><option value="">Geral da obra</option>{orcamentos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select>}
          <div className="sm:col-span-2"><Input label="Título" required value={form.titulo} onChange={event => setForm(current => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Concreto usinado" /></div>
          <Select label="Tipo" value={form.tipo} onChange={event => setForm(current => ({ ...current, tipo: event.target.value as PrevisaoTipo }))}>{Object.entries(PREVISAO_TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          <Input label="Data prevista" type="date" required value={form.dataPrevista} onChange={event => setForm(current => ({ ...current, dataPrevista: event.target.value }))} />
          <Input label="Valor previsto (opcional)" type="number" min="0" step="0.01" value={form.valorPrevisto} onChange={event => setForm(current => ({ ...current, valorPrevisto: event.target.value }))} placeholder="Valor a definir" />
          <Input label="Fornecedor (opcional)" value={form.fornecedorNome} onChange={event => setForm(current => ({ ...current, fornecedorNome: event.target.value }))} placeholder="Ex.: Petter Ferragem" />
          <div className="sm:col-span-2"><button type="button" onClick={() => setShowAdvanced(value => !value)} className="flex w-full items-center justify-between rounded-lg border px-3 py-3 text-sm font-medium" style={{ borderColor: 'var(--border)' }}>Mais detalhes <ChevronDown size={16} className={showAdvanced ? 'rotate-180' : ''} /></button></div>
          {showAdvanced && <><Select label="Condição de pagamento" value={form.condicaoPagamento} onChange={event => setForm(current => ({ ...current, condicaoPagamento: event.target.value as CondicaoPagamento | '' }))}><option value="">Não informada</option>{Object.entries(CONDICAO_PAGAMENTO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select label="Situação" value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as PrevisaoStatus }))}>{Object.entries(PREVISAO_STATUS_LABEL).filter(([value]) => value !== 'substituida').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select label="Etapa" value={form.etapaId} onChange={event => setForm(current => ({ ...current, etapaId: event.target.value, subetapaId: '', servicoId: '' }))}><option value="">Sem etapa</option>{etapas.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select><Select label="Subetapa" value={form.subetapaId} onChange={event => setForm(current => ({ ...current, subetapaId: event.target.value, servicoId: '' }))} disabled={!form.etapaId}><option value="">Sem subetapa</option>{subetapas.filter(item => item.parentId === form.etapaId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select><Select label="Serviço" value={form.servicoId} onChange={event => setForm(current => ({ ...current, servicoId: event.target.value }))} disabled={!form.subetapaId}><option value="">Sem serviço</option>{servicos.filter(item => item.parentId === form.subetapaId).map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select><Select label="Origem" value={form.origem} onChange={event => setForm(current => ({ ...current, origem: event.target.value as PrevisaoOrigem }))}>{Object.entries(PREVISAO_ORIGEM_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><div className="sm:col-span-2"><Textarea label="Descrição técnica" rows={3} value={form.descricao} onChange={event => setForm(current => ({ ...current, descricao: event.target.value }))} /></div><div className="sm:col-span-2"><Textarea label="Observação interna" rows={2} value={form.observacaoInterna} onChange={event => setForm(current => ({ ...current, observacaoInterna: event.target.value }))} /></div><label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: 'var(--border)' }}><input type="checkbox" checked={form.baseline} onChange={event => setForm(current => ({ ...current, baseline: event.target.checked }))} /> Preservar como baseline</label></>}
          <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm sm:col-span-2" style={{ borderColor: form.publicadoCliente ? 'var(--accent)' : 'var(--border)' }}><input type="checkbox" checked={form.publicadoCliente} onChange={event => setForm(current => ({ ...current, publicadoCliente: event.target.checked, status: 'confirmada' }))} /> Mostrar esta previsão no Portal do Cliente</label>
          {form.publicadoCliente && <><div className="sm:col-span-2"><Input label="Título para o cliente (opcional)" value={form.tituloCliente} onChange={event => setForm(current => ({ ...current, tituloCliente: event.target.value }))} placeholder={form.titulo || 'Usar título técnico'} /></div><div className="sm:col-span-2"><Textarea label="Texto para o cliente (opcional)" rows={3} value={form.descricaoCliente} onChange={event => setForm(current => ({ ...current, descricaoCliente: event.target.value }))} placeholder="Se ficar vazio, será usada a descrição técnica." /></div></>}
        </div>
        <div className="sticky -bottom-6 -mx-6 mt-6 flex justify-end gap-2 border-t px-6 py-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button loading={saving} onClick={() => save()}>Salvar</Button></div>
      </Modal>
    </div>
  )
}

// Estado de compra sempre a partir de vinculo estrutural (compra_itens),
// nunca por nome. null = nenhum vinculo estrutural gravado na previsao
// (ex.: baseline importado ou previsao manual) -- nao sabemos, entao nao
// afirmamos "nao comprado". false = ha vinculo estrutural, mas nenhuma
// compra_itens correspondente foi encontrada -- confirmadamente pendente.
function purchaseBadge(item: ObraPrevisao) {
  if (item.compraVinculada === true && item.compraRecebida) return <Badge variant="success">Recebido</Badge>
  if (item.compraVinculada === true) return <Badge variant="info">Comprado</Badge>
  if (item.compraVinculada === false) return <Badge variant="warning">Ainda não comprado</Badge>
  return <Badge variant="default">Vínculo não identificado</Badge>
}

function AlertRow({ item }: { item: ObraPrevisao }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-sm font-medium">{item.titulo}</p>{purchaseBadge(item)}</div>
        <p className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>{[item.etapaNome, item.subetapaNome, item.servicoNome].filter(Boolean).join(' · ') || 'Sem etapa'}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {item.dataNecessidade && <span>Necessário em <strong style={{ color: 'var(--text-primary)' }}>{formatForecastDate(item.dataNecessidade)}</strong></span>}
        {item.prazoFornecimentoDias != null && <span>Prazo {item.prazoFornecimentoDias}d</span>}
        <span>Providenciar até <strong style={{ color: 'var(--danger)' }}>{formatForecastDate(item.dataPrevista)}</strong></span>
        <Badge variant={item.status === 'confirmada' ? 'info' : 'default'}>{PREVISAO_STATUS_LABEL[item.status]}</Badge>
      </div>
    </div>
  )
}

function ForecastRow({ item, onEdit }: { item: ObraPrevisao; onEdit: () => void }) {
  const tone = previsaoTone(item.status, item.dataPrevista)
  return <StatusItemCard title={item.titulo} eyebrow={PREVISAO_TIPO_LABEL[item.tipo]} value={item.valorPrevisto == null ? 'Valor a definir' : formatCurrency(item.valorPrevisto)} detail={previsaoPrazo(item.dataPrevista, item.status)} tone={tone} badge={<div className="flex items-center gap-1.5"><Badge variant={tone === 'success' ? 'success' : tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info'}>{PREVISAO_STATUS_LABEL[item.status]}</Badge>{item.publicadoCliente && <Eye size={14} aria-label="Visível no Portal" />}</div>} meta={<div className="flex flex-wrap items-center gap-x-4 gap-y-1"><span>{item.dataPrevista ? formatForecastDate(item.dataPrevista) : 'Data a definir'}</span>{item.etapaNome && <span>{item.etapaNome}</span>}{item.fornecedorNome && <span>{item.fornecedorNome}</span>}{item.cronogramaAlterado && <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--warning)' }}><RefreshCw size={12} /> Cronograma alterado — recalcular previsão?</span>}</div>} actions={<button type="button" onClick={onEdit} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg-secondary)]" title="Editar previsão"><Pencil size={15} /></button>} />
}

function countUntil(items: ObraPrevisao[], days: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return items.filter(item => {
    if (!item.dataPrevista) return false
    const due = new Date(`${item.dataPrevista}T00:00:00`)
    return due >= today && due.getTime() <= today.getTime() + days * 86400000
  }).length
}
