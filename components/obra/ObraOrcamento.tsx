'use client'

import { useEffect, useState, useRef, useCallback, Fragment } from 'react'
import {
  Plus, Lock, Unlock, Search, Trash2, MoreHorizontal,
  ChevronDown, ChevronRight, FolderPlus, RotateCcw, FileSpreadsheet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Orcamento, ComposicaoPropria, SinapiComposicao, Etapa } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { exportOrcamentoXLSX, ItemExportRow } from '@/lib/export-orcamento'

type FonteBusca = 'proprias' | 'sinapi'

const ETAPAS_PADRAO_KEY = 'buildsmart-etapas-padrao'
const ETAPAS_PADRAO_FALLBACK = [
  'Serviços preliminares', 'Administração local', 'Mobilização e desmobilização',
  'Canteiro de obras', 'Movimento de terra', 'Fundações', 'Estrutura',
  'Alvenaria e vedação', 'Cobertura', 'Impermeabilização',
  'Instalações hidrossanitárias', 'Instalações elétricas', 'Instalações especiais',
  'Esquadrias', 'Revestimentos internos', 'Revestimentos externos',
  'Pisos', 'Pintura', 'Louças e metais', 'Serviços complementares',
]

// novo schema: composicao_itens (referência via sinapi_codigo TEXT)
type ComposicaoItemJoin = {
  id: string
  composicao_id: string
  tipo: 'SINAPI_INSUMO' | 'SINAPI_COMPOSICAO' | 'MANUAL'
  sinapi_codigo: string | null
  descricao: string
  unidade: string
  coeficiente: number
  ordem: number
}

type ComposicaoComCusto = ComposicaoPropria & {
  composicao_itens?: ComposicaoItemJoin[]
  custo_calculado: number
}

type ItemEnriquecido = {
  id: string
  orcamento_id: string
  etapa_id: string | null
  subetapa: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  quantidade: number
  preco_unitario_snapshot: number
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  unidade_snapshot: string | null
  codigo: string
  descricao: string
  unidade: string
  composicao_itens?: ComposicaoItemJoin[]
}

// ─── override key helper ─────────────────────────────────────────────────────
// Usa sinapi_codigo (string) como chave de insumo para o override
function overrideKey(itemId: string, insumoKey: string) {
  return `${itemId}_${insumoKey}`
}

