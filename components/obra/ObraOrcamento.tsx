'use client'

import { Fragment, useEffect, useState, useRef, useCallback } from 'react'
import {
  Plus, Lock, Unlock, Search, Trash2, MoreHorizontal, RefreshCw, Snowflake,
  ChevronDown, ChevronRight, FolderPlus, RotateCcw, FileSpreadsheet,
  Boxes, Users, FileText, Percent, Wallet, ArrowLeftRight,
  HardHat, Mountain, Layers, Building2, Grid3x3, Home, ShieldCheck,
  Droplets, Zap, Wrench, DoorOpen, Square, PaintBucket, Bath, Package,
  Pencil, type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Orcamento, ComposicaoPropria, SinapiComposicao, Etapa } from '@/lib/types'
import { formatCurrency, fixMojibake } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { exportOrcamentoXLSX, ItemExportRow } from '@/lib/export-orcamento'
import { InsumoOrcamentoAntigo, LinhaOrcamentoTabular } from '@/lib/import-export-orcamento'
import { LinhaImportada } from '@/lib/import-export-templates'
import { ImportarExportarOrcamentoModal, ResultadoImportacaoOrcamento } from './ImportarExportarOrcamentoModal'
import { readEtapasPadrao } from '@/lib/settings/etapas-padrao'

type FonteBusca = 'proprias' | 'sinapi' | 'livre'


// schema real (tabela composicao_insumos): FKs normalizadas para sinapi_insumos
// ou insumos_proprios — descrição/unidade/preço vêm sempre do embed (sem snapshot)
type ComposicaoItemJoin = {
  id: string
  composicao_id: string
  insumo_id: string | null
  insumo_proprio_id: string | null
  coeficiente: number
  insumo?: { codigo: string; classificacao: string; descricao: string; unidade: string; precos: Record<string, number> } | null
  insumo_proprio?: { codigo: string; descricao: string; unidade: string; categoria: string; preco_unitario: number } | null
}

// Deriva os dados de exibição/custo de um item de composição, qualquer que seja
// sua origem (insumo SINAPI ou insumo próprio da empresa)
function infoDoItem(ins: ComposicaoItemJoin, uf: string): { codigo: string; descricao: string; unidade: string; classificacao: string; preco: number } {
  if (ins.insumo_proprio) {
    return {
      codigo: ins.insumo_proprio.codigo,
      descricao: ins.insumo_proprio.descricao,
      unidade: ins.insumo_proprio.unidade,
      classificacao: ins.insumo_proprio.categoria,
      preco: ins.insumo_proprio.preco_unitario ?? 0,
    }
  }
  if (ins.insumo) {
    return {
      codigo: ins.insumo.codigo,
      descricao: ins.insumo.descricao,
      unidade: ins.insumo.unidade,
      classificacao: ins.insumo.classificacao,
      preco: ins.insumo.precos?.[uf] ?? 0,
    }
  }
  return { codigo: '—', descricao: '(insumo removido)', unidade: '—', classificacao: '', preco: 0 }
}

type ComposicaoComCusto = ComposicaoPropria & {
  composicao_itens?: ComposicaoItemJoin[]
  custo_calculado: number
}

// linha bruta de orcamento_itens com os joins de composição embutidos
type OrcamentoItemRow = Omit<ItemEnriquecido, 'codigo' | 'descricao' | 'unidade' | 'composicao_itens'> & {
  composicoes_proprias?: (ComposicaoPropria & { composicao_insumos?: ComposicaoItemJoin[] }) | null
  sinapi_composicoes?: SinapiComposicao | null
}

// linha bruta de composicoes_proprias com o join de composicao_insumos embutido
type ComposicaoPropriaRow = ComposicaoPropria & { composicao_insumos?: ComposicaoItemJoin[] }

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
  // mês de referência da composição SINAPI (quando o item vem da base SINAPI) —
  // necessário para casar com `sinapi_composicao_itens` ao gerar/abater materiais
  sinapi_mes_referencia?: string | null
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

