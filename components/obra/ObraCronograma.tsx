'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import {
  Plus, Calendar, Pencil, Trash2, ChevronDown, ChevronRight,
  LayoutList, BarChart2, KanbanSquare, Check, AlertTriangle, Clock, CheckCircle2, Flag, Wallet, Link2, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, SubetapaCronograma, ServicoCronograma, CronogramaDependencia, CronogramaItemTipo } from '@/lib/types'
import { STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL, formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { PredecessorPicker, PredecessoraRef } from '@/components/obra/PredecessorPicker'

type Tab = 'kanban' | 'cascata' | 'gantt'

type EtapaForm = { nome: string; data_inicio: string; data_fim: string; status: Etapa['status']; percentual_executado: number; is_marco: boolean }
type SubForm   = { nome: string; data_inicio: string; data_fim: string; status: SubetapaCronograma['status']; percentual_executado: number; responsavel: string; is_marco: boolean }
type SvcForm   = { nome: string; data_inicio: string; data_fim: string; percentual_executado: number; responsavel: string; is_marco: boolean }

type EditField = { id: string; table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma'; field: 'data_inicio' | 'data_fim' } | null
type CronogramaStatus = Etapa['status']

const STATUS_FILTRO: { key: CronogramaStatus; label: string }[] = [
  { key: 'planejada', label: 'A executar' },
  { key: 'em_andamento', label: 'Em execução' },
  { key: 'atrasada', label: 'Atenção' },
  { key: 'concluida', label: 'Concluídas' },
]

const EMPTY_ETAPA: EtapaForm = { nome: '', data_inicio: '', data_fim: '', status: 'planejada', percentual_executado: 0, is_marco: false }
const EMPTY_SUB   = (responsavel = ''): SubForm => ({ nome: '', data_inicio: '', data_fim: '', status: 'planejada', percentual_executado: 0, responsavel, is_marco: false })
const EMPTY_SVC   = (responsavel = ''): SvcForm => ({ nome: '', data_inicio: '', data_fim: '', percentual_executado: 0, responsavel, is_marco: false })

const fmtBR = (v: string | null | undefined) => {
  if (!v) return null
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${String(y).slice(2)}`
}

type OrcamentoCronogramaItem = {
  etapa_id: string | null
  subetapa: string | null
  descricao_snapshot: string | null
  composicoes_proprias?: { descricao: string | null } | null
  sinapi_composicoes?: { descricao: string | null } | null
}

const normalizarChaveCrono = (valor: string | null | undefined) =>
  (valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function ObraCronograma({ obraId, projetoId }: { obraId?: string; projetoId?: string }) {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('cascata')
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaCronograma[]>([])
  const [servicos, setServicos] = useState<ServicoCronograma[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editField, setEditField] = useState<EditField>(null)
  const [empreiteiro, setEmpreiteiro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<CronogramaStatus[]>(['planejada', 'em_andamento', 'atrasada'])

  const [etapaModal, setEtapaModal] = useState<{ open: boolean; editando: Etapa | null }>({ open: false, editando: null })
  const [subModal,   setSubModal]   = useState<{ open: boolean; etapaId: string | null; editando: SubetapaCronograma | null }>({ open: false, etapaId: null, editando: null })
  const [svcModal,   setSvcModal]   = useState<{ open: boolean; subetapaId: string | null; editando: ServicoCronograma | null }>({ open: false, subetapaId: null, editando: null })

  const [etapaForm, setEtapaForm] = useState<EtapaForm>(EMPTY_ETAPA)
  const [subForm,   setSubForm]   = useState<SubForm>(EMPTY_SUB())
  const [svcForm,   setSvcForm]   = useState<SvcForm>(EMPTY_SVC())
  const [saving, setSaving] = useState(false)

  // ── Dependências (predecessoras Fim→Início) ───────────────────────────────────
  const [dependencias, setDependencias] = useState<CronogramaDependencia[]>([])
  const [etapaPreds, setEtapaPreds] = useState<PredecessoraRef[]>([])
  const [subPreds,   setSubPreds]   = useState<PredecessoraRef[]>([])
  const [svcPreds,   setSvcPreds]   = useState<PredecessoraRef[]>([])
  const [pickerAberto, setPickerAberto] = useState<'etapa' | 'sub' | 'svc' | null>(null)
  // Atalho de predecessora direto no card (fora do modal): salva na hora, sem precisar abrir/salvar o formulário completo.
  const [pickerQuickAlvo, setPickerQuickAlvo] = useState<{ tipo: CronogramaItemTipo; id: string } | null>(null)

  // ── Financeiro (orçado × realizado) ───────────────────────────────────────────
  const [mostrarFinanceiro, setMostrarFinanceiro] = useState(false)
  const [orcadoPorEtapa, setOrcadoPorEtapa] = useState<Map<string, number>>(new Map())
  const [realizadoPorEtapa, setRealizadoPorEtapa] = useState<Map<string, number>>(new Map())
  const [realizadoPorSubetapa, setRealizadoPorSubetapa] = useState<Map<string, number>>(new Map())
  const [realizadoPorServico, setRealizadoPorServico] = useState<Map<string, number>>(new Map())

  useEffect(() => { loadData() }, [obraId, projetoId])

  useEffect(() => {
    function onDataChanged() { loadData() }
    window.addEventListener('buildsmart:obra-data-changed', onDataChanged)
    return () => window.removeEventListener('buildsmart:obra-data-changed', onDataChanged)
  }, [obraId, projetoId])

  useEffect(() => {
    if (!obraId) return
    supabase.from('obras').select('responsavel').eq('id', obraId).single()
      .then(({ data }: { data: { responsavel: string | null } | null }) => { if (data?.responsavel) setEmpreiteiro(data.responsavel) })
  }, [obraId])

  // Carrega dados financeiros só quando o toggle é ligado (lazy).
  useEffect(() => {
    if (!mostrarFinanceiro || !obraId) return
    loadFinanceiro()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarFinanceiro, obraId])

  async function loadFinanceiro() {
    const [orcRes, compRes] = await Promise.all([
      supabase.from('orcamentos')
        .select('bdi_percentual, orcamento_itens(etapa_id, quantidade, preco_unitario_snapshot)')
        .eq('obra_id', obraId).order('versao', { ascending: false }).limit(1),
      supabase.from('compra_itens').select('etapa_id, subetapa_id, servico_id, valor_total').eq('obra_id', obraId),
    ])
    const orc = (orcRes.data || [])[0] as { bdi_percentual: number; orcamento_itens: { etapa_id: string | null; quantidade: number; preco_unitario_snapshot: number }[] } | undefined
    const bdi = orc?.bdi_percentual ?? 25
    const orcMap = new Map<string, number>()
    ;(orc?.orcamento_itens ?? []).forEach(i => {
      if (!i.etapa_id) return
      const subtotal = (i.quantidade || 0) * (i.preco_unitario_snapshot || 0)
      orcMap.set(i.etapa_id, (orcMap.get(i.etapa_id) || 0) + subtotal * (1 + bdi / 100))
    })

    const etapaMap = new Map<string, number>()
    const subMap = new Map<string, number>()
    const svcMap = new Map<string, number>()
    ;((compRes.data ?? []) as { etapa_id: string | null; subetapa_id: string | null; servico_id: string | null; valor_total: number }[]).forEach(c => {
      if (c.etapa_id) etapaMap.set(c.etapa_id, (etapaMap.get(c.etapa_id) || 0) + (c.valor_total || 0))
      if (c.subetapa_id) subMap.set(c.subetapa_id, (subMap.get(c.subetapa_id) || 0) + (c.valor_total || 0))
      if (c.servico_id) svcMap.set(c.servico_id, (svcMap.get(c.servico_id) || 0) + (c.valor_total || 0))
    })
    setOrcadoPorEtapa(orcMap)
    setRealizadoPorEtapa(etapaMap)
    setRealizadoPorSubetapa(subMap)
    setRealizadoPorServico(svcMap)
  }

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

      if (obraId) {
        const sincronizado = await sincronizarCronogramaComOrcamento(etapasData, subsData, svcsData)
        subsData = sincronizado.subetapas
        svcsData = sincronizado.servicos
      }
    }
    setEtapas(etapasData)
    setSubetapas(subsData)
    setServicos(svcsData)

    if (obraId) {
      const { data: deps } = await supabase.from('cronograma_dependencias').select('*').eq('obra_id', obraId)
      setDependencias((deps ?? []) as CronogramaDependencia[])
    }
    setLoading(false)
  }

  async function sincronizarCronogramaComOrcamento(
    etapasData: Etapa[],
    subsAtuais: SubetapaCronograma[],
    svcsAtuais: ServicoCronograma[]
  ) {
    if (!obraId) return { subetapas: subsAtuais, servicos: svcsAtuais }

    const { data: orc } = await supabase
      .from('orcamentos')
      .select('id')
      .eq('obra_id', obraId)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!orc?.id) return { subetapas: subsAtuais, servicos: svcsAtuais }

    const { data: itensOrcamento } = await supabase
      .from('orcamento_itens')
      .select('etapa_id, subetapa, descricao_snapshot, composicoes_proprias(descricao), sinapi_composicoes(descricao)')
      .eq('orcamento_id', orc.id)

    const itensValidos = ((itensOrcamento ?? []) as OrcamentoCronogramaItem[])
      .filter(item => item.etapa_id && item.subetapa?.trim())

    if (itensValidos.length === 0) return { subetapas: subsAtuais, servicos: svcsAtuais }

    const etapaIdsValidos = new Set(etapasData.map(etapa => etapa.id))
    const subPorChave = new Map<string, SubetapaCronograma>()
    subsAtuais.forEach(sub => {
      subPorChave.set(`${sub.etapa_id}|${normalizarChaveCrono(sub.nome)}`, sub)
    })

    const novasSubsPayload: Array<Partial<SubetapaCronograma> & { etapa_id: string; nome: string; ordem: number }> = []
    const ordemPorEtapa = new Map<string, number>()
    subsAtuais.forEach(sub => {
      ordemPorEtapa.set(sub.etapa_id, Math.max(ordemPorEtapa.get(sub.etapa_id) ?? 0, sub.ordem ?? 0))
    })

    for (const item of itensValidos) {
      if (!item.etapa_id || !etapaIdsValidos.has(item.etapa_id) || !item.subetapa?.trim()) continue
      const nomeSub = item.subetapa.trim()
      const chave = `${item.etapa_id}|${normalizarChaveCrono(nomeSub)}`
      if (subPorChave.has(chave) || novasSubsPayload.some(sub => `${sub.etapa_id}|${normalizarChaveCrono(sub.nome)}` === chave)) continue
      const proxOrdem = (ordemPorEtapa.get(item.etapa_id) ?? 0) + 1
      ordemPorEtapa.set(item.etapa_id, proxOrdem)
      novasSubsPayload.push({
        etapa_id: item.etapa_id,
        nome: nomeSub,
        status: 'planejada',
        percentual_executado: 0,
        ordem: proxOrdem,
      })
    }

    let subsSincronizadas = subsAtuais
    if (novasSubsPayload.length > 0) {
      const { data: novasSubs, error } = await supabase
        .from('subetapas_cronograma')
        .insert(novasSubsPayload)
        .select('*')
      if (!error && novasSubs) {
        subsSincronizadas = [...subsAtuais, ...(novasSubs as SubetapaCronograma[])]
        ;(novasSubs as SubetapaCronograma[]).forEach(sub => {
          subPorChave.set(`${sub.etapa_id}|${normalizarChaveCrono(sub.nome)}`, sub)
        })
      }
    }

    const servicoPorChave = new Set(svcsAtuais.map(svc => `${svc.subetapa_id}|${normalizarChaveCrono(svc.nome)}`))
    const ordemPorSub = new Map<string, number>()
    svcsAtuais.forEach(svc => {
      ordemPorSub.set(svc.subetapa_id, Math.max(ordemPorSub.get(svc.subetapa_id) ?? 0, svc.ordem ?? 0))
    })

    const novosServicosPayload: Array<Partial<ServicoCronograma> & { subetapa_id: string; nome: string; ordem: number }> = []
    for (const item of itensValidos) {
      if (!item.etapa_id || !item.subetapa?.trim()) continue
      const sub = subPorChave.get(`${item.etapa_id}|${normalizarChaveCrono(item.subetapa)}`)
      if (!sub) continue
      const nomeServico = (item.descricao_snapshot || item.composicoes_proprias?.descricao || item.sinapi_composicoes?.descricao || '').trim()
      if (!nomeServico) continue
      const chaveServico = `${sub.id}|${normalizarChaveCrono(nomeServico)}`
      if (servicoPorChave.has(chaveServico) || novosServicosPayload.some(svc => `${svc.subetapa_id}|${normalizarChaveCrono(svc.nome)}` === chaveServico)) continue
      const proxOrdem = (ordemPorSub.get(sub.id) ?? 0) + 1
      ordemPorSub.set(sub.id, proxOrdem)
      novosServicosPayload.push({
        subetapa_id: sub.id,
        nome: nomeServico,
        percentual_executado: 0,
        ordem: proxOrdem,
      })
    }

    let svcsSincronizados = svcsAtuais
    if (novosServicosPayload.length > 0) {
      const { data: novosServicos, error } = await supabase
        .from('servicos_cronograma')
        .insert(novosServicosPayload)
        .select('*')
      if (!error && novosServicos) {
        svcsSincronizados = [...svcsAtuais, ...(novosServicos as ServicoCronograma[])]
      }
    }

    return { subetapas: subsSincronizadas, servicos: svcsSincronizados }
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

  function statusDoServico(svc: ServicoCronograma): CronogramaStatus {
    if ((svc.percentual_executado ?? 0) >= 100) return 'concluida'
    if ((svc.percentual_executado ?? 0) > 0) return 'em_andamento'
    return 'planejada'
  }

  const statusPermitido = (status: CronogramaStatus) => statusFiltro.includes(status)
  const servicoVisivel = (svc: ServicoCronograma) => statusPermitido(statusDoServico(svc))
  const subetapaVisivel = (sub: SubetapaCronograma) =>
    statusPermitido(sub.status) || svcsDaSub(sub.id).some(servicoVisivel)
  const etapaVisivel = (etapa: Etapa) => {
    const subs = subsDaEtapa(etapa.id)
    return statusPermitido(etapa.status) || subs.some(subetapaVisivel)
  }

  function progressoEtapa(etapaId: string): number {
    const subs = subsDaEtapa(etapaId)
    if (subs.length === 0) return etapas.find(e => e.id === etapaId)?.percentual_executado ?? 0
    return Math.round(subs.reduce((acc, s) => acc + s.percentual_executado, 0) / subs.length)
  }

  // ── Predecessoras — helpers ────────────────────────────────────────────────────

  function nomeDoItem(tipo: CronogramaItemTipo, id: string): string {
    if (tipo === 'etapa') return etapas.find(e => e.id === id)?.nome ?? '?'
    if (tipo === 'subetapa') return subetapas.find(s => s.id === id)?.nome ?? '?'
    return servicos.find(s => s.id === id)?.nome ?? '?'
  }

  function dataDoItem(tipo: CronogramaItemTipo, id: string) {
    if (tipo === 'etapa') { const e = etapas.find(x => x.id === id); return { inicio: e?.data_inicio ?? null, fim: e?.data_fim ?? null } }
    if (tipo === 'subetapa') { const s = subetapas.find(x => x.id === id); return { inicio: s?.data_inicio ?? null, fim: s?.data_fim ?? null } }
    const s = servicos.find(x => x.id === id); return { inicio: s?.data_inicio ?? null, fim: s?.data_fim ?? null }
  }

  // Próprio item + descendentes (pra excluir do picker — evita ciclo trivial).
  function descendentesDe(tipo: CronogramaItemTipo, id: string): Set<string> {
    const ids = new Set<string>([id])
    if (tipo === 'etapa') {
      subsDaEtapa(id).forEach(s => { ids.add(s.id); svcsDaSub(s.id).forEach(v => ids.add(v.id)) })
    } else if (tipo === 'subetapa') {
      svcsDaSub(id).forEach(v => ids.add(v.id))
    }
    return ids
  }

  function predecessorasDeItem(tipo: CronogramaItemTipo, id: string): CronogramaDependencia[] {
    return dependencias.filter(d => d.item_tipo === tipo && d.item_id === id)
  }

  function antecessorasDeItem(tipo: CronogramaItemTipo, id: string): CronogramaDependencia[] {
    return dependencias.filter(d => d.predecessor_tipo === tipo && d.predecessor_id === id)
  }

  // BFS: partindo da predecessora escolhida, percorre as predecessoras DELA —
  // se alcançar o próprio item, formaria um ciclo (A depende de B que depende de A).
  function criariCiclo(predecessorTipo: CronogramaItemTipo, predecessorId: string, itemTipo: CronogramaItemTipo, itemId: string): boolean {
    if (predecessorTipo === itemTipo && predecessorId === itemId) return true
    const visitados = new Set<string>()
    const fila: { tipo: CronogramaItemTipo; id: string }[] = [{ tipo: predecessorTipo, id: predecessorId }]
    while (fila.length > 0) {
      const atual = fila.shift()!
      const chave = `${atual.tipo}:${atual.id}`
      if (visitados.has(chave)) continue
      visitados.add(chave)
      const preds = predecessorasDeItem(atual.tipo, atual.id)
      for (const p of preds) {
        if (p.predecessor_tipo === itemTipo && p.predecessor_id === itemId) return true
        fila.push({ tipo: p.predecessor_tipo, id: p.predecessor_id })
      }
    }
    return false
  }

  function addOneDay(dateStr: string): string {
    const d = new Date(`${dateStr}T12:00:00`)
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  function calcDurCrono(inicio: string | null | undefined, fim: string | null | undefined): number | null {
    if (!inicio || !fim) return null
    const d1 = new Date(inicio + 'T00:00:00')
    const d2 = new Date(fim + 'T00:00:00')
    const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 ? diff : null
  }

  function addDaysCronoStr(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  // Diferença entre a lista nova (escolhida no picker) e a persistida — insere o
  // que faltava, remove o que foi tirado.
  async function salvarPredecessoras(itemTipo: CronogramaItemTipo, itemId: string, novaLista: PredecessoraRef[]) {
    if (!obraId) return
    const atuais = predecessorasDeItem(itemTipo, itemId)
    const novosIds = new Set(novaLista.map(p => `${p.tipo}:${p.id}`))
    const atuaisIds = new Set(atuais.map(d => `${d.predecessor_tipo}:${d.predecessor_id}`))

    const paraRemover = atuais.filter(d => !novosIds.has(`${d.predecessor_tipo}:${d.predecessor_id}`))
    const paraAdicionar = novaLista.filter(p => !atuaisIds.has(`${p.tipo}:${p.id}`))

    if (paraRemover.length > 0) {
      await Promise.all(paraRemover.map(d => supabase.from('cronograma_dependencias').delete().eq('id', d.id)))
    }
    if (paraAdicionar.length > 0) {
      const { data } = await supabase.from('cronograma_dependencias').insert(
        paraAdicionar.map(p => ({ obra_id: obraId, item_tipo: itemTipo, item_id: itemId, predecessor_tipo: p.tipo, predecessor_id: p.id }))
      ).select()
      if (data) setDependencias(prev => [...prev.filter(d => !paraRemover.some(r => r.id === d.id)), ...(data as CronogramaDependencia[])])
      return
    }
    if (paraRemover.length > 0) {
      setDependencias(prev => prev.filter(d => !paraRemover.some(r => r.id === d.id)))
    }
  }

  // Aviso de conflito: alguma predecessora termina depois do início do item?
  function conflitoDePredecessoras(tipo: CronogramaItemTipo, id: string, dataInicio: string | null): string | null {
    if (!dataInicio) return null
    const preds = predecessorasDeItem(tipo, id)
    for (const p of preds) {
      const { fim } = dataDoItem(p.predecessor_tipo, p.predecessor_id)
      if (fim && fim > dataInicio) return nomeDoItem(p.predecessor_tipo, p.predecessor_id)
    }
    return null
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
    setEtapaPreds([])
    setEtapaModal({ open: true, editando: null })
  }

  function openEditEtapa(etapa: Etapa) {
    setEtapaForm({
      nome: etapa.nome, data_inicio: etapa.data_inicio ?? '',
      data_fim: etapa.data_fim ?? '', status: etapa.status,
      percentual_executado: etapa.percentual_executado ?? 0,
      is_marco: etapa.is_marco ?? false,
    })
    setEtapaPreds(predecessorasDeItem('etapa', etapa.id).map(d => ({
      tipo: d.predecessor_tipo, id: d.predecessor_id, nome: nomeDoItem(d.predecessor_tipo, d.predecessor_id), data_fim: dataDoItem(d.predecessor_tipo, d.predecessor_id).fim,
    })))
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
      is_marco: etapaForm.is_marco,
    }
    let etapaId = editando?.id
    if (editando) {
      await supabase.from('etapas').update(payload).eq('id', editando.id)
      setEtapas(prev => prev.map(e => e.id === editando.id ? { ...e, ...payload } : e))
    } else {
      const maxOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0)
      const fk = obraId ? { obra_id: obraId } : { projeto_id: projetoId }
      const { data } = await supabase.from('etapas').insert({ ...fk, ...payload, ordem: maxOrdem + 1 }).select().single()
      if (data) { setEtapas(prev => [...prev, data as Etapa]); etapaId = (data as Etapa).id }
    }
    if (etapaId) await salvarPredecessoras('etapa', etapaId, etapaPreds)
    setSaving(false)
    setEtapaModal({ open: false, editando: null })
  }

  async function deleteEtapa(id: string) {
    if (!confirm('Remover etapa e todas as subetapas? Itens de orçamento e materiais vinculados ficarão sem etapa.')) return
    const { error } = await supabase.from('etapas').delete().eq('id', id)
    if (error) { alert('Erro ao remover etapa: ' + error.message); return }
    const subIds = subsDaEtapa(id).map(s => s.id)
    setEtapas(prev => prev.filter(e => e.id !== id))
    setSubetapas(prev => prev.filter(s => s.etapa_id !== id))
    setServicos(prev => prev.filter(s => !subIds.includes(s.subetapa_id)))
  }

  // ── CRUD Subetapa ─────────────────────────────────────────────────────────────

  function openNewSub(etapaId: string) {
    setSubForm(EMPTY_SUB(empreiteiro))
    setSubPreds([])
    setSubModal({ open: true, etapaId, editando: null })
  }

  function openEditSub(sub: SubetapaCronograma) {
    setSubForm({
      nome: sub.nome, data_inicio: sub.data_inicio ?? '',
      data_fim: sub.data_fim ?? '', status: sub.status,
      percentual_executado: sub.percentual_executado, responsavel: sub.responsavel ?? '',
      is_marco: sub.is_marco ?? false,
    })
    setSubPreds(predecessorasDeItem('subetapa', sub.id).map(d => ({
      tipo: d.predecessor_tipo, id: d.predecessor_id, nome: nomeDoItem(d.predecessor_tipo, d.predecessor_id), data_fim: dataDoItem(d.predecessor_tipo, d.predecessor_id).fim,
    })))
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
      is_marco: subForm.is_marco,
    }
    let novoSubId = editando?.id
    if (editando) {
      await supabase.from('subetapas_cronograma').update(payload).eq('id', editando.id)
      setSubetapas(prev => prev.map(s => s.id === editando.id ? { ...s, ...payload } : s))
    } else {
      const maxOrdem = subsDaEtapa(etapaId!).reduce((m, s) => Math.max(m, s.ordem), 0)
      const { data } = await supabase.from('subetapas_cronograma').insert({ etapa_id: etapaId, ...payload, ordem: maxOrdem + 1 }).select().single()
      if (data) { setSubetapas(prev => [...prev, data as SubetapaCronograma]); novoSubId = (data as SubetapaCronograma).id }
    }
    if (novoSubId) await salvarPredecessoras('subetapa', novoSubId, subPreds)
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
    setSvcPreds([])
    setSvcModal({ open: true, subetapaId, editando: null })
  }

  function openEditSvc(svc: ServicoCronograma) {
    setSvcForm({
      nome: svc.nome, data_inicio: svc.data_inicio ?? '',
      data_fim: svc.data_fim ?? '',
      percentual_executado: svc.percentual_executado, responsavel: svc.responsavel ?? '',
      is_marco: svc.is_marco ?? false,
    })
    setSvcPreds(predecessorasDeItem('servico', svc.id).map(d => ({
      tipo: d.predecessor_tipo, id: d.predecessor_id, nome: nomeDoItem(d.predecessor_tipo, d.predecessor_id), data_fim: dataDoItem(d.predecessor_tipo, d.predecessor_id).fim,
    })))
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
      is_marco: svcForm.is_marco,
    }
    let novoSvcId = editando?.id
    if (editando) {
      await supabase.from('servicos_cronograma').update(payload).eq('id', editando.id)
      setServicos(prev => prev.map(s => s.id === editando.id ? { ...s, ...payload } : s))
    } else {
      const maxOrdem = svcsDaSub(subetapaId!).reduce((m, s) => Math.max(m, s.ordem), 0)
      const { data } = await supabase.from('servicos_cronograma').insert({ subetapa_id: subetapaId, ...payload, ordem: maxOrdem + 1 }).select().single()
      if (data) { setServicos(prev => [...prev, data as ServicoCronograma]); novoSvcId = (data as ServicoCronograma).id }
    }
    if (novoSvcId) await salvarPredecessoras('servico', novoSvcId, svcPreds)
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

  // ── Picker de predecessoras — compartilhado pelos 3 modais ────────────────────

  function excluirIdsAtual(): Set<string> {
    if (pickerQuickAlvo) return descendentesDe(pickerQuickAlvo.tipo, pickerQuickAlvo.id)
    if (pickerAberto === 'etapa') return etapaModal.editando ? descendentesDe('etapa', etapaModal.editando.id) : new Set()
    if (pickerAberto === 'sub') return subModal.editando ? descendentesDe('subetapa', subModal.editando.id) : new Set()
    if (pickerAberto === 'svc') return svcModal.editando ? descendentesDe('servico', svcModal.editando.id) : new Set()
    return new Set()
  }

  function jaSelecionadosAtual(): Set<string> {
    if (pickerQuickAlvo) return new Set(predecessorasDeItem(pickerQuickAlvo.tipo, pickerQuickAlvo.id).map(d => d.predecessor_id))
    if (pickerAberto === 'etapa') return new Set(etapaPreds.map(p => p.id))
    if (pickerAberto === 'sub') return new Set(subPreds.map(p => p.id))
    if (pickerAberto === 'svc') return new Set(svcPreds.map(p => p.id))
    return new Set()
  }

  function confirmarPicker(refs: PredecessoraRef[]) {
    if (pickerQuickAlvo) {
      const { tipo, id } = pickerQuickAlvo
      const bloqueados = refs.filter(r => criariCiclo(r.tipo, r.id, tipo, id))
      const refsValidos = bloqueados.length > 0
        ? refs.filter(r => !bloqueados.includes(r))
        : refs
      if (bloqueados.length > 0) {
        alert(`Não é possível usar como predecessora: ${bloqueados.map(b => b.nome).join(', ')} — geraria uma dependência circular.`)
      }
      salvarPredecessoras(tipo, id, refsValidos)

      const maiorFim = refsValidos.map(r => r.data_fim).filter((v): v is string => !!v).sort().pop()
      if (maiorFim) {
        const { inicio: dataAtual } = dataDoItem(tipo, id)
        if (!dataAtual) {
          const table = tipo === 'etapa' ? 'etapas' : tipo === 'subetapa' ? 'subetapas_cronograma' : 'servicos_cronograma'
          updateDateInline(table, id, 'data_inicio', addOneDay(maiorFim))
        }
      }

      setPickerQuickAlvo(null)
      return
    }

    const itemTipo: CronogramaItemTipo | null = pickerAberto === 'etapa' ? 'etapa' : pickerAberto === 'sub' ? 'subetapa' : pickerAberto === 'svc' ? 'servico' : null
    const editandoId = pickerAberto === 'etapa' ? etapaModal.editando?.id : pickerAberto === 'sub' ? subModal.editando?.id : pickerAberto === 'svc' ? svcModal.editando?.id : undefined

    let refsValidos = refs
    if (itemTipo && editandoId) {
      const bloqueados = refs.filter(r => criariCiclo(r.tipo, r.id, itemTipo, editandoId))
      if (bloqueados.length > 0) {
        alert(`Não é possível usar como predecessora: ${bloqueados.map(b => b.nome).join(', ')} — geraria uma dependência circular.`)
        refsValidos = refs.filter(r => !bloqueados.includes(r))
      }
    }

    const maiorFim = refsValidos.map(r => r.data_fim).filter((v): v is string => !!v).sort().pop()

    if (pickerAberto === 'etapa') {
      setEtapaPreds(refsValidos)
      if (maiorFim && !etapaForm.data_inicio) setEtapaForm(f => ({ ...f, data_inicio: addOneDay(maiorFim) }))
    } else if (pickerAberto === 'sub') {
      setSubPreds(refsValidos)
      if (maiorFim && !subForm.data_inicio) setSubForm(f => ({ ...f, data_inicio: addOneDay(maiorFim) }))
    } else if (pickerAberto === 'svc') {
      setSvcPreds(refsValidos)
      if (maiorFim && !svcForm.data_inicio) setSvcForm(f => ({ ...f, data_inicio: addOneDay(maiorFim) }))
    }
  }

  async function toggleMarco(table: 'etapas' | 'subetapas_cronograma' | 'servicos_cronograma', id: string, atual: boolean) {
    const novo = !atual
    await supabase.from(table).update({ is_marco: novo }).eq('id', id)
    if (table === 'etapas') setEtapas(prev => prev.map(e => e.id === id ? { ...e, is_marco: novo } : e))
    if (table === 'subetapas_cronograma') setSubetapas(prev => prev.map(s => s.id === id ? { ...s, is_marco: novo } : s))
    if (table === 'servicos_cronograma') setServicos(prev => prev.map(s => s.id === id ? { ...s, is_marco: novo } : s))
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
            { key: 'cascata', label: 'Estrutura', icon: LayoutList },
            { key: 'gantt',   label: 'Gantt',   icon: BarChart2 },
            { key: 'kanban',  label: 'Kanban',  icon: KanbanSquare },
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarFinanceiro(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
            style={mostrarFinanceiro
              ? { background: 'rgba(16,185,129,0.12)', color: 'var(--success)', borderColor: 'var(--success)' }
              : { color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            title="Alternar entre cronograma físico e físico-financeiro"
          >
            <Wallet size={15} /> Financeiro
          </button>
          <Button icon={<Plus size={16} />} onClick={openNewEtapa}>Nova Etapa</Button>
        </div>
      </div>

      <div className="card p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Filtro de status
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFiltro(['planejada', 'em_andamento', 'atrasada'])}
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Pendentes
            </button>
            <button
              onClick={() => setStatusFiltro(STATUS_FILTRO.map(s => s.key))}
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Mostrar tudo
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {STATUS_FILTRO.map(status => {
            const ativo = statusFiltro.includes(status.key)
            return (
              <button
                key={status.key}
                onClick={() => setStatusFiltro(prev => {
                  if (ativo && prev.length > 1) return prev.filter(s => s !== status.key)
                  if (ativo) return prev
                  return [...prev, status.key]
                })}
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={ativo
                  ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }
                  : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {status.label}
              </button>
            )
          })}
        </div>
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
          mostrarFinanceiro={mostrarFinanceiro}
          orcadoPorEtapa={orcadoPorEtapa}
          realizadoPorEtapa={realizadoPorEtapa}
          realizadoPorSubetapa={realizadoPorSubetapa}
          statusFiltro={statusFiltro}
        />
      ) : tab === 'cascata' ? (
        /* ── CASCATA (grid) ── */
        <div className="card overflow-hidden">
          {/* Cabeçalho de colunas */}
          <div
            className="hidden sm:grid text-xs font-medium px-2 py-2"
            style={{
              gridTemplateColumns: '1fr 110px 70px 110px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span className="pl-10">Item / Etapa</span>
            <span>Início</span>
            <span>Duração</span>
            <span>Fim</span>
          </div>

          {etapas.filter(etapaVisivel).map(etapa => {
            const subs = subsDaEtapa(etapa.id).filter(subetapaVisivel)
            const isCollapsedEtapa = collapsed[etapa.id] ?? false
            const prog = progressoEtapa(etapa.id)
            const etapaDur = calcDurCrono(etapa.data_inicio, etapa.data_fim)
            const etapaAtrasada = !!(etapa.data_fim && prog < 100 && new Date(etapa.data_fim) < new Date())

            return (
              <Fragment key={etapa.id}>
                {/* ── Linha Etapa (nível 1) — grid row ── */}
                <div
                  className="block sm:grid items-center group hover:bg-[var(--bg-secondary)] transition-colors px-2 py-1.5"
                  style={{
                    gridTemplateColumns: '1fr 110px 70px 110px',
                    background: 'rgba(59,123,248,0.06)',
                    borderBottom: '1px solid var(--border)',
                    minHeight: 36,
                  }}
                >
                  {/* Col 1: Nome + expand + status + marco + ações */}
                  <div className="flex items-center gap-1.5 py-1 min-w-0 flex-wrap sm:flex-nowrap" style={{ paddingLeft: 0 }}>
                    <button onClick={() => toggle(etapa.id)} className="w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {isCollapsedEtapa ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>

                    <span className="flex-1 text-sm font-semibold truncate min-w-0" style={{ color: 'var(--accent)' }}>
                      {etapa.nome}
                      <span className="ml-2 text-[10px] font-normal opacity-60">{prog}%</span>
                    </span>

                    <button
                      className="p-0.5 rounded flex-shrink-0 hover:bg-[var(--bg-card)] transition-colors"
                      title={etapa.is_marco ? 'Marco — clique para remover' : 'Marcar como marco'}
                      onClick={() => toggleMarco('etapas', etapa.id, etapa.is_marco)}
                    >
                      <Flag size={12} style={{ color: etapa.is_marco ? '#F59E0B' : 'var(--text-secondary)' }} fill={etapa.is_marco ? '#F59E0B' : 'none'} strokeWidth={etapa.is_marco ? 2.5 : 1.5} />
                    </button>

                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                      {STATUS_ETAPA_LABEL[etapa.status]}
                    </span>

                    <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
                      <button onClick={() => openNewSub(etapa.id)} className="p-1 rounded hover:bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }} title="Adicionar subetapa"><Plus size={12} /></button>
                      <button onClick={() => openEditEtapa(etapa)} className="p-1 rounded hover:bg-[var(--bg-card)]"><Pencil size={11} style={{ color: 'var(--text-secondary)' }} /></button>
                      <button onClick={() => deleteEtapa(etapa.id)} className="p-1 rounded hover:bg-red-500/10"><Trash2 size={11} style={{ color: 'var(--danger)' }} /></button>
                    </div>

                    {/* Mobile dates */}
                    <div className="basis-full sm:hidden grid grid-cols-3 gap-2 mt-2" style={{ paddingLeft: 24 }}>
                      <label className="min-w-0">
                        <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Início</span>
                        <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={etapa.data_inicio ?? ''} onChange={e => updateDateInline('etapas', etapa.id, 'data_inicio', e.target.value)} />
                      </label>
                      <label className="min-w-0">
                        <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</span>
                        <input type="number" min={0} className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="dias" value={etapaDur ?? ''} onChange={e => { const d = parseInt(e.target.value); if (!isNaN(d) && d >= 0 && etapa.data_inicio) updateDateInline('etapas', etapa.id, 'data_fim', addDaysCronoStr(etapa.data_inicio, d)) }} />
                      </label>
                      <label className="min-w-0">
                        <span className="block text-[10px] mb-1" style={{ color: etapaAtrasada ? '#EF4444' : 'var(--text-secondary)' }}>Fim</span>
                        <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: etapaAtrasada ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }} value={etapa.data_fim ?? ''} onChange={e => updateDateInline('etapas', etapa.id, 'data_fim', e.target.value)} />
                      </label>
                    </div>

                    {mostrarFinanceiro && (
                      <div className="basis-full flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-md w-fit" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', marginLeft: 24 }}>
                        <Wallet size={10} style={{ color: '#10b981' }} />
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(realizadoPorEtapa.get(etapa.id) ?? 0)}</span>
                        <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>de {formatCurrency(orcadoPorEtapa.get(etapa.id) ?? 0)}</span>
                      </div>
                    )}
                  </div>

                  {/* Col 2: Início */}
                  <div className="hidden sm:block py-1">
                    <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={etapa.data_inicio ?? ''} onChange={e => updateDateInline('etapas', etapa.id, 'data_inicio', e.target.value)} />
                  </div>
                  {/* Col 3: Duração */}
                  <div className="hidden sm:block py-1">
                    <input type="number" min={0} className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="—" value={etapaDur ?? ''} onChange={e => { const d = parseInt(e.target.value); if (!isNaN(d) && d >= 0 && etapa.data_inicio) updateDateInline('etapas', etapa.id, 'data_fim', addDaysCronoStr(etapa.data_inicio, d)) }} />
                  </div>
                  {/* Col 4: Fim */}
                  <div className="hidden sm:block py-1">
                    <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-secondary)', borderColor: etapaAtrasada ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }} value={etapa.data_fim ?? ''} onChange={e => updateDateInline('etapas', etapa.id, 'data_fim', e.target.value)} />
                  </div>
                </div>

                {/* ── Subetapas (nível 2) ── */}
                {!isCollapsedEtapa && subs.map(sub => {
                  const svcs = svcsDaSub(sub.id).filter(servicoVisivel)
                  const isCollapsedSub = collapsed[sub.id] ?? false
                  const subDur = calcDurCrono(sub.data_inicio, sub.data_fim)
                  const subAtrasada = !!(sub.data_fim && sub.percentual_executado < 100 && new Date(sub.data_fim) < new Date())
                  return (
                    <Fragment key={sub.id}>
                      <div
                        className="block sm:grid items-center group hover:bg-[var(--bg-secondary)] transition-colors px-2 py-1.5"
                        style={{
                          gridTemplateColumns: '1fr 110px 70px 110px',
                          background: 'rgba(255,255,255,0.018)',
                          borderBottom: '1px solid var(--border)',
                          minHeight: 36,
                        }}
                      >
                        <div className="flex items-center gap-1.5 py-1 min-w-0 flex-wrap sm:flex-nowrap" style={{ paddingLeft: 20 }}>
                          <button onClick={() => toggle(sub.id)} className="w-4 h-4 flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-secondary)', visibility: svcs.length > 0 ? 'visible' : 'hidden' }}>
                            {isCollapsedSub ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>

                          <span className="flex-1 text-sm font-medium truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{sub.nome}</span>

                          <button
                            className="p-0.5 rounded flex-shrink-0 hover:bg-[var(--bg-card)] transition-colors"
                            title={sub.is_marco ? 'Marco — clique para remover' : 'Marcar como marco'}
                            onClick={() => toggleMarco('subetapas_cronograma', sub.id, sub.is_marco)}
                          >
                            <Flag size={12} style={{ color: sub.is_marco ? '#F59E0B' : 'var(--text-secondary)' }} fill={sub.is_marco ? '#F59E0B' : 'none'} strokeWidth={sub.is_marco ? 2.5 : 1.5} />
                          </button>

                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_ETAPA_COLOR[sub.status]}`}>
                            {STATUS_ETAPA_LABEL[sub.status]}
                          </span>

                          <PctInput value={sub.percentual_executado} onChange={v => updatePct('subetapas_cronograma', sub.id, v)} small />

                          <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => openNewSvc(sub.id)} className="p-1 rounded hover:bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }}><Plus size={11} /></button>
                            <button onClick={() => openEditSub(sub)} className="p-1 rounded hover:bg-[var(--bg-card)]"><Pencil size={11} style={{ color: 'var(--text-secondary)' }} /></button>
                            <button onClick={() => deleteSub(sub)} className="p-1 rounded hover:bg-red-500/10"><Trash2 size={11} style={{ color: 'var(--danger)' }} /></button>
                          </div>

                          {/* Mobile dates */}
                          <div className="basis-full sm:hidden grid grid-cols-3 gap-2 mt-2" style={{ paddingLeft: 20 }}>
                            <label className="min-w-0">
                              <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Início</span>
                              <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={sub.data_inicio ?? ''} onChange={e => updateDateInline('subetapas_cronograma', sub.id, 'data_inicio', e.target.value)} />
                            </label>
                            <label className="min-w-0">
                              <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</span>
                              <input type="number" min={0} className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="dias" value={subDur ?? ''} onChange={e => { const d = parseInt(e.target.value); if (!isNaN(d) && d >= 0 && sub.data_inicio) updateDateInline('subetapas_cronograma', sub.id, 'data_fim', addDaysCronoStr(sub.data_inicio, d)) }} />
                            </label>
                            <label className="min-w-0">
                              <span className="block text-[10px] mb-1" style={{ color: subAtrasada ? '#EF4444' : 'var(--text-secondary)' }}>Fim</span>
                              <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: subAtrasada ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }} value={sub.data_fim ?? ''} onChange={e => updateDateInline('subetapas_cronograma', sub.id, 'data_fim', e.target.value)} />
                            </label>
                          </div>

                          {/* Predecessoras + financeiro */}
                          <div className="basis-full flex flex-wrap items-center gap-1.5 mt-1" style={{ paddingLeft: 20 }}>
                            {predecessorasDeItem('subetapa', sub.id).map(p => (
                              <span key={p.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,123,248,0.08)', color: 'var(--accent)', border: '1px solid rgba(59,123,248,0.25)' }}>
                                <Link2 size={9} />
                                <span className="font-medium">Dep:</span> {nomeDoItem(p.predecessor_tipo, p.predecessor_id)}
                                <button onClick={() => salvarPredecessoras('subetapa', sub.id, predecessorasDeItem('subetapa', sub.id).filter(x => x.id !== p.id).map(x => ({ tipo: x.predecessor_tipo, id: x.predecessor_id, nome: nomeDoItem(x.predecessor_tipo, x.predecessor_id), data_fim: dataDoItem(x.predecessor_tipo, x.predecessor_id).fim })))} className="opacity-60 hover:opacity-100"><X size={9} /></button>
                              </span>
                            ))}
                            <button onClick={() => setPickerQuickAlvo({ tipo: 'subetapa', id: sub.id })} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full hover:bg-[var(--bg-card)] transition-colors" style={{ color: 'var(--accent)', border: '1px dashed var(--border)' }}>
                              <Plus size={9} /> Predecessora
                            </button>
                          </div>
                          {conflitoDePredecessoras('subetapa', sub.id, sub.data_inicio) && (
                            <p className="basis-full text-[10px] mt-1" style={{ color: 'var(--danger)', paddingLeft: 20 }}>Conflita com predecessora: {conflitoDePredecessoras('subetapa', sub.id, sub.data_inicio)}</p>
                          )}
                          {mostrarFinanceiro && (
                            <div className="basis-full flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md w-fit" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', marginLeft: 20 }}>
                              <Wallet size={10} style={{ color: '#10b981' }} />
                              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(realizadoPorSubetapa.get(sub.id) ?? 0)}</span>
                              <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>realizado</span>
                            </div>
                          )}
                        </div>

                        {/* Col 2: Início */}
                        <div className="hidden sm:block py-1">
                          <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={sub.data_inicio ?? ''} onChange={e => updateDateInline('subetapas_cronograma', sub.id, 'data_inicio', e.target.value)} />
                        </div>
                        {/* Col 3: Duração */}
                        <div className="hidden sm:block py-1">
                          <input type="number" min={0} className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="—" value={subDur ?? ''} onChange={e => { const d = parseInt(e.target.value); if (!isNaN(d) && d >= 0 && sub.data_inicio) updateDateInline('subetapas_cronograma', sub.id, 'data_fim', addDaysCronoStr(sub.data_inicio, d)) }} />
                        </div>
                        {/* Col 4: Fim */}
                        <div className="hidden sm:block py-1">
                          <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-secondary)', borderColor: subAtrasada ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }} value={sub.data_fim ?? ''} onChange={e => updateDateInline('subetapas_cronograma', sub.id, 'data_fim', e.target.value)} />
                        </div>
                      </div>

                      {/* ── Serviços (nível 3) ── */}
                      {!isCollapsedSub && svcs.map(svc => {
                        const svcDur = calcDurCrono(svc.data_inicio, svc.data_fim)
                        const svcAtrasada = !!(svc.data_fim && svc.percentual_executado < 100 && new Date(svc.data_fim) < new Date())
                        return (
                          <div
                            key={svc.id}
                            className="block sm:grid items-center group hover:bg-[var(--bg-card)] transition-colors px-2 py-1.5"
                            style={{ gridTemplateColumns: '1fr 110px 70px 110px', borderBottom: '1px solid var(--border)', minHeight: 32 }}
                          >
                            <div className="flex items-center gap-1.5 py-1 min-w-0 flex-wrap sm:flex-nowrap" style={{ paddingLeft: 44 }}>
                              <Check size={12} className="flex-shrink-0" style={{ color: svc.percentual_executado >= 100 ? '#10b981' : 'var(--border)' }} />
                              <span className="flex-1 text-xs truncate min-w-0" style={{ color: 'var(--text-primary)' }}>{svc.nome}</span>

                              <button className="p-0.5 rounded flex-shrink-0 hover:bg-[var(--bg-card)] transition-colors" title={svc.is_marco ? 'Marco — remover' : 'Marcar como marco'} onClick={() => toggleMarco('servicos_cronograma', svc.id, svc.is_marco)}>
                                <Flag size={11} style={{ color: svc.is_marco ? '#F59E0B' : 'var(--text-secondary)' }} fill={svc.is_marco ? '#F59E0B' : 'none'} strokeWidth={svc.is_marco ? 2.5 : 1.5} />
                              </button>

                              <PctInput value={svc.percentual_executado} onChange={v => updatePct('servicos_cronograma', svc.id, v)} small />

                              <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button onClick={() => openEditSvc(svc)} className="p-1 rounded hover:bg-[var(--bg-card)]"><Pencil size={10} style={{ color: 'var(--text-secondary)' }} /></button>
                                <button onClick={() => deleteSvc(svc.id)} className="p-1 rounded hover:bg-red-500/10"><Trash2 size={10} style={{ color: 'var(--danger)' }} /></button>
                              </div>

                              {/* Mobile dates */}
                              <div className="basis-full sm:hidden grid grid-cols-3 gap-2 mt-2" style={{ paddingLeft: 16 }}>
                                <label className="min-w-0">
                                  <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Início</span>
                                  <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={svc.data_inicio ?? ''} onChange={e => updateDateInline('servicos_cronograma', svc.id, 'data_inicio', e.target.value)} />
                                </label>
                                <label className="min-w-0">
                                  <span className="block text-[10px] mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</span>
                                  <input type="number" min={0} className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="dias" value={svcDur ?? ''} onChange={e => { const d = parseInt(e.target.value); if (!isNaN(d) && d >= 0 && svc.data_inicio) updateDateInline('servicos_cronograma', svc.id, 'data_fim', addDaysCronoStr(svc.data_inicio, d)) }} />
                                </label>
                                <label className="min-w-0">
                                  <span className="block text-[10px] mb-1" style={{ color: svcAtrasada ? '#EF4444' : 'var(--text-secondary)' }}>Fim</span>
                                  <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-card)', borderColor: svcAtrasada ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }} value={svc.data_fim ?? ''} onChange={e => updateDateInline('servicos_cronograma', svc.id, 'data_fim', e.target.value)} />
                                </label>
                              </div>
                            </div>

                            <div className="hidden sm:block py-1">
                              <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={svc.data_inicio ?? ''} onChange={e => updateDateInline('servicos_cronograma', svc.id, 'data_inicio', e.target.value)} />
                            </div>
                            <div className="hidden sm:block py-1">
                              <input type="number" min={0} className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} placeholder="—" value={svcDur ?? ''} onChange={e => { const d = parseInt(e.target.value); if (!isNaN(d) && d >= 0 && svc.data_inicio) updateDateInline('servicos_cronograma', svc.id, 'data_fim', addDaysCronoStr(svc.data_inicio, d)) }} />
                            </div>
                            <div className="hidden sm:block py-1">
                              <input type="date" className="w-full min-h-9 rounded-lg border px-2 text-xs outline-none" style={{ background: 'var(--bg-secondary)', borderColor: svcAtrasada ? '#EF4444' : 'var(--border)', color: 'var(--text-primary)' }} value={svc.data_fim ?? ''} onChange={e => updateDateInline('servicos_cronograma', svc.id, 'data_fim', e.target.value)} />
                            </div>
                          </div>
                        )
                      })}

                      {!isCollapsedSub && (
                        <div className="pl-16 pr-4 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                          <button onClick={() => openNewSvc(sub.id)} className="text-xs opacity-40 hover:opacity-70 transition-opacity" style={{ color: 'var(--accent)' }}>+ Serviço</button>
                        </div>
                      )}
                    </Fragment>
                  )
                })}

                {!isCollapsedEtapa && (
                  <div className="pl-10 pr-4 py-1.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    <button onClick={() => openNewSub(etapa.id)} className="text-xs opacity-40 hover:opacity-70 transition-opacity" style={{ color: 'var(--accent)' }}>+ Subetapa</button>
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
          dependencias={dependencias}
          onUpdateDate={updateDateInline}
          onUpdatePct={updatePct}
          mostrarFinanceiro={mostrarFinanceiro}
          orcadoPorEtapa={orcadoPorEtapa}
          realizadoPorEtapa={realizadoPorEtapa}
          realizadoPorSubetapa={realizadoPorSubetapa}
          realizadoPorServico={realizadoPorServico}
          statusFiltro={statusFiltro}
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Predecessoras (Fim → Início)</label>
            <div className="flex flex-wrap gap-1.5">
              {etapaPreds.map(p => (
                <span key={`${p.tipo}:${p.id}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                  {p.nome}
                  <button onClick={() => setEtapaPreds(prev => prev.filter(x => x.id !== p.id))} className="opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
              <button onClick={() => setPickerAberto('etapa')} className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                + Adicionar predecessora
              </button>
            </div>
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
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={subForm.is_marco} onChange={e => setSubForm(f => ({ ...f, is_marco: e.target.checked }))} />
            É um marco de projeto
          </label>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Predecessoras (Fim → Início)</label>
            <div className="flex flex-wrap gap-1.5">
              {subPreds.map(p => (
                <span key={`${p.tipo}:${p.id}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                  {p.nome}
                  <button onClick={() => setSubPreds(prev => prev.filter(x => x.id !== p.id))} className="opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
              <button onClick={() => setPickerAberto('sub')} className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                + Adicionar predecessora
              </button>
            </div>
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
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Predecessoras (Fim → Início)</label>
            <div className="flex flex-wrap gap-1.5">
              {svcPreds.map(p => (
                <span key={`${p.tipo}:${p.id}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                  {p.nome}
                  <button onClick={() => setSvcPreds(prev => prev.filter(x => x.id !== p.id))} className="opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
              <button onClick={() => setPickerAberto('svc')} className="text-xs px-2 py-1 rounded-full border" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                + Adicionar predecessora
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSvcModal({ open: false, subetapaId: null, editando: null })}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!svcForm.nome} onClick={saveSvc}>{svcModal.editando ? 'Salvar' : 'Adicionar'}</Button>
          </div>
        </div>
      </Modal>

      {/* ── Picker de predecessoras (compartilhado pelos 3 modais + atalho rápido do card) ── */}
      <PredecessorPicker
        open={pickerAberto !== null || pickerQuickAlvo !== null}
        onClose={() => { setPickerAberto(null); setPickerQuickAlvo(null) }}
        etapas={etapas}
        subetapas={subetapas}
        servicos={servicos}
        excluirIds={excluirIdsAtual()}
        jaSelecionadosIds={jaSelecionadosAtual()}
        onConfirmar={confirmarPicker}
      />
    </div>
  )
}

// ── DateCell: clique para editar data inline ──────────────────────────────────
function DateCell({ value, onCommit }: {
  value: string | null | undefined
  isEditing: boolean
  onStartEdit: () => void
  onCommit: (v: string) => void
}) {
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={e => onCommit(e.target.value)}
      className="min-h-9 w-[8.75rem] rounded-lg border px-2 text-xs outline-none"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    />
  )
}

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

function KanbanObraView({ etapas, subetapas, servicos, onUpdateStatus, onUpdatePct, onEditSub, onEditEtapa, onNewSub, editField, onSetEditField, onUpdateDate, mostrarFinanceiro, orcadoPorEtapa, realizadoPorEtapa, realizadoPorSubetapa, statusFiltro }: {
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
  mostrarFinanceiro: boolean
  orcadoPorEtapa: Map<string, number>
  realizadoPorEtapa: Map<string, number>
  realizadoPorSubetapa: Map<string, number>
  statusFiltro: CronogramaStatus[]
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
    if (!statusFiltro.includes(st)) return
    ;(byStatus[st] as { type: 'sub'; item: SubetapaCronograma; etapaNome: string }[]).push({
      type: 'sub', item: sub, etapaNome: etapaNome[sub.etapa_id] ?? '',
    })
  })

  // Etapas sem subetapas também como cards
  etapas.forEach(etapa => {
    const hasSubs = subetapas.some(s => s.etapa_id === etapa.id)
    if (!hasSubs) {
      const st = (etapa.status as KStatus) ?? 'planejada'
      if (!statusFiltro.includes(st)) return
      const subsCount = subetapas.filter(s => s.etapa_id === etapa.id).length
      ;(byStatus[st] as { type: 'etapa'; item: Etapa; subsCount: number }[]).push({
        type: 'etapa', item: etapa, subsCount,
      })
    }
  })

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible sm:pb-0">
      {KANBAN_COLS.filter(col => statusFiltro.includes(col.key)).map(col => {
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
                    <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                      {etapa.nome}
                    </span>
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
                    {mostrarFinanceiro && (
                      <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        💰 {formatCurrency(realizadoPorEtapa.get(etapa.id) ?? 0)} / {formatCurrency(orcadoPorEtapa.get(etapa.id) ?? 0)}
                      </p>
                    )}
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
                  <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                    {sub.nome}
                    {sub.is_marco && <Flag size={14} style={{ color: '#F59E0B' }} fill="#F59E0B" />}
                  </span>
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
                  {mostrarFinanceiro && (
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>💰 Realizado {formatCurrency(realizadoPorSubetapa.get(sub.id) ?? 0)}</p>
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
  is_marco: boolean
  children: ObraGanttNode[]
}

type GanttEff = { inicio: string | null; fim: string | null; pct: number }

const GANTT_ROW_H = 40
const GANTT_HDR_H = 36
const GANTT_LEFT_W = 260
const GANTT_DATE_COL_W = 90
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
        is_marco: sub.is_marco ?? false,
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
            is_marco: svc.is_marco ?? false,
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
      is_marco: etapa.is_marco ?? false,
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
  dependencias,
  onUpdateDate,
  onUpdatePct,
  mostrarFinanceiro,
  orcadoPorEtapa,
  realizadoPorEtapa,
  realizadoPorSubetapa,
  realizadoPorServico,
  statusFiltro,
}: {
  etapas: Etapa[]
  subetapas: SubetapaCronograma[]
  servicos: ServicoCronograma[]
  dependencias: CronogramaDependencia[]
  onUpdateDate: (table: ObraGanttTable, id: string, field: 'data_inicio' | 'data_fim', value: string) => void
  onUpdatePct: (table: ObraGanttTable, id: string, pct: number) => void
  mostrarFinanceiro: boolean
  orcadoPorEtapa: Map<string, number>
  realizadoPorEtapa: Map<string, number>
  realizadoPorSubetapa: Map<string, number>
  realizadoPorServico: Map<string, number>
  statusFiltro: CronogramaStatus[]
}) {
  const rawTree = buildObraGanttTree(etapas, subetapas, servicos)
  const statusDoNode = (node: ObraGanttNode): CronogramaStatus => {
    if (node.status) return node.status
    if ((node.percentual_executado ?? 0) >= 100) return 'concluida'
    if ((node.percentual_executado ?? 0) > 0) return 'em_andamento'
    return 'planejada'
  }
  const filtrarTree = (nodes: ObraGanttNode[]): ObraGanttNode[] =>
    nodes
      .map(node => ({ ...node, children: filtrarTree(node.children) }))
      .filter(node => statusFiltro.includes(statusDoNode(node)) || node.children.length > 0)
  const tree = filtrarTree(rawTree)
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(tree.flatMap(etapa => [etapa.id, ...etapa.children.map(sub => sub.id)]))
  )
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const today = new Date()
  const scrollRef = useRef<HTMLDivElement>(null)
  const nameColW = isMobile ? 168 : GANTT_LEFT_W
  const fullLeftW = isMobile ? 168 : nameColW + GANTT_DATE_COL_W * 2

  const effMap = new Map<string, GanttEff>()
  tree.forEach(node => rollupObraGantt(node, effMap))

  const rootEffs = tree.map(node => effMap.get(node.id)).filter(Boolean) as GanttEff[]
  const totalInicios = rootEffs.map(e => e.inicio).filter((v): v is string => Boolean(v))
  const totalFims = rootEffs.map(e => e.fim).filter((v): v is string => Boolean(v))
  const totalInicio = totalInicios.reduce<string | null>((acc, v) => !acc || v < acc ? v : acc, null)
  const totalFim = totalFims.reduce<string | null>((acc, v) => !acc || v > acc ? v : acc, null)
  const totalPct = rootEffs.length ? Math.round(rootEffs.reduce((sum, e) => sum + e.pct, 0) / rootEffs.length) : 0

  const collectDates = (nodes: ObraGanttNode[]): string[] =>
    nodes.flatMap(node => [
      node.data_inicio,
      node.data_fim,
      ...collectDates(node.children),
    ]).filter(Boolean) as string[]
  const allDates = collectDates(tree)

  if (tree.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <p className="text-sm font-medium">Nenhum item para exibir</p>
        <p className="text-xs mt-1 opacity-60">Ajuste o filtro de status ou defina datas para visualizar o Gantt.</p>
      </div>
    )
  }

  let minDate: Date, maxDate: Date
  if (allDates.length === 0) {
    minDate = addDaysCrono(today, -30)
    maxDate = addDaysCrono(today, 30)
  } else {
    const dates = allDates.map(d => new Date(`${d}T12:00:00`))
    minDate = addDaysCrono(new Date(Math.min(...dates.map(d => d.getTime()))), -GANTT_PAD_DAYS)
    maxDate = addDaysCrono(new Date(Math.max(...dates.map(d => d.getTime()))), GANTT_PAD_DAYS)
  }
  const totalDays = Math.max(1, daysBetweenCrono(maxDate, minDate))
  const pxPerDay = isMobile ? 13 : 18
  const timelineW = Math.max(totalDays * pxPerDay, isMobile ? 320 : 460)
  const ganttW = fullLeftW + timelineW
  const todayX = daysBetweenCrono(today, minDate) * pxPerDay

  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const visibleW = el.clientWidth - fullLeftW
    el.scrollLeft = Math.max(0, todayX - visibleW / 2)
  }, [todayX, fullLeftW])

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
      <div ref={scrollRef} className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}>
        <div className="flex" style={{ width: ganttW, minWidth: ganttW }}>
          <div style={{ width: fullLeftW, minWidth: fullLeftW, flexShrink: 0, borderRight: '1px solid var(--border)', position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-card)' }}>
            <div className="flex items-end text-xs font-semibold" style={{ height: GANTT_HDR_H, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
              <div className="px-3 pb-2" style={{ width: nameColW, minWidth: nameColW }}>Item</div>
              {!isMobile && <div className="text-center pb-2" style={{ width: GANTT_DATE_COL_W, borderLeft: '1px solid var(--border)' }}>Início</div>}
              {!isMobile && <div className="text-center pb-2" style={{ width: GANTT_DATE_COL_W, borderLeft: '1px solid var(--border)' }}>Fim</div>}
            </div>
            {rows.map(row => {
              const node = row.node
              const isCollapsed = collapsed.has(row.id)
              const atrasado = !!(row.fim && row.pct < 100 && new Date(`${row.fim}T12:00:00`) < today)
              const rowBg = row.isTotal ? 'rgba(59,123,248,0.08)' : node?.nivel === 1 ? 'rgba(59,123,248,0.04)' : 'transparent'
              return (
                <div key={row.id} className="flex border-b" style={{ height: GANTT_ROW_H, borderColor: 'var(--border)', background: rowBg }}>
                  <div className="flex flex-col justify-center" style={{ width: nameColW, minWidth: nameColW, paddingLeft: 8 + row.depth * 14, paddingRight: 8 }}>
                    <div className="flex items-center gap-1">
                      {row.hasKids && node ? (
                        <button onClick={() => toggleRow(node.id)} className="text-[10px] w-4 h-4 flex items-center justify-center flex-shrink-0 rounded" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
                          {isCollapsed ? '>' : 'v'}
                        </button>
                      ) : (
                        <span className="w-4 flex-shrink-0" />
                      )}
                      {!row.isTotal && node?.nivel === 2 && node.is_marco && (
                        <Flag size={11} style={{ color: '#F59E0B' }} fill="#F59E0B" className="flex-shrink-0" />
                      )}
                      <span className="text-[11px] truncate flex-1" style={{ color: row.isTotal || node?.nivel === 1 ? 'var(--accent)' : 'var(--text-primary)', fontWeight: row.isTotal ? 700 : node?.nivel === 1 ? 600 : 400 }} title={row.nome}>
                        {row.nome}
                      </span>
                      {atrasado && <span className="text-[9px] flex-shrink-0" style={{ color: '#EF4444' }}>!</span>}
                      {!row.isTotal && node && (
                        <span className="text-[9px] flex-shrink-0" style={{ color: (row.pct ?? 0) >= 100 ? '#10b981' : 'var(--text-secondary)' }}>{Math.round(row.pct ?? 0)}%</span>
                      )}
                    </div>
                  </div>
                  {!isMobile && !row.isTotal && node && (
                    <>
                      <div className="flex items-center px-1" style={{ width: GANTT_DATE_COL_W, borderLeft: '1px solid var(--border)' }}>
                        <input type="date" className="w-full h-6 rounded border px-0.5 text-[10px] outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={node.data_inicio ?? ''} onChange={e => onUpdateDate(node.table, node.id, 'data_inicio', e.target.value)} />
                      </div>
                      <div className="flex items-center px-1" style={{ width: GANTT_DATE_COL_W, borderLeft: '1px solid var(--border)' }}>
                        <input type="date" className="w-full h-6 rounded border px-0.5 text-[10px] outline-none" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} value={node.data_fim ?? ''} onChange={e => onUpdateDate(node.table, node.id, 'data_fim', e.target.value)} />
                      </div>
                    </>
                  )}
                  {!isMobile && row.isTotal && (
                    <>
                      <div className="flex items-center justify-center text-[10px]" style={{ width: GANTT_DATE_COL_W, borderLeft: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {fmtGanttDate(row.inicio)}
                      </div>
                      <div className="flex items-center justify-center text-[10px]" style={{ width: GANTT_DATE_COL_W, borderLeft: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        {fmtGanttDate(row.fim)}
                      </div>
                    </>
                  )}
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
                if (!row.inicio && !row.fim) {
                  return null
                }
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

                // Marco (só subetapas): renderiza como losango dourado na data de referência.
                if (!row.isTotal && row.node?.nivel === 2 && row.node?.is_marco) {
                  const cx = row.fim ? x2 : x1
                  const cy = barY + barH / 2
                  const s = 7
                  return (
                    <g key={row.id} opacity={1}>
                      <polygon
                        points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
                        fill="#F59E0B"
                        stroke="#D97706"
                        strokeWidth={1.5}
                      />
                      <text x={cx + s + 5} y={cy + 3.5} fontSize={8} fill={atrasado ? '#EF4444' : '#F59E0B'} fontFamily="var(--font-sans)" fontWeight={600}>
                        {fmtGanttDate(row.fim ?? row.inicio)}
                      </text>
                    </g>
                  )
                }

                const financeiroValor = mostrarFinanceiro && row.node
                  ? (row.node.nivel === 1 ? realizadoPorEtapa.get(row.node.id) : row.node.nivel === 2 ? realizadoPorSubetapa.get(row.node.id) : realizadoPorServico.get(row.node.id)) ?? 0
                  : null
                const insideLabel = row.isTotal
                  ? `${fmtGanttDate(row.inicio)} - ${fmtGanttDate(row.fim)}`
                  : financeiroValor !== null
                    ? formatCurrency(financeiroValor)
                    : pct > 0 ? `${Math.round(pct)}%` : null
                const minWFor = (text: string) => text.length * (row.isTotal ? 6 : 5.2) + 10
                const fitsInside = !!insideLabel && barW >= minWFor(insideLabel)

                return (
                  <g key={row.id} opacity={opacity}>
                    <rect x={x1} y={barY} width={barW} height={barH} rx={row.isTotal ? 3 : barH / 2} fill={color} />
                    {pct > 0 && pct < 100 && (
                      <rect x={x1} y={barY} width={Math.max(2, barW * pct / 100)} height={barH} rx={row.isTotal ? 3 : barH / 2} fill="rgba(0,0,0,0.25)" />
                    )}
                    {fitsInside ? (
                      <text x={x1 + barW / 2} y={barY + barH / 2 + 3.5} textAnchor="middle" fontSize={row.isTotal ? 9 : 8} fontWeight={row.isTotal ? 400 : 700} fill="white" fontFamily="var(--font-sans)" style={{ pointerEvents: 'none' }}>
                        {insideLabel}
                      </text>
                    ) : row.fim && (
                      <text x={x2 + 4} y={barY + barH / 2 + 3.5} fontSize={8} fontWeight={insideLabel ? 700 : 400} fill={atrasado ? '#EF4444' : insideLabel ? 'var(--text-primary)' : 'var(--text-secondary)'} fontFamily="var(--font-sans)">
                        {insideLabel && !row.isTotal ? insideLabel : fmtGanttDate(row.fim)}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* ── Setas de dependência (predecessora → item) ── */}
              {(() => {
                const rowIndexById = new Map(rows.map((row, idx) => [row.id, idx]))
                return dependencias.map(dep => {
                  const predIdx = rowIndexById.get(dep.predecessor_id)
                  const itemIdx = rowIndexById.get(dep.item_id)
                  if (predIdx === undefined || itemIdx === undefined || predIdx === itemIdx) return null
                  const predRow = rows[predIdx]
                  const itemRow = rows[itemIdx]
                  if (!predRow.fim && !predRow.inicio) return null
                  if (!itemRow.inicio && !itemRow.fim) return null

                  const predY = GANTT_HDR_H + predIdx * GANTT_ROW_H + GANTT_ROW_H / 2
                  const itemY = GANTT_HDR_H + itemIdx * GANTT_ROW_H + GANTT_ROW_H / 2
                  const predX = xOf(predRow.fim, predRow.inicio ? addDaysCrono(new Date(`${predRow.inicio}T12:00:00`), 1) : today)
                  const itemX = xOf(itemRow.inicio, itemRow.fim ? addDaysCrono(new Date(`${itemRow.fim}T12:00:00`), -1) : today)

                  const conflito = !!(predRow.fim && itemRow.inicio && predRow.fim > itemRow.inicio)
                  const strokeColor = conflito ? '#EF4444' : 'var(--text-secondary)'
                  const midX = predX + 10
                  const arrowX = itemX - 5
                  const path = `M ${predX} ${predY} L ${midX} ${predY} L ${midX} ${itemY} L ${arrowX} ${itemY}`

                  return (
                    <g key={dep.id} opacity={0.85}>
                      <path d={path} fill="none" stroke={strokeColor} strokeWidth={1.25} strokeDasharray={conflito ? '3 2' : undefined} />
                      <polygon points={`${itemX},${itemY} ${arrowX},${itemY - 3} ${arrowX},${itemY + 3}`} fill={strokeColor} />
                    </g>
                  )
                })
              })()}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
