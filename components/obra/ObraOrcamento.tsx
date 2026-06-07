'use client'

import { useEffect, useState, useRef, useCallback, Fragment } from 'react'
import {
  Plus, Lock, Unlock, Search, Trash2, MoreHorizontal,
  ChevronDown, ChevronRight, FolderPlus, RotateCcw, FileSpreadsheet,
  Boxes, Users, FileText, Percent, Wallet,
  HardHat, Mountain, Layers, Building2, Grid3x3, Home, ShieldCheck,
  Droplets, Zap, Wrench, DoorOpen, Square, PaintBucket, Bath, Package,
  type LucideIcon,
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

// ─── Composição de custo direto por categoria ───────────────────────────────
type CustoCategoria = { material: number; maoDeObra: number; equipamento: number; outros: number }

// ─── Ícone + cor discretos por tipo de etapa (heurística por palavra-chave) ──
const ETAPA_ICON_RULES: { match: RegExp; icon: LucideIcon; cor: string }[] = [
  { match: /preliminar|mobiliza|administra|canteiro/i, icon: HardHat, cor: '#3B7BF8' },
  { match: /terra|terraplenagem|escava/i, icon: Mountain, cor: '#A16207' },
  { match: /funda/i, icon: Layers, cor: '#F59E0B' },
  { match: /estrutura/i, icon: Building2, cor: '#8B5CF6' },
  { match: /alvenaria|veda/i, icon: Grid3x3, cor: '#10B981' },
  { match: /cobertura|telhado/i, icon: Home, cor: '#EF4444' },
  { match: /impermeabiliza/i, icon: ShieldCheck, cor: '#06B6D4' },
  { match: /hidr[oá]ssanit|hidráulic/i, icon: Droplets, cor: '#0EA5E9' },
  { match: /el[ée]tric/i, icon: Zap, cor: '#EAB308' },
  { match: /especial/i, icon: Wrench, cor: '#64748B' },
  { match: /esquadri/i, icon: DoorOpen, cor: '#F97316' },
  { match: /revestimento/i, icon: Square, cor: '#22C55E' },
  { match: /piso/i, icon: Grid3x3, cor: '#84CC16' },
  { match: /pintura/i, icon: PaintBucket, cor: '#EC4899' },
  { match: /lou[çc]a|metai/i, icon: Bath, cor: '#6366F1' },
  { match: /complementar/i, icon: Package, cor: '#94A3B8' },
]
function getEtapaIcone(nome: string): { icon: LucideIcon; cor: string } {
  const found = ETAPA_ICON_RULES.find(r => r.match.test(nome))
  return found ? { icon: found.icon, cor: found.cor } : { icon: FolderPlus, cor: '#64748B' }
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

  // Lookup de insumos SINAPI (referência lógica via sinapi_codigo — sem FK real,
  // então buscamos classificação + preços por UF numa query separada e montamos um mapa)
  const [sinapiInsumoMap, setSinapiInsumoMap] = useState<Record<string, { classificacao: string; precos: Record<string, number> }>>({})

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

  // Menu de etapa (excluir etapa)
  const [etapaMenuAberto, setEtapaMenuAberto] = useState<string | null>(null)
  const etapaMenuRef = useRef<HTMLDivElement>(null)

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
      if (etapaMenuRef.current && !etapaMenuRef.current.contains(e.target as Node)) setEtapaMenuAberto(null)
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
      .select(`*, composicoes_proprias(id,codigo,descricao,unidade,composicao_insumos(*)), sinapi_composicoes(id,codigo,descricao,unidade,custos)`)
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
        composicao_itens: cp?.composicao_insumos || [],
      }
    })
    setItens(enriched)

    // composicao_itens.sinapi_codigo é referência LÓGICA (sem FK real) — o PostgREST
    // não consegue fazer embed automático. Buscamos os insumos referenciados numa
    // query separada e montamos um mapa código → { classificacao, precos } no cliente.
    const codigos = Array.from(new Set(
      enriched.flatMap(i => (i.composicao_itens || [])
        .filter(ci => ci.tipo === 'SINAPI_INSUMO' && ci.sinapi_codigo)
        .map(ci => ci.sinapi_codigo as string))
    ))
    if (codigos.length > 0) {
      const { data: insumos } = await supabase
        .from('sinapi_insumos')
        .select('codigo, classificacao, precos')
        .in('codigo', codigos)
      const map: Record<string, { classificacao: string; precos: Record<string, number> }> = {}
      for (const ins of insumos || []) map[(ins as any).codigo] = { classificacao: (ins as any).classificacao, precos: (ins as any).precos || {} }
      setSinapiInsumoMap(map)
    } else {
      setSinapiInsumoMap({})
    }
  }

  async function loadEtapas() {
    const { data } = await supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem')
    setEtapas(data || [])
  }

  async function loadComposicoesProprias() {
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*, composicao_insumos(*)')
      .eq('ativo', true).order('codigo')
    const withCusto = (data || []).map((comp: any) => ({
      ...comp,
      composicao_itens: comp.composicao_insumos || [],
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
  // sinapi_codigo é referência lógica (sem FK real) — os preços/classificação vêm
  // do mapa sinapiInsumoMap, montado em loadItens via query separada + merge no cliente.
  const getItemTotal = useCallback((item: ItemEnriquecido): number => {
    const itensComp = item.composicao_itens || []
    if (itensComp.length === 0) return item.preco_unitario_snapshot * item.quantidade
    const temPreco = itensComp.some(ins => ((ins.sinapi_codigo ? sinapiInsumoMap[ins.sinapi_codigo]?.precos?.[obraUf] : undefined) ?? 0) > 0)
    if (!temPreco) return item.preco_unitario_snapshot * item.quantidade
    return itensComp.reduce((total, ins) => {
      const key = overrideKey(item.id, ins.sinapi_codigo || ins.id)
      const qtdCalculada = item.quantidade * ins.coeficiente
      const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
      const preco = (ins.sinapi_codigo ? sinapiInsumoMap[ins.sinapi_codigo]?.precos?.[obraUf] : undefined) ?? 0
      return total + qtdAdotada * preco
    }, 0)
  }, [insumoOverrides, obraUf, sinapiInsumoMap])

  const subtotal = itens.reduce((a, i) => a + getItemTotal(i), 0)
  const totalBdi = subtotal * (bdi / 100)
  const totalGeral = subtotal + totalBdi
  const custoPorM2 = areaM2 && areaM2 > 0 ? totalGeral / areaM2 : null

  // ─── Composição de custos diretos por categoria (Material / Mão de obra / Equipamentos) ──
  // Espelha exatamente a lógica de getItemTotal para que material+maoDeObra+equipamento+outros === subtotal
  const custoPorCategoria: CustoCategoria = (() => {
    const acc: CustoCategoria = { material: 0, maoDeObra: 0, equipamento: 0, outros: 0 }
    for (const item of itens) {
      const itensComp = item.composicao_itens || []
      const totalItem = getItemTotal(item)
      if (itensComp.length === 0) { acc.outros += totalItem; continue }
      const temPreco = itensComp.some(ins => ((ins.sinapi_codigo ? sinapiInsumoMap[ins.sinapi_codigo]?.precos?.[obraUf] : undefined) ?? 0) > 0)
      if (!temPreco) { acc.outros += totalItem; continue }
      for (const ins of itensComp) {
        const info = ins.sinapi_codigo ? sinapiInsumoMap[ins.sinapi_codigo] : undefined
        const preco = info?.precos?.[obraUf] ?? 0
        const key = overrideKey(item.id, ins.sinapi_codigo || ins.id)
        const qtdCalculada = item.quantidade * ins.coeficiente
        const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
        const valor = qtdAdotada * preco
        switch (info?.classificacao) {
          case 'MATERIAL': acc.material += valor; break
          case 'MAO_DE_OBRA': acc.maoDeObra += valor; break
          case 'EQUIPAMENTO': acc.equipamento += valor; break
          default: acc.outros += valor
        }
      }
    }
    return acc
  })()

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

  // ─── Excluir etapa (e suas composições) ─────────────────────────────────
  // etapas.id não tem ON DELETE CASCADE em orcamento_itens — removemos os itens
  // (abatendo materiais gerados) antes de excluir a etapa em si.
  async function handleRemoveEtapa(etapaId: string, nome: string) {
    const itensDaEtapa = itens.filter(i => i.etapa_id === etapaId)
    const aviso = itensDaEtapa.length > 0
      ? `Excluir a etapa "${nome}" e suas ${itensDaEtapa.length} composições? Esta ação não pode ser desfeita.`
      : `Excluir a etapa "${nome}"?`
    if (!confirm(aviso)) return

    for (const item of itensDaEtapa) {
      if (item.composicao_itens?.length) {
        await abaterMateriaisDaComposicao(item.composicao_itens, item.quantidade, item.etapa_id)
      }
      setInsumoOverrides(prev => {
        const next = { ...prev }
        Object.keys(next).filter(k => k.startsWith(item.id)).forEach(k => delete next[k])
        return next
      })
      await supabase.from('orcamento_itens').delete().eq('id', item.id)
    }
    await supabase.from('etapas').delete().eq('id', etapaId)
    setItens(prev => prev.filter(i => i.etapa_id !== etapaId))
    setEtapas(prev => prev.filter(e => e.id !== etapaId))
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
          const preco = (ins.sinapi_codigo ? sinapiInsumoMap[ins.sinapi_codigo]?.precos?.[obraUf] : undefined) ?? 0
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

      {/* ── Card 1 — KPIs gerais da obra (rola normalmente, não fixo) ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
      >
        <div className="p-4 flex flex-col gap-3">
          {/* Ações do orçamento */}
          <div className="flex items-center justify-end gap-2">
            {itens.length > 0 && (
              <Button size="sm" icon={<FileSpreadsheet size={14} />} variant="secondary" onClick={handleExportXLSX}>
                Exportar Excel
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
                <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
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

          {/* Tira de KPIs discretos */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <KpiMini label="Área construída" value={areaM2 && areaM2 > 0 ? `${areaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²` : '—'} />
            <KpiMini label="Custo direto / m²" value={areaM2 && areaM2 > 0 ? formatCurrency(subtotal / areaM2) : '—'} />
            <KpiMini label="Custo final / m²" value={custoPorM2 !== null ? formatCurrency(custoPorM2) : '—'} />
            <KpiMini label="Etapas" value={String(etapas.length)} />
            <KpiMini label="Composições" value={String(itens.length)} />
          </div>
        </div>
      </div>

      {/* ── Card 2 — composição de custos (fixo ao rolar) ── */}
      <div
        className="sticky top-16 z-20 rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
      >
        <div className="px-4 py-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            <CustoCard
              icon={Boxes} cor="var(--accent)" label="Custo Material"
              value={formatCurrency(custoPorCategoria.material)}
              hint={subtotal > 0 ? `${((custoPorCategoria.material / subtotal) * 100).toFixed(1)}% do direto` : undefined}
            />
            <CustoCard
              icon={Users} cor="var(--success)" label="Mão de Obra"
              value={formatCurrency(custoPorCategoria.maoDeObra)}
              hint={subtotal > 0 ? `${((custoPorCategoria.maoDeObra / subtotal) * 100).toFixed(1)}% do direto` : undefined}
            />
            <CustoCard
              icon={FileText} cor="var(--text-secondary)" label="Valor Direto"
              value={formatCurrency(subtotal)} hint="Sem BDI"
            />
            <CustoCard icon={Percent} cor="var(--warning)" label="BDI" hint={formatCurrency(totalBdi)}>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" value={bdi}
                  onChange={e => setBdi(Number(e.target.value))}
                  onBlur={handleUpdateBdi}
                  disabled={isReadonly}
                  className="input-base w-14 text-center py-0.5 text-sm"
                  min={0} max={100}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>
            </CustoCard>
            <CustoCard
              icon={Wallet} cor="var(--accent)" label="Total da Obra"
              value={formatCurrency(totalGeral)} hint="Com BDI" highlight
            />
          </div>
        </div>
      </div>

      {/* ── Estrutura da Obra (etapas + composições em cascata) ── */}
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
      ) : (() => {
        return (
          <div className="flex flex-col gap-3">
            {/* Cabeçalho — contagem + ação */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                {etapas.length} {etapas.length === 1 ? 'etapa' : 'etapas'} · {itens.length} {itens.length === 1 ? 'composição' : 'composições'}
              </span>
              {!isReadonly && (
                <Button size="sm" icon={<FolderPlus size={14} />} onClick={() => openItemModal()}>
                  Adicionar item
                </Button>
              )}
            </div>

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
                sinapiInsumoMap={sinapiInsumoMap}
                obraUf={obraUf}
                subtotalDireto={subtotal}
              />
            )}
            {etapas.map(etapa => {
              const itensDaEtapa = itensPorEtapa[etapa.id] || []
              const { icon, cor } = getEtapaIcone(etapa.nome)
              return (
                <GrupoEtapa
                  key={etapa.id}
                  nome={etapa.nome}
                  itens={itensDaEtapa}
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
                  sinapiInsumoMap={sinapiInsumoMap}
                  obraUf={obraUf}
                  icon={icon}
                  iconCor={cor}
                  subtotalDireto={subtotal}
                  onDeleteEtapa={!isReadonly ? () => handleRemoveEtapa(etapa.id, etapa.nome) : undefined}
                  menuAberto={etapaMenuAberto === etapa.id}
                  onToggleMenu={() => setEtapaMenuAberto(v => v === etapa.id ? null : etapa.id)}
                  menuRef={etapaMenuAberto === etapa.id ? etapaMenuRef : undefined}
                />
              )
            })}

            {!isReadonly && (
              <button
                onClick={() => openItemModal()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors hover:bg-[var(--bg-card)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <FolderPlus size={16} /> Adicionar item
              </button>
            )}
          </div>
        )
      })()}

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

// ─── Mini-KPI textual (tira de indicadores no topo do orçamento) ────────────
function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

// ─── Card de custo com ícone discreto ────────────────────────────────────────
function CustoCard({ icon: Icon, cor, label, value, hint, highlight, children }: {
  icon: LucideIcon
  cor: string
  label: string
  value?: React.ReactNode
  hint?: string
  highlight?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded-xl"
      style={{
        background: highlight ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary))' : 'var(--bg-secondary)',
        border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon size={12} style={{ color: cor }} className="flex-shrink-0" />
        <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        {children ?? (
          <span className="text-sm font-semibold leading-tight truncate" style={{ color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>
            {value}
          </span>
        )}
        {hint && <span className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{hint}</span>}
      </div>
    </div>
  )
}

// ─── Grupo de etapa (nível 1 da cascata) ─────────────────────────────────────
function GrupoEtapa({
  nome, itens, isReadonly, collapsed, onToggleGrupo, onAddItem, onRemove, bdi,
  expandedItems, onToggleItem, insumoOverrides, onOverrideInsumo, getItemTotal,
  sinapiInsumoMap, obraUf, icon: Icon, iconCor, subtotalDireto,
  onDeleteEtapa, menuAberto, onToggleMenu, menuRef,
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
  sinapiInsumoMap: Record<string, { classificacao: string; precos: Record<string, number> }>
  obraUf: string
  icon?: LucideIcon
  iconCor?: string
  subtotalDireto?: number
  onDeleteEtapa?: () => void
  menuAberto?: boolean
  onToggleMenu?: () => void
  menuRef?: React.RefObject<HTMLDivElement | null>
}) {
  const subtotalGrupo = itens.reduce((a, i) => a + getItemTotal(i), 0)
  const totalGrupo = subtotalGrupo * (1 + bdi / 100)
  const pctDoDireto = subtotalDireto && subtotalDireto > 0 ? (subtotalGrupo / subtotalDireto) * 100 : null

  return (
    <div className="card overflow-hidden">
      {/* Cabeçalho etapa */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={onToggleGrupo}
      >
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        {Icon && (
          <span className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0" style={{ background: 'var(--bg-card)', color: iconCor || 'var(--text-secondary)' }}>
            <Icon size={14} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{nome}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {itens.length} {itens.length === 1 ? 'composição' : 'composições'}
          </p>
        </div>
        {pctDoDireto !== null && (
          <span className="hidden sm:inline text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {pctDoDireto.toFixed(1)}% do direto
          </span>
        )}
        <span className="text-sm font-semibold ml-1 flex-shrink-0" style={{ color: 'var(--accent)' }}>
          {formatCurrency(totalGrupo)}
        </span>
        {!isReadonly && (
          <button
            onClick={e => { e.stopPropagation(); onAddItem() }}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-card)] flex-shrink-0"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)', opacity: 0.8 }}
          >
            <Plus size={12} /> item
          </button>
        )}
        {onDeleteEtapa && (
          <div className="relative flex-shrink-0" ref={menuRef} onClick={e => e.stopPropagation()}>
            <button
              onClick={onToggleMenu}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuAberto && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <button onClick={onDeleteEtapa}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                  style={{ color: 'var(--danger)' }}>
                  <Trash2 size={13} /> Excluir etapa
                </button>
              </div>
            )}
          </div>
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
                        const preco = (ins.sinapi_codigo ? sinapiInsumoMap[ins.sinapi_codigo]?.precos?.[obraUf] : undefined) ?? 0
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