export function ObraOrcamento({ obraId, orcamentoId, areaM2, obraName, obraUf = 'SP' }: {
  obraId?: string
  orcamentoId?: string
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
  const [filtroEtapaId, setFiltroEtapaId] = useState('todas')

  // Cascata + overrides
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [insumoOverrides, setInsumoOverrides] = useState<Record<string, number>>({})


  // Modal adicionar item
  const [showAddItem, setShowAddItem] = useState(false)
  const [showImportExportTabular, setShowImportExportTabular] = useState(false)
  const [selectedEtapaNome, setSelectedEtapaNome] = useState('')
  const [subetapaLivre, setSubetapaLivre] = useState('')
  const [fonte, setFonte] = useState<FonteBusca>('proprias')
  const [composicoesProprias, setComposicoesProprias] = useState<ComposicaoComCusto[]>([])
  const [sinapiComps, setSinapiComps] = useState<SinapiComposicao[]>([])
  const [busca, setBusca] = useState('')
  const [selectedItem, setSelectedItem] = useState<(ComposicaoComCusto | SinapiComposicao) | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [livreDescricao, setLivreDescricao] = useState('')
  const [livreUnidade, setLivreUnidade] = useState('UN')
  const [livrePreco, setLivrePreco] = useState('')
  const [saving, setSaving] = useState(false)
  const qtdInputRef = useRef<HTMLInputElement>(null)
  // Cache (por sessão de componente) de se a coluna materiais.subetapa existe —
  // em alguns bancos a migração "fix_2026_06_08_supabase_v1_2_columns.sql"
  // ainda não rodou, e a coluna não existe. Sondamos uma vez e reaproveitamos,
  // pra não bloquear silenciosamente toda a cascata de geração de materiais
  // (era a causa raiz de "materiais não estão sendo importados do orçamento").
  const temSubetapaMateriaisRef = useRef<boolean | null>(null)
  async function materiaisTemSubetapa(): Promise<boolean> {
    if (temSubetapaMateriaisRef.current !== null) return temSubetapaMateriaisRef.current
    if (!resolvedObraId) { temSubetapaMateriaisRef.current = false; return false }
    const { error } = await supabase.from('materiais').select('subetapa').eq('obra_id', resolvedObraId).limit(1)
    const tem = !(error && /column .* does not exist/i.test(error.message))
    temSubetapaMateriaisRef.current = tem
    return tem
  }

  // Modal editar item de composição
  const [editItem, setEditItem] = useState<ItemEnriquecido | null>(null)
  const [editDescricao, setEditDescricao] = useState('')
  const [editUnidade, setEditUnidade] = useState('')
  const [editPreco, setEditPreco] = useState('')
  const [editQuantidade, setEditQuantidade] = useState('')
  const [editSubetapa, setEditSubetapa] = useState('')
  const [editEtapaId, setEditEtapaId] = useState('')

  function openEditItem(item: ItemEnriquecido) {
    setEditItem(item)
    setEditDescricao(item.descricao)
    setEditUnidade(item.unidade)
    setEditPreco(item.preco_unitario_snapshot.toString())
    setEditQuantidade(item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 }))
    setEditSubetapa(item.subetapa ?? '')
    setEditEtapaId(item.etapa_id ?? '')
  }

  // Modal nova etapa
  const [showNovaEtapa, setShowNovaEtapa] = useState(false)
  const [novaEtapaNome, setNovaEtapaNome] = useState('')
  const [criandoEtapa, setCriandoEtapa] = useState(false)

  // Grupos colapsados (nível etapa) — persistido no localStorage por obra
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = localStorage.getItem(`bs_collapsed_${obraId || orcamentoId}`)
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  // Menu de etapa (excluir etapa)
  const [etapaMenuAberto, setEtapaMenuAberto] = useState<string | null>(null)
  const etapaMenuRef = useRef<HTMLDivElement>(null)

  // Menu ...
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [sincronizandoMateriais, setSincronizandoMateriais] = useState(false)

  // ─── Reabrir orçamento finalizado (nova versão) ──────────────────────────
  // O usuário perguntou se reabrir volta a puxar os preços da base — hoje não:
  // a versão nova é criada preservando o snapshot congelado. Damos a opção
  // explícita de manter os preços congelados OU atualizar pelos preços atuais
  // da base (SINAPI / composições próprias) na UF da obra.
  const [showReabrirModal, setShowReabrirModal] = useState(false)
  const [reabrindo, setReabrindo] = useState(false)

  // ─── Carregar overrides do localStorage ─────────────────────────────────
  useEffect(() => {
    if (!orcamento?.id) return
    const stored = localStorage.getItem(`bs_overrides_${orcamento.id}`)
    if (!stored) return
    // Disparo assíncrono evita setState síncrono no corpo do efeito (cascading renders)
    Promise.resolve().then(() => {
      try { setInsumoOverrides(JSON.parse(stored)) } catch { /* ignore */ }
    })
  }, [orcamento?.id])

  useEffect(() => {
    if (!orcamento?.id) return
    localStorage.setItem(`bs_overrides_${orcamento.id}`, JSON.stringify(insumoOverrides))
  }, [insumoOverrides, orcamento?.id])

  useEffect(() => {
    localStorage.setItem(`bs_collapsed_${obraId || orcamentoId}`, JSON.stringify(collapsed))
  }, [collapsed, obraId, orcamentoId])


  // ─── Fechar menu ao clicar fora ──────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
      if (etapaMenuRef.current && !etapaMenuRef.current.contains(e.target as Node)) setEtapaMenuAberto(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadOrcamento(), loadEtapas(), loadComposicoesProprias(), loadSinapiComps()])
    setLoading(false)
  }

  async function loadOrcamento() {
    let orc: Orcamento | null = null

    if (orcamentoId) {
      const { data } = await supabase.from('orcamentos').select('*').eq('id', orcamentoId).single()
      orc = data
    } else if (obraId) {
      const { data } = await supabase
        .from('orcamentos').select('*').eq('obra_id', resolvedObraId)
        .order('versao', { ascending: false }).limit(1).maybeSingle()
      orc = data

      if (!orc) {
        const { data: novo } = await supabase
          .from('orcamentos')
          .insert({ obra_id: resolvedObraId, tipo: 'executivo', bdi_percentual: 25, status: 'rascunho', versao: 1 })
          .select()
          .single()
        orc = novo
      }
    }

    if (orc) { setOrcamento(orc); setBdi(orc.bdi_percentual); await loadItens(orc.id) }
  }

  // embed padrão dos itens de composição própria — traz direto do banco a descrição,
  // unidade, classificação e preços (por UF) do insumo SINAPI ou do insumo próprio
  const COMPOSICAO_INSUMOS_EMBED = `composicao_insumos(
    id, composicao_id, insumo_id, insumo_proprio_id, coeficiente,
    insumo:sinapi_insumos(codigo,classificacao,descricao,unidade,precos),
    insumo_proprio:insumos_proprios(codigo,descricao,unidade,categoria,preco_unitario)
  )`

  async function loadItens(orcamentoId: string) {
    const { data } = await supabase
      .from('orcamento_itens')
      .select(`*, composicoes_proprias(id,codigo,descricao,unidade,${COMPOSICAO_INSUMOS_EMBED}), sinapi_composicoes(id,codigo,descricao,unidade,custos,custo_unitario,mes_referencia)`)
      .eq('orcamento_id', orcamentoId)
      .order('updated_at')

    const enriched: ItemEnriquecido[] = (data || []).map((item: OrcamentoItemRow) => {
      const cp = item.composicoes_proprias
      const sc = item.sinapi_composicoes
      return {
        ...item,
        codigo: cp?.codigo || sc?.codigo || item.codigo_snapshot || '—',
        descricao: fixMojibake(item.descricao_snapshot || cp?.descricao || sc?.descricao || '—'),
        unidade: cp?.unidade || sc?.unidade || item.unidade_snapshot || '—',
        composicao_itens: cp?.composicao_insumos || [],
        sinapi_mes_referencia: sc?.mes_referencia || null,
      }
    })
    setItens(enriched)
  }

  const resolvedObraId = obraId || orcamento?.obra_id || null

  async function loadEtapas() {
    if (!resolvedObraId) { setEtapas([]); return }
    const { data } = await supabase.from('etapas').select('*').eq('obra_id', resolvedObraId).order('ordem')
    setEtapas(data || [])
  }

  async function loadComposicoesProprias() {
    const { data } = await supabase
      .from('composicoes_proprias')
      .select(`*, ${COMPOSICAO_INSUMOS_EMBED}`)
      .eq('ativo', true).order('codigo')
    const withCusto = (data || []).map((comp: ComposicaoPropriaRow) => {
      const composicao_itens = comp.composicao_insumos || []
      const custo_calculado = composicao_itens.reduce(
        (total, ins) => total + ins.coeficiente * infoDoItem(ins, obraUf).preco, 0
      )
      return { ...comp, descricao: fixMojibake(comp.descricao), composicao_itens, custo_calculado }
    })
    setComposicoesProprias(withCusto)
  }

  async function loadSinapiComps() {
    const { data } = await supabase.from('sinapi_composicoes').select('*').order('codigo').limit(200)
    setSinapiComps((data || []).map((c: any) => ({ ...c, descricao: fixMojibake(c.descricao) })))
  }

  useEffect(() => {
    Promise.resolve().then(() => loadAll())
  }, [obraId, orcamentoId])

  useEffect(() => {
    function onDataChanged() { loadAll() }
    window.addEventListener('buildsmart:obra-data-changed', onDataChanged)
    return () => window.removeEventListener('buildsmart:obra-data-changed', onDataChanged)
  }, [obraId, orcamentoId])

  // ─── Totais com override ─────────────────────────────────────────────────
  // preços/classificação vêm direto do embed (insumo:sinapi_insumos / insumo_proprio:insumos_proprios)
  const getItemTotal = useCallback((item: ItemEnriquecido): number => {
    const itensComp = item.composicao_itens || []
    if (itensComp.length === 0) return item.preco_unitario_snapshot * item.quantidade
    const temPreco = itensComp.some(ins => infoDoItem(ins, obraUf).preco > 0)
    if (!temPreco) return item.preco_unitario_snapshot * item.quantidade
    return itensComp.reduce((total, ins) => {
      const info = infoDoItem(ins, obraUf)
      const key = overrideKey(item.id, info.codigo !== '—' ? info.codigo : ins.id)
      const qtdCalculada = item.quantidade * ins.coeficiente
      const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
      return total + qtdAdotada * info.preco
    }, 0)
  }, [insumoOverrides, obraUf])

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
      const temPreco = itensComp.some(ins => infoDoItem(ins, obraUf).preco > 0)
      if (!temPreco) { acc.outros += totalItem; continue }
      for (const ins of itensComp) {
        const info = infoDoItem(ins, obraUf)
        const key = overrideKey(item.id, info.codigo !== '—' ? info.codigo : ins.id)
        const qtdCalculada = item.quantidade * ins.coeficiente
        const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
        const valor = qtdAdotada * info.preco
        switch (info.classificacao) {
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
      .insert({ obra_id: resolvedObraId, nome: novaEtapaNome.trim(), status: 'planejada', ordem: maxOrdem + 1 })
      .select().single()
    if (data) {
      setEtapas(prev => [...prev, data])
      setSelectedEtapaNome(data.nome)
      setShowAddItem(true)
    }
    setCriandoEtapa(false); setShowNovaEtapa(false); setNovaEtapaNome('')
  }

  function openItemModal(etapaId: string | null = null, subetapa: string | null = null, usarItemLivre = false) {
    const etapa = etapaId ? etapas.find(e => e.id === etapaId) : null
    setSelectedEtapaNome(etapa?.nome || etapas[0]?.nome || '')
    setSubetapaLivre(subetapa && subetapa !== 'Sem subetapa' ? subetapa : '')
    setFonte(usarItemLivre ? 'livre' : 'proprias')
    setSelectedItem(null)
    setBusca('')
    setLivreDescricao('')
    setLivreUnidade('UN')
    setLivrePreco('')
    setQuantidade('')
    setShowAddItem(true)
  }

  async function ensureEtapaSelecionada(): Promise<string | null> {
    const nome = selectedEtapaNome.trim()
    if (!nome) return null
    const existente = etapas.find(e => e.nome.toLowerCase() === nome.toLowerCase())
    if (existente) return existente.id
    const ordem = etapas.length + 1
    const { data } = await supabase.from('etapas').insert({ obra_id: resolvedObraId, nome, ordem }).select().single()
    if (data) {
      setEtapas(prev => [...prev, data])
      return data.id
    }
    return null
  }

  // ─── Adicionar item ───────────────────────────────────────────────────────
  async function handleAddItem(fecharDepois = false) {
    if (!orcamento || !quantidade) return
    if (fonte !== 'livre' && !selectedItem) return
    if (fonte === 'livre' && !livreDescricao.trim()) return
    setSaving(true)
    try {
      const isSinapi = fonte === 'sinapi'
      const qtd = parseFloat(quantidade)
      const codigoLivre = `LIV-${Date.now().toString(36).toUpperCase()}`
      const descricaoFinal = fonte === 'livre' ? livreDescricao.trim() : selectedItem!.descricao
      const unidadeFinal = fonte === 'livre' ? (livreUnidade.trim() || 'UN') : selectedItem!.unidade
      const custoUnitario = fonte === 'livre' ? (parseFloat(livrePreco.replace(',', '.')) || 0) : getItemCost(selectedItem!)
      const etapaId = await ensureEtapaSelecionada()
      const subetapaFinal = subetapaLivre.trim() || null

      const { error } = await supabase.from('orcamento_itens').insert({
        orcamento_id: orcamento.id,
        etapa_id: etapaId,
        subetapa: subetapaFinal,
        composicao_id: fonte === 'proprias' ? selectedItem!.id : null,
        sinapi_composicao_id: isSinapi ? selectedItem!.id : null,
        quantidade: qtd,
        preco_unitario_snapshot: custoUnitario,
        descricao_snapshot: descricaoFinal,
        codigo_snapshot: fonte === 'livre' ? codigoLivre : selectedItem!.codigo,
        unidade_snapshot: unidadeFinal,
      })

      if (error) throw error

      if (fonte === 'livre') {
        await upsertMaterialSoma(codigoLivre, descricaoFinal, unidadeFinal, qtd, etapaId, subetapaFinal)
      } else if (!isSinapi && selectedItem && 'composicao_itens' in selectedItem) {
        await gerarMateriaisDaComposicao(selectedItem.composicao_itens || [], qtd, etapaId, subetapaFinal, selectedItem.codigo, selectedItem.descricao, selectedItem.unidade)
      } else if (isSinapi) {
        await gerarMateriaisDaComposicaoSinapi(selectedItem!.codigo, (selectedItem as SinapiComposicao).mes_referencia, qtd, etapaId, subetapaFinal, selectedItem!.descricao, selectedItem!.unidade)
      }

      setSelectedItem(null); setQuantidade(''); setBusca(''); setLivreDescricao(''); setLivrePreco('')
      if (fecharDepois) { setShowAddItem(false); setSubetapaLivre('') }
      await loadItens(orcamento.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      alert(`Não foi possível inserir a composição no orçamento: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveItem(itemId: string) {
    const item = itens.find(i => i.id === itemId)
    if (item?.composicao_id) {
      await abaterMateriaisDaComposicao(item.composicao_itens || [], item.quantidade, item.etapa_id, item.subetapa, item.codigo)
    } else if (item?.sinapi_composicao_id && item.codigo && item.codigo !== '—') {
      await abaterMateriaisDaComposicaoSinapi(item.codigo, item.sinapi_mes_referencia, item.quantidade, item.etapa_id, item.subetapa)
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

  async function handleUpdateItemQuantidade(itemId: string, novaQuantidade: number) {
    if (!Number.isFinite(novaQuantidade) || novaQuantidade <= 0) return
    const item = itens.find(i => i.id === itemId)
    if (!item || item.quantidade === novaQuantidade) return

    const quantidadeAnterior = item.quantidade
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, quantidade: novaQuantidade } : i))

    const { error } = await supabase
      .from('orcamento_itens')
      .update({ quantidade: novaQuantidade })
      .eq('id', itemId)

    if (error) {
      setItens(prev => prev.map(i => i.id === itemId ? { ...i, quantidade: quantidadeAnterior } : i))
      alert(`Nao foi possivel atualizar a quantidade: ${error.message}`)
      return
    }

    if (item.composicao_id) {
      await abaterMateriaisDaComposicao(item.composicao_itens || [], quantidadeAnterior, item.etapa_id, item.subetapa, item.codigo)
      await gerarMateriaisDaComposicao(item.composicao_itens || [], novaQuantidade, item.etapa_id, item.subetapa, item.codigo, item.descricao, item.unidade)
    } else if (item.sinapi_composicao_id && item.codigo && item.codigo !== '\u2014') {
      await abaterMateriaisDaComposicaoSinapi(item.codigo, item.sinapi_mes_referencia, quantidadeAnterior, item.etapa_id, item.subetapa)
      await gerarMateriaisDaComposicaoSinapi(item.codigo, item.sinapi_mes_referencia, novaQuantidade, item.etapa_id, item.subetapa, item.descricao, item.unidade)
    }
  }

  async function handleEditItemSave() {
    if (!editItem || !orcamento) return
    setSaving(true)
    try {
      const novaQtd = Number(editQuantidade.replace(',', '.'))
      const novoPreco = Number(editPreco.replace(',', '.'))
      const novaSubetapa = editSubetapa.trim() || null
      const novaEtapaId = editEtapaId || null

      const updates: Record<string, unknown> = {
        descricao_snapshot: editDescricao.trim(),
        unidade_snapshot: editUnidade.trim(),
        preco_unitario_snapshot: Number.isFinite(novoPreco) ? novoPreco : editItem.preco_unitario_snapshot,
        quantidade: Number.isFinite(novaQtd) && novaQtd > 0 ? novaQtd : editItem.quantidade,
        subetapa: novaSubetapa,
        etapa_id: novaEtapaId,
      }

      const { error } = await supabase.from('orcamento_itens').update(updates).eq('id', editItem.id)
      if (error) throw error

      await loadItens(orcamento.id)
      setEditItem(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      alert(`Não foi possível atualizar: ${message}`)
    } finally {
      setSaving(false)
    }
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
      if (item.composicao_id) {
        await abaterMateriaisDaComposicao(item.composicao_itens || [], item.quantidade, item.etapa_id, item.subetapa, item.codigo)
      } else if (item.sinapi_composicao_id && item.codigo && item.codigo !== '—') {
        await abaterMateriaisDaComposicaoSinapi(item.codigo, item.sinapi_mes_referencia, item.quantidade, item.etapa_id, item.subetapa)
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

  async function handleRenameEtapa(etapaId: string, nomeAtual: string) {
    const nome = prompt('Novo nome da etapa', nomeAtual)?.trim()
    if (!nome || nome === nomeAtual) return
    const { error } = await supabase.from('etapas').update({ nome }).eq('id', etapaId)
    if (error) {
      alert(`Nao foi possivel renomear a etapa: ${error.message}`)
      return
    }
    setEtapas(prev => prev.map(e => e.id === etapaId ? { ...e, nome } : e))
  }

  async function handleRenameSubetapa(etapaId: string | null, subetapaAtual: string) {
    const atual = subetapaAtual === 'Sem subetapa' ? '' : subetapaAtual
    const nome = prompt('Novo nome da subetapa', atual)?.trim()
    if (nome === undefined || nome === atual) return
    const novoValor = nome || null
    let query = supabase.from('orcamento_itens').update({ subetapa: novoValor })
    query = atual ? query.eq('subetapa', atual) : query.is('subetapa', null)
    query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
    const { error } = await query
    if (error) {
      alert(`Nao foi possivel renomear a subetapa: ${error.message}`)
      return
    }
    setItens(prev => prev.map(item => item.etapa_id === etapaId && (item.subetapa || 'Sem subetapa') === subetapaAtual
      ? { ...item, subetapa: novoValor }
      : item))
  }

  async function handleRemoveSubetapa(etapaId: string | null, subetapaNome: string) {
    const itensDaSubetapa = itens.filter(item =>
      item.etapa_id === etapaId && (item.subetapa || 'Sem subetapa') === subetapaNome
    )
    if (itensDaSubetapa.length === 0) return
    const aviso = `Excluir a subetapa "${subetapaNome}" e suas ${itensDaSubetapa.length} composições/itens? Esta ação não pode ser desfeita.`
    if (!confirm(aviso)) return

    for (const item of itensDaSubetapa) {
      if (item.composicao_id) {
        await abaterMateriaisDaComposicao(item.composicao_itens || [], item.quantidade, item.etapa_id, item.subetapa, item.codigo)
      } else if (item.sinapi_composicao_id && item.codigo && item.codigo !== '—') {
        await abaterMateriaisDaComposicaoSinapi(item.codigo, item.sinapi_mes_referencia, item.quantidade, item.etapa_id, item.subetapa)
      } else if (item.codigo && item.codigo !== '—') {
        await abaterMaterialQtd(item.codigo, item.quantidade, item.etapa_id, item.subetapa)
      }
      setInsumoOverrides(prev => {
        const next = { ...prev }
        Object.keys(next).filter(k => k.startsWith(item.id)).forEach(k => delete next[k])
        return next
      })
    }

    const ids = itensDaSubetapa.map(item => item.id)
    await supabase.from('orcamento_itens').delete().in('id', ids)
    setItens(prev => prev.filter(item => !ids.includes(item.id)))
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
          const info = infoDoItem(ins, obraUf)
          const insumoKey = info.codigo !== '—' ? info.codigo : ins.id
          const key = overrideKey(item.id, insumoKey)
          const qtdCalculada = item.quantidade * ins.coeficiente
          const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
          return {
            codigo: info.codigo !== '—' ? info.codigo : '',
            descricao: info.descricao,
            unidade: info.unidade,
            qtdCalculada,
            qtdAdotada,
            precoUnit: info.preco,
            totalInsumo: qtdAdotada * info.preco,
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

  // ─── Importar orçamento via planilha tabular ─────────────────────────────
  // Cada linha: Etapa, Subetapa, Código (da composição), Quantidade. A etapa é
  // localizada/criada por nome e a composição é localizada pelo código —
  // própria primeiro, SINAPI em seguida. Espelha handleAddItem para cada linha.
  async function handleImportarOrcamento(linhas: LinhaImportada[]): Promise<ResultadoImportacaoOrcamento> {
    if (!orcamento) return { inseridos: 0, ignorados: linhas.length, erros: ['Orçamento não carregado.'] }

    const erros: string[] = []
    let inseridos = 0
    let ignorados = 0

    const etapaCache = new Map(etapas.map(e => [e.nome.trim().toLowerCase(), e.id]))
    let maxOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0)

    const mapaProprias = new Map(composicoesProprias.map(c => [c.codigo.trim().toUpperCase(), c]))
    const mapaSinapi = new Map(sinapiComps.map(c => [c.codigo.trim().toUpperCase(), c]))

    for (const linha of linhas) {
      const etapaNome = String(linha.valores.etapa ?? '').trim()
      const subetapa = (linha.valores.subetapa as string | null) ?? null
      const codigo = String(linha.valores.codigo ?? '').trim().toUpperCase()
      const quantidade = Number(linha.valores.quantidade ?? 0)
      const statusExecucaoImportado = mapStatusExecucao(linha.valores.statusExecucao)
      const statusCompraImportado = mapStatusCompra(linha.valores.statusMaterial)
      const insumosAntigos = Array.isArray(linha.valores.insumos)
        ? linha.valores.insumos as InsumoOrcamentoAntigo[]
        : []
      const insumosResumoLegado = insumosAntigos.length > 0
        && insumosAntigos.every(insumo => insumo.tipo === 'LEGADO_RESUMIDO' || insumo.codigo.startsWith(`${codigo}-`))

      if (!etapaNome || !codigo || !quantidade) {
        ignorados++
        erros.push(`Linha ${linha.numero}: dados incompletos — ignorada.`)
        continue
      }

      let etapaId = etapaCache.get(etapaNome.toLowerCase()) ?? null
      if (!etapaId) {
        const { data, error } = await supabase
          .from('etapas')
          .insert({ obra_id: resolvedObraId, nome: etapaNome, status: statusExecucaoImportado, ordem: ++maxOrdem })
          .select().single()
        if (error || !data) {
          ignorados++
          erros.push(`Linha ${linha.numero}: não foi possível criar a etapa "${etapaNome}".`)
          continue
        }
        etapaId = data.id
        etapaCache.set(etapaNome.toLowerCase(), data.id)
        setEtapas(prev => [...prev, data])
      } else if (statusExecucaoImportado !== 'planejada') {
        await supabase.from('etapas').update({ status: statusExecucaoImportado }).eq('id', etapaId)
        setEtapas(prev => prev.map(e => e.id === etapaId ? { ...e, status: statusExecucaoImportado } : e))
      }

      let propria = mapaProprias.get(codigo)
      const sinapi = !propria ? mapaSinapi.get(codigo) : undefined
      const origemLegada = String(linha.valores.origem ?? '')
      if (!propria && !sinapi && (origemLegada === 'sistema_antigo' || origemLegada === 'planilha_resumida')) {
        const descricaoLegada = String(linha.valores.descricao ?? codigo)
        const unidadeLegada = String(linha.valores.unidade ?? 'UN') || 'UN'
        const { data: novaComposicao, error: erroComposicao } = await supabase
          .from('composicoes_proprias')
          .insert({
            codigo,
            descricao: descricaoLegada,
            unidade: unidadeLegada,
            grupo: etapaNome || 'Importado',
            ativo: true,
          })
          .select(`*, ${COMPOSICAO_INSUMOS_EMBED}`)
          .single()

        if (erroComposicao || !novaComposicao) {
          ignorados++
          erros.push(`Linha ${linha.numero}: nao foi possivel criar a composicao resumida "${codigo}".`)
          continue
        }

        propria = {
          ...novaComposicao,
          composicao_itens: novaComposicao.composicao_insumos || [],
          custo_calculado: 0,
        } as ComposicaoComCusto
        mapaProprias.set(codigo, propria)
        setComposicoesProprias(prev => [...prev, propria!])
      }
      const composicao = propria || sinapi
      if (!composicao) {
        ignorados++
        erros.push(`Linha ${linha.numero}: código "${codigo}" não corresponde a nenhuma composição cadastrada.`)
        continue
      }
      const isSinapi = !propria

      const custoUnitarioImportado = Number(linha.valores.custoUnitario ?? 0)
      const custoUnitario = custoUnitarioImportado > 0 ? custoUnitarioImportado : getItemCost(composicao)
      const descricaoSnapshot = String(linha.valores.descricao ?? composicao.descricao)
      const unidadeSnapshot = String(linha.valores.unidade ?? composicao.unidade)
      const { data: itemInserido, error: insertErro } = await supabase.from('orcamento_itens').insert({
        orcamento_id: orcamento.id,
        etapa_id: etapaId,
        subetapa,
        composicao_id: isSinapi ? null : composicao.id,
        sinapi_composicao_id: isSinapi ? composicao.id : null,
        quantidade,
        preco_unitario_snapshot: custoUnitario,
        descricao_snapshot: descricaoSnapshot,
        codigo_snapshot: composicao.codigo,
        unidade_snapshot: unidadeSnapshot,
      }).select('id').single()

      if (insertErro) {
        ignorados++
        erros.push(`Linha ${linha.numero}: erro ao inserir item — ${insertErro.message}`)
        continue
      }

      if (insumosAntigos.length && !insumosResumoLegado && itemInserido?.id && !isSinapi && 'composicao_itens' in composicao) {
        const overridesImportados: Record<string, number> = {}
        const itensComposicao = (composicao as ComposicaoComCusto).composicao_itens || []
        for (const insumoImportado of insumosAntigos) {
          const itemComp = itensComposicao.find(ins => infoDoItem(ins, obraUf).codigo.toUpperCase() === insumoImportado.codigo.toUpperCase())
          if (!itemComp) {
            erros.push(`Linha ${linha.numero}: insumo ${insumoImportado.codigo} nao encontrado na composicao ${codigo}; quantidade adotada nao aplicada.`)
            continue
          }
          const info = infoDoItem(itemComp, obraUf)
          overridesImportados[overrideKey(itemInserido.id, info.codigo !== '—' ? info.codigo : itemComp.id)] = insumoImportado.quantidadeAdotada
        }
        if (Object.keys(overridesImportados).length) {
          setInsumoOverrides(prev => ({ ...prev, ...overridesImportados }))
        }
      }

      if (insumosResumoLegado) {
        await upsertMaterialSoma(composicao.codigo, descricaoSnapshot, unidadeSnapshot, quantidade, etapaId, subetapa, statusCompraImportado)
      } else if (!insumosAntigos.length && !isSinapi && 'composicao_itens' in composicao) {
        await gerarMateriaisDaComposicao((composicao as ComposicaoComCusto).composicao_itens || [], quantidade, etapaId, subetapa, composicao.codigo, composicao.descricao, composicao.unidade)
      } else if (!insumosAntigos.length && isSinapi) {
        await gerarMateriaisDaComposicaoSinapi(composicao.codigo, (composicao as SinapiComposicao).mes_referencia, quantidade, etapaId, subetapa, composicao.descricao, composicao.unidade)
      }

      inseridos++
    }

    if (orcamento) await loadItens(orcamento.id)
    return { inseridos, ignorados, erros }
  }

  async function handleFinalizar() {
    if (!orcamento || !confirm('Finalizar orçamento? Os preços serão congelados.')) return
    await supabase.from('orcamentos').update({ status: 'finalizado' }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, status: 'finalizado' } : o)
    setShowMenu(false)
  }

  function handleReabrir() {
    setShowMenu(false)
    setShowReabrirModal(true)
  }

  // Busca o preço atual de um item na base (SINAPI ou composição própria) para
  // a UF da obra. Retorna null quando não há referência viva (ex.: item digitado
  // manualmente / importado sem vínculo) — nesse caso o snapshot antigo é mantido.
  async function precoAtualDoItem(item: ItemEnriquecido): Promise<number | null> {
    if (item.sinapi_composicao_id) {
      const { data } = await supabase.from('sinapi_composicoes').select('custos').eq('id', item.sinapi_composicao_id).maybeSingle()
      const custos = (data as { custos?: Record<string, number> } | null)?.custos
      return custos?.[obraUf] ?? null
    }
    if (item.composicao_id) {
      const cp = composicoesProprias.find(c => c.id === item.composicao_id)
      return cp?.custo_calculado ?? null
    }
    return null
  }

  async function confirmarReabrir(atualizarPrecos: boolean) {
    if (!orcamento) return
    setReabrindo(true)
    try {
      const novaVersao = orcamento.versao + 1
      const { data: novoOrc } = await supabase
        .from('orcamentos')
        .insert({ obra_id: resolvedObraId, tipo: orcamento.tipo, bdi_percentual: orcamento.bdi_percentual, status: 'rascunho', versao: novaVersao })
        .select().single()
      if (novoOrc) {
        let atualizados = 0
        for (const item of itens) {
          let preco = item.preco_unitario_snapshot
          if (atualizarPrecos) {
            const precoAtual = await precoAtualDoItem(item)
            if (precoAtual !== null && precoAtual > 0) { preco = precoAtual; atualizados++ }
          }
          await supabase.from('orcamento_itens').insert({
            orcamento_id: novoOrc.id, etapa_id: item.etapa_id, subetapa: item.subetapa,
            composicao_id: item.composicao_id, sinapi_composicao_id: item.sinapi_composicao_id,
            quantidade: item.quantidade, preco_unitario_snapshot: preco,
            descricao_snapshot: item.descricao_snapshot, codigo_snapshot: item.codigo_snapshot,
            unidade_snapshot: item.unidade_snapshot,
          })
        }
        setOrcamento(novoOrc)
        await loadItens(novoOrc.id)
        if (atualizarPrecos) {
          alert(atualizados > 0
            ? `Nova versão criada. ${atualizados} de ${itens.length} ${itens.length === 1 ? 'item teve seu preço atualizado' : 'itens tiveram o preço atualizado'} pela base atual (UF ${obraUf}). Itens sem vínculo direto com a base mantiveram o preço anterior.`
            : `Nova versão criada, mas nenhum item tinha vínculo vivo com a base SINAPI/composições para atualizar — os preços anteriores foram mantidos.`)
        }
      }
    } finally {
      setReabrindo(false)
      setShowReabrirModal(false)
    }
  }

  // ─── Materiais ────────────────────────────────────────────────────────────
  // Observação: a lista de "materiais a comprar" é ligada a sinapi_codigo (TEXT).
  // gerarMateriaisDaComposicao (própria) e gerarMateriaisDaComposicaoSinapi (base
  // SINAPI) ficam definidas mais abaixo, junto dos helpers de upsert/abate —
  // ambas com fallback (lançam a própria composição como material) quando não
  // há detalhamento analítico de insumos disponível, garantindo que o dado
  // sempre "puxe" pra Materiais.

  // Mesma ideia de gerarMateriaisDaComposicao, mas para itens vindos direto da
  // base SINAPI (sinapi_composicao_id) — não têm `composicao_itens` embutido,
  // então buscamos a tabela analítica `sinapi_composicao_itens` (INSUMO|COMPOSICAO)
  // e geramos materiais a partir dos insumos diretos (tipo INSUMO).
  // Sem isso, a cascata de Materiais ficava vazia para orçamentos montados com
  // composições da base SINAPI (o caminho mais comum).
  async function buscarInsumosAnaliticosSinapi(codigo: string, mesReferencia: string | null | undefined) {
    let query = supabase.from('sinapi_composicao_itens')
      .select('item_codigo, item_descricao, item_unidade, coeficiente, tipo')
      .eq('composicao_codigo', codigo).eq('tipo', 'INSUMO')
    if (mesReferencia) query = query.eq('mes_referencia', mesReferencia)
    const { data } = await query
    return (data || []) as { item_codigo: string; item_descricao: string; item_unidade: string; coeficiente: number; tipo: string }[]
  }

  function mapStatusExecucao(valor: unknown): Etapa['status'] {
    const texto = String(valor ?? '').toLowerCase()
    if (texto.includes('execut')) return 'concluida'
    if (texto.includes('andamento') || texto.includes('execu')) return 'em_andamento'
    if (texto.includes('atras')) return 'atrasada'
    return 'planejada'
  }

  function mapStatusCompra(valor: unknown): 'nao_comprado' | 'solicitado' | 'parcial' | 'comprado' {
    const texto = String(valor ?? '').toLowerCase()
    if (texto.includes('comprado')) return 'comprado'
    if (texto.includes('parcial')) return 'parcial'
    if (texto.includes('solicit')) return 'solicitado'
    return 'nao_comprado'
  }

  // ─── Upsert/abate genérico de uma linha de material (soma/subtrai quantidade) ──
  async function upsertMaterialSoma(codigo: string, descricao: string, unidade: string, qtdSomar: number, etapaId: string | null, subetapa: string | null, statusCompra: 'nao_comprado' | 'solicitado' | 'parcial' | 'comprado' = 'nao_comprado') {
    if (!codigo || codigo === '—' || qtdSomar <= 0) return
    const temSubetapa = await materiaisTemSubetapa()
    let query = supabase.from('materiais').select('id, quantidade_total')
      .eq('obra_id', resolvedObraId).eq('sinapi_codigo', codigo)
    query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
    if (temSubetapa) query = subetapa ? query.eq('subetapa', subetapa) : query.is('subetapa', null)
    const { data: existente, error: erroSel } = await query.maybeSingle()
    if (erroSel) { console.error('Erro ao consultar material existente:', erroSel); return }
    if (existente) {
      const updatePayload: Record<string, unknown> = { quantidade_total: Number(existente.quantidade_total) + qtdSomar }
      if (statusCompra !== 'nao_comprado') {
        updatePayload.status_compra = statusCompra
        if (statusCompra === 'comprado') updatePayload.quantidade_comprada = Number(existente.quantidade_total) + qtdSomar
      }
      const { error } = await supabase.from('materiais').update(updatePayload).eq('id', existente.id)
      if (error) console.error('Erro ao somar quantidade do material:', error)
    } else {
      const novoMaterial: Record<string, unknown> = {
        obra_id: resolvedObraId, etapa_id: etapaId,
        sinapi_codigo: codigo, descricao: descricao || codigo, unidade: unidade || 'UN',
        quantidade_total: qtdSomar, quantidade_comprada: statusCompra === 'comprado' ? qtdSomar : 0, status_compra: statusCompra,
      }
      if (temSubetapa) novoMaterial.subetapa = subetapa
      const { error } = await supabase.from('materiais').insert(novoMaterial)
      if (error) console.error('Erro ao criar material a partir do orçamento:', error)
    }
  }

  async function abaterMaterialQtd(codigo: string, qtdAbater: number, etapaId: string | null, subetapa: string | null) {
    if (!codigo || codigo === '—' || qtdAbater <= 0) return
    const temSubetapa = await materiaisTemSubetapa()
    let query = supabase.from('materiais').select('id, quantidade_total')
      .eq('obra_id', resolvedObraId).eq('sinapi_codigo', codigo)
    query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
    if (temSubetapa) query = subetapa ? query.eq('subetapa', subetapa) : query.is('subetapa', null)
    const { data: existente, error: erroSel } = await query.maybeSingle()
    if (erroSel) { console.error('Erro ao consultar material existente:', erroSel); return }
    if (!existente) return
    const novaQtd = Number(existente.quantidade_total) - qtdAbater
    if (novaQtd <= 0) { await supabase.from('materiais').delete().eq('id', existente.id) }
    else { await supabase.from('materiais').update({ quantidade_total: novaQtd }).eq('id', existente.id) }
  }

  // Gera materiais a partir de uma composição vinda da base SINAPI. Quando a
  // composição TEM detalhamento analítico importado (tabela sinapi_composicao_itens
  // — vem de uma importação manual e opcional na aba SINAPI), usamos os insumos
  // reais dela. Quando NÃO tem (caso mais comum, pois poucos usuários importam
  // esse detalhamento), caímos no FALLBACK: lançamos a própria composição como
  // uma linha de material (na quantidade do orçamento) — assim o dado sempre
  // "puxa" pra Materiais, mesmo sem o detalhamento analítico.
  async function gerarMateriaisDaComposicaoSinapi(codigo: string, mesReferencia: string | null | undefined, qtdComposicao: number, etapaId: string | null, subetapa: string | null = null, descricaoFallback?: string, unidadeFallback?: string) {
    const itensAnaliticos = await buscarInsumosAnaliticosSinapi(codigo, mesReferencia)
    if (itensAnaliticos.length === 0) {
      await upsertMaterialSoma(codigo, descricaoFallback || codigo, unidadeFallback || 'UN', qtdComposicao, etapaId, subetapa)
      return
    }
    for (const item of itensAnaliticos) {
      if (!item.item_codigo) continue
      const qtdSugerida = qtdComposicao * item.coeficiente
      await upsertMaterialSoma(item.item_codigo, item.item_descricao || item.item_codigo, item.item_unidade || 'UN', qtdSugerida, etapaId, subetapa)
    }
  }

  async function abaterMateriaisDaComposicaoSinapi(codigo: string, mesReferencia: string | null | undefined, qtdComposicao: number, etapaId: string | null, subetapa: string | null = null) {
    const itensAnaliticos = await buscarInsumosAnaliticosSinapi(codigo, mesReferencia)
    if (itensAnaliticos.length === 0) {
      await abaterMaterialQtd(codigo, qtdComposicao, etapaId, subetapa)
      return
    }
    for (const item of itensAnaliticos) {
      if (!item.item_codigo) continue
      await abaterMaterialQtd(item.item_codigo, qtdComposicao * item.coeficiente, etapaId, subetapa)
    }
  }

  async function gerarMateriaisDaComposicao(itensComp2: ComposicaoItemJoin[], qtdComposicao: number, etapaId: string | null, subetapa: string | null = null, codigoFallback?: string, descricaoFallback?: string, unidadeFallback?: string) {
    if (itensComp2.length === 0) {
      // Composição própria sem insumos cadastrados — mesmo fallback do SINAPI:
      // lança a própria composição como material, pra não ficar "sem puxar nada".
      if (codigoFallback) await upsertMaterialSoma(codigoFallback, descricaoFallback || codigoFallback, unidadeFallback || 'UN', qtdComposicao, etapaId, subetapa)
      return
    }
    for (const item of itensComp2) {
      if (!item.insumo?.codigo) continue
      await upsertMaterialSoma(item.insumo.codigo, item.insumo.descricao, item.insumo.unidade, qtdComposicao * item.coeficiente, etapaId, subetapa)
    }
  }

  async function abaterMateriaisDaComposicao(itensComp: ComposicaoItemJoin[], qtdComposicao: number, etapaId: string | null, subetapa: string | null = null, codigoFallback?: string) {
    if (itensComp.length === 0) {
      if (codigoFallback) await abaterMaterialQtd(codigoFallback, qtdComposicao, etapaId, subetapa)
      return
    }
    for (const item of itensComp) {
      if (!item.insumo?.codigo) continue
      await abaterMaterialQtd(item.insumo.codigo, qtdComposicao * item.coeficiente, etapaId, subetapa)
    }
  }

  // ─── Sincronizar materiais com o orçamento (recalcula do zero) ───────────
  // Pergunta do usuário: "como faço pra puxar os insumos do orçamento pra
  // materiais? o sistema já deveria fazer isso sozinho?" — Sim, a partir de
  // agora qualquer item ADICIONADO ao orçamento já gera/abate materiais
  // automaticamente (handleAddItem/handleRemoveItem/handleRemoveEtapa/import).
  // Mas itens que já estavam no orçamento ANTES dessa correção (principalmente
  // os vindos direto da base SINAPI) nunca geraram materiais — esta ação
  // varre TODOS os itens atuais do orçamento, soma a necessidade por
  // (etapa, subetapa, código do insumo) e GRAVA o total na tabela `materiais`
  // (sobrescreve, não soma) — por isso é seguro rodar quantas vezes quiser,
  // sem duplicar quantidades.
  async function sincronizarMateriaisDoOrcamento() {
    if (sincronizandoMateriais) return
    setSincronizandoMateriais(true)
    try {
      type Acc = { qtd: number; descricao: string; unidade: string }
      const mapa = new Map<string, Acc>()
      const acumular = (etapaId: string | null, subetapa: string | null, codigo: string, descricao: string, unidade: string, qtd: number) => {
        if (!codigo || codigo === '—' || qtd <= 0) return
        const key = `${etapaId ?? 'null'}|${subetapa ?? 'null'}|${codigo}`
        const atual = mapa.get(key)
        if (atual) atual.qtd += qtd
        else mapa.set(key, { qtd, descricao, unidade })
      }

      for (const item of itens) {
        if (item.sinapi_composicao_id) {
          const insumos = await buscarInsumosAnaliticosSinapi(item.codigo, item.sinapi_mes_referencia)
          if (insumos.length === 0) {
            // Sem detalhamento analítico importado pra essa composição/mês —
            // lança a própria composição como material (fallback), senão o
            // item simplesmente não "puxaria" nada pra Materiais.
            acumular(item.etapa_id, item.subetapa, item.codigo, item.descricao, item.unidade, item.quantidade)
          } else {
            for (const ins of insumos) {
              if (!ins.item_codigo) continue
              acumular(item.etapa_id, item.subetapa, ins.item_codigo, ins.item_descricao || ins.item_codigo, ins.item_unidade || 'UN', item.quantidade * ins.coeficiente)
            }
          }
        } else if (item.composicao_id) {
          const lista = item.composicao_itens || []
          if (lista.length === 0) {
            acumular(item.etapa_id, item.subetapa, item.codigo, item.descricao, item.unidade, item.quantidade)
          } else {
            for (const ins of lista) {
              const info = infoDoItem(ins, obraUf)
              if (!info.codigo || info.codigo === '—') continue
              acumular(item.etapa_id, item.subetapa, info.codigo, info.descricao, info.unidade, item.quantidade * ins.coeficiente)
            }
          }
        }
        // itens digitados manualmente (sem composição vinculada) não geram materiais —
        // não há "receita" de insumos pra puxar.
      }

      // Detecta se a coluna materiais.subetapa existe — em alguns bancos a
      // migração "fix_2026_06_08_supabase_v1_2_columns.sql" ainda não rodou.
      const temSubetapa = await materiaisTemSubetapa()

      let criados = 0
      let atualizados = 0
      const errosDb: string[] = []
      for (const [key, acc] of mapa) {
        const [etapaIdRaw, subetapaRaw, codigo] = key.split('|')
        const etapaId = etapaIdRaw === 'null' ? null : etapaIdRaw
        const subetapa = subetapaRaw === 'null' ? null : subetapaRaw
        let query = supabase.from('materiais').select('id, quantidade_total')
          .eq('obra_id', resolvedObraId).eq('sinapi_codigo', codigo)
        query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
        if (temSubetapa) query = subetapa ? query.eq('subetapa', subetapa) : query.is('subetapa', null)
        const { data: existente, error: erroSelect } = await query.maybeSingle()
        if (erroSelect) { errosDb.push(erroSelect.message); continue }
        const qtdArredondada = Math.round(acc.qtd * 10000) / 10000
        if (existente) {
          if (Number(existente.quantidade_total) !== qtdArredondada) {
            const { error: erroUpdate } = await supabase.from('materiais').update({ quantidade_total: qtdArredondada }).eq('id', existente.id)
            if (erroUpdate) errosDb.push(erroUpdate.message)
            else atualizados++
          }
        } else {
          const novoMaterial: Record<string, unknown> = {
            obra_id: resolvedObraId, etapa_id: etapaId,
            sinapi_codigo: codigo, descricao: acc.descricao, unidade: acc.unidade,
            quantidade_total: qtdArredondada, quantidade_comprada: 0, status_compra: 'nao_comprado',
          }
          if (temSubetapa) novoMaterial.subetapa = subetapa
          const { error: erroInsert } = await supabase.from('materiais').insert(novoMaterial)
          if (erroInsert) errosDb.push(erroInsert.message)
          else criados++
        }
      }
      if (!temSubetapa) {
        alert(
          `Sincronização concluída (sem agrupamento por subetapa — coluna pendente no banco).\n\n` +
          `${criados} novo(s) · ${atualizados} atualizado(s) · ${errosDb.length} erro(s)${errosDb.length > 0 ? `\nPrimeiro erro: ${errosDb[0]}` : ''}\n\n` +
          `Para habilitar o agrupamento por subetapa, rode a migração pendente "supabase/fix_2026_06_08_supabase_v1_2_columns.sql" no SQL Editor do Supabase (uma vez só).`
        )
      } else if (errosDb.length > 0) {
        console.error('Erros ao sincronizar materiais:', errosDb)
        alert(`Sincronização concluída com ${errosDb.length} erro(s) do banco.\n\nCriados: ${criados} · Atualizados: ${atualizados}\n\nPrimeiro erro: ${errosDb[0]}`)
      } else if (criados === 0 && atualizados === 0) {
        alert('Materiais já estavam em dia com o orçamento — nada para sincronizar.\n\n(Se você esperava ver itens novos, confira se o orçamento tem itens com composição vinculada — itens digitados manualmente não geram materiais, pois não têm uma "receita" de insumos.)')
      } else {
        alert(`Materiais sincronizados com o orçamento.\n\n${criados} novo(s) item(ns) criado(s) em Materiais.\n${atualizados} item(ns) com quantidade atualizada.`)
      }
    } catch (e) {
      console.error('Erro ao sincronizar materiais:', e)
      const msg = e instanceof Error ? e.message : 'Erro desconhecido'
      alert(`Não foi possível sincronizar os materiais com o orçamento.\n\nErro: ${msg}`)
    } finally {
      setSincronizandoMateriais(false)
      setShowMenu(false)
    }
  }

  // ─── Agrupamento ─────────────────────────────────────────────────────────
  const itensPorEtapa: Record<string, ItemEnriquecido[]> = { sem_etapa: [] }
  for (const etapa of etapas) itensPorEtapa[etapa.id] = []
  for (const item of itens) {
    const key = item.etapa_id && itensPorEtapa[item.etapa_id] !== undefined ? item.etapa_id : 'sem_etapa'
    itensPorEtapa[key].push(item)
  }

  const normBusca = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termoBusca = normBusca(busca.trim())
  const listaFiltrada = termoBusca
    ? (fonte === 'proprias' ? composicoesProprias : sinapiComps).filter(c =>
        normBusca(fixMojibake(c.descricao)).includes(termoBusca) || normBusca(c.codigo).includes(termoBusca))
    : []
  const etapasPadrao = readEtapasPadrao()
  const nomesEtapasObra = new Set(etapas.map(e => e.nome.toLowerCase()))
  const etapaOptions = [
    ...etapas.map(e => e.nome),
    ...etapasPadrao.filter(n => !nomesEtapasObra.has(n.toLowerCase())),
  ]
  const isReadonly = orcamento?.status === 'finalizado'
  const etapasVisiveis = filtroEtapaId === 'todas'
    ? etapas
    : etapas.filter(etapa => etapa.id === filtroEtapaId)
  const mostrarSemEtapa = filtroEtapaId === 'todas' || filtroEtapaId === 'sem_etapa'
  const itensFiltradosCount = filtroEtapaId === 'todas'
    ? itens.length
    : filtroEtapaId === 'sem_etapa'
      ? itensPorEtapa.sem_etapa.length
      : (itensPorEtapa[filtroEtapaId] || []).length

  // Itens atuais no layout tabular (Etapa, Subetapa, Código, Quantidade) —
  // para exportação/round-trip com a planilha de importação
  const etapaNomePorId: Record<string, string> = {}
  for (const e of etapas) etapaNomePorId[e.id] = e.nome
  const linhasOrcamentoTabular: LinhaOrcamentoTabular[] = itens.map(item => ({
    etapa: (item.etapa_id && etapaNomePorId[item.etapa_id]) || 'Sem etapa',
    subetapa: item.subetapa,
    codigo: item.codigo,
    descricao: item.descricao,
    unidade: item.unidade,
    quantidade: item.quantidade,
  }))
  // Custo de uma composição para exibir no modal de busca
  // Pós-Supabase: calcula via composicao_itens + sinapi_insumos.precos[obraUf]
  const getItemCost = (item: { custo_calculado?: number; custos?: Record<string, number>; custo_unitario?: number }) =>
    item.custos?.[obraUf] || item.custo_unitario || item.custo_calculado || 0

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
            {!isReadonly && (
              <Button size="sm" icon={<ArrowLeftRight size={14} />} variant="secondary" onClick={() => setShowImportExportTabular(true)}>
                Importar/exportar tabular
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
                  {itens.length > 0 && (
                    <button onClick={sincronizarMateriaisDoOrcamento} disabled={sincronizandoMateriais}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                      style={{ color: 'var(--text-primary)' }}>
                      <Boxes size={13} style={{ color: 'var(--text-secondary)' }} className={sincronizandoMateriais ? 'animate-pulse' : ''} />
                      {sincronizandoMateriais ? 'Importando...' : 'Importar p/ Materiais'}
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

      {/* ── Card 2 — composição de custos (fixo ao rolar) ──
          Para abaixo da barra superior fixa (header h-16 / 64px) com folga de 8px,
          z-20 < z-30 do header garante que nunca "entra" na barra */}
      <div
        className="sticky top-[72px] z-20 rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
      >
        <div className="px-4 py-3 flex flex-col gap-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
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
            {/* Cabeçalho — filtro + ação */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                  {etapasVisiveis.length} {etapasVisiveis.length === 1 ? 'etapa' : 'etapas'} · {itensFiltradosCount} {itensFiltradosCount === 1 ? 'composição' : 'composições'}
                </span>
                <select
                  value={filtroEtapaId}
                  onChange={e => setFiltroEtapaId(e.target.value)}
                  className="input-base min-w-[190px] py-1.5 text-xs"
                  title="Filtrar orçamento por etapa"
                >
                  <option value="todas">Todas as etapas</option>
                  {itensPorEtapa.sem_etapa.length > 0 && <option value="sem_etapa">Sem etapa</option>}
                  {etapas.map(etapa => <option key={etapa.id} value={etapa.id}>{etapa.nome}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {filtroEtapaId !== 'todas' && (
                  <Button size="sm" variant="secondary" onClick={() => setFiltroEtapaId('todas')}>
                    Limpar filtro
                  </Button>
                )}
                {!isReadonly && (
                  <Button size="sm" icon={<FolderPlus size={14} />} onClick={() => openItemModal(filtroEtapaId !== 'todas' && filtroEtapaId !== 'sem_etapa' ? filtroEtapaId : null)}>
                    Adicionar item
                  </Button>
                )}
              </div>
            </div>

            {mostrarSemEtapa && itensPorEtapa.sem_etapa.length > 0 && (
              <GrupoEtapa
                nome="Sem etapa"
                itens={itensPorEtapa.sem_etapa}
                isReadonly={isReadonly}
                collapsed={collapsed['sem_etapa']}
                onToggleGrupo={() => setCollapsed(c => ({ ...c, sem_etapa: !c['sem_etapa'] }))}
                onAddItem={() => openItemModal(null)}
                onRemove={handleRemoveItem}
                onUpdateQuantidade={handleUpdateItemQuantidade}
                bdi={bdi}
                expandedItems={expandedItems}
                onToggleItem={toggleItemExpanded}
                insumoOverrides={insumoOverrides}
                onOverrideInsumo={handleOverrideInsumo}
                getItemTotal={getItemTotal}
                obraUf={obraUf}
                subtotalDireto={subtotal}
                onAddItemToSubetapa={(nomeSub) => openItemModal(null, nomeSub)}
                onAddInsumoToItem={(item) => openItemModal(item.etapa_id, item.subetapa, true)}
                onRenameSubetapa={(nomeSub) => handleRenameSubetapa(null, nomeSub)}
                onDeleteSubetapa={(nomeSub) => handleRemoveSubetapa(null, nomeSub)}
                onEditItem={!isReadonly ? openEditItem : undefined}
              />
            )}
            {etapasVisiveis.map(etapa => {
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
                  onUpdateQuantidade={handleUpdateItemQuantidade}
                  bdi={bdi}
                  expandedItems={expandedItems}
                  onToggleItem={toggleItemExpanded}
                  insumoOverrides={insumoOverrides}
                  onOverrideInsumo={handleOverrideInsumo}
                  getItemTotal={getItemTotal}
                  obraUf={obraUf}
                  icon={icon}
                  iconCor={cor}
                  subtotalDireto={subtotal}
                  onAddItemToSubetapa={(nomeSub) => openItemModal(etapa.id, nomeSub)}
                  onAddInsumoToItem={(item) => openItemModal(item.etapa_id, item.subetapa, true)}
                  onDeleteEtapa={!isReadonly ? () => handleRemoveEtapa(etapa.id, etapa.nome) : undefined}
                  onRenameEtapa={!isReadonly ? () => handleRenameEtapa(etapa.id, etapa.nome) : undefined}
                  onRenameSubetapa={!isReadonly ? (nomeSub) => handleRenameSubetapa(etapa.id, nomeSub) : undefined}
                  onDeleteSubetapa={!isReadonly ? (nomeSub) => handleRemoveSubetapa(etapa.id, nomeSub) : undefined}
                  onEditItem={!isReadonly ? openEditItem : undefined}
                  menuAberto={etapaMenuAberto === etapa.id}
                  onToggleMenu={() => setEtapaMenuAberto(v => v === etapa.id ? null : etapa.id)}
                  menuRef={etapaMenuAberto === etapa.id ? etapaMenuRef : undefined}
                />
              )
            })}

            {itensFiltradosCount === 0 && (
              <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nenhuma composição encontrada neste filtro de etapa.
              </div>
            )}

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
          {(() => {
            const nomesExistentes = new Set(etapas.map(e => e.nome.toLowerCase()))
            const sugestoes = readEtapasPadrao().filter(n => !nomesExistentes.has(n.toLowerCase()))
            if (sugestoes.length === 0) return null
            return (
              <div>
                <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>Sugestões:</p>
                <div className="flex flex-wrap gap-1">
                  {sugestoes.map(s => (
                    <button key={s} type="button" onClick={() => setNovaEtapaNome(s)}
                      className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
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
        onClose={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade(''); setBusca(''); setSubetapaLivre(''); setLivreDescricao(''); setLivrePreco('') }}
        title="Adicionar item"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
              <div className="flex gap-1.5">
                <select value={selectedEtapaNome} onChange={e => setSelectedEtapaNome(e.target.value)} className="input-base flex-1">
                  {etapaOptions.map(etapa => <option key={etapa} value={etapa}>{etapa}</option>)}
                </select>
                <button type="button" onClick={() => { setShowAddItem(false); setShowNovaEtapa(true) }}
                  className="px-2 rounded-lg text-xs font-medium flex-shrink-0"
                  style={{ background: 'var(--accent)', color: 'white' }} title="Criar nova etapa">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <Input
              label="Subetapa / complemento"
              value={subetapaLivre}
              onChange={e => setSubetapaLivre(e.target.value)}
              placeholder="Ex: Baldrames, térreo, bloco A..."
            />
          </div>

          <div className="flex gap-1 p-1 rounded-xl w-fit max-w-full overflow-x-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {([['proprias', 'Composições Próprias'], ['sinapi', 'Referência SINAPI'], ['livre', 'Item livre']] as [FonteBusca, string][]).map(([id, label]) => (
              <button key={id} onClick={() => { setFonte(id); setSelectedItem(null); setBusca('') }}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                style={fonte === id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
                {label}
              </button>
            ))}
          </div>

          {fonte !== 'livre' && <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder={fonte === 'proprias' ? 'Buscar por descrição...' : 'Buscar na tabela SINAPI...'}
              className="input-base input-search" autoFocus
            />
          </div>}

          {fonte === 'livre' ? (
            <div className="p-3 rounded-xl flex flex-col gap-3" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.25)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_130px] gap-3">
                <Input label="Descrição do item/insumo" value={livreDescricao} onChange={e => setLivreDescricao(e.target.value)} placeholder="Ex: Projeto, cimento, frete..." />
                <Input label="Unidade" value={livreUnidade} onChange={e => setLivreUnidade(e.target.value)} placeholder="UN" />
                <Input label="Valor unitário" type="number" value={livrePreco} onChange={e => setLivrePreco(e.target.value)} placeholder="0" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <Input label={`Quantidade (${livreUnidade || 'UN'})`} type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0" min={0} />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" loading={saving} disabled={!quantidade || !livreDescricao.trim()} onClick={() => handleAddItem(false)}>+ mais</Button>
                  <Button size="sm" loading={saving} disabled={!quantidade || !livreDescricao.trim()} onClick={() => handleAddItem(true)}>Inserir</Button>
                </div>
              </div>
            </div>
          ) : selectedItem ? (
            <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.25)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--accent)' }}>{selectedItem.descricao}</p>
                  </div>
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
                      const info = infoDoItem(ins, obraUf)
                      const qtdBase = parseFloat(quantidade) || 0
                      const qtdSugerida = qtdBase * ins.coeficiente
                      return (
                        <div key={ins.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="flex-1 truncate">{info.descricao}</span>
                          <span>{qtdBase > 0 ? `${qtdSugerida.toLocaleString('pt-BR')} ${info.unidade}` : `coef. ${ins.coeficiente}`}</span>
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
                    className="flex items-start gap-3 p-3 rounded-lg text-left transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ border: '1px solid transparent' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.unidade}</span>
                      {getItemCost(c) > 0 && (
                        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{formatCurrency(getItemCost(c))}</span>
                      )}
                    </div>
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

      {/* Reabrir orçamento finalizado — escolher se mantém preços congelados ou atualiza pela base */}
      <Modal open={showReabrirModal} onClose={() => !reabrindo && setShowReabrirModal(false)} title="Reabrir orçamento" size="md">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Isso cria a <strong>versão {orcamento ? orcamento.versao + 1 : ''}</strong> como rascunho editável.
            A versão atual (finalizada) é preservada como histórico. Como você quer tratar os preços dos itens?
          </p>
          <button
            onClick={() => confirmarReabrir(false)}
            disabled={reabrindo}
            className="flex items-start gap-3 p-4 rounded-xl text-left transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ border: '1px solid var(--border)' }}
          >
            <Snowflake size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Manter preços congelados</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Copia os itens com o mesmo preço unitário já praticado (snapshot atual). Use quando só precisa ajustar quantidades/itens sem mexer em valores.
              </p>
            </div>
          </button>
          <button
            onClick={() => confirmarReabrir(true)}
            disabled={reabrindo}
            className="flex items-start gap-3 p-4 rounded-xl text-left transition-colors hover:bg-[var(--bg-secondary)]"
            style={{ border: '1px solid var(--border)' }}
          >
            <RefreshCw size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} className={reabrindo ? 'animate-spin' : ''} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Atualizar pelos preços atuais da base</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Repuxa o valor mais recente da base SINAPI / composições próprias para a UF <strong>{obraUf}</strong> em cada item vinculado. Itens digitados manualmente (sem vínculo com a base) mantêm o preço anterior.
              </p>
            </div>
          </button>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" disabled={reabrindo} onClick={() => setShowReabrirModal(false)}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal editar composição ── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Editar composição" size="md">
        {editItem && (
          <div className="flex flex-col gap-4">
            <Input
              label="Descrição"
              value={editDescricao}
              onChange={e => setEditDescricao(e.target.value)}
              autoFocus
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Unidade"
                value={editUnidade}
                onChange={e => setEditUnidade(e.target.value)}
              />
              <Input
                label="Preço unitário (R$)"
                type="number"
                value={editPreco}
                onChange={e => setEditPreco(e.target.value)}
                min={0}
                step="any"
              />
              <Input
                label="Quantidade"
                value={editQuantidade}
                onChange={e => setEditQuantidade(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
                <select
                  value={editEtapaId}
                  onChange={e => setEditEtapaId(e.target.value)}
                  className="input-base w-full"
                >
                  <option value="">Sem etapa</option>
                  {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <Input
                label="Subetapa"
                value={editSubetapa}
                onChange={e => setEditSubetapa(e.target.value)}
                placeholder="Ex: Baldrames, térreo..."
              />
            </div>
            {editItem.codigo && editItem.codigo !== '—' && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Código: {editItem.codigo}
                {editItem.composicao_id && ' (composição própria)'}
                {editItem.sinapi_composicao_id && ' (SINAPI)'}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setEditItem(null)}>Cancelar</Button>
              <Button loading={saving} onClick={handleEditItemSave}>Salvar</Button>
            </div>
          </div>
        )}
      </Modal>

      <ImportarExportarOrcamentoModal
        open={showImportExportTabular}
        onClose={() => setShowImportExportTabular(false)}
        linhasAtuais={linhasOrcamentoTabular}
        obraName={obraName || 'Obra'}
        versao={orcamento.versao}
        onImportar={handleImportarOrcamento}
      />
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
      {/* Valor em cima, % / hint embaixo — melhor leitura em telas pequenas */}
      <div className="flex flex-col min-w-0">
        {children ?? (
          <span className="text-sm font-semibold leading-tight truncate" style={{ color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>
            {value}
          </span>
        )}
        {hint && <span className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{hint}</span>}
      </div>
    </div>
  )
}

// ─── Grupo de etapa (nível 1 da cascata) ─────────────────────────────────────
function GrupoEtapa({
  nome, itens, isReadonly, collapsed, onToggleGrupo, onAddItem, onRemove, bdi,
  onUpdateQuantidade, expandedItems, onToggleItem, insumoOverrides, onOverrideInsumo, getItemTotal,
  obraUf, icon: Icon, iconCor, subtotalDireto,
  onDeleteEtapa, onRenameEtapa, onAddItemToSubetapa, onAddInsumoToItem, onRenameSubetapa, onDeleteSubetapa, onEditItem, menuAberto, onToggleMenu, menuRef,
}: {
  nome: string
  itens: ItemEnriquecido[]
  isReadonly: boolean
  collapsed?: boolean
  onToggleGrupo: () => void
  onAddItem: () => void
  onRemove: (id: string) => void
  onUpdateQuantidade: (id: string, quantidade: number) => void
  bdi: number
  expandedItems: Record<string, boolean>
  onToggleItem: (id: string) => void
  insumoOverrides: Record<string, number>
  onOverrideInsumo: (itemId: string, insumoId: string, value: number | null) => void
  getItemTotal: (item: ItemEnriquecido) => number
  obraUf: string
  icon?: LucideIcon
  iconCor?: string
  subtotalDireto?: number
  onDeleteEtapa?: () => void
  onRenameEtapa?: () => void
  onAddItemToSubetapa?: (nome: string) => void
  onAddInsumoToItem?: (item: ItemEnriquecido) => void
  onRenameSubetapa?: (nome: string) => void
  onDeleteSubetapa?: (nome: string) => void
  onEditItem?: (item: ItemEnriquecido) => void
  menuAberto?: boolean
  onToggleMenu?: () => void
  menuRef?: React.RefObject<HTMLDivElement | null>
}) {
  const [subetapasFechadas, setSubetapasFechadas] = useState<Record<string, boolean>>({})
  const [subMenuAberto, setSubMenuAberto] = useState<string | null>(null)
  const [itemMenuAberto, setItemMenuAberto] = useState<string | null>(null)
  useEffect(() => {
    if (!subMenuAberto && !itemMenuAberto) return
    function handleClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (t.closest('[data-submenu-container]') || t.closest('[data-itemmenu-container]')) return
      if (subMenuAberto) setSubMenuAberto(null)
      if (itemMenuAberto) setItemMenuAberto(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [subMenuAberto, itemMenuAberto])

  const subtotalGrupo = itens.reduce((a, i) => a + getItemTotal(i), 0)
  const totalGrupo = subtotalGrupo * (1 + bdi / 100)
  const pctDoDireto = subtotalDireto && subtotalDireto > 0 ? (subtotalGrupo / subtotalDireto) * 100 : null
  const gruposSubetapa = itens.reduce<{ nome: string; key: string; itens: ItemEnriquecido[] }[]>((acc, item) => {
    const nomeSub = item.subetapa?.trim() || 'Sem subetapa'
    const key = nomeSub.toLowerCase()
    let grupo = acc.find(g => g.key === key)
    if (!grupo) {
      grupo = { nome: nomeSub, key, itens: [] }
      acc.push(grupo)
    }
    grupo.itens.push(item)
    return acc
  }, [])

  function parseQuantidadeInput(value: string) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

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
                {onRenameEtapa && (
                  <button onClick={onRenameEtapa}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}>
                    <Pencil size={13} /> Renomear etapa
                  </button>
                )}
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
            <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <th className="w-10 px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}></th>
                    <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Descrição</th>
                    <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>Un.</th>
                    <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>Qtd.</th>
                    <th className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Unitário</th>
                    <th className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Total</th>
                    <th className="w-12 px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {gruposSubetapa.map(grupo => {
                    const subFechada = subetapasFechadas[grupo.key] ?? false
                    const subtotalSubetapa = grupo.itens.reduce((acc, item) => acc + getItemTotal(item), 0)

                    return (
                      <Fragment key={grupo.key}>
                        <tr style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))', borderBottom: '1px solid var(--border)' }}>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setSubetapasFechadas(prev => ({ ...prev, [grupo.key]: !subFechada }))}
                              className="p-1 rounded hover:bg-[var(--bg-card)]"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {subFechada ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            </button>
                          </td>
                          <td className="px-3 py-2 font-semibold" colSpan={3} style={{ color: 'var(--text-primary)' }}>
                            <div className="flex items-center gap-2">
                              <span>{grupo.nome}</span>
                              {onAddItemToSubetapa && !isReadonly && (
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); onAddItemToSubetapa(grupo.nome) }}
                                  className="p-1 rounded hover:bg-[var(--bg-card)]"
                                  title="Adicionar composição nesta subetapa"
                                >
                                  <Plus size={13} style={{ color: 'var(--accent)' }} />
                                </button>
                              )}
                              {onRenameSubetapa && !isReadonly && (
                                <button type="button" onClick={e => { e.stopPropagation(); onRenameSubetapa(grupo.nome) }} className="p-1 rounded hover:bg-[var(--bg-card)]" title="Renomear subetapa">
                                  <Pencil size={12} style={{ color: 'var(--text-secondary)' }} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                            Subtotal
                          </td>
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--accent)' }}>
                            {formatCurrency(subtotalSubetapa)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!isReadonly && (onDeleteSubetapa || onRenameSubetapa || onAddItemToSubetapa) && (
                              <div className="relative inline-flex" data-submenu-container onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setSubMenuAberto(v => v === grupo.key ? null : grupo.key)}
                                  className="p-1.5 rounded-lg hover:bg-[var(--bg-card)]"
                                  style={{ color: 'var(--text-secondary)' }}
                                  title="Ações da subetapa"
                                >
                                  <MoreHorizontal size={14} />
                                </button>
                                {subMenuAberto === grupo.key && (
                                  <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                    {onAddItemToSubetapa && (
                                      <button onClick={() => { setSubMenuAberto(null); onAddItemToSubetapa(grupo.nome) }}
                                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                        style={{ color: 'var(--text-primary)' }}>
                                        <Plus size={13} style={{ color: 'var(--accent)' }} /> Adicionar composição
                                      </button>
                                    )}
                                    {onRenameSubetapa && (
                                      <button onClick={() => { setSubMenuAberto(null); onRenameSubetapa(grupo.nome) }}
                                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                        style={{ color: 'var(--text-primary)' }}>
                                        <Pencil size={13} /> Renomear subetapa
                                      </button>
                                    )}
                                    {onDeleteSubetapa && (
                                      <button onClick={() => { setSubMenuAberto(null); onDeleteSubetapa(grupo.nome) }}
                                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                        style={{ color: 'var(--danger)' }}>
                                        <Trash2 size={13} /> Excluir subetapa
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>

                        {!subFechada && grupo.itens.map(item => {
                          const hasInsumos = (item.composicao_itens?.length || 0) > 0
                          const isExpanded = expandedItems[item.id] || false
                          const itemTotal = getItemTotal(item)
                          const hasOverride = (item.composicao_itens || []).some(ins => {
                            const info = infoDoItem(ins, obraUf)
                            return insumoOverrides[overrideKey(item.id, info.codigo !== '\u2014' ? info.codigo : ins.id)] !== undefined
                          })

                          return (
                            <Fragment key={item.id}>
                              <tr className="transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderBottom: '1px solid var(--border)' }}>
                                <td className="px-3 py-2 align-top">
                                  {hasInsumos && (
                                    <button
                                      type="button"
                                      onClick={() => onToggleItem(item.id)}
                                      className="p-1 rounded hover:bg-[var(--bg-card)]"
                                      style={{ color: 'var(--text-secondary)' }}
                                    >
                                      {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top" style={{ color: 'var(--text-primary)' }}>
                                  <span className="line-clamp-2">{item.descricao}</span>
                                </td>
                                <td className="px-3 py-2 align-top text-center" style={{ color: 'var(--text-secondary)' }}>{item.unidade}</td>
                                <td className="px-3 py-2 align-top text-center">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                    className="input-base py-1 text-xs text-center tabular-nums"
                                    style={{ width: 86, color: 'var(--text-primary)' }}
                                    disabled={isReadonly}
                                    onFocus={e => e.currentTarget.select()}
                                    onBlur={e => {
                                      const next = parseQuantidadeInput(e.currentTarget.value)
                                      if (next === null) {
                                        e.currentTarget.value = item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                        return
                                      }
                                      e.currentTarget.value = next.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                      onUpdateQuantidade(item.id, next)
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') e.currentTarget.blur()
                                      if (e.key === 'Escape') {
                                        e.currentTarget.value = item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                        e.currentTarget.blur()
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2 align-top text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(item.preco_unitario_snapshot)}</td>
                                <td className="px-3 py-2 align-top text-right font-semibold tabular-nums" style={{ color: hasOverride ? 'var(--warning)' : 'var(--text-primary)' }}>
                                  {formatCurrency(itemTotal)}
                                </td>
                                <td className="px-3 py-2 align-top text-right">
                                  {!isReadonly && (
                                    <div className="relative inline-flex items-center gap-1" data-itemmenu-container onClick={e => e.stopPropagation()}>
                                      {onAddInsumoToItem && (
                                        <button
                                          type="button"
                                          onClick={() => onAddInsumoToItem(item)}
                                          className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                                          aria-label="Adicionar insumo nesta composição"
                                          title="Adicionar insumo nesta composição"
                                        >
                                          <Plus size={13} style={{ color: 'var(--accent)' }} />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setItemMenuAberto(v => v === item.id ? null : item.id)}
                                        className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                                        aria-label="Ações da composição"
                                        title="Ações da composição"
                                      >
                                        <MoreHorizontal size={14} style={{ color: 'var(--text-secondary)' }} />
                                      </button>
                                      {itemMenuAberto === item.id && (
                                        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                          {onEditItem && (
                                            <button onClick={() => { setItemMenuAberto(null); onEditItem(item) }}
                                              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                              style={{ color: 'var(--text-primary)' }}>
                                              <Pencil size={13} /> Editar composição
                                            </button>
                                          )}
                                          {onAddInsumoToItem && (
                                            <button onClick={() => { setItemMenuAberto(null); onAddInsumoToItem(item) }}
                                              className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                              style={{ color: 'var(--text-primary)' }}>
                                              <Plus size={13} style={{ color: 'var(--accent)' }} /> Adicionar insumo
                                            </button>
                                          )}
                                          <button onClick={() => { setItemMenuAberto(null); onRemove(item.id) }}
                                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                            style={{ color: 'var(--danger)' }}>
                                            <Trash2 size={13} /> Excluir composição
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>

                              {isExpanded && hasInsumos && (
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                  <td />
                                  <td colSpan={6} className="px-3 py-3">
                                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                            <th className="px-3 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Insumo</th>
                                            <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>Un.</th>
                                            <th className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Preço</th>
                                            <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>Qtd. calc.</th>
                                            <th className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>Qtd. adotada</th>
                                            <th className="px-3 py-2 text-right font-semibold" style={{ color: 'var(--text-secondary)' }}>Total</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {item.composicao_itens!.map(ins => {
                                            const info = infoDoItem(ins, obraUf)
                                            const insumoKey = info.codigo !== '\u2014' ? info.codigo : ins.id
                                            const key = overrideKey(item.id, insumoKey)
                                            const qtdCalculada = item.quantidade * ins.coeficiente
                                            const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
                                            const preco = info.preco
                                            const totalIns = qtdAdotada * preco
                                            const isOverridden = insumoOverrides[key] !== undefined

                                            return (
                                              <tr key={ins.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td className="px-3 py-2">
                                                  <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{info.descricao}</p>
                                                </td>
                                                <td className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{info.unidade}</td>
                                                <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{preco > 0 ? formatCurrency(preco) : '-'}</td>
                                                <td className="px-3 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)' }}>{qtdCalculada.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                                                <td className="px-3 py-2 text-center">
                                                  <div className="inline-flex items-center gap-1.5">
                                                    <input
                                                      type="number"
                                                      value={isOverridden ? insumoOverrides[key] : qtdCalculada}
                                                      onChange={e => {
                                                        const v = parseFloat(e.target.value)
                                                        onOverrideInsumo(item.id, insumoKey, isNaN(v) ? null : v)
                                                      }}
                                                      disabled={isReadonly}
                                                      className="input-base py-1 text-xs text-center tabular-nums"
                                                      style={{
                                                        width: 88,
                                                        border: isOverridden ? '1px solid var(--warning)' : '1px solid var(--border)',
                                                        color: isOverridden ? 'var(--warning)' : 'var(--text-primary)',
                                                      }}
                                                      min={0}
                                                      step="any"
                                                    />
                                                    {isOverridden && !isReadonly && (
                                                      <button
                                                        onClick={() => onOverrideInsumo(item.id, insumoKey, null)}
                                                        title="Restaurar calculado"
                                                        className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]"
                                                      >
                                                        <RotateCcw size={11} style={{ color: 'var(--text-secondary)' }} />
                                                      </button>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold" style={{ color: isOverridden ? 'var(--warning)' : 'var(--text-primary)' }}>{totalIns > 0 ? formatCurrency(totalIns) : '-'}</td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:hidden">
              {gruposSubetapa.map(grupo => {
                const subFechada = subetapasFechadas[grupo.key] ?? false
                const subtotalSubetapa = grupo.itens.reduce((acc, item) => acc + getItemTotal(item), 0)

                return (
                  <section key={grupo.key} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3.5 py-3 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                      onClick={() => setSubetapasFechadas(prev => ({ ...prev, [grupo.key]: !subFechada }))}
                    >
                      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                        {subFechada ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{grupo.nome}</p>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {grupo.itens.length} {grupo.itens.length === 1 ? 'composicao' : 'composicoes'}
                        </p>
                      </div>
                      {onRenameSubetapa && !isReadonly && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); onRenameSubetapa(grupo.nome) }}
                          className="hidden"
                          title="Renomear subetapa"
                        >
                          <Pencil size={12} style={{ color: 'var(--text-secondary)' }} />
                        </span>
                      )}
                      {onAddItemToSubetapa && !isReadonly && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); onAddItemToSubetapa(grupo.nome) }}
                          className="hidden"
                          title="Adicionar composição"
                        >
                          <Plus size={13} style={{ color: 'var(--accent)' }} />
                        </span>
                      )}
                      <span className="min-w-[92px] flex-shrink-0 rounded-lg px-2.5 py-1.5 text-right" style={{ background: 'rgba(59, 123, 248, 0.10)' }}>
                        <span className="block text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                        <span className="block text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatCurrency(subtotalSubetapa)}</span>
                      </span>
                      {!isReadonly && (onDeleteSubetapa || onAddItemToSubetapa || onRenameSubetapa) && (
                        <span className="relative flex-shrink-0" data-submenu-container onClick={e => e.stopPropagation()}>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => setSubMenuAberto(v => v === grupo.key ? null : grupo.key)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--bg-card)]"
                            title="Ações da subetapa"
                          >
                            <MoreHorizontal size={14} style={{ color: 'var(--text-secondary)' }} />
                          </span>
                          {subMenuAberto === grupo.key && (
                            <span className="absolute right-0 top-full mt-1.5 w-52 rounded-xl py-1.5 shadow-lg z-50 animate-enter text-left"
                              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                              {onAddItemToSubetapa && (
                                <span role="button" tabIndex={0} onClick={() => { setSubMenuAberto(null); onAddItemToSubetapa(grupo.nome) }}
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                  style={{ color: 'var(--text-primary)' }}>
                                  <Plus size={13} style={{ color: 'var(--accent)' }} /> Adicionar composição
                                </span>
                              )}
                              {onRenameSubetapa && (
                                <span role="button" tabIndex={0} onClick={() => { setSubMenuAberto(null); onRenameSubetapa(grupo.nome) }}
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                  style={{ color: 'var(--text-primary)' }}>
                                  <Pencil size={13} /> Renomear subetapa
                                </span>
                              )}
                              {onDeleteSubetapa && (
                                <span role="button" tabIndex={0} onClick={() => { setSubMenuAberto(null); onDeleteSubetapa(grupo.nome) }}
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                  style={{ color: 'var(--danger)' }}>
                                  <Trash2 size={13} /> Excluir subetapa
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      )}
                    </button>

                    {!subFechada && (
                      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {grupo.itens.map(item => {
                          const hasInsumos = (item.composicao_itens?.length || 0) > 0
                          const isExpanded = expandedItems[item.id] || false
                          const itemTotal = getItemTotal(item)
                          const hasOverride = (item.composicao_itens || []).some(ins => {
                            const info = infoDoItem(ins, obraUf)
                            return insumoOverrides[overrideKey(item.id, info.codigo !== '\u2014' ? info.codigo : ins.id)] !== undefined
                          })

                          return (
                            <div key={item.id} className="px-3 py-3">
                              <div
                                role={hasInsumos ? 'button' : undefined}
                                tabIndex={hasInsumos ? 0 : undefined}
                                className="rounded-xl border p-3 transition-colors hover:bg-[var(--bg-secondary)]"
                                style={{ cursor: hasInsumos ? 'pointer' : 'default', borderColor: 'var(--border)', background: 'rgba(255,255,255,0.015)' }}
                                onClick={() => hasInsumos && onToggleItem(item.id)}
                                onKeyDown={e => {
                                  if (!hasInsumos) return
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onToggleItem(item.id)
                                  }
                                }}
                              >
                                <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                                  {hasInsumos ? (isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : null}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-col gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{item.descricao}</p>
                                      <div className="mt-3 rounded-lg border px-2.5 py-2 text-xs" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-secondary)' }} onClick={e => e.stopPropagation()}>
                                        <span className="block text-[10px] font-medium uppercase tracking-wide">Qtd.</span>
                                        <div className="mt-1 flex items-center gap-2">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          defaultValue={item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                          className="input-base h-9 min-w-0 flex-1 py-1 text-center text-sm tabular-nums"
                                          style={{ color: 'var(--text-primary)' }}
                                          disabled={isReadonly}
                                          onFocus={e => e.currentTarget.select()}
                                          onBlur={e => {
                                            const next = parseQuantidadeInput(e.currentTarget.value)
                                            if (next === null) {
                                              e.currentTarget.value = item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                              return
                                            }
                                            e.currentTarget.value = next.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                            onUpdateQuantidade(item.id, next)
                                          }}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') e.currentTarget.blur()
                                            if (e.key === 'Escape') {
                                              e.currentTarget.value = item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                              e.currentTarget.blur()
                                            }
                                          }}
                                        />
                                        <span className="max-w-[56px] truncate">{item.unidade}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                                      <span className="min-w-0 rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                                        <span className="block text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Unitario</span>
                                        <span className="mt-0.5 block truncate text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.preco_unitario_snapshot)}</span>
                                      </span>
                                      <span className="min-w-[106px] rounded-lg px-2.5 py-2 text-right" style={{ background: hasOverride ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.035)' }}>
                                        <span className="block text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Total</span>
                                        <span className="mt-0.5 block text-sm font-bold tabular-nums" style={{ color: hasOverride ? 'var(--warning)' : 'var(--text-primary)' }}>
                                          {formatCurrency(itemTotal)}
                                        </span>
                                      </span>
                                      {!isReadonly && (
                                        <span className="relative inline-flex items-center gap-1" data-itemmenu-container onClick={e => e.stopPropagation()}>
                                          {onAddInsumoToItem && (
                                            <button
                                              type="button"
                                              onClick={() => onAddInsumoToItem(item)}
                                              className="hidden"
                                              aria-label="Adicionar insumo"
                                              title="Adicionar insumo"
                                            >
                                              <Plus size={13} style={{ color: 'var(--accent)' }} />
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => setItemMenuAberto(v => v === item.id ? null : item.id)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                                            style={{ border: '1px solid var(--border)' }}
                                            aria-label="Ações da composição"
                                            title="Ações da composição"
                                          >
                                            <MoreHorizontal size={14} style={{ color: 'var(--text-secondary)' }} />
                                          </button>
                                          {itemMenuAberto === item.id && (
                                            <span className="absolute right-0 top-full mt-1.5 w-52 rounded-xl py-1.5 shadow-lg z-50 animate-enter text-left"
                                              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                              {onEditItem && (
                                                <span role="button" tabIndex={0} onClick={() => { setItemMenuAberto(null); onEditItem(item) }}
                                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                                  style={{ color: 'var(--text-primary)' }}>
                                                  <Pencil size={13} /> Editar composição
                                                </span>
                                              )}
                                              {onAddInsumoToItem && (
                                                <span role="button" tabIndex={0} onClick={() => { setItemMenuAberto(null); onAddInsumoToItem(item) }}
                                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                                  style={{ color: 'var(--text-primary)' }}>
                                                  <Plus size={13} style={{ color: 'var(--accent)' }} /> Adicionar insumo
                                                </span>
                                              )}
                                              <span role="button" tabIndex={0} onClick={() => { setItemMenuAberto(null); onRemove(item.id) }}
                                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                                style={{ color: 'var(--danger)' }}>
                                                <Trash2 size={13} /> Excluir composição
                                              </span>
                                            </span>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              </div>

                              {isExpanded && hasInsumos && (
                                <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                                  <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                    Insumos
                                  </div>
                                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                    {item.composicao_itens!.map(ins => {
                                      const info = infoDoItem(ins, obraUf)
                                      const insumoKey = info.codigo !== '\u2014' ? info.codigo : ins.id
                                      const key = overrideKey(item.id, insumoKey)
                                      const qtdCalculada = item.quantidade * ins.coeficiente
                                      const qtdAdotada = insumoOverrides[key] ?? qtdCalculada
                                      const preco = info.preco
                                      const totalIns = qtdAdotada * preco
                                      const isOverridden = insumoOverrides[key] !== undefined

                                      return (
                                        <div key={ins.id} className="px-3 py-2.5">
                                          <div className="min-w-0">
                                            <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{info.descricao}</p>
                                            <p className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                                              {info.unidade}
                                            </p>
                                          </div>

                                          <div className="mt-2 grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-1 text-xs" onClick={e => e.stopPropagation()}>
                                            <span style={{ color: 'var(--text-secondary)' }}>{preco > 0 ? formatCurrency(preco) : '-'}</span>
                                            <span className="font-semibold" style={{ color: isOverridden ? 'var(--warning)' : 'var(--text-secondary)' }}>
                                              {totalIns > 0 ? formatCurrency(totalIns) : '-'}
                                            </span>
                                            <span />
                                            <span className="tabular-nums" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                                              calc. {qtdCalculada.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                            </span>
                                            <span style={{ color: 'var(--border)', fontSize: 10 }}>-&gt;</span>
                                            <div className="flex items-center gap-1.5">
                                              <input
                                                type="number"
                                                value={isOverridden ? insumoOverrides[key] : qtdCalculada}
                                                onChange={e => {
                                                  const v = parseFloat(e.target.value)
                                                  onOverrideInsumo(item.id, insumoKey, isNaN(v) ? null : v)
                                                }}
                                                disabled={isReadonly}
                                                className="input-base py-1 text-xs text-center tabular-nums"
                                                style={{
                                                  width: 78,
                                                  border: isOverridden ? '1px solid var(--warning)' : '1px solid var(--border)',
                                                  color: isOverridden ? 'var(--warning)' : 'var(--text-primary)',
                                                }}
                                                min={0}
                                                step="any"
                                              />
                                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{info.unidade}</span>
                                              {isOverridden && !isReadonly && (
                                                <button
                                                  onClick={e => { e.stopPropagation(); onOverrideInsumo(item.id, insumoKey, null) }}
                                                  title="Restaurar calculado"
                                                  className="p-1 rounded transition-colors hover:bg-[var(--bg-card)]"
                                                >
                                                  <RotateCcw size={11} style={{ color: 'var(--text-secondary)' }} />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