export function ObraOrcamento({ obraId, areaM2, obraName, obraUf = 'SP' }: {
  obraId: string
  areaM2?: number | null
  obraName?: string
  obraUf?: string
}) {
  const supabase = createClient()
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [itens, setItens] = useState<ItemEnriquecido[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [bdi, setBdi] = useState(25)

  // Cascata + overrides
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [insumoOverrides, setInsumoOverrides] = useState<Record<string, number>>({})

  // Modal adicionar item
  const [showAddItem, setShowAddItem] = useState(false)
  const [addToEtapaId, setAddToEtapaId] = useState<string | null>(null)
  const [etapasPadrao, setEtapasPadrao] = useState<string[]>(ETAPAS_PADRAO_FALLBACK)
  const [selectedEtapaNome, setSelectedEtapaNome] = useState('')
  const [subetapaLivre, setSubetapaLivre] = useState('')
  const [fonte, setFonte] = useState<FonteBusca>('proprias')
  const [composicoesProprias, setComposicoesProprias] = useState<ComposicaoComCusto[]>([])
  const [sinapiComps, setSinapiComps] = useState<SinapiComposicao[]>([])
  const [busca, setBusca] = useState('')
  const [selectedItem, setSelectedItem] = useState<(ComposicaoComCusto | SinapiComposicao) | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [saving, setSaving] = useState(false)
  const qtdInputRef = useRef<HTMLInputElement>(null)

  // Modal nova etapa
  const [showNovaEtapa, setShowNovaEtapa] = useState(false)
  const [novaEtapaNome, setNovaEtapaNome] = useState('')
  const [criandoEtapa, setCriandoEtapa] = useState(false)

  // Grupos colapsados (nível etapa)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Menu ...
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // ─── Carregar overrides do localStorage ─────────────────────────────────
  useEffect(() => {
    if (!orcamento?.id) return
    const stored = localStorage.getItem(`bs_overrides_${orcamento.id}`)
    if (stored) {
      try { setInsumoOverrides(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [orcamento?.id])

  useEffect(() => {
    if (!orcamento?.id) return
    localStorage.setItem(`bs_overrides_${orcamento.id}`, JSON.stringify(insumoOverrides))
  }, [insumoOverrides, orcamento?.id])

  // ─── Etapas padrão ───────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(ETAPAS_PADRAO_KEY)
    if (!stored) { localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(ETAPAS_PADRAO_FALLBACK)); return }
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) setEtapasPadrao(parsed.slice(0, 20))
    } catch { localStorage.setItem(ETAPAS_PADRAO_KEY, JSON.stringify(ETAPAS_PADRAO_FALLBACK)) }
  }, [])

  // ─── Fechar menu ao clicar fora ──────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => { loadAll() }, [obraId])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadOrcamento(), loadEtapas(), loadComposicoesProprias(), loadSinapiComps()])
    setLoading(false)
  }

  async function loadOrcamento() {
    const { data: orc } = await supabase
      .from('orcamentos').select('*').eq('obra_id', obraId)
      .order('versao', { ascending: false }).limit(1).maybeSingle()
    if (orc) { setOrcamento(orc); setBdi(orc.bdi_percentual); await loadItens(orc.id) }
  }

  async function loadItens(orcamentoId: string) {
    const { data } = await supabase
      .from('orcamento_itens')
      .select(`*, composicoes_proprias(id,codigo,descricao,unidade,composicao_itens(*)), sinapi_composicoes(id,codigo,descricao,unidade,custos)`)
      .eq('orcamento_id', orcamentoId)
      .order('created_at')

    const enriched: ItemEnriquecido[] = (data || []).map((item: any) => {
      const cp = item.composicoes_proprias
      const sc = item.sinapi_composicoes
      return {
        ...item,
        codigo: cp?.codigo || sc?.codigo || item.codigo_snapshot || '—',
        descricao: item.descricao_snapshot || cp?.descricao || sc?.descricao || '—',
        unidade: cp?.unidade || sc?.unidade || item.unidade_snapshot || '—',
        composicao_itens: cp?.composicao_itens || [],
      }
    })
    setItens(enriched)
  }

  async function loadEtapas() {
    const { data } = await supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem')
    setEtapas(data || [])
  }

  async function loadComposicoesProprias() {
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*, composicao_itens(*)')
      .eq('ativo', true).order('codigo')
    const withCusto = (data || []).map((comp: any) => ({
      ...comp,
      // custo_calculado requer lookup de sinapi_insumos.precos[uf] — feito pós-Supabase
      custo_calculado: 0,
    }))
    setComposicoesProprias(withCusto)
  }

  async function loadSinapiComps() {
    const { data } = await supabase.from('sinapi_composicoes').select('*').order('codigo').limit(200)
    setSinapiComps(data || [])
  }

  // ─── Totais com override ─────────────────────────────────────────────────
  // Quando sinapi_insumos.precos estiver disponível (pós-Supabase), buscar preco[obraUf].
  // Por agora, usa preco_unitario_snapshot como fallback.
  const getItemTotal = useCallback((item: ItemEnriquecido): number => {
    const itensComp = item.composicao_itens || []
    if (itensComp.length === 0) return item.preco_unitario_snapshot * item.quantidade
    // Se algum item tem preços carregados via join (futuro), usa-os.
    // Por enquanto fallback para snapshot.
    const temPreco = itensComp.some((ins: any) => (ins.sinapi_insumo?.precos?.[obraUf] ?? 0) > 0)
    if (!temPreco) return item.preco_unitario_snapshot * item.quantidade
    return itensComp.reduce((total, ins: any) => {
      const key = overrideKey(item.id, ins.sinapi_codigo || ins.id)
      const qtdCalculada = item.quantidade * ins.coeficiente
      const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
      const preco = ins.sinapi_insumo?.precos?.[obraUf] ?? 0
      return total + qtdAdotada * preco
    }, 0)
  }, [insumoOverrides, obraUf])

  const subtotal = itens.reduce((a, i) => a + getItemTotal(i), 0)
  const totalBdi = subtotal * (bdi / 100)
  const totalGeral = subtotal + totalBdi
  const custoPorM2 = areaM2 && areaM2 > 0 ? totalGeral / areaM2 : null

  // ─── Handlers de override ────────────────────────────────────────────────
  function handleOverrideInsumo(itemId: string, insumoKey: string, value: number | null) {
    const key = overrideKey(itemId, insumoKey)
    setInsumoOverrides(prev => {
      const next = { ...prev }
      if (value === null || isNaN(value)) { delete next[key] } else { next[key] = value }
      return next
    })
  }

  function toggleItemExpanded(itemId: string) {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  // ─── Criar etapa ─────────────────────────────────────────────────────────
  async function handleCriarEtapa() {
    if (!novaEtapaNome.trim()) return
    setCriandoEtapa(true)
    const maxOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0)
    const { data } = await supabase
      .from('etapas')
      .insert({ obra_id: obraId, nome: novaEtapaNome.trim(), status: 'planejada', ordem: maxOrdem + 1 })
      .select().single()
    if (data) { setEtapas(prev => [...prev, data]); setAddToEtapaId(data.id); setShowAddItem(true) }
    setCriandoEtapa(false); setShowNovaEtapa(false); setNovaEtapaNome('')
  }

  function openItemModal(etapaId: string | null = null) {
    const etapa = etapaId ? etapas.find(e => e.id === etapaId) : null
    setAddToEtapaId(etapaId)
    setSelectedEtapaNome(etapa?.nome || etapasPadrao[0] || '')
    setSubetapaLivre('')
    setShowAddItem(true)
  }

  async function ensureEtapaSelecionada() {
    const nome = selectedEtapaNome.trim()
    if (!nome) return null
    const existente = etapas.find(e => e.nome.toLowerCase() === nome.toLowerCase())
    if (existente) return existente.id
    const maxOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0)
    const { data } = await supabase
      .from('etapas')
      .insert({ obra_id: obraId, nome, status: 'planejada', ordem: maxOrdem + 1 })
      .select().single()
    if (!data) return null
    setEtapas(prev => [...prev, data])
    return data.id
  }

  // ─── Adicionar item ───────────────────────────────────────────────────────
  async function handleAddItem(fecharDepois = false) {
    if (!orcamento || !selectedItem || !quantidade) return
    setSaving(true)
    const isSinapi = fonte === 'sinapi'
    const qtd = parseFloat(quantidade)
    const custoUnitario = getItemCost(selectedItem)
    const etapaId = await ensureEtapaSelecionada()
    const descricaoFinal = selectedItem.descricao + (subetapaLivre.trim() ? ` — ${subetapaLivre.trim()}` : '')

    await supabase.from('orcamento_itens').insert({
      orcamento_id: orcamento.id,
      etapa_id: etapaId,
      subetapa: subetapaLivre.trim() || null,
      composicao_id: isSinapi ? null : selectedItem.id,
      sinapi_composicao_id: isSinapi ? selectedItem.id : null,
      quantidade: qtd,
      preco_unitario_snapshot: custoUnitario,
      descricao_snapshot: descricaoFinal,
      codigo_snapshot: selectedItem.codigo,
      unidade_snapshot: selectedItem.unidade,
    })

    if (!isSinapi && 'composicao_itens' in selectedItem) {
      await gerarMateriaisDaComposicao(selectedItem.composicao_itens || [], qtd, etapaId)
    }

    setSaving(false); setSelectedItem(null); setQuantidade(''); setBusca(''); setAddToEtapaId(etapaId)
    if (fecharDepois) { setShowAddItem(false); setSubetapaLivre('') }
    loadItens(orcamento.id)
  }

  async function handleRemoveItem(itemId: string) {
    const item = itens.find(i => i.id === itemId)
    if (item?.composicao_itens?.length) {
      await abaterMateriaisDaComposicao(item.composicao_itens, item.quantidade, item.etapa_id)
    }
    // Limpar overrides deste item
    setInsumoOverrides(prev => {
      const next = { ...prev }
      Object.keys(next).filter(k => k.startsWith(itemId)).forEach(k => delete next[k])
      return next
    })
    await supabase.from('orcamento_itens').delete().eq('id', itemId)
    setItens(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleUpdateBdi() {
    if (!orcamento) return
    await supabase.from('orcamentos').update({ bdi_percentual: bdi }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, bdi_percentual: bdi } : o)
  }

  // ─── Export Excel ────────────────────────────────────────────────────────
  function handleExportXLSX() {
    if (!orcamento) return

    const etapaMap: Record<string, string> = { sem_etapa: 'Sem etapa' }
    for (const e of etapas) etapaMap[e.id] = e.nome

    const exportItens: ItemExportRow[] = itens.map(item => {
      const itensComp = item.composicao_itens || []
      return {
        etapaNome: etapaMap[item.etapa_id || 'sem_etapa'] || 'Sem etapa',
        subetapa: item.subetapa,
        codigo: item.codigo,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        precoUnitario: item.preco_unitario_snapshot,
        totalItem: getItemTotal(item),
        insumos: itensComp.map(ins => {
          const insumoKey = ins.sinapi_codigo || ins.id
          const key = overrideKey(item.id, insumoKey)
          const qtdCalculada = item.quantidade * ins.coeficiente
          const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
          const preco = (ins as any).sinapi_insumo?.precos?.[obraUf] ?? 0
          return {
            codigo: ins.sinapi_codigo || '',
            descricao: ins.descricao,
            unidade: ins.unidade,
            qtdCalculada,
            qtdAdotada,
            precoUnit: preco,
            totalInsumo: qtdAdotada * preco,
            isOverride: insumoOverrides[key] !== undefined,
          }
        }),
      }
    })

    exportOrcamentoXLSX({
      itens: exportItens,
      bdi,
      versao: orcamento.versao,
      status: orcamento.status,
      obraName: obraName || 'Obra',
      areaM2,
      incluirInsumos: true,
    })
  }

  async function handleFinalizar() {
    if (!orcamento || !confirm('Finalizar orçamento? Os preços serão congelados.')) return
    await supabase.from('orcamentos').update({ status: 'finalizado' }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, status: 'finalizado' } : o)
    setShowMenu(false)
  }

  async function handleReabrir() {
    if (!orcamento) return
    const novaVersao = orcamento.versao + 1
    const { data: novoOrc } = await supabase
      .from('orcamentos')
      .insert({ obra_id: obraId, tipo: orcamento.tipo, bdi_percentual: orcamento.bdi_percentual, status: 'rascunho', versao: novaVersao })
      .select().single()
    if (novoOrc) {
      for (const item of itens) {
        await supabase.from('orcamento_itens').insert({
          orcamento_id: novoOrc.id, etapa_id: item.etapa_id, subetapa: item.subetapa,
          composicao_id: item.composicao_id, sinapi_composicao_id: item.sinapi_composicao_id,
          quantidade: item.quantidade, preco_unitario_snapshot: item.preco_unitario_snapshot,
          descricao_snapshot: item.descricao_snapshot, codigo_snapshot: item.codigo_snapshot,
          unidade_snapshot: item.unidade_snapshot,
        })
      }
      setOrcamento(novoOrc); loadItens(novoOrc.id)
    }
    setShowMenu(false)
  }

  // ─── Materiais ────────────────────────────────────────────────────────────
  async function gerarMateriaisDaComposicao(itensComp: ComposicaoItemJoin[], qtdComposicao: number, etapaId: string | null) {
    for (const item of itensComp) {
      if (!item.sinapi_codigo) continue
      const qtdSugerida = qtdComposicao * item.coeficiente
      if (qtdSugerida <= 0) continue
      let query = supabase.from('materiais').select('id, quantidade_total')
        .eq('obra_id', obraId).eq('sinapi_codigo', item.sinapi_codigo)
      query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
      const { data: existente } = await query.maybeSingle()
      if (existente) {
        await supabase.from('materiais').update({ quantidade_total: Number(existente.quantidade_total) + qtdSugerida }).eq('id', existente.id)
      } else {
        await supabase.from('materiais').insert({
          obra_id: obraId, etapa_id: etapaId,
          sinapi_codigo: item.sinapi_codigo,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade_total: qtdSugerida, quantidade_comprada: 0, status_compra: 'nao_comprado',
        })
      }
    }
  }

  async function abaterMateriaisDaComposicao(itensComp: ComposicaoItemJoin[], qtdComposicao: number, etapaId: string | null) {
    for (const item of itensComp) {
      if (!item.sinapi_codigo) continue
      const qtdSugerida = qtdComposicao * item.coeficiente
      if (qtdSugerida <= 0) continue
      let query = supabase.from('materiais').select('id, quantidade_total')
        .eq('obra_id', obraId).eq('sinapi_codigo', item.sinapi_codigo)
      query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
      const { data: existente } = await query.maybeSingle()
      if (!existente) continue
      const novaQtd = Number(existente.quantidade_total) - qtdSugerida
      if (novaQtd <= 0) { await supabase.from('materiais').delete().eq('id', existente.id) }
      else { await supabase.from('materiais').update({ quantidade_total: novaQtd }).eq('id', existente.id) }
    }
  }

  // ─── Agrupamento ─────────────────────────────────────────────────────────
  const itensPorEtapa: Record<string, ItemEnriquecido[]> = { sem_etapa: [] }
  for (const etapa of etapas) itensPorEtapa[etapa.id] = []
  for (const item of itens) {
    const key = item.etapa_id && itensPorEtapa[item.etapa_id] !== undefined ? item.etapa_id : 'sem_etapa'
    itensPorEtapa[key].push(item)
  }

  const termoBusca = busca.trim().toLowerCase()
  const listaFiltrada = termoBusca
    ? (fonte === 'proprias' ? composicoesProprias : sinapiComps).filter(c =>
        c.descricao.toLowerCase().includes(termoBusca) || c.codigo.toLowerCase().includes(termoBusca))
    : []
  const etapaOptions = Array.from(new Set([...etapasPadrao, ...etapas.map(e => e.nome)])).filter(Boolean)
  const isReadonly = orcamento?.status === 'finalizado'
  // Custo de uma composição para exibir no modal de busca
  // Pós-Supabase: calcula via composicao_itens + sinapi_insumos.precos[obraUf]
  const getItemCost = (item: { custo_calculado?: number; custos?: Record<string, number> }) =>
    item.custos?.[obraUf] || item.custo_calculado || 0

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  )

  if (!orcamento) return <EmptyState icon={Plus} title="Nenhum orçamento encontrado" description="Crie um orçamento para esta obra." />

  return (
    <div className="flex flex-col gap-4">

      {/* ── Sticky header com totais ── */}
      <div
        className="sticky top-0 z-20 rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
      >
        <div className="flex flex-wrap items-center divide-x" style={{ borderColor: 'var(--border)' }}>
          <StickyKpi label="Total Geral" value={formatCurrency(totalGeral)} accent />
          <StickyKpi label="Subtotal s/ BDI" value={formatCurrency(subtotal)} />
          <StickyKpi label={`BDI ${bdi}%`} value={formatCurrency(totalBdi)} />
          {custoPorM2 !== null && (
            <StickyKpi label="Custo / m²" value={formatCurrency(custoPorM2)} />
          )}
          <div className="px-4 py-3 flex items-center gap-2 ml-auto">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                background: isReadonly ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                color: isReadonly ? 'var(--success)' : 'var(--warning)',
              }}
            >
              v{orcamento.versao} · {isReadonly ? 'Finalizado' : 'Rascunho'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Barra de ações ── */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>BDI %</label>
            <input
              type="number" value={bdi}
              onChange={e => setBdi(Number(e.target.value))}
              onBlur={handleUpdateBdi}
              disabled={isReadonly}
              className="input-base w-20 text-center py-1"
              min={0} max={100}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {itens.length > 0 && (
            <Button
              size="sm"
              icon={<FileSpreadsheet size={14} />}
              variant="secondary"
              onClick={handleExportXLSX}
            >
              Exportar Excel
            </Button>
          )}
          {!isReadonly && (
            <Button size="sm" icon={<FolderPlus size={14} />} variant="secondary" onClick={() => openItemModal()}>
              Novo item
            </Button>
          )}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(v => !v)}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                {!isReadonly ? (
                  <button onClick={handleFinalizar}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}>
                    <Lock size={13} style={{ color: 'var(--text-secondary)' }} /> Finalizar orçamento
                  </button>
                ) : (
                  <button onClick={handleReabrir}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}>
                    <Unlock size={13} style={{ color: 'var(--text-secondary)' }} /> Reabrir (nova versão)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Grupos por etapa (cascata) ── */}
      {etapas.length === 0 && itens.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="Orçamento vazio"
          description="Adicione o primeiro item escolhendo etapa, subetapa e composição."
          action={!isReadonly ? (
            <Button icon={<FolderPlus size={16} />} onClick={() => openItemModal()}>
              Adicionar primeiro item
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {itensPorEtapa.sem_etapa.length > 0 && (
            <GrupoEtapa
              nome="Sem etapa"
              itens={itensPorEtapa.sem_etapa}
              isReadonly={isReadonly}
              collapsed={collapsed['sem_etapa']}
              onToggleGrupo={() => setCollapsed(c => ({ ...c, sem_etapa: !c['sem_etapa'] }))}
              onAddItem={() => openItemModal(null)}
              onRemove={handleRemoveItem}
              bdi={bdi}
              expandedItems={expandedItems}
              onToggleItem={toggleItemExpanded}
              insumoOverrides={insumoOverrides}
              onOverrideInsumo={handleOverrideInsumo}
              getItemTotal={getItemTotal}
            />
          )}
          {etapas.map(etapa => (
            <GrupoEtapa
              key={etapa.id}
              nome={etapa.nome}
              itens={itensPorEtapa[etapa.id] || []}
              isReadonly={isReadonly}
              collapsed={collapsed[etapa.id]}
              onToggleGrupo={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
              onAddItem={() => openItemModal(etapa.id)}
              onRemove={handleRemoveItem}
              bdi={bdi}
              expandedItems={expandedItems}
              onToggleItem={toggleItemExpanded}
              insumoOverrides={insumoOverrides}
              onOverrideInsumo={handleOverrideInsumo}
              getItemTotal={getItemTotal}
            />
          ))}

          {!isReadonly && (
            <button
              onClick={() => openItemModal()}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors hover:bg-[var(--bg-card)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <FolderPlus size={16} /> Adicionar item
            </button>
          )}

          {/* Totais rodapé */}
          <div className="card p-4">
            <div className="flex justify-end">
              <div className="flex flex-col gap-1 min-w-64">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>BDI ({bdi}%)</span>
                  <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalBdi)}</span>
                </div>
                {custoPorM2 !== null && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Custo / m²</span>
                    <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(custoPorM2)}/m²</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>Total Geral</span>
                  <span style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>{formatCurrency(totalGeral)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nova etapa ── */}
      <Modal open={showNovaEtapa} onClose={() => { setShowNovaEtapa(false); setNovaEtapaNome('') }} title="Nova Etapa" size="sm">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da etapa"
            value={novaEtapaNome}
            onChange={e => setNovaEtapaNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCriarEtapa()}
            placeholder="Ex: Fundação, Estrutura, Cobertura..."
            autoFocus
          />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Datas são definidas depois no Cronograma.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowNovaEtapa(false); setNovaEtapaNome('') }}>Cancelar</Button>
            <Button className="flex-1" loading={criandoEtapa} disabled={!novaEtapaNome.trim()} onClick={handleCriarEtapa}>
              Criar e adicionar serviços
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal adicionar composição ── */}
      <Modal
        open={showAddItem}
        onClose={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade(''); setBusca(''); setSubetapaLivre('') }}
        title="Adicionar item"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
              <select value={selectedEtapaNome} onChange={e => setSelectedEtapaNome(e.target.value)} className="input-base">
                {etapaOptions.map(etapa => <option key={etapa} value={etapa}>{etapa}</option>)}
              </select>
            </div>
            <Input
              label="Subetapa / complemento"
              value={subetapaLivre}
              onChange={e => setSubetapaLivre(e.target.value)}
              placeholder="Ex: Baldrames, térreo, bloco A..."
            />
          </div>

          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {([['proprias', 'Composições Próprias'], ['sinapi', 'Referência SINAPI']] as [FonteBusca, string][]).map(([id, label]) => (
              <button key={id} onClick={() => { setFonte(id); setSelectedItem(null); setBusca('') }}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={fonte === id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder={fonte === 'proprias' ? 'Buscar por código ou descrição...' : 'Buscar na tabela SINAPI...'}
              className="input-base input-search" autoFocus
            />
          </div>

          {selectedItem ? (
            <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.25)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{selectedItem.codigo}</span>
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--accent)' }}>{selectedItem.descricao}</span>
                  {getItemCost(selectedItem) > 0 && (
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(getItemCost(selectedItem))}/{selectedItem.unidade}
                    </span>
                  )}
                </div>
                {'composicao_itens' in selectedItem && selectedItem.composicao_itens && selectedItem.composicao_itens.length > 0 && (
                  <div className="mb-3 rounded-lg p-2 flex flex-col gap-1" style={{ background: 'var(--bg-secondary)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Insumos sugeridos para compra</p>
                    {selectedItem.composicao_itens.slice(0, 5).map((ins) => {
                      const qtdBase = parseFloat(quantidade) || 0
                      const qtdSugerida = qtdBase * ins.coeficiente
                      return (
                        <div key={ins.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{ins.sinapi_codigo || '—'}</span>
                          <span className="flex-1 truncate">{ins.descricao}</span>
                          <span>{qtdBase > 0 ? `${qtdSugerida.toLocaleString('pt-BR')} ${ins.unidade}` : `coef. ${ins.coeficiente}`}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      ref={qtdInputRef}
                      label={`Quantidade (${selectedItem.unidade})`}
                      type="number" value={quantidade}
                      onChange={e => setQuantidade(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && quantidade && handleAddItem(false)}
                      placeholder="0" min={0}
                    />
                  </div>
                  <div className="flex gap-2 pb-0.5">
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedItem(null); setQuantidade('') }}>Limpar</Button>
                    <Button variant="secondary" size="sm" loading={saving} disabled={!quantidade} onClick={() => handleAddItem(false)}>+ mais</Button>
                    <Button size="sm" loading={saving} disabled={!quantidade} onClick={() => handleAddItem(true)}>Inserir</Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
              {!termoBusca ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>Digite para buscar composições.</p>
              ) : listaFiltrada.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                  {fonte === 'proprias' ? 'Nenhuma composição própria encontrada.' : 'Nenhuma composição SINAPI encontrada.'}
                </p>
              ) : (
                listaFiltrada.slice(0, 60).map(c => (
                  <button key={c.id}
                    onClick={() => { setSelectedItem(c); setBusca(''); setTimeout(() => qtdInputRef.current?.focus(), 60) }}
                    className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ border: '1px solid transparent' }}
                  >
                    <span className="text-xs font-mono flex-shrink-0 w-20 truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{c.codigo}</span>
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{c.unidade}</span>
                    {getItemCost(c) > 0 && (
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>{formatCurrency(getItemCost(c))}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade('') }}>Fechar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Sticky KPI ──────────────────────────────────────────────────────────────
function StickyKpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="px-5 py-3 flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        className="text-base font-bold leading-tight"
        style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'DM Serif Display, serif' }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Grupo de etapa (nível 1 da cascata) ─────────────────────────────────────
function GrupoEtapa({
  nome, itens, isReadonly, collapsed, onToggleGrupo, onAddItem, onRemove, bdi,
  expandedItems, onToggleItem, insumoOverrides, onOverrideInsumo, getItemTotal,
}: {
  nome: string
  itens: ItemEnriquecido[]
  isReadonly: boolean
  collapsed?: boolean
  onToggleGrupo: () => void
  onAddItem: () => void
  onRemove: (id: string) => void
  bdi: number
  expandedItems: Record<string, boolean>
  onToggleItem: (id: string) => void
  insumoOverrides: Record<string, number>
  onOverrideInsumo: (itemId: string, insumoId: string, value: number | null) => void
  getItemTotal: (item: ItemEnriquecido) => number
}) {
  const subtotalGrupo = itens.reduce((a, i) => a + getItemTotal(i), 0)
  const totalGrupo = subtotalGrupo * (1 + bdi / 100)

  return (
    <div className="card overflow-hidden">
      {/* Cabeçalho etapa */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={onToggleGrupo}
      >
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{nome}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {itens.length} {itens.length === 1 ? 'item' : 'itens'}
        </span>
        <span className="text-sm font-semibold ml-4" style={{ color: 'var(--accent)' }}>
          {formatCurrency(totalGrupo)}
        </span>
        {!isReadonly && (
          <button
            onClick={e => { e.stopPropagation(); onAddItem() }}
            className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-card)]"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)', opacity: 0.8 }}
          >
            <Plus size={12} /> item
          </button>
        )}
      </div>

      {/* Itens */}
      {!collapsed && (
        <>
          {itens.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isReadonly ? 'Nenhum item.' : (
                <button onClick={onAddItem} className="hover:underline" style={{ color: 'var(--accent)' }}>
                  + Adicionar primeiro item
                </button>
              )}
            </div>
          ) : (
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['', 'Código', 'Descrição', 'Unid.', 'Qtd.', 'Unit. R$', 'Total R$', ''].map((h, i) => (
                    <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map(item => {
                  const hasInsumos = (item.composicao_itens?.length || 0) > 0
                  const isExpanded = expandedItems[item.id] || false
                  const itemTotal = getItemTotal(item)
                  const hasOverride = (item.composicao_itens || []).some(ins =>
                    insumoOverrides[overrideKey(item.id, ins.sinapi_codigo || ins.id)] !== undefined
                  )

                  return (
                    <Fragment key={item.id}>
                      {/* ── Linha da composição ── */}
                      <tr
                        style={{ borderBottom: '1px solid var(--border)', cursor: hasInsumos ? 'pointer' : 'default' }}
                        onClick={() => hasInsumos && onToggleItem(item.id)}
                      >
                        {/* Chevron expand */}
                        <td className="px-3 py-2.5 w-6">
                          {hasInsumos && (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {item.codigo}
                        </td>
                        <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-primary)', maxWidth: 260 }}>
                          <span className="truncate block">{item.descricao}</span>
                          {item.subetapa && (
                            <span className="text-xs block truncate" style={{ color: 'var(--text-secondary)' }}>{item.subetapa}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.unidade}</td>
                        <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>{item.quantidade.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.preco_unitario_snapshot)}</td>
                        <td className="px-3 py-2.5 text-sm font-semibold" style={{ color: hasOverride ? 'var(--warning)' : 'var(--text-primary)' }}>
                          {formatCurrency(itemTotal)}
                          {hasOverride && <span className="text-xs ml-1 opacity-60">(ajust.)</span>}
                        </td>
                        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          {!isReadonly && (
                            <button onClick={() => onRemove(item.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                              <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* ── Linhas de insumos (cascata expandida) ── */}
                      {isExpanded && hasInsumos && item.composicao_itens!.map(ins => {
                        const insumoKey = ins.sinapi_codigo || ins.id
                        const key = overrideKey(item.id, insumoKey)
                        const qtdCalculada = item.quantidade * ins.coeficiente
                        const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
                        // preço pós-Supabase: (ins as any).sinapi_insumo?.precos?.[obraUf] ?? 0
                        const preco = 0
                        const totalIns = qtdAdotada * preco
                        const isOverridden = insumoOverrides[key] !== undefined

                        return (
                          <tr
                            key={ins.id}
                            style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
                          >
                            <td className="pl-6 pr-2 py-2 w-6">
                              <span style={{ color: 'var(--border)', fontSize: 10 }}>└</span>
                            </td>
                            <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                              {ins.sinapi_codigo || '—'}
                            </td>
                            <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)', maxWidth: 260 }}>
                              <span className="truncate block">{ins.descricao}</span>
                            </td>
                            <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {ins.unidade}
                            </td>
                            {/* Quantidade: calculada → adotada (editável) */}
                            <td className="px-3 py-2" colSpan={1}>
                              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                  {qtdCalculada.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                </span>
                                <span style={{ color: 'var(--border)', fontSize: 10 }}>→</span>
                                <input
                                  type="number"
                                  value={isOverridden ? insumoOverrides[key] : qtdCalculada}
                                  onChange={e => {
                                    const v = parseFloat(e.target.value)
                                    onOverrideInsumo(item.id, insumoKey, isNaN(v) ? null : v)
                                  }}
                                  disabled={isReadonly}
                                  className="input-base py-0.5 text-xs text-center tabular-nums"
                                  style={{
                                    width: 72,
                                    border: isOverridden ? '1px solid var(--warning)' : '1px solid var(--border)',
                                    color: isOverridden ? 'var(--warning)' : 'var(--text-primary)',
                                  }}
                                  min={0}
                                  step="any"
                                />
                                {isOverridden && !isReadonly && (
                                  <button
                                    onClick={e => { e.stopPropagation(); onOverrideInsumo(item.id, insumoKey, null) }}
                                    title="Restaurar calculado"
                                    className="p-0.5 rounded transition-colors hover:bg-[var(--bg-card)]"
                                  >
                                    <RotateCcw size={11} style={{ color: 'var(--text-secondary)' }} />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {preco > 0 ? formatCurrency(preco) : '—'}
                            </td>
                            <td className="px-3 py-2 text-xs font-medium" style={{ color: isOverridden ? 'var(--warning)' : 'var(--text-secondary)' }}>
                              {totalIns > 0 ? formatCurrency(totalIns) : '—'}
                            </td>
                            <td />
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
