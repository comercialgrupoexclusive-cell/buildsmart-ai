'use client'

import { Fragment, useEffect, useState, useRef, useCallback } from 'react'
import {
  Plus, Lock, Unlock, Search, Trash2, MoreHorizontal, RefreshCw, Snowflake,
  ChevronDown, ChevronRight, FolderPlus, RotateCcw, FileSpreadsheet,
  Boxes, Users, FileText, Percent, Wallet, ArrowLeftRight,
  HardHat, Mountain, Layers, Building2, Grid3x3, Home, ShieldCheck,
  Droplets, Zap, Wrench, DoorOpen, Square, PaintBucket, Bath, Package,
  Pencil, GripVertical, Move, MoreVertical, type LucideIcon,
  Sparkles, LayoutTemplate, Save, Wand2,
} from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Orcamento, ComposicaoPropria, SinapiComposicao, Etapa, InsumoProprio, SinapiInsumo } from '@/lib/types'
import { formatCurrency, fixMojibake } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { exportOrcamentoXLSX, ItemExportRow } from '@/lib/export-orcamento'
import { InsumoOrcamentoAntigo, LinhaOrcamentoTabular } from '@/lib/import-export-orcamento'
import { LinhaImportada } from '@/lib/import-export-templates'
import { ImportarExportarOrcamentoModal, ResultadoImportacaoOrcamento } from './ImportarExportarOrcamentoModal'
import { SalvarTemplateOrcamentoModal, UsarTemplateOrcamentoModal } from './TemplateOrcamentoModal'
import { ObraAssistenteDock } from './ObraAssistenteDock'
import { OrcamentoEstruturaIAModal } from './OrcamentoEstruturaIAModal'
import { fetchEtapasPadrao, ETAPAS_PADRAO_CHANGED_EVENT } from '@/lib/settings/etapas-padrao'
import { finalizarOrcamento } from '@/lib/project-cycle'
import { sincronizarMateriaisDoOrcamento as sincronizarMateriaisLib } from '@/lib/materiais-sync'

type FonteBusca = 'proprias' | 'insumos' | 'sinapi' | 'livre'

type HierarquiaDialog = {
  tipo: 'renomear-etapa' | 'renomear-subetapa' | 'editar-valor' | 'excluir-etapa' | 'excluir-subetapa'
  etapaId: string | null
  nomeAtual: string
  valor: string
  quantidadeItens?: number
}

function normalizarNomeEtapa(nome: string) {
  return nome.trim().toLocaleLowerCase('pt-BR')
}

// ─── Drag & drop (reordenar etapas / subetapas / itens) ──────────────────────
// Handle visual (⋮⋮) — só ele dispara o arraste, o resto da linha continua
// clicável normalmente (expandir, editar, etc.)
function DragHandle({ attributes, listeners, size = 14 }: { attributes: any; listeners: any; size?: number }) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={e => e.stopPropagation()}
      className="flex-shrink-0 flex items-center justify-center rounded touch-none cursor-grab active:cursor-grabbing hover:bg-[var(--bg-card)]"
      style={{ color: 'var(--text-secondary)', width: 20, height: 20 }}
      title="Arrastar para reordenar"
    >
      <GripVertical size={size} />
    </button>
  )
}

// Lista genérica com arraste — envolve os itens em DndContext + SortableContext
// e injeta (handle, isDragging, style, ref) em cada filho via render prop.
// `disabled` mantém a lista estática (sem handle) quando não há permissão de editar.
function SortableList<T extends { id: string }>({
  items, onReorder, disabled, children,
}: {
  items: T[]
  onReorder: (novaOrdem: T[]) => void
  disabled?: boolean
  children: (item: T, index: number, drag: { handle: React.ReactNode; setNodeRef: (el: HTMLElement | null) => void; style: React.CSSProperties; isDragging: boolean }) => React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  )

  if (disabled) {
    return <>{items.map((item, i) => children(item, i, { handle: null, setNodeRef: () => {}, style: {}, isDragging: false }))}</>
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(it => it.id === active.id)
    const newIndex = items.findIndex(it => it.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ container: typeof document !== 'undefined' ? document.body : undefined }}
    >
      <SortableContext items={items.map(it => it.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => <SortableSlot key={item.id} id={item.id}>{drag => children(item, i, drag)}</SortableSlot>)}
      </SortableContext>
    </DndContext>
  )
}

function SortableSlot({ id, children }: { id: string; children: (drag: { handle: React.ReactNode; setNodeRef: (el: HTMLElement | null) => void; style: React.CSSProperties; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 30 : undefined,
  }
  return <>{children({ handle: <DragHandle attributes={attributes} listeners={listeners} />, setNodeRef, style, isDragging })}</>
}


// schema real (tabela composicao_insumos): FKs normalizadas para sinapi_insumos
// ou insumos_proprios — descrição/unidade/preço vêm sempre do embed (sem snapshot)
type ComposicaoItemJoin = {
  id: string
  composicao_id: string
  insumo_id: string | null
  insumo_proprio_id: string | null
  coeficiente: number
  insumo?: { codigo: string; classificacao: string; descricao: string; unidade: string; precos: Record<string, number> } | null
  insumo_proprio?: { codigo: string; descricao: string; unidade: string; categoria: string; classificacao?: ClassificacaoInsumo | null; grupo?: string | null; preco_unitario: number } | null
  codigo_snapshot?: string | null
  descricao_snapshot?: string | null
  unidade_snapshot?: string | null
  classificacao_snapshot?: ClassificacaoInsumo | null
  grupo_snapshot?: string | null
  quantidade_calculada?: number
  quantidade_adotada?: number | null
  coeficiente_snapshot?: number | null
  preco_unitario_snapshot?: number
  valor_total_informado_snapshot?: number | null
  valor_total_divergente?: boolean
  ordem?: number
}

type ClassificacaoInsumo = 'EQUIPAMENTO' | 'MAO_DE_OBRA' | 'MATERIAL_SERVICOS'

const CLASSIFICACOES_INSUMO: { value: ClassificacaoInsumo; label: string }[] = [
  { value: 'EQUIPAMENTO', label: 'Equipamento' },
  { value: 'MAO_DE_OBRA', label: 'Mão de Obra' },
  { value: 'MATERIAL_SERVICOS', label: 'Material e Serviços' },
]

// Deriva os dados de exibição/custo de um item de composição, qualquer que seja
// sua origem (insumo SINAPI ou insumo próprio da empresa)
function infoDoItem(ins: ComposicaoItemJoin, uf: string): { codigo: string; descricao: string; unidade: string; classificacao: string; preco: number } {
  if (ins.insumo_proprio) {
    return {
      codigo: ins.insumo_proprio.codigo,
      descricao: fixMojibake(ins.insumo_proprio.descricao),
      unidade: fixMojibake(ins.insumo_proprio.unidade),
      classificacao: ins.insumo_proprio.classificacao || ins.insumo_proprio.categoria,
      preco: ins.insumo_proprio.preco_unitario ?? 0,
    }
  }
  if (ins.insumo) {
    return {
      codigo: ins.insumo.codigo,
      descricao: fixMojibake(ins.insumo.descricao),
      unidade: fixMojibake(ins.insumo.unidade),
      classificacao: ins.insumo.classificacao,
      preco: ins.insumo.precos?.[uf] ?? 0,
    }
  }
  if (ins.descricao_snapshot) {
    return {
      codigo: ins.codigo_snapshot || '',
      descricao: fixMojibake(ins.descricao_snapshot),
      unidade: ins.unidade_snapshot || 'UN',
      classificacao: ins.classificacao_snapshot || 'MATERIAL_SERVICOS',
      preco: Number(ins.preco_unitario_snapshot || 0),
    }
  }
  return { codigo: '—', descricao: '(insumo removido)', unidade: '—', classificacao: '', preco: 0 }
}

type ComposicaoComCusto = ComposicaoPropria & {
  composicao_itens?: ComposicaoItemJoin[]
  custo_calculado: number
}

type InsumoCatalogo = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  preco_unitario: number
  classificacao: ClassificacaoInsumo
  grupo: string
  origem: 'proprio' | 'sinapi'
}

// linha bruta de orcamento_itens com os joins de composição embutidos
type OrcamentoItemRow = Omit<ItemEnriquecido, 'codigo' | 'descricao' | 'unidade' | 'composicao_itens'> & {
  composicoes_proprias?: (ComposicaoPropria & { composicao_insumos?: ComposicaoItemJoin[] }) | null
  sinapi_composicoes?: SinapiComposicao | null
  orcamento_item_insumos?: ComposicaoItemJoin[] | null
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
  tipo_linha?: 'item' | 'subetapa' | null
  subetapa_valor_manual?: number | null
  subetapa_valor_manual_ativo?: boolean | null
  classificacao_snapshot?: ClassificacaoInsumo | null
  grupo_snapshot?: string | null
  subetapa_categoria_snapshot?: string | null
  tipo_item_snapshot?: 'COMPOSICAO' | 'INSUMO' | 'ITEM_LIVRE' | null
  valor_total_informado_snapshot?: number | null
  valor_total_manual_ativo?: boolean | null
  importacao_alertas?: string[] | null
  // mês de referência da composição SINAPI (quando o item vem da base SINAPI) —
  // necessário para casar com `sinapi_composicao_itens` ao gerar/abater materiais
  sinapi_mes_referencia?: string | null
  // ordem de exibição dentro do grupo (etapa+subetapa, ou etapa p/ linhas de subetapa) — arrastar para reordenar
  ordem?: number | null
}

type SubetapaMeta = {
  id: string
  etapa_id: string | null
  nome: string
  descricao: string | null
  valor_manual: number | null
  ativo: boolean
  categoria: string | null
  ordem: number | null
}

type AddItemDraft = {
  id: string
  etapaNome: string
  subetapa: string | null
  fonte: FonteBusca
  item: ComposicaoComCusto | SinapiComposicao | InsumoCatalogo | null
  descricao: string
  unidade: string
  preco: number
  quantidade: number
  codigo: string
  classificacao: ClassificacaoInsumo | null
  grupo: string
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

export function ObraOrcamento({ obraId, projetoId, orcamentoId, areaM2, obraName, obraUf = 'SP' }: {
  obraId?: string
  projetoId?: string
  orcamentoId?: string
  areaM2?: number | null
  obraName?: string
  obraUf?: string
}) {
  const supabase = createClient()
  const { currentProfile } = useProfile()
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [itens, setItens] = useState<ItemEnriquecido[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [bdi, setBdi] = useState(25)
  const [gerenciamento, setGerenciamento] = useState(0)
  const [filtroEtapaId, setFiltroEtapaId] = useState('todas')
  // Mobile: os handles de arrastar ficam ocultos por padrão (menos poluição visual,
  // mais espaço pro nome) e só aparecem quando o usuário ativa o modo "Mover".
  // No desktop o arraste continua sempre disponível (não há aperto de espaço lá).
  const [reorderMode, setReorderMode] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobileViewport(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const mobileDragLocked = isMobileViewport && !reorderMode

  const [etapasPadrao, setEtapasPadrao] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    function carregar() {
      fetchEtapasPadrao(supabase).then(rows => { if (!cancelled) setEtapasPadrao(rows.map(r => r.nome)) })
    }
    carregar()
    window.addEventListener(ETAPAS_PADRAO_CHANGED_EVENT, carregar)
    return () => { cancelled = true; window.removeEventListener(ETAPAS_PADRAO_CHANGED_EVENT, carregar) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cascata + overrides
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})
  const [insumoOverrides, setInsumoOverrides] = useState<Record<string, number>>({})


  // Modal adicionar item
  const [showAddItem, setShowAddItem] = useState(false)
  const [showImportExportTabular, setShowImportExportTabular] = useState(false)
  const [showUsarTemplate, setShowUsarTemplate] = useState(false)
  const [showSalvarTemplate, setShowSalvarTemplate] = useState(false)
  const [showAssistente, setShowAssistente] = useState(false)
  const [showEstruturaIA, setShowEstruturaIA] = useState(false)
  const [selectedEtapaNome, setSelectedEtapaNome] = useState('')
  const [subetapaLivre, setSubetapaLivre] = useState('')
  const [subetapaDescricao, setSubetapaDescricao] = useState('')
  const [subetapaValor, setSubetapaValor] = useState('')
  const [subetapaCategoria, setSubetapaCategoria] = useState('')
  const [fonte, setFonte] = useState<FonteBusca>('proprias')
  const [composicoesProprias, setComposicoesProprias] = useState<ComposicaoComCusto[]>([])
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogo[]>([])
  const [sinapiComps, setSinapiComps] = useState<SinapiComposicao[]>([])
  const [busca, setBusca] = useState('')
  const [selectedItem, setSelectedItem] = useState<(ComposicaoComCusto | SinapiComposicao | InsumoCatalogo) | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [livreDescricao, setLivreDescricao] = useState('')
  const [livreUnidade, setLivreUnidade] = useState('UN')
  const [livrePreco, setLivrePreco] = useState('')
  const [livreClassificacao, setLivreClassificacao] = useState<ClassificacaoInsumo>('MATERIAL_SERVICOS')
  const [livreGrupo, setLivreGrupo] = useState('')
  const [itensPendentes, setItensPendentes] = useState<AddItemDraft[]>([])
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

  // Editor da hierarquia do orcamento. Evita prompt/confirm, que nao sao
  // suportados em todos os navegadores usados pelo aplicativo.
  const [hierarquiaDialog, setHierarquiaDialog] = useState<HierarquiaDialog | null>(null)
  const [salvandoHierarquia, setSalvandoHierarquia] = useState(false)
  const [erroHierarquia, setErroHierarquia] = useState('')

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
  const [showFinalizarModal, setShowFinalizarModal] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [erroFinalizacao, setErroFinalizacao] = useState('')

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

  // Recarrega quando a Luiza (assistente IA) altera o orçamento por baixo dos panos
  useEffect(() => {
    function onDataChanged() { loadAll() }
    window.addEventListener('buildsmart:obra-data-changed', onDataChanged)
    return () => window.removeEventListener('buildsmart:obra-data-changed', onDataChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadOrcamento(), loadEtapas(), loadComposicoesProprias(), loadInsumosCatalogo(), loadSinapiComps()])
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
          .insert({ obra_id: resolvedObraId, tipo: 'executivo', bdi_percentual: 25, status: 'em_projeto', versao: 1 })
          .select()
          .single()
        orc = novo
      }
    }

    if (orc) {
      setOrcamento(orc)
      setBdi(orc.bdi_percentual)
      setGerenciamento(Number(orc.gerenciamento_percentual || 0))
      await loadItens(orc.id)
    }
  }

  // embed padrão dos itens de composição própria — traz direto do banco a descrição,
  // unidade, classificação e preços (por UF) do insumo SINAPI ou do insumo próprio
  const COMPOSICAO_INSUMOS_EMBED = `composicao_insumos(
    id, composicao_id, insumo_id, insumo_proprio_id, coeficiente,
    insumo:sinapi_insumos(codigo,classificacao,descricao,unidade,precos),
    insumo_proprio:insumos_proprios(codigo,descricao,unidade,categoria,classificacao,grupo,preco_unitario)
  )`

  async function loadItens(orcamentoId: string) {
    const { data } = await supabase
      .from('orcamento_itens')
      .select(`*, orcamento_item_insumos(*), composicoes_proprias(id,codigo,descricao,unidade,grupo,${COMPOSICAO_INSUMOS_EMBED}), sinapi_composicoes(id,codigo,descricao,unidade,grupo,custos,custo_unitario,mes_referencia)`)
      .eq('orcamento_id', orcamentoId)
      .order('updated_at')

    const enriched: ItemEnriquecido[] = (data || []).map((item: OrcamentoItemRow) => {
      const cp = item.composicoes_proprias
      const sc = item.sinapi_composicoes
      const insumosImportados = (item.orcamento_item_insumos || [])
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
        .map(insumo => ({
          ...insumo,
          coeficiente: Number(insumo.coeficiente_snapshot || (item.quantidade ? Number(insumo.quantidade_calculada || 0) / Number(item.quantidade) : 0)),
        }))
      return {
        ...item,
        codigo: item.codigo_snapshot || cp?.codigo || sc?.codigo || '—',
        descricao: fixMojibake(item.descricao_snapshot || cp?.descricao || sc?.descricao || '—'),
        unidade: fixMojibake(item.unidade_snapshot || cp?.unidade || sc?.unidade || '—'),
        composicao_itens: insumosImportados.length ? insumosImportados : cp?.composicao_insumos || [],
        sinapi_mes_referencia: sc?.mes_referencia || null,
      }
    })
    setItens(enriched)
  }

  const resolvedObraId = obraId || orcamento?.obra_id || null
  // Em fase de projeto, um mesmo projeto pode ter vários orçamentos
  // (A, B, C...) — cada um precisa da sua própria hierarquia de etapas,
  // sem compartilhar linhas mutáveis com os outros. Por isso, além do
  // projeto_id, também filtramos/gravamos por orcamento_id enquanto não
  // existe obra. Depois que a obra existe, só há um orçamento operacional
  // por obra, então o filtro volta a ser só obra_id.
  const etapaContexto = resolvedObraId
    ? { coluna: 'obra_id' as const, id: resolvedObraId, fk: { obra_id: resolvedObraId, orcamento_id: orcamentoId || null }, orcamentoFiltro: null as string | null }
    : projetoId
      ? { coluna: 'projeto_id' as const, id: projetoId, fk: { projeto_id: projetoId, orcamento_id: orcamentoId || null }, orcamentoFiltro: orcamentoId || null }
      : null

  async function loadEtapas() {
    if (!etapaContexto) { setEtapas([]); return }
    let query = supabase.from('etapas').select('*').eq(etapaContexto.coluna, etapaContexto.id)
    if (etapaContexto.orcamentoFiltro) query = query.eq('orcamento_id', etapaContexto.orcamentoFiltro)
    const { data } = await query.order('ordem')
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

  async function loadInsumosCatalogo(searchTerm = '') {
    const termo = searchTerm.trim()
    let propriosQuery = supabase
      .from('insumos_proprios')
      .select('id,codigo,descricao,unidade,preco_unitario,ativo,categoria,classificacao,grupo')
      .eq('ativo', true)
      .order('descricao')
      .limit(termo ? 80 : 200)
    let sinapiQuery = supabase
      .from('sinapi_insumos')
      .select('id,codigo,descricao,unidade,precos,classificacao')
      .order('descricao')
      .limit(termo ? 80 : 200)

    if (termo) {
      propriosQuery = propriosQuery.ilike('descricao', `%${termo}%`)
      sinapiQuery = sinapiQuery.ilike('descricao', `%${termo}%`)
    }

    const [propriosRes, sinapiRes] = await Promise.all([propriosQuery, sinapiQuery])
    const proprios = ((propriosRes.data || []) as InsumoProprio[]).map(ins => ({
      id: ins.id,
      codigo: ins.codigo,
      descricao: fixMojibake(ins.descricao),
      unidade: ins.unidade,
      preco_unitario: Number(ins.preco_unitario || 0),
      classificacao: ins.classificacao || (ins.categoria === 'EQUIPAMENTO' ? 'EQUIPAMENTO' : ins.categoria === 'MAO_DE_OBRA' ? 'MAO_DE_OBRA' : 'MATERIAL_SERVICOS'),
      grupo: ins.grupo || '',
      origem: 'proprio' as const,
    }))
    const sinapi = ((sinapiRes.data || []) as SinapiInsumo[]).map(ins => ({
      id: ins.id,
      codigo: ins.codigo,
      descricao: fixMojibake(ins.descricao),
      unidade: ins.unidade,
      preco_unitario: Number(ins.precos?.[obraUf] || 0),
      classificacao: ((ins.classificacao === 'EQUIPAMENTO' || ins.classificacao === 'MAO_DE_OBRA') ? ins.classificacao : 'MATERIAL_SERVICOS') as ClassificacaoInsumo,
      grupo: '',
      origem: 'sinapi' as const,
    }))
    setInsumosCatalogo([...proprios, ...sinapi])
  }

  useEffect(() => {
    Promise.resolve().then(() => loadAll())
  }, [obraId, orcamentoId])

  useEffect(() => {
    if (fonte !== 'insumos') return
    const termo = busca.trim()
    if (termo.length === 1) return
    const timer = window.setTimeout(() => {
      void loadInsumosCatalogo(termo)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [fonte, busca, obraUf])

  useEffect(() => {
    function onDataChanged() { loadAll() }
    window.addEventListener('buildsmart:obra-data-changed', onDataChanged)
    return () => window.removeEventListener('buildsmart:obra-data-changed', onDataChanged)
  }, [obraId, orcamentoId])

  // ─── Totais com override ─────────────────────────────────────────────────
  // preços/classificação vêm direto do embed (insumo:sinapi_insumos / insumo_proprio:insumos_proprios)
  const getItemTotal = useCallback((item: ItemEnriquecido): number => {
    if (item.tipo_linha === 'subetapa') return item.subetapa_valor_manual_ativo ? Number(item.subetapa_valor_manual || 0) : 0
    if (item.valor_total_manual_ativo && item.valor_total_informado_snapshot != null) return Number(item.valor_total_informado_snapshot)
    const itensComp = item.composicao_itens || []
    if (itensComp.length === 0) return item.preco_unitario_snapshot * item.quantidade
    const temPreco = itensComp.some(ins => infoDoItem(ins, obraUf).preco > 0)
    if (!temPreco) return item.preco_unitario_snapshot * item.quantidade
    return itensComp.reduce((total, ins) => {
      const info = infoDoItem(ins, obraUf)
      const key = overrideKey(item.id, info.codigo !== '—' ? info.codigo : ins.id)
      const qtdCalculada = ins.quantidade_calculada != null ? Number(ins.quantidade_calculada) : item.quantidade * ins.coeficiente
      const qtdAdotada = insumoOverrides[key] ?? (ins.quantidade_adotada != null ? Number(ins.quantidade_adotada) : qtdCalculada)
      return total + qtdAdotada * info.preco
    }, 0)
  }, [insumoOverrides, obraUf])

  const itensOrcamento = itens.filter(item => item.tipo_linha !== 'subetapa')
  const subetapasMeta: SubetapaMeta[] = itens
    .filter(item => item.tipo_linha === 'subetapa')
    .map(item => ({
      id: item.id,
      etapa_id: item.etapa_id,
      nome: item.subetapa?.trim() || item.descricao_snapshot?.trim() || item.descricao || 'Sem subetapa',
      descricao: item.descricao_snapshot,
      valor_manual: item.subetapa_valor_manual ?? null,
      ativo: Boolean(item.subetapa_valor_manual_ativo),
      categoria: item.subetapa_categoria_snapshot ?? null,
      ordem: item.ordem ?? null,
    }))

  const subtotal = itensOrcamento.reduce((acc, item) => acc + getItemTotal(item), 0)
    + subetapasMeta
      .filter(meta => meta.ativo)
      .reduce((acc, meta) => {
        const itensSub = itensOrcamento.filter(item => item.etapa_id === meta.etapa_id && (item.subetapa?.trim() || 'Sem subetapa').toLowerCase() === meta.nome.toLowerCase())
        const calculado = itensSub.reduce((sum, item) => sum + getItemTotal(item), 0)
        return acc + (Number(meta.valor_manual || 0) - calculado)
      }, 0)
  const totalBdi = subtotal * (bdi / 100)
  const totalGerenciamento = subtotal * (gerenciamento / 100)
  const totalGeral = subtotal + totalBdi + totalGerenciamento
  const custoPorM2 = areaM2 && areaM2 > 0 ? totalGeral / areaM2 : null

  // ─── Composição de custos diretos por categoria (Material / Mão de obra / Equipamentos) ──
  // Espelha exatamente a lógica de getItemTotal para que material+maoDeObra+equipamento+outros === subtotal
  const custoPorCategoria: CustoCategoria = (() => {
    const acc: CustoCategoria = { material: 0, maoDeObra: 0, equipamento: 0, outros: 0 }
    for (const item of itensOrcamento) {
      const itensComp = item.composicao_itens || []
      const totalItem = getItemTotal(item)
      if (itensComp.length === 0) {
        const desc = (item.descricao || '').toLowerCase()
        if (desc.startsWith('mão de obra') || desc.startsWith('mao de obra')) { acc.maoDeObra += totalItem }
        else { acc.material += totalItem }
        continue
      }
      const temPreco = itensComp.some(ins => infoDoItem(ins, obraUf).preco > 0)
      if (!temPreco) { acc.outros += totalItem; continue }
      let distribuido = 0
      for (const ins of itensComp) {
        const info = infoDoItem(ins, obraUf)
        const key = overrideKey(item.id, info.codigo !== '—' ? info.codigo : ins.id)
        const qtdCalculada = ins.quantidade_calculada != null ? Number(ins.quantidade_calculada) : item.quantidade * ins.coeficiente
        const qtdAdotada = insumoOverrides[key] ?? (ins.quantidade_adotada != null ? Number(ins.quantidade_adotada) : qtdCalculada)
        const valor = qtdAdotada * info.preco
        distribuido += valor
        switch (info.classificacao) {
          case 'MATERIAL':
          case 'MATERIAL_SERVICOS': acc.material += valor; break
          case 'MAO_DE_OBRA': acc.maoDeObra += valor; break
          case 'EQUIPAMENTO': acc.equipamento += valor; break
          default: acc.outros += valor
        }
      }
      if (item.valor_total_manual_ativo) acc.outros += totalItem - distribuido
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
    try {
      const etapa = await findOrCreateEtapa(novaEtapaNome)
      setSelectedEtapaNome(etapa.nome)
      setShowAddItem(true)
      setShowNovaEtapa(false)
      setNovaEtapaNome('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      alert(`Nao foi possivel criar a etapa: ${message}`)
    } finally {
      setCriandoEtapa(false)
    }
  }

  function openItemModal(etapaId: string | null = null, subetapa: string | null = null, usarItemLivre = false) {
    const etapa = etapaId ? etapas.find(e => e.id === etapaId) : null
    setSelectedEtapaNome(etapa?.nome || etapas[0]?.nome || etapasPadrao[0] || '')
    setSubetapaLivre(subetapa && subetapa !== 'Sem subetapa' ? subetapa : '')
    setSubetapaDescricao('')
    setSubetapaValor('')
    setSubetapaCategoria('')
    setFonte(usarItemLivre ? 'livre' : 'proprias')
    setSelectedItem(null)
    setBusca('')
    setLivreDescricao('')
    setLivreUnidade('UN')
    setLivrePreco('')
    setLivreClassificacao('MATERIAL_SERVICOS')
    setLivreGrupo('')
    setQuantidade('')
    setItensPendentes([])
    setShowAddItem(true)
  }

  async function findOrCreateEtapa(nomeInformado: string): Promise<Etapa> {
    const nome = nomeInformado.trim()
    if (!nome) throw new Error('Selecione uma etapa para este lancamento.')
    if (!etapaContexto) throw new Error('Projeto ou obra nao identificado para criar a etapa.')

    const chave = normalizarNomeEtapa(nome)
    const local = etapas.find(etapa => normalizarNomeEtapa(etapa.nome) === chave)
    if (local) return local

    const buscarNoBanco = async () => {
      let query = supabase.from('etapas').select('*').eq(etapaContexto.coluna, etapaContexto.id)
      if (etapaContexto.orcamentoFiltro) query = query.eq('orcamento_id', etapaContexto.orcamentoFiltro)
      const { data, error } = await query
      if (error) throw error
      return (data || []).find((etapa: Etapa) => normalizarNomeEtapa(etapa.nome) === chave) as Etapa | undefined
    }

    const existente = await buscarNoBanco()
    if (existente) {
      setEtapas(prev => prev.some(etapa => etapa.id === existente.id) ? prev : [...prev, existente])
      return existente
    }

    const maxOrdem = etapas.reduce((maior, etapa) => Math.max(maior, etapa.ordem || 0), 0)
    const { data, error } = await supabase
      .from('etapas')
      .insert({ ...etapaContexto.fk, nome, status: 'planejada', ordem: maxOrdem + 1 })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        const criadaEmParalelo = await buscarNoBanco()
        if (criadaEmParalelo) {
          setEtapas(prev => prev.some(etapa => etapa.id === criadaEmParalelo.id) ? prev : [...prev, criadaEmParalelo])
          return criadaEmParalelo
        }
      }
      throw error
    }
    if (!data) throw new Error('A etapa nao foi criada.')

    setEtapas(prev => prev.some(etapa => etapa.id === data.id || normalizarNomeEtapa(etapa.nome) === chave) ? prev : [...prev, data])
    return data
  }

  async function ensureEtapaSelecionada(): Promise<string> {
    return (await findOrCreateEtapa(selectedEtapaNome)).id
  }

  function parseDecimalInput(value: string) {
    const cleaned = String(value || '').replace(/[^\d,.-]/g, '')
    const parsed = Number(cleaned.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }

  function parseQuantityInput(value: string) {
    const parsed = Number(String(value || '').trim().replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }

  function formatCurrencyInput(value: string) {
    const numero = parseDecimalInput(value)
    return numero > 0 ? numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
  }

  function updateItemPendente(id: string, patch: Partial<AddItemDraft>) {
    setItensPendentes(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  function itemAtualValido() {
    const qtd = parseQuantityInput(quantidade)
    if (qtd <= 0 || !selectedEtapaNome.trim()) return false
    return fonte === 'livre' ? Boolean(livreDescricao.trim() && livreClassificacao) : Boolean(selectedItem)
  }

  function draftAtual(): AddItemDraft | null {
    if (!itemAtualValido()) return null
    const qtd = parseQuantityInput(quantidade)
    const subetapa = subetapaLivre.trim() || null
    if (fonte === 'livre') {
      const descricao = livreDescricao.trim()
      if (!descricao) return null
      return {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        etapaNome: selectedEtapaNome.trim(),
        subetapa,
        fonte,
        item: null,
        descricao,
        unidade: livreUnidade.trim() || 'UN',
        preco: parseDecimalInput(livrePreco),
        quantidade: qtd,
        codigo: `LIV-${Date.now().toString(36).toUpperCase()}`,
        classificacao: livreClassificacao,
        grupo: livreGrupo.trim(),
      }
    }
    if (!selectedItem) return null
    return {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      etapaNome: selectedEtapaNome.trim(),
      subetapa,
      fonte,
      item: selectedItem,
      descricao: selectedItem.descricao,
      unidade: selectedItem.unidade,
      preco: getItemCost(selectedItem),
      quantidade: qtd,
      codigo: selectedItem.codigo,
      classificacao: fonte === 'insumos' ? (selectedItem as InsumoCatalogo).classificacao : null,
      grupo: 'grupo' in selectedItem && typeof selectedItem.grupo === 'string' ? selectedItem.grupo : '',
    }
  }

  function limparCamposItemAtual() {
    setSelectedItem(null)
    setQuantidade('')
    setBusca('')
    setLivreDescricao('')
    setLivrePreco('')
    setLivreClassificacao('MATERIAL_SERVICOS')
    setLivreGrupo('')
  }

  function handleMaisCampos() {
    const draft = draftAtual()
    if (!draft && fonte !== 'livre') return
    setItensPendentes(prev => [...prev, draft ?? {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      etapaNome: selectedEtapaNome.trim(),
      subetapa: subetapaLivre.trim() || null,
      fonte: 'livre',
      item: null,
      descricao: '',
      unidade: livreUnidade.trim() || 'UN',
      preco: 0,
      quantidade: 1,
      codigo: `LIV-${Date.now().toString(36).toUpperCase()}`,
      classificacao: livreClassificacao,
      grupo: livreGrupo.trim(),
    }])
    limparCamposItemAtual()
  }

  async function ensureEtapaPorNome(nomeEtapa: string): Promise<string> {
    return (await findOrCreateEtapa(nomeEtapa)).id
  }

  async function upsertSubetapaMeta(etapaId: string | null, nomeSubetapa: string | null, valorManual: number | null, descricao?: string | null, categoria?: string | null, ativo = true) {
    if (!orcamento || !nomeSubetapa?.trim()) return
    const nome = nomeSubetapa.trim()
    let query = supabase.from('orcamento_itens')
      .select('id')
      .eq('orcamento_id', orcamento.id)
      .eq('tipo_linha', 'subetapa')
      .eq('subetapa', nome)
      .limit(1)
    query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
    const { data: existente } = await query.maybeSingle()
    const codigo = `SUB-${nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 24)}`
    const payload = {
      orcamento_id: orcamento.id,
      etapa_id: etapaId,
      subetapa: nome,
      tipo_linha: 'subetapa',
      quantidade: 1,
      preco_unitario_snapshot: 0,
      descricao_snapshot: descricao?.trim() || nome,
      codigo_snapshot: codigo,
      unidade_snapshot: 'VB',
      subetapa_valor_manual: valorManual,
      subetapa_valor_manual_ativo: ativo,
      subetapa_categoria_snapshot: categoria?.trim() || null,
    }
    const { error } = existente?.id
      ? await supabase.from('orcamento_itens').update(payload).eq('id', existente.id)
      : await supabase.from('orcamento_itens').insert(payload)
    if (error) throw error
  }

  async function inserirDraft(draft: AddItemDraft) {
    if (!orcamento) return
    const etapaId = await ensureEtapaPorNome(draft.etapaNome)
    const isSinapi = draft.fonte === 'sinapi'
    const { error } = await supabase.from('orcamento_itens').insert({
      orcamento_id: orcamento.id,
      etapa_id: etapaId,
      subetapa: draft.subetapa,
      tipo_linha: 'item',
      composicao_id: draft.fonte === 'proprias' ? draft.item!.id : null,
      sinapi_composicao_id: isSinapi ? draft.item!.id : null,
      quantidade: draft.quantidade,
      preco_unitario_snapshot: draft.preco,
      descricao_snapshot: draft.descricao,
      codigo_snapshot: draft.codigo,
      unidade_snapshot: draft.unidade,
      classificacao_snapshot: draft.classificacao,
      grupo_snapshot: draft.grupo || null,
      tipo_item_snapshot: draft.fonte === 'proprias' || draft.fonte === 'sinapi' ? 'COMPOSICAO' : draft.fonte === 'insumos' ? 'INSUMO' : 'ITEM_LIVRE',
    })
    if (error) throw error
    // Materiais não são mais atualizados incrementalmente a cada edição do
    // orçamento (isso era a origem dos duplicados — duas chaves de
    // identidade diferentes brigando). Use "Importar p/ Materiais" para
    // recalcular a partir do estado atual do orçamento.
  }

  async function handleInserirItens() {
    if (!orcamento) return
    const atual = draftAtual()
    const drafts = [...itensPendentes, ...(atual ? [atual] : [])].filter(draft => draft.descricao.trim() && draft.quantidade > 0)
    const valorSubetapaInformado = subetapaValor.trim().length > 0
    const valorMeta = parseDecimalInput(subetapaValor)
    const podeCriarSubetapaDireta = Boolean(selectedEtapaNome.trim() && subetapaLivre.trim() && valorSubetapaInformado)
    if (drafts.length === 0 && !podeCriarSubetapaDireta) {
      alert('Selecione um item e informe a quantidade. O valor da subetapa e opcional.')
      return
    }
    setSaving(true)
    try {
      const etapaId = await ensureEtapaSelecionada()
      for (const draft of drafts) await inserirDraft(draft)
      if (podeCriarSubetapaDireta) {
        await upsertSubetapaMeta(etapaId, subetapaLivre.trim(), valorMeta, subetapaDescricao, subetapaCategoria)
      }
      setItensPendentes([])
      limparCamposItemAtual()
      setSubetapaLivre('')
      setSubetapaDescricao('')
      setSubetapaValor('')
      setSubetapaCategoria('')
      setShowAddItem(false)
      await Promise.all([loadItens(orcamento.id), loadEtapas()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      alert(`Nao foi possivel inserir no orcamento: ${message}`)
    } finally {
      setSaving(false)
    }
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
      // Materiais não são mais atualizados incrementalmente aqui — use
      // "Importar p/ Materiais" para recalcular a partir do orçamento atual.

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

    // Materiais n\u00e3o s\u00e3o mais atualizados incrementalmente aqui \u2014 use
    // "Importar p/ Materiais" para recalcular a partir do or\u00e7amento atual.
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

  // ─── Reordenar (drag & drop) — etapas, subetapas e itens ────────────────
  // Atualização otimista no state local + persistência assíncrona do campo
  // "ordem" em segundo plano (sem recarregar a lista, pra não "piscar").
  async function handleReorderEtapas(novaOrdem: Etapa[]) {
    setEtapas(novaOrdem)
    await Promise.all(novaOrdem.map((etapa, i) =>
      supabase.from('etapas').update({ ordem: i + 1 }).eq('id', etapa.id)
    ))
  }

  async function handleReorderSubetapas(etapaId: string | null, novaOrdemNomes: string[]) {
    const ordemPorNome = new Map(novaOrdemNomes.map((nome, i) => [nome.toLowerCase(), i + 1]))
    setItens(prev => prev.map(item => {
      if (item.tipo_linha !== 'subetapa') return item
      if ((item.etapa_id ?? null) !== etapaId) return item
      const novaOrdem = ordemPorNome.get((item.subetapa ?? '').toLowerCase())
      return novaOrdem !== undefined ? { ...item, ordem: novaOrdem } : item
    }))
    await Promise.all(novaOrdemNomes.map(async (nome, i) => {
      let query = supabase.from('orcamento_itens').update({ ordem: i + 1 })
        .eq('orcamento_id', orcamento!.id).eq('tipo_linha', 'subetapa').eq('subetapa', nome)
      query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
      await query
    }))
  }

  async function handleReorderItens(novaOrdemIds: string[]) {
    const ordemPorId = new Map(novaOrdemIds.map((id, i) => [id, i + 1]))
    setItens(prev => prev.map(item => ordemPorId.has(item.id) ? { ...item, ordem: ordemPorId.get(item.id) } : item))
    await Promise.all(novaOrdemIds.map((id, i) =>
      supabase.from('orcamento_itens').update({ ordem: i + 1 }).eq('id', id)
    ))
  }

  // ─── Excluir etapa (e suas composições) ─────────────────────────────────
  // etapas.id não tem ON DELETE CASCADE em orcamento_itens — removemos os itens
  // (abatendo materiais gerados) antes de excluir a etapa em si.
  function handleRemoveEtapa(etapaId: string, nome: string) {
    const itensDaEtapa = itens.filter(i => i.etapa_id === etapaId)
    setErroHierarquia('')
    setHierarquiaDialog({
      tipo: 'excluir-etapa', etapaId, nomeAtual: nome, valor: '', quantidadeItens: itensDaEtapa.length,
    })
  }

  async function removeEtapaConfirmada(etapaId: string) {
    const itensDaEtapa = itens.filter(i => i.etapa_id === etapaId)
    for (const item of itensDaEtapa) {
      setInsumoOverrides(prev => {
        const next = { ...prev }
        Object.keys(next).filter(k => k.startsWith(item.id)).forEach(k => delete next[k])
        return next
      })
      const { error: itemError } = await supabase.from('orcamento_itens').delete().eq('id', item.id)
      if (itemError) throw itemError
    }
    const { error: etapaError } = await supabase.from('etapas').delete().eq('id', etapaId)
    if (etapaError) throw etapaError
    setItens(prev => prev.filter(i => i.etapa_id !== etapaId))
    setEtapas(prev => prev.filter(e => e.id !== etapaId))
  }

  function handleRenameEtapa(etapaId: string, nomeAtual: string) {
    setErroHierarquia('')
    setHierarquiaDialog({ tipo: 'renomear-etapa', etapaId, nomeAtual, valor: nomeAtual })
  }

  function handleRenameSubetapa(etapaId: string | null, subetapaAtual: string) {
    const atual = subetapaAtual === 'Sem subetapa' ? '' : subetapaAtual
    setErroHierarquia('')
    setHierarquiaDialog({ tipo: 'renomear-subetapa', etapaId, nomeAtual: subetapaAtual, valor: atual })
  }

  function handleRemoveSubetapa(etapaId: string | null, subetapaNome: string) {
    const itensDaSubetapa = itens.filter(item =>
      item.etapa_id === etapaId && (item.subetapa || 'Sem subetapa') === subetapaNome
    )
    if (itensDaSubetapa.length === 0) return
    setErroHierarquia('')
    setHierarquiaDialog({
      tipo: 'excluir-subetapa', etapaId, nomeAtual: subetapaNome, valor: '', quantidadeItens: itensDaSubetapa.length,
    })
  }

  async function removeSubetapaConfirmada(etapaId: string | null, subetapaNome: string) {
    const itensDaSubetapa = itens.filter(item =>
      item.etapa_id === etapaId && (item.subetapa || 'Sem subetapa') === subetapaNome
    )
    for (const item of itensDaSubetapa) {
      setInsumoOverrides(prev => {
        const next = { ...prev }
        Object.keys(next).filter(k => k.startsWith(item.id)).forEach(k => delete next[k])
        return next
      })
    }

    const ids = itensDaSubetapa.map(item => item.id)
    const { error } = await supabase.from('orcamento_itens').delete().in('id', ids)
    if (error) throw error
    setItens(prev => prev.filter(item => !ids.includes(item.id)))
  }

  function handleEditSubetapaValor(etapaId: string | null, subetapaNome: string, valorAtual: number) {
    setErroHierarquia('')
    setHierarquiaDialog({
      tipo: 'editar-valor',
      etapaId,
      nomeAtual: subetapaNome,
      valor: valorAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    })
  }

  async function salvarHierarquia() {
    if (!hierarquiaDialog || !orcamento) return
    setErroHierarquia('')
    setSalvandoHierarquia(true)

    try {
      if (hierarquiaDialog.tipo === 'renomear-etapa') {
        const nome = hierarquiaDialog.valor.trim()
        if (!nome) throw new Error('Informe o novo nome da etapa.')
        if (!hierarquiaDialog.etapaId || !etapaContexto) throw new Error('Etapa nao identificada.')

        const repetida = etapas.some(etapa =>
          etapa.id !== hierarquiaDialog.etapaId && normalizarNomeEtapa(etapa.nome) === normalizarNomeEtapa(nome)
        )
        if (repetida) throw new Error('Ja existe uma etapa com esse nome nesta obra.')

        let updateQuery = supabase
          .from('etapas')
          .update({ nome })
          .eq('id', hierarquiaDialog.etapaId)
          .eq(etapaContexto.coluna, etapaContexto.id)
        if (etapaContexto.orcamentoFiltro) updateQuery = updateQuery.eq('orcamento_id', etapaContexto.orcamentoFiltro)
        const { data, error } = await updateQuery.select('id,nome').maybeSingle()
        if (error) throw error
        if (!data) throw new Error('A etapa nao foi encontrada para edicao.')
        setEtapas(prev => prev.map(etapa => etapa.id === data.id ? { ...etapa, nome: data.nome } : etapa))
      }

      if (hierarquiaDialog.tipo === 'renomear-subetapa') {
        const nome = hierarquiaDialog.valor.trim()
        if (!nome) throw new Error('Informe o novo nome da subetapa.')
        const atual = hierarquiaDialog.nomeAtual === 'Sem subetapa' ? '' : hierarquiaDialog.nomeAtual

        const repetida = itens.some(item =>
          item.etapa_id === hierarquiaDialog.etapaId
          && (item.subetapa || '') !== atual
          && normalizarNomeEtapa(item.subetapa || '') === normalizarNomeEtapa(nome)
        )
        if (repetida) throw new Error('Ja existe uma subetapa com esse nome nesta etapa.')

        let query = supabase
          .from('orcamento_itens')
          .update({ subetapa: nome })
          .eq('orcamento_id', orcamento.id)
        query = atual ? query.eq('subetapa', atual) : query.is('subetapa', null)
        query = hierarquiaDialog.etapaId ? query.eq('etapa_id', hierarquiaDialog.etapaId) : query.is('etapa_id', null)
        const { data, error } = await query.select('id')
        if (error) throw error
        if (!data || data.length === 0) throw new Error('A subetapa nao foi encontrada para edicao.')

        if (resolvedObraId && atual && await materiaisTemSubetapa()) {
          let materiaisQuery = supabase
            .from('materiais')
            .update({ subetapa: nome })
            .eq('obra_id', resolvedObraId)
            .eq('subetapa', atual)
          materiaisQuery = hierarquiaDialog.etapaId
            ? materiaisQuery.eq('etapa_id', hierarquiaDialog.etapaId)
            : materiaisQuery.is('etapa_id', null)
          const { error: materiaisError } = await materiaisQuery
          if (materiaisError) console.error('Subetapa renomeada, mas materiais nao foram sincronizados:', materiaisError)
        }
        await loadItens(orcamento.id)
      }

      if (hierarquiaDialog.tipo === 'editar-valor') {
        const valor = parseDecimalInput(hierarquiaDialog.valor)
        if (!Number.isFinite(valor) || valor < 0) throw new Error('Informe um valor valido, igual ou maior que zero.')
        await upsertSubetapaMeta(hierarquiaDialog.etapaId, hierarquiaDialog.nomeAtual, valor)
        await loadItens(orcamento.id)
      }

      if (hierarquiaDialog.tipo === 'excluir-etapa') {
        if (!hierarquiaDialog.etapaId) throw new Error('Etapa nao identificada.')
        await removeEtapaConfirmada(hierarquiaDialog.etapaId)
      }

      if (hierarquiaDialog.tipo === 'excluir-subetapa') {
        await removeSubetapaConfirmada(hierarquiaDialog.etapaId, hierarquiaDialog.nomeAtual)
      }

      setHierarquiaDialog(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel concluir a alteracao.'
      setErroHierarquia(message)
    } finally {
      setSalvandoHierarquia(false)
    }
  }

  async function handleRestoreSubetapaValor(etapaId: string | null, subetapaNome: string) {
    if (!orcamento) return
    let query = supabase
      .from('orcamento_itens')
      .update({ subetapa_valor_manual_ativo: false })
      .eq('orcamento_id', orcamento.id)
      .eq('tipo_linha', 'subetapa')
      .eq('subetapa', subetapaNome)
    query = etapaId ? query.eq('etapa_id', etapaId) : query.is('etapa_id', null)
    const { error } = await query
    if (error) {
      alert(`Nao foi possivel restaurar o valor calculado: ${error.message}`)
      return
    }
    await loadItens(orcamento.id)
  }

  async function handleRestoreItemValor(itemId: string) {
    if (!orcamento) return
    const { error } = await supabase.from('orcamento_itens')
      .update({ valor_total_manual_ativo: false, importacao_alertas: [] })
      .eq('id', itemId)
      .eq('orcamento_id', orcamento.id)
    if (error) {
      alert(`Não foi possível restaurar o valor calculado: ${error.message}`)
      return
    }
    await loadItens(orcamento.id)
  }

  async function handleRestoreInsumoValor(insumoId: string) {
    if (!orcamento) return
    const { error } = await supabase.from('orcamento_item_insumos')
      .update({ valor_total_divergente: false, valor_total_informado_snapshot: null })
      .eq('id', insumoId)
    if (error) {
      alert(`Não foi possível restaurar o total do insumo: ${error.message}`)
      return
    }
    await loadItens(orcamento.id)
  }

  async function handleUpdateBdi() {
    if (!orcamento) return
    await supabase.from('orcamentos').update({ bdi_percentual: bdi }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, bdi_percentual: bdi } : o)
  }

  async function handleUpdateGerenciamento() {
    if (!orcamento) return
    await supabase.from('orcamentos').update({ gerenciamento_percentual: gerenciamento }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, gerenciamento_percentual: gerenciamento } : o)
  }

  // ─── Export Excel ────────────────────────────────────────────────────────
  function handleExportXLSX() {
    if (!orcamento) return

    const etapaMap: Record<string, string> = { sem_etapa: 'Sem etapa' }
    for (const e of etapas) etapaMap[e.id] = e.nome

    const exportItens: ItemExportRow[] = itensOrcamento.map(item => {
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
          const qtdCalculada = ins.quantidade_calculada != null ? Number(ins.quantidade_calculada) : item.quantidade * ins.coeficiente
          const qtdAdotada = insumoOverrides[key] ?? (ins.quantidade_adotada != null ? Number(ins.quantidade_adotada) : qtdCalculada)
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
  async function handleImportarOrcamentoAnalitico(linhas: LinhaImportada[]): Promise<ResultadoImportacaoOrcamento> {
    if (!orcamento) return { inseridos: 0, ignorados: linhas.length, erros: ['Orçamento não carregado.'] }
    const erros: string[] = []
    let inseridos = 0
    let ignorados = 0
    const etapasImportadas = new Map<string, string>()
    const gruposComposicao = new Map<string, LinhaImportada[]>()

    for (const linha of linhas) {
      const tipo = String(linha.valores.tipo || '').toUpperCase()
      if (tipo === 'SUBETAPA') continue
      const chave = [linha.valores.etapa, linha.valores.subetapa, linha.valores.composicaoDescricao]
        .map(valor => normalizarNomeEtapa(String(valor || ''))).join('|')
      gruposComposicao.set(chave, [...(gruposComposicao.get(chave) || []), linha])
    }

    async function etapaIdDaLinha(linha: LinhaImportada) {
      const nome = String(linha.valores.etapa || '').trim()
      const chave = normalizarNomeEtapa(nome)
      if (etapasImportadas.has(chave)) return etapasImportadas.get(chave)!
      const etapa = await findOrCreateEtapa(nome)
      etapasImportadas.set(chave, etapa.id)
      return etapa.id
    }

    // Cria metadados de subetapa depois de conhecer o total único de cada composição.
    const composicoesPorSubetapa = new Map<string, number>()
    for (const grupo of gruposComposicao.values()) {
      const primeira = grupo[0]
      const chaveSub = [primeira.valores.etapa, primeira.valores.subetapa].map(valor => normalizarNomeEtapa(String(valor || ''))).join('|')
      const total = Number(primeira.valores.composicaoValorTotal || primeira.valores._somaInsumos || 0)
      composicoesPorSubetapa.set(chaveSub, (composicoesPorSubetapa.get(chaveSub) || 0) + total)
    }

    const subetapasProcessadas = new Set<string>()
    for (const linha of linhas) {
      const nomeSubetapa = String(linha.valores.subetapa || '').trim()
      if (!nomeSubetapa) continue
      const chaveSub = [linha.valores.etapa, nomeSubetapa].map(valor => normalizarNomeEtapa(String(valor || ''))).join('|')
      if (subetapasProcessadas.has(chaveSub)) continue
      subetapasProcessadas.add(chaveSub)
      const etapaId = await etapaIdDaLinha(linha)
      const valorInformado = Number(linha.valores.valorSubetapa || 0)
      const valorCalculado = composicoesPorSubetapa.get(chaveSub) || 0
      const divergente = valorInformado > 0 && Math.abs(valorInformado - valorCalculado) > Math.max(0.02, Math.abs(valorCalculado) * 0.001)
      await upsertSubetapaMeta(
        etapaId,
        nomeSubetapa,
        valorInformado > 0 ? valorInformado : null,
        nomeSubetapa,
        String(linha.valores.categoriaSubetapa || ''),
        divergente,
      )
    }

    for (const grupo of gruposComposicao.values()) {
      const primeira = grupo[0]
      try {
        const etapaId = await etapaIdDaLinha(primeira)
        const quantidade = Number(primeira.valores.composicaoQuantidade || 1)
        const totalInformado = Number(primeira.valores.composicaoValorTotal || 0)
        const somaInsumos = Number(primeira.valores._somaInsumosCalculada || primeira.valores._somaInsumos || 0)
        const valorUnitario = Number(primeira.valores.composicaoValorUnitario || (totalInformado && quantidade ? totalInformado / quantidade : 0))
        const totalCalculado = somaInsumos || quantidade * valorUnitario
        const divergente = Boolean(primeira.valores._divergenciaComposicao)
        const alertas = divergente
          ? [`Total informado (${formatCurrency(totalInformado)}) diverge do calculado (${formatCurrency(totalCalculado)}).`]
          : []
        const descricao = String(primeira.valores.composicaoDescricao || '').trim()
        const codigo = `IMP-${Date.now().toString(36).toUpperCase()}-${primeira.numero}`
        const { data: itemCriado, error: erroItem } = await supabase.from('orcamento_itens').insert({
          orcamento_id: orcamento.id,
          etapa_id: etapaId,
          subetapa: String(primeira.valores.subetapa || '').trim() || null,
          tipo_linha: 'item',
          composicao_id: null,
          sinapi_composicao_id: null,
          quantidade,
          preco_unitario_snapshot: valorUnitario,
          descricao_snapshot: descricao,
          codigo_snapshot: codigo,
          unidade_snapshot: String(primeira.valores.composicaoUnidade || 'UN'),
          classificacao_snapshot: primeira.valores.composicaoClassificacao || null,
          grupo_snapshot: String(primeira.valores.composicaoGrupo || '').trim() || null,
          subetapa_categoria_snapshot: String(primeira.valores.categoriaSubetapa || '').trim() || null,
          tipo_item_snapshot: String(primeira.valores.tipo || '').toUpperCase() === 'ITEM_LIVRE' ? 'ITEM_LIVRE' : 'COMPOSICAO',
          valor_total_informado_snapshot: totalInformado || null,
          valor_total_manual_ativo: divergente,
          importacao_alertas: alertas,
        }).select('id').single()
        if (erroItem || !itemCriado) throw erroItem || new Error('Item não criado.')

        const linhasInsumo = grupo.filter(linha => String(linha.valores.insumoDescricao || '').trim())
        if (linhasInsumo.length) {
          const payload = linhasInsumo.map((linha, indice) => {
            const quantidadeInsumo = Number(linha.valores.insumoQuantidade || 0)
            const valorUnitarioInsumo = Number(linha.valores.insumoValorUnitario || 0)
            const totalInsumo = Number(linha.valores.insumoValorTotal || quantidadeInsumo * valorUnitarioInsumo)
            const codigoInsumo = `IMP-${String(indice + 1).padStart(3, '0')}-${normalizarNomeEtapa(String(linha.valores.insumoDescricao || '')).replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`.toUpperCase()
            return {
              orcamento_item_id: itemCriado.id,
              sinapi_codigo: codigoInsumo,
              descricao_snapshot: String(linha.valores.insumoDescricao || '').trim(),
              unidade_snapshot: String(linha.valores.insumoUnidade || 'UN'),
              classificacao_snapshot: linha.valores.insumoClassificacao || null,
              grupo_snapshot: String(linha.valores.insumoGrupo || '').trim() || null,
              coeficiente_snapshot: Number(linha.valores.insumoCoeficiente || (quantidade ? quantidadeInsumo / quantidade : 0)),
              quantidade_calculada: quantidadeInsumo,
              quantidade_adotada: quantidadeInsumo,
              preco_unitario_snapshot: valorUnitarioInsumo,
              valor_total_informado_snapshot: totalInsumo || null,
              valor_total_divergente: totalInsumo > 0 && Math.abs(totalInsumo - quantidadeInsumo * valorUnitarioInsumo) > Math.max(0.02, Math.abs(totalInsumo) * 0.001),
              ordem: indice,
            }
          })
          const { error: erroInsumos } = await supabase.from('orcamento_item_insumos').insert(payload)
          if (erroInsumos) {
            await supabase.from('orcamento_itens').delete().eq('id', itemCriado.id)
            throw erroInsumos
          }
        }
        inseridos++
      } catch (error) {
        ignorados += grupo.length
        erros.push(`Linha ${primeira.numero}: ${error instanceof Error ? error.message : 'falha ao importar composição.'}`)
      }
    }

    // Subetapas sem itens também são válidas.
    for (const linha of linhas.filter(item => String(item.valores.tipo || '').toUpperCase() === 'SUBETAPA')) {
      if (String(linha.valores.subetapa || '').trim()) inseridos++
      else { ignorados++; erros.push(`Linha ${linha.numero}: nome da subetapa vazio.`) }
    }
    await Promise.all([loadItens(orcamento.id), loadEtapas()])
    return { inseridos, ignorados, erros }
  }

  // própria primeiro, SINAPI em seguida. Espelha handleAddItem para cada linha.
  async function handleImportarOrcamento(linhas: LinhaImportada[]): Promise<ResultadoImportacaoOrcamento> {
    if (!orcamento) return { inseridos: 0, ignorados: linhas.length, erros: ['Orçamento não carregado.'] }
    if (linhas.some(linha => linha.valores.origem === 'orcamento_analitico')) {
      return handleImportarOrcamentoAnalitico(linhas)
    }

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
      const tipoLinha = String(linha.valores.tipo ?? '').trim().toLowerCase()
      const quantidade = Number(linha.valores.quantidade ?? 0) || 1
      const descricaoImportada = String(linha.valores.descricao ?? '').trim()
      const unidadeImportada = String(linha.valores.unidade ?? 'UN').trim() || 'UN'
      const valorUnitarioImportado = Number(linha.valores.valorUnitario ?? linha.valores.valor_unitario ?? linha.valores.custoUnitario ?? 0)
      const valorTotalImportado = Number(linha.valores.valorTotal ?? linha.valores.valor_total ?? linha.valores.custoTotal ?? 0)
      const valorSubetapaCampo = Number(linha.valores.valorSubetapa ?? linha.valores.valor_subetapa ?? 0)
      const valorSubetapaImportado = valorSubetapaCampo || (tipoLinha === 'subetapa' ? (valorTotalImportado || valorUnitarioImportado) : 0)
      const origemImportacao = String(linha.valores.origem ?? '').trim()
      const grupoImportado = String(linha.valores.grupo ?? linha.valores.categoriaGrupo ?? '').trim()
      const categoriaSubetapaImportada = String(linha.valores.categoriaSubetapa ?? linha.valores.categoria_subetapa ?? '').trim()
      const classificacaoTexto = String(linha.valores.classificacao ?? '').trim().toUpperCase()
      const descricaoEhMaoObra = /m[aã]o\s+de\s+obra/i.test(descricaoImportada)
      const classificacaoImportada: ClassificacaoInsumo | null = classificacaoTexto === 'EQUIPAMENTO'
        ? 'EQUIPAMENTO'
        : classificacaoTexto === 'MAO_DE_OBRA' || classificacaoTexto === 'MÃO DE OBRA' || classificacaoTexto === 'MAO DE OBRA'
          ? 'MAO_DE_OBRA'
          : classificacaoTexto === 'MATERIAL_SERVICOS' || classificacaoTexto === 'MATERIAL E SERVIÇOS' || classificacaoTexto === 'MATERIAL E SERVICOS'
            ? 'MATERIAL_SERVICOS'
            : descricaoEhMaoObra ? 'MAO_DE_OBRA' : null
      const statusExecucaoImportado = mapStatusExecucao(linha.valores.statusExecucao)
      const insumosAntigos = Array.isArray(linha.valores.insumos)
        ? linha.valores.insumos as InsumoOrcamentoAntigo[]
        : []
      const insumosResumoLegado = insumosAntigos.length > 0
        && insumosAntigos.every(insumo => insumo.tipo === 'LEGADO_RESUMIDO' || insumo.codigo.startsWith(`${codigo}-`))

      if (!etapaNome) {
        ignorados++
        erros.push(`Linha ${linha.numero}: dados incompletos — ignorada.`)
        continue
      }

      let etapaId = etapaCache.get(etapaNome.toLowerCase()) ?? null
      if (!etapaId) {
        const { data, error } = await supabase
          .from('etapas')
          .insert({ ...(etapaContexto?.fk || {}), nome: etapaNome, status: statusExecucaoImportado, ordem: ++maxOrdem })
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

      if (subetapa && valorSubetapaImportado > 0) {
        await upsertSubetapaMeta(etapaId, subetapa, valorSubetapaImportado, descricaoImportada && tipoLinha === 'subetapa' ? descricaoImportada : subetapa, categoriaSubetapaImportada)
      }

      // O modelo tabular novo importa snapshots independentes. Não cria nem altera
      // catálogos mestres e não gera materiais automaticamente.
      if (!origemImportacao) {
        if (tipoLinha === 'subetapa') {
          if (!subetapa) {
            ignorados++
            erros.push(`Linha ${linha.numero}: informe o nome da subetapa.`)
            continue
          }
          await upsertSubetapaMeta(etapaId, subetapa, valorSubetapaImportado, descricaoImportada || subetapa, categoriaSubetapaImportada)
          inseridos++
          continue
        }

        const tipoSnapshot = tipoLinha === 'composicao' ? 'COMPOSICAO' : tipoLinha === 'insumo' ? 'INSUMO' : 'ITEM_LIVRE'
        if (!descricaoImportada) {
          ignorados++
          erros.push(`Linha ${linha.numero}: informe a descrição do item.`)
          continue
        }
        if ((tipoSnapshot === 'INSUMO' || tipoSnapshot === 'ITEM_LIVRE') && !classificacaoImportada) {
          ignorados++
          erros.push(`Linha ${linha.numero}: classificação obrigatória para ${tipoSnapshot}.`)
          continue
        }
        const preco = valorUnitarioImportado || (valorTotalImportado > 0 ? valorTotalImportado / quantidade : 0)
        const codigoSnapshot = codigo || `${tipoSnapshot === 'COMPOSICAO' ? 'COMP' : tipoSnapshot === 'INSUMO' ? 'INS' : 'LIV'}-${Date.now().toString(36).toUpperCase()}-${linha.numero}`
        // Se o código da linha bate com uma composição já cadastrada no catálogo,
        // referenciamos ela (sem alterar o catálogo em si) para que os insumos
        // continuem visíveis ao expandir o item — sem isso, o vínculo se perdia
        // silenciosamente em toda importação tabular.
        const composicaoRef = tipoSnapshot === 'COMPOSICAO' && codigo ? mapaProprias.get(codigo) : undefined
        const sinapiRef = tipoSnapshot === 'COMPOSICAO' && codigo && !composicaoRef ? mapaSinapi.get(codigo) : undefined
        const { error: erroSnapshot } = await supabase.from('orcamento_itens').insert({
          orcamento_id: orcamento.id,
          etapa_id: etapaId,
          subetapa,
          tipo_linha: 'item',
          composicao_id: composicaoRef?.id ?? null,
          sinapi_composicao_id: sinapiRef?.id ?? null,
          quantidade,
          preco_unitario_snapshot: preco,
          descricao_snapshot: descricaoImportada,
          codigo_snapshot: codigoSnapshot,
          unidade_snapshot: unidadeImportada,
          classificacao_snapshot: classificacaoImportada,
          grupo_snapshot: grupoImportado || null,
          subetapa_categoria_snapshot: categoriaSubetapaImportada || null,
          tipo_item_snapshot: tipoSnapshot,
        })
        if (erroSnapshot) {
          ignorados++
          erros.push(`Linha ${linha.numero}: erro ao inserir item - ${erroSnapshot.message}`)
          continue
        }
        inseridos++
        continue
      }

      if (tipoLinha === 'subetapa' || (!codigo && subetapa && valorSubetapaImportado > 0 && !descricaoImportada)) {
        if (!subetapa) {
          ignorados++
          erros.push(`Linha ${linha.numero}: subetapa vazia para valor direto.`)
          continue
        }
        inseridos++
        continue
      }

      if (!codigo && (tipoLinha === 'item_livre' || descricaoImportada)) {
        const preco = valorUnitarioImportado || (valorTotalImportado > 0 ? valorTotalImportado / quantidade : 0)
        const codigoLivre = `LIV-${Date.now().toString(36).toUpperCase()}-${linha.numero}`
        const { error: insertLivreErro } = await supabase.from('orcamento_itens').insert({
          orcamento_id: orcamento.id,
          etapa_id: etapaId,
          subetapa,
          tipo_linha: 'item',
          composicao_id: null,
          sinapi_composicao_id: null,
          quantidade,
          preco_unitario_snapshot: preco,
          descricao_snapshot: descricaoImportada || `Item livre ${linha.numero}`,
          codigo_snapshot: codigoLivre,
          unidade_snapshot: unidadeImportada,
        })
        if (insertLivreErro) {
          ignorados++
          erros.push(`Linha ${linha.numero}: erro ao inserir item livre - ${insertLivreErro.message}`)
          continue
        }
        inseridos++
        continue
      }

      if (!codigo) {
        ignorados++
        erros.push(`Linha ${linha.numero}: informe codigo da composicao, tipo subetapa ou descricao do item livre.`)
        continue
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

      const custoUnitarioImportado = Number(linha.valores.custoUnitario ?? linha.valores.valorUnitario ?? 0)
      const custoUnitario = custoUnitarioImportado > 0 ? custoUnitarioImportado : getItemCost(composicao)
      const descricaoSnapshot = String(linha.valores.descricao ?? composicao.descricao)
      const unidadeSnapshot = String(linha.valores.unidade ?? composicao.unidade)
      const { data: itemInserido, error: insertErro } = await supabase.from('orcamento_itens').insert({
        orcamento_id: orcamento.id,
        etapa_id: etapaId,
        subetapa,
        tipo_linha: 'item',
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

      inseridos++
    }

    if (orcamento) await loadItens(orcamento.id)
    return { inseridos, ignorados, erros }
  }

  function handleFinalizar() {
    setShowMenu(false)
    setErroFinalizacao('')
    setShowFinalizarModal(true)
  }

  async function confirmarFinalizacao() {
    if (!orcamento) return
    if (!currentProfile) { setErroFinalizacao('Perfil não identificado.'); return }
    setFinalizando(true)
    try {
      await finalizarOrcamento(supabase, orcamento.id, currentProfile.id)
      await loadOrcamento()
      setShowFinalizarModal(false)
    } catch (error) {
      setErroFinalizacao(`Nao foi possivel iniciar a obra: ${error instanceof Error ? error.message : 'erro inesperado'}`)
    } finally {
      setFinalizando(false)
    }
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
        .insert({ obra_id: resolvedObraId, projeto_id: projetoId || orcamento.projeto_id, tipo: orcamento.tipo, bdi_percentual: orcamento.bdi_percentual, gerenciamento_percentual: orcamento.gerenciamento_percentual, status: 'em_projeto', versao: novaVersao })
        .select().single()
      if (novoOrc) {
        let atualizados = 0
        for (const item of itensOrcamento) {
          let preco = item.preco_unitario_snapshot
          if (atualizarPrecos) {
            const precoAtual = await precoAtualDoItem(item)
            if (precoAtual !== null && precoAtual > 0) { preco = precoAtual; atualizados++ }
          }
          await supabase.from('orcamento_itens').insert({
            orcamento_id: novoOrc.id, etapa_id: item.etapa_id, subetapa: item.subetapa,
            tipo_linha: 'item',
            composicao_id: item.composicao_id, sinapi_composicao_id: item.sinapi_composicao_id,
            quantidade: item.quantidade, preco_unitario_snapshot: preco,
            descricao_snapshot: item.descricao_snapshot, codigo_snapshot: item.codigo_snapshot,
            unidade_snapshot: item.unidade_snapshot,
          })
        }
        for (const meta of subetapasMeta) {
          await supabase.from('orcamento_itens').insert({
            orcamento_id: novoOrc.id,
            etapa_id: meta.etapa_id,
            subetapa: meta.nome,
            tipo_linha: 'subetapa',
            quantidade: 1,
            preco_unitario_snapshot: 0,
            descricao_snapshot: meta.descricao || meta.nome,
            codigo_snapshot: `SUB-${meta.id.slice(0, 8)}`,
            unidade_snapshot: 'VB',
            subetapa_valor_manual: meta.valor_manual,
            subetapa_valor_manual_ativo: meta.ativo,
          })
        }
        setOrcamento(novoOrc)
        await loadItens(novoOrc.id)
        if (atualizarPrecos) {
          alert(atualizados > 0
            ? `Nova versão criada. ${atualizados} de ${itensOrcamento.length} ${itensOrcamento.length === 1 ? 'item teve seu preço atualizado' : 'itens tiveram o preço atualizado'} pela base atual (UF ${obraUf}). Itens sem vínculo direto com a base mantiveram o preço anterior.`
            : `Nova versão criada, mas nenhum item tinha vínculo vivo com a base SINAPI/composições para atualizar — os preços anteriores foram mantidos.`)
        }
      }
    } finally {
      setReabrindo(false)
      setShowReabrirModal(false)
    }
  }

  // ─── Materiais ────────────────────────────────────────────────────────────
  // A expansão orçamento→insumos e a geração de materiais vivem em
  // lib/materiais-sync.ts (fonte única, reaproveitada por ObraMateriais.tsx).

  function mapStatusExecucao(valor: unknown): Etapa['status'] {
    const texto = String(valor ?? '').toLowerCase()
    if (texto.includes('execut')) return 'concluida'
    if (texto.includes('andamento') || texto.includes('execu')) return 'em_andamento'
    if (texto.includes('atras')) return 'atrasada'
    return 'planejada'
  }

  // ─── Sincronizar materiais com o orçamento ─────────────────────────────────
  // Fonte única (lib/materiais-sync.ts), usada também por ObraMateriais.tsx —
  // upsert atômico (ON CONFLICT no banco) por (obra, orçamento, etapa,
  // subetapa estável, código do insumo). Rodar quantas vezes quiser produz
  // sempre o mesmo resultado; nunca mexe em quantidade_comprada/status_compra/
  // data_recebimento (isso é histórico de compra, não necessidade).
  async function sincronizarMateriaisDoOrcamento() {
    if (sincronizandoMateriais || !orcamento || !resolvedObraId) return
    setSincronizandoMateriais(true)
    try {
      const { criados, atualizados } = await sincronizarMateriaisLib(supabase, { obraId: resolvedObraId, orcamentoId: orcamento.id })
      if (criados === 0 && atualizados === 0) {
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
  for (const item of itensOrcamento) {
    const key = item.etapa_id && itensPorEtapa[item.etapa_id] !== undefined ? item.etapa_id : 'sem_etapa'
    itensPorEtapa[key].push(item)
  }
  const subetapasMetaPorEtapa: Record<string, SubetapaMeta[]> = { sem_etapa: [] }
  for (const etapa of etapas) subetapasMetaPorEtapa[etapa.id] = []
  for (const meta of subetapasMeta) {
    const key = meta.etapa_id && subetapasMetaPorEtapa[meta.etapa_id] !== undefined ? meta.etapa_id : 'sem_etapa'
    subetapasMetaPorEtapa[key].push(meta)
  }

  const normBusca = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termoBusca = normBusca(busca.trim())
  const listaFonte = fonte === 'proprias' ? composicoesProprias : fonte === 'insumos' ? insumosCatalogo : sinapiComps
  const listaFiltrada = termoBusca
    ? listaFonte.filter(c =>
        normBusca(fixMojibake(c.descricao)).includes(termoBusca) || normBusca(c.codigo).includes(termoBusca))
    : []
  const nomesEtapasObra = new Set(etapas.map(e => normalizarNomeEtapa(e.nome)))
  const nomesEtapasExibidos = new Set<string>()
  const etapaOptions = [
    ...etapas.map(e => e.nome),
    ...etapasPadrao.filter(n => !nomesEtapasObra.has(normalizarNomeEtapa(n))),
  ].filter(nome => {
    const chave = normalizarNomeEtapa(nome)
    if (!chave || nomesEtapasExibidos.has(chave)) return false
    nomesEtapasExibidos.add(chave)
    return true
  })
  // travado_em (congelamento de preços de insumos) não bloqueia mais edição —
  // a baseline (orcamento_itens_baseline/planejamento_itens_baseline) já
  // preserva a fotografia original ao iniciar a obra, e o orçamento
  // operacional continua editável normalmente depois disso.
  const isReadonly = orcamento?.status === 'finalizado' || orcamento?.status === 'arquivado'
  const etapasVisiveis = filtroEtapaId === 'todas'
    ? etapas
    : etapas.filter(etapa => etapa.id === filtroEtapaId)
  const mostrarSemEtapa = filtroEtapaId === 'todas' || filtroEtapaId === 'sem_etapa'
  const itensFiltradosCount = filtroEtapaId === 'todas'
    ? itensOrcamento.length
    : filtroEtapaId === 'sem_etapa'
      ? itensPorEtapa.sem_etapa.length
      : (itensPorEtapa[filtroEtapaId] || []).length

  // Itens atuais no layout tabular (Etapa, Subetapa, Código, Quantidade) —
  // para exportação/round-trip com a planilha de importação
  const etapaNomePorId: Record<string, string> = {}
  for (const e of etapas) etapaNomePorId[e.id] = e.nome
  const linhasOrcamentoTabular: LinhaOrcamentoTabular[] = [
    ...subetapasMeta.filter(meta => !itensOrcamento.some(item => item.etapa_id === meta.etapa_id && item.subetapa === meta.nome)).map(meta => ({
      tipo: 'subetapa' as const,
      etapa: (meta.etapa_id && etapaNomePorId[meta.etapa_id]) || 'Sem etapa',
      subetapa: meta.nome,
      valorSubetapa: Number(meta.valor_manual || 0),
      composicaoDescricao: '',
    })),
    ...itensOrcamento.flatMap(item => {
      const meta = subetapasMeta.find(sub => sub.etapa_id === item.etapa_id && sub.nome === item.subetapa)
      const comum = {
        tipo: (item.tipo_item_snapshot === 'ITEM_LIVRE' ? 'item_livre' : 'composicao') as 'item_livre' | 'composicao',
        etapa: (item.etapa_id && etapaNomePorId[item.etapa_id]) || 'Sem etapa',
        subetapa: item.subetapa,
        valorSubetapa: Number(meta?.valor_manual || 0),
        composicaoDescricao: item.descricao,
        composicaoGrupo: item.grupo_snapshot || '',
        composicaoUnidade: item.unidade,
        composicaoQuantidade: item.quantidade,
        composicaoValorUnitario: item.preco_unitario_snapshot,
        composicaoValorTotal: getItemTotal(item),
      }
      const insumos = item.composicao_itens || []
      if (!insumos.length) return [comum]
      return insumos.map(insumo => {
        const info = infoDoItem(insumo, obraUf)
        const quantidadeCalculada = insumo.quantidade_calculada != null ? Number(insumo.quantidade_calculada) : item.quantidade * insumo.coeficiente
        const quantidadeAdotada = insumo.quantidade_adotada != null ? Number(insumo.quantidade_adotada) : quantidadeCalculada
        return {
          ...comum,
          insumoDescricao: info.descricao,
          insumoClassificacao: (info.classificacao === 'EQUIPAMENTO' || info.classificacao === 'MAO_DE_OBRA' ? info.classificacao : 'MATERIAL_SERVICOS') as ClassificacaoInsumo,
          insumoGrupo: insumo.grupo_snapshot || '',
          insumoUnidade: info.unidade,
          insumoCoeficiente: insumo.coeficiente,
          insumoQuantidade: quantidadeAdotada,
          insumoValorUnitario: info.preco,
          insumoValorTotal: insumo.valor_total_informado_snapshot != null ? Number(insumo.valor_total_informado_snapshot) : quantidadeAdotada * info.preco,
        }
      })
    }),
  ]
  // Custo de uma composição para exibir no modal de busca
  // Pós-Supabase: calcula via composicao_itens + sinapi_insumos.precos[obraUf]
  const getItemCost = (item: { custo_calculado?: number; custos?: Record<string, number>; custo_unitario?: number; preco_unitario?: number; precos?: Record<string, number> }) =>
    item.precos?.[obraUf] || item.preco_unitario || item.custos?.[obraUf] || item.custo_unitario || item.custo_calculado || 0

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
            {itensOrcamento.length > 0 && (
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
                  {!isReadonly && orcamento?.status !== 'ativo' && (
                    <button onClick={handleFinalizar}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}>
                      <Lock size={13} style={{ color: 'var(--text-secondary)' }} /> Iniciar obra
                    </button>
                  )}
                  {isReadonly && (
                    <button onClick={handleReabrir}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                      style={{ color: 'var(--text-primary)' }}>
                      <Unlock size={13} style={{ color: 'var(--text-secondary)' }} /> Reabrir (nova versão)
                    </button>
                  )}
                  {itensOrcamento.length > 0 && (
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
            <KpiMini label="Composições" value={String(itensOrcamento.length)} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
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
            <CustoCard icon={Wallet} cor="var(--success)" label="Gerenciamento" hint={formatCurrency(totalGerenciamento)}>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" value={gerenciamento}
                  onChange={e => setGerenciamento(Number(e.target.value))}
                  onBlur={handleUpdateGerenciamento}
                  disabled={isReadonly}
                  className="input-base w-14 text-center py-0.5 text-sm"
                  min={0} max={100}
                />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>%</span>
              </div>
            </CustoCard>
            <CustoCard
              icon={Wallet} cor="var(--accent)" label="Total da Obra"
              value={formatCurrency(totalGeral)} hint="Direto + BDI + gerenciamento" highlight
            />
          </div>
        </div>
      </div>

      {/* ── Estrutura da Obra (etapas + composições em cascata) ── */}
      {etapas.length === 0 && itensOrcamento.length === 0 && subetapasMeta.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="Orçamento vazio"
          description="Comece do zero, reaproveite um template salvo ou peça para a Luiza montar a estrutura."
          action={!isReadonly ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button icon={<FolderPlus size={16} />} onClick={() => openItemModal()}>
                Adicionar primeiro item
              </Button>
              <Button variant="secondary" icon={<LayoutTemplate size={16} />} onClick={() => setShowUsarTemplate(true)}>
                Usar template
              </Button>
              <Button
                variant="secondary" icon={<Wand2 size={16} />} onClick={() => setShowEstruturaIA(true)}
                disabled={!resolvedObraId || composicoesProprias.length === 0}
                title={!resolvedObraId ? 'Vincule este orçamento a uma obra para gerar por IA' : composicoesProprias.length === 0 ? 'Cadastre composições próprias primeiro' : 'Gera etapas, subetapas e composições com IA — você revisa antes de aplicar'}
              >
                Gerar estrutura com IA
              </Button>
              <Button
                variant="secondary" icon={<Sparkles size={16} />} onClick={() => setShowAssistente(true)}
                disabled={!resolvedObraId} title={!resolvedObraId ? 'Vincule este orçamento a uma obra para usar a Luiza' : undefined}
              >
                Criar com a Luiza
              </Button>
            </div>
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
                  {(itensPorEtapa.sem_etapa.length > 0 || subetapasMetaPorEtapa.sem_etapa.length > 0) && <option value="sem_etapa">Sem etapa</option>}
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
                  <button
                    onClick={() => setReorderMode(v => !v)}
                    className="sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                    style={reorderMode
                      ? { background: 'var(--accent)', color: 'white' }
                      : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    title="Ativar para arrastar e reordenar etapas, subetapas e itens"
                  >
                    <Move size={13} /> {reorderMode ? 'Concluir' : 'Mover'}
                  </button>
                )}
                {!isReadonly && (
                  <Button size="sm" icon={<FolderPlus size={14} />} onClick={() => openItemModal(filtroEtapaId !== 'todas' && filtroEtapaId !== 'sem_etapa' ? filtroEtapaId : null)}>
                    Adicionar item
                  </Button>
                )}
                {!isReadonly && (
                  <Button size="sm" variant="secondary" icon={<Save size={14} />} onClick={() => setShowSalvarTemplate(true)} title="Salvar a estrutura atual como template reutilizável">
                    Salvar como template
                  </Button>
                )}
                <Button
                  size="sm" variant="secondary" icon={<Wand2 size={14} />} onClick={() => setShowEstruturaIA(true)}
                  disabled={!resolvedObraId || composicoesProprias.length === 0}
                  title={!resolvedObraId ? 'Vincule este orçamento a uma obra para gerar por IA' : composicoesProprias.length === 0 ? 'Cadastre composições próprias primeiro' : 'Gera mais etapas/composições com IA — você revisa antes de aplicar'}
                >
                  Gerar com IA
                </Button>
                <Button
                  size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => setShowAssistente(true)}
                  disabled={!resolvedObraId} title={!resolvedObraId ? 'Vincule este orçamento a uma obra para usar a Luiza' : undefined}
                >
                  Assistente IA
                </Button>
              </div>
            </div>

            {mostrarSemEtapa && (itensPorEtapa.sem_etapa.length > 0 || subetapasMetaPorEtapa.sem_etapa.length > 0) && (
              <GrupoEtapa
                nome="Sem etapa"
                itens={itensPorEtapa.sem_etapa}
                subetapasMeta={subetapasMetaPorEtapa.sem_etapa}
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
                onEditSubetapaValor={(nomeSub, valorAtual) => handleEditSubetapaValor(null, nomeSub, valorAtual)}
                onRestoreSubetapaValor={(nomeSub) => handleRestoreSubetapaValor(null, nomeSub)}
                onRestoreItemValor={handleRestoreItemValor}
                onRestoreInsumoValor={handleRestoreInsumoValor}
                onEditItem={!isReadonly ? openEditItem : undefined}
                onReorderSubetapas={!isReadonly ? (novaOrdem) => handleReorderSubetapas(null, novaOrdem) : undefined}
                onReorderItens={!isReadonly ? handleReorderItens : undefined}
                mobileDragLocked={mobileDragLocked}
              />
            )}
            <SortableList
              items={etapasVisiveis}
              onReorder={handleReorderEtapas}
              disabled={isReadonly || filtroEtapaId !== 'todas' || mobileDragLocked}
            >
              {(etapa, _i, drag) => {
                const itensDaEtapa = itensPorEtapa[etapa.id] || []
                const metasDaEtapa = subetapasMetaPorEtapa[etapa.id] || []
                const { icon, cor } = getEtapaIcone(etapa.nome)
                return (
                  <div key={etapa.id} ref={drag.setNodeRef as React.Ref<HTMLDivElement>} style={drag.style}>
                    <GrupoEtapa
                      nome={etapa.nome}
                      dragHandle={drag.handle}
                      itens={itensDaEtapa}
                      subetapasMeta={metasDaEtapa}
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
                      onEditSubetapaValor={!isReadonly ? (nomeSub, valorAtual) => handleEditSubetapaValor(etapa.id, nomeSub, valorAtual) : undefined}
                      onRestoreSubetapaValor={!isReadonly ? (nomeSub) => handleRestoreSubetapaValor(etapa.id, nomeSub) : undefined}
                      onRestoreItemValor={!isReadonly ? handleRestoreItemValor : undefined}
                      onRestoreInsumoValor={!isReadonly ? handleRestoreInsumoValor : undefined}
                      onEditItem={!isReadonly ? openEditItem : undefined}
                      onReorderSubetapas={!isReadonly ? (novaOrdem) => handleReorderSubetapas(etapa.id, novaOrdem) : undefined}
                      onReorderItens={!isReadonly ? handleReorderItens : undefined}
                      mobileDragLocked={mobileDragLocked}
                      menuAberto={etapaMenuAberto === etapa.id}
                      onToggleMenu={() => setEtapaMenuAberto(v => v === etapa.id ? null : etapa.id)}
                      menuRef={etapaMenuAberto === etapa.id ? etapaMenuRef : undefined}
                    />
                  </div>
                )
              }}
            </SortableList>

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
            const sugestoes = etapasPadrao.filter(n => !nomesExistentes.has(n.toLowerCase()))
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
        onClose={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade(''); setBusca(''); setSubetapaLivre(''); setSubetapaDescricao(''); setSubetapaValor(''); setSubetapaCategoria(''); setLivreDescricao(''); setLivrePreco(''); setLivreClassificacao('MATERIAL_SERVICOS'); setLivreGrupo(''); setItensPendentes([]) }}
        title="Adicionar item"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,0.9fr)_minmax(220px,1.2fr)_150px] gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
              <div className="flex gap-1.5">
                <select value={selectedEtapaNome} onChange={e => setSelectedEtapaNome(e.target.value)} className="input-base flex-1">
                  {etapaOptions.map(etapa => <option key={normalizarNomeEtapa(etapa)} value={etapa}>{etapa}</option>)}
                </select>
                <button type="button" onClick={() => { setShowAddItem(false); setShowNovaEtapa(true) }}
                  className="px-2 rounded-lg text-xs font-medium flex-shrink-0"
                  style={{ background: 'var(--accent)', color: 'white' }} title="Criar nova etapa">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <Input
              label="Subetapa / complemento (opcional)"
              value={subetapaLivre}
              onChange={e => setSubetapaLivre(e.target.value)}
              placeholder="Ex: Baldrames, térreo, bloco A..."
            />            <Input
              label="Valor da subetapa (opcional)"
              type="text"
              inputMode="decimal"
              value={subetapaValor}
              onChange={e => setSubetapaValor(e.target.value)}
              onBlur={() => setSubetapaValor(formatCurrencyInput(subetapaValor))}
              placeholder="R$ 0,00"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <Input
              label="Descrição da subetapa (opcional)"
              value={subetapaDescricao}
              onChange={e => setSubetapaDescricao(e.target.value)}
              placeholder="Detalhe resumido da subetapa"
            />
            <Input
              label="Categoria da subetapa (opcional)"
              value={subetapaCategoria}
              onChange={e => setSubetapaCategoria(e.target.value)}
              placeholder="Ex: Estrutura"
            />
          </div>

          {itensPendentes.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
                Itens do lancamento
              </div>
              <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
                {itensPendentes.map((draft, idx) => (
                  <div key={draft.id} className="grid grid-cols-2 lg:grid-cols-[32px_minmax(190px,1fr)_minmax(130px,0.65fr)_150px_72px_88px_125px_92px_44px] gap-2 p-3 items-end">
                    <div className="hidden lg:flex h-9 items-center justify-center rounded-lg text-xs font-semibold" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                      {idx + 1}
                    </div>
                    <div className="col-span-2 lg:col-span-1"><Input label="Descrição" value={draft.descricao} onChange={e => updateItemPendente(draft.id, { descricao: e.target.value })} /></div>
                    <Input label="Grupo" value={draft.grupo} onChange={e => updateItemPendente(draft.id, { grupo: e.target.value })} placeholder="Opcional" />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-[var(--text-secondary)]">Classificação</label>
                      <select value={draft.classificacao || ''} onChange={e => updateItemPendente(draft.id, { classificacao: (e.target.value || null) as ClassificacaoInsumo | null })} className="input-base h-10">
                        <option value="">Não se aplica</option>
                        {CLASSIFICACOES_INSUMO.map(opcao => <option key={opcao.value} value={opcao.value}>{opcao.label}</option>)}
                      </select>
                    </div>
                    <Input label="Un." value={draft.unidade} onChange={e => updateItemPendente(draft.id, { unidade: e.target.value || 'UN' })} />
                    <Input label="Qtd." type="number" value={String(draft.quantidade)} onChange={e => updateItemPendente(draft.id, { quantidade: parseQuantityInput(e.target.value) })} />
                    <Input
                      label="Valor unit."
                      type="text"
                      inputMode="decimal"
                      value={draft.preco ? draft.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}
                      onChange={e => updateItemPendente(draft.id, { preco: parseDecimalInput(e.target.value) })}
                      placeholder="R$ 0,00"
                    />
                    <div className="rounded-lg border px-3 py-2 h-10 flex items-center justify-end text-sm font-semibold tabular-nums" style={{ borderColor: 'var(--border)', color: 'var(--accent)', background: 'var(--bg-card)' }}>
                      {formatCurrency(draft.preco * draft.quantidade)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setItensPendentes(prev => prev.filter(i => i.id !== draft.id))}
                      className="h-10 rounded-lg px-3 inline-flex items-center justify-center gap-2 text-xs font-medium transition-colors hover:bg-[rgba(239,68,68,0.12)]"
                      style={{ color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.35)' }}
                      title="Remover linha"
                    >
                      <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                      <span className="lg:hidden xl:inline">Excluir</span>
                    </button>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 text-right text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
                Total dos itens: <strong style={{ color: 'var(--accent)' }}>{formatCurrency(itensPendentes.reduce((sum, item) => sum + item.preco * item.quantidade, 0))}</strong>
              </div>
            </div>
          )}


          <div className="flex gap-1 p-1 rounded-xl w-fit max-w-full overflow-x-auto" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {([['proprias', 'Composições Próprias'], ['insumos', 'Insumos'], ['sinapi', 'Referência SINAPI'], ['livre', 'Item livre']] as [FonteBusca, string][]).map(([id, label]) => (
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
              placeholder={fonte === 'proprias' ? 'Buscar composição...' : fonte === 'insumos' ? 'Buscar insumo no banco...' : 'Buscar na tabela SINAPI...'}
              className="input-base input-search" autoFocus
            />
          </div>}

          {fonte === 'livre' ? (
            <div className="p-3 rounded-xl flex flex-col gap-3" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.25)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,1fr)_110px_150px] gap-3">
                <Input label="Descrição do item/insumo" value={livreDescricao} onChange={e => setLivreDescricao(e.target.value)} placeholder="Ex: Projeto, cimento, frete..." />
                <Input label="Unidade" value={livreUnidade} onChange={e => setLivreUnidade(e.target.value)} placeholder="UN" />
                <Input
                  label="Valor unitario"
                  type="text"
                  inputMode="decimal"
                  value={livrePreco}
                  onChange={e => setLivrePreco(e.target.value)}
                  onBlur={() => setLivrePreco(formatCurrencyInput(livrePreco))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[200px_minmax(180px,1fr)_100px_auto] gap-3 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text-secondary)]">Classificação *</label>
                  <select value={livreClassificacao} onChange={e => setLivreClassificacao(e.target.value as ClassificacaoInsumo)} className="input-base h-10" required>
                    {CLASSIFICACOES_INSUMO.map(opcao => <option key={opcao.value} value={opcao.value}>{opcao.label}</option>)}
                  </select>
                </div>
                <Input label="Grupo" value={livreGrupo} onChange={e => setLivreGrupo(e.target.value)} placeholder="Ex: Alvenaria, fretes..." />
                <Input label={`Qtd. (${livreUnidade || 'UN'})`} type="number" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0" min={0} />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" icon={<Plus size={13} />} loading={saving} disabled={!draftAtual()} onClick={handleMaisCampos} title="Adicionar esta linha e continuar lançando mais itens">
                    Mais um item
                  </Button>
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
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Insumos da composicao</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-3 items-end">
                  <div>
                    <Input
                      ref={qtdInputRef}
                      label={`Qtd. (${selectedItem.unidade})`}
                      type="number" value={quantidade}
                      onChange={e => setQuantidade(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && quantidade && handleMaisCampos()}
                      placeholder="0" min={0}
                    />
                  </div>
                  <div className="flex gap-2 pb-0.5">
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedItem(null); setQuantidade('') }}>Limpar</Button>
                    <Button variant="secondary" size="sm" icon={<Plus size={13} />} loading={saving} disabled={!draftAtual()} onClick={handleMaisCampos} title="Adicionar esta linha e continuar lançando mais itens">
                    Mais um item
                  </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
              {!termoBusca ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                  {fonte === 'insumos' ? 'Digite para buscar insumos.' : 'Digite para buscar composições.'}
                </p>
              ) : listaFiltrada.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                  {fonte === 'proprias' ? 'Nenhuma composição própria encontrada.' : fonte === 'insumos' ? 'Nenhum insumo encontrado.' : 'Nenhuma composição SINAPI encontrada.'}
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

          <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" size="sm" onClick={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade('') }}>
              Fechar
            </Button>
            <Button
              size="sm"
              loading={saving}
              disabled={!itemAtualValido() && itensPendentes.length === 0 && !(selectedEtapaNome.trim() && subetapaLivre.trim() && subetapaValor.trim())}
              onClick={handleInserirItens}
            >
              Inserir
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!hierarquiaDialog}
        onClose={() => !salvandoHierarquia && setHierarquiaDialog(null)}
        title={hierarquiaDialog?.tipo === 'renomear-etapa'
          ? 'Editar etapa'
          : hierarquiaDialog?.tipo === 'renomear-subetapa'
            ? 'Editar subetapa'
            : hierarquiaDialog?.tipo === 'editar-valor'
              ? 'Editar valor da subetapa'
              : hierarquiaDialog?.tipo === 'excluir-etapa'
                ? 'Excluir etapa'
                : 'Excluir subetapa'}
        size="sm"
      >
        {hierarquiaDialog && (
          <div className="flex flex-col gap-4">
            {(hierarquiaDialog.tipo === 'renomear-etapa' || hierarquiaDialog.tipo === 'renomear-subetapa') && (
              <Input
                label={hierarquiaDialog.tipo === 'renomear-etapa' ? 'Nome da etapa' : 'Nome da subetapa'}
                value={hierarquiaDialog.valor}
                onChange={event => setHierarquiaDialog(prev => prev ? { ...prev, valor: event.target.value } : prev)}
                onKeyDown={event => { if (event.key === 'Enter') salvarHierarquia() }}
                autoFocus
              />
            )}

            {hierarquiaDialog.tipo === 'editar-valor' && (
              <Input
                label={`Valor de ${hierarquiaDialog.nomeAtual}`}
                value={hierarquiaDialog.valor}
                onChange={event => setHierarquiaDialog(prev => prev ? { ...prev, valor: event.target.value } : prev)}
                onBlur={() => setHierarquiaDialog(prev => prev ? { ...prev, valor: formatCurrencyInput(prev.valor) || 'R$ 0,00' } : prev)}
                onKeyDown={event => { if (event.key === 'Enter') salvarHierarquia() }}
                inputMode="decimal"
                placeholder="R$ 0,00"
                autoFocus
              />
            )}

            {(hierarquiaDialog.tipo === 'excluir-etapa' || hierarquiaDialog.tipo === 'excluir-subetapa') && (
              <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Excluir {hierarquiaDialog.tipo === 'excluir-etapa' ? 'a etapa' : 'a subetapa'} &quot;{hierarquiaDialog.nomeAtual}&quot;?
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {hierarquiaDialog.quantidadeItens
                    ? `${hierarquiaDialog.quantidadeItens} item(ns) vinculado(s) tambem serao excluidos.`
                    : 'Esta acao nao pode ser desfeita.'}
                </p>
              </div>
            )}

            {erroHierarquia && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>
                {erroHierarquia}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" disabled={salvandoHierarquia} onClick={() => setHierarquiaDialog(null)}>
                Cancelar
              </Button>
              <Button
                variant={hierarquiaDialog.tipo.startsWith('excluir') ? 'danger' : 'primary'}
                loading={salvandoHierarquia}
                disabled={!hierarquiaDialog.tipo.startsWith('excluir') && !hierarquiaDialog.valor.trim()}
                onClick={salvarHierarquia}
              >
                {hierarquiaDialog.tipo.startsWith('excluir') ? 'Excluir' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showFinalizarModal}
        onClose={() => !finalizando && setShowFinalizarModal(false)}
        title="Iniciar obra por este orçamento"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Os preços, nomes e insumos deste orçamento serão congelados. Ele será vinculado à obra e passará a alimentar execução física, mão de obra, compras, financeiro e Portal. Os demais orçamentos permanecem independentes.
          </p>
          {erroFinalizacao && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}>
              {erroFinalizacao}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={finalizando} onClick={() => setShowFinalizarModal(false)}>Cancelar</Button>
            <Button loading={finalizando} onClick={confirmarFinalizacao}>Iniciar obra</Button>
          </div>
        </div>
      </Modal>

      {/* Reabrir orçamento finalizado — escolher se mantém preços congelados ou atualiza pela base */}
      <Modal open={showReabrirModal} onClose={() => !reabrindo && setShowReabrirModal(false)} title="Reabrir orçamento" size="md">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Isso cria a <strong>versão {orcamento ? orcamento.versao + 1 : ''}</strong> como orçamento em projeto e editável.
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

      <SalvarTemplateOrcamentoModal
        open={showSalvarTemplate}
        onClose={() => setShowSalvarTemplate(false)}
        itens={itens}
        etapas={etapas}
      />

      <UsarTemplateOrcamentoModal
        open={showUsarTemplate}
        onClose={() => setShowUsarTemplate(false)}
        obraId={resolvedObraId || ''}
        orcamentoId={orcamento.id}
        onApplied={() => loadAll()}
      />

      <ObraAssistenteDock
        open={showAssistente}
        onClose={() => setShowAssistente(false)}
        obraId={resolvedObraId || ''}
        obraNome={obraName || 'Obra'}
        obraUf={obraUf}
      />

      <OrcamentoEstruturaIAModal
        open={showEstruturaIA}
        onClose={() => setShowEstruturaIA(false)}
        obraId={resolvedObraId || ''}
        obraName={obraName || 'Obra'}
        orcamentoId={orcamento.id}
        composicoesProprias={composicoesProprias}
        onApplied={() => loadAll()}
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
  nome, dragHandle, itens, subetapasMeta = [], isReadonly, collapsed, onToggleGrupo, onAddItem, onRemove, bdi,
  onUpdateQuantidade, expandedItems, onToggleItem, insumoOverrides, onOverrideInsumo, getItemTotal,
  obraUf, icon: Icon, iconCor, subtotalDireto,
  onDeleteEtapa, onRenameEtapa, onAddItemToSubetapa, onAddInsumoToItem, onRenameSubetapa, onDeleteSubetapa, onEditSubetapaValor, onRestoreSubetapaValor, onRestoreItemValor, onRestoreInsumoValor, onEditItem, menuAberto, onToggleMenu, menuRef,
  onReorderSubetapas, onReorderItens, mobileDragLocked,
}: {
  nome: string
  dragHandle?: React.ReactNode
  itens: ItemEnriquecido[]
  subetapasMeta?: SubetapaMeta[]
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
  onEditSubetapaValor?: (nome: string, valorAtual: number) => void
  onRestoreSubetapaValor?: (nome: string) => void
  onRestoreItemValor?: (itemId: string) => void
  onRestoreInsumoValor?: (insumoId: string) => void
  onEditItem?: (item: ItemEnriquecido) => void
  menuAberto?: boolean
  onToggleMenu?: () => void
  menuRef?: React.RefObject<HTMLDivElement | null>
  onReorderSubetapas?: (novaOrdemNomes: string[]) => void
  onReorderItens?: (novaOrdemIds: string[]) => void
  mobileDragLocked?: boolean
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

  const gruposSubetapa = itens.reduce<{ nome: string; key: string; itens: ItemEnriquecido[]; meta?: SubetapaMeta }[]>((acc, item) => {
    const nomeSub = item.subetapa?.trim() || 'Sem subetapa'
    const key = nomeSub.toLowerCase()
    let grupo = acc.find(g => g.key === key)
    if (!grupo) {
      grupo = { nome: nomeSub, key, itens: [] }
      acc.push(grupo)
    }
    grupo.itens.push(item)
    return acc
  }, subetapasMeta.map(meta => ({ nome: meta.nome, key: meta.nome.toLowerCase(), itens: [], meta })))
  // "ordem" só é única DENTRO de cada subetapa (e dentro das metas de uma etapa) —
  // por isso a ordenação precisa acontecer aqui, agrupada, e não na query do banco.
  gruposSubetapa.sort((a, b) => (a.meta?.ordem ?? Infinity) - (b.meta?.ordem ?? Infinity))
  gruposSubetapa.forEach(grupo => grupo.itens.sort((a, b) => (a.ordem ?? Infinity) - (b.ordem ?? Infinity)))
  const subtotalGrupo = gruposSubetapa.reduce((acc, grupo) => {
    const calculado = grupo.itens.reduce((sum, item) => sum + getItemTotal(item), 0)
    return acc + (grupo.meta?.ativo ? Number(grupo.meta.valor_manual || 0) : calculado)
  }, 0)
  const totalGrupo = subtotalGrupo * (1 + bdi / 100)
  const pctDoDireto = subtotalDireto && subtotalDireto > 0 ? (subtotalGrupo / subtotalDireto) * 100 : null

  function parseQuantidadeInput(value: string) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return (
    <div className="card overflow-hidden">
      {/* Cabeçalho etapa */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={onToggleGrupo}
      >
        {dragHandle}
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        {Icon && (
          <span className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0" style={{ background: 'var(--bg-card)', color: iconCor || 'var(--text-secondary)' }}>
            <Icon size={14} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{nome}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {itens.length} {itens.length === 1 ? 'composição' : 'composições'}
            <span className="sm:hidden font-semibold" style={{ color: 'var(--accent)' }}> · {formatCurrency(totalGrupo)}</span>
          </p>
        </div>
        {pctDoDireto !== null && (
          <span className="hidden sm:inline text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {pctDoDireto.toFixed(1)}% do direto
          </span>
        )}
        <span className="hidden sm:inline text-sm font-semibold ml-1 flex-shrink-0" style={{ color: 'var(--accent)' }}>
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
              aria-label={`Acoes da etapa ${nome}`}
              title="Acoes da etapa"
            >
              <MoreVertical size={15} />
            </button>
            {menuAberto && (
              <div className="fixed inset-x-4 bottom-4 z-[120] rounded-xl py-1.5 shadow-lg animate-enter sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-44"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                {onRenameEtapa && (
                  <button onClick={() => { onToggleMenu?.(); onRenameEtapa() }}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}>
                    <Pencil size={13} /> Renomear etapa
                  </button>
                )}
                <button onClick={() => { onToggleMenu?.(); onDeleteEtapa() }}
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
          {gruposSubetapa.length === 0 ? (
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
              <table className="w-full min-w-[860px] border-collapse text-xs">
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
                  <SortableList
                    items={gruposSubetapa.map(g => ({ ...g, id: g.key }))}
                    disabled={!onReorderSubetapas || mobileDragLocked}
                    onReorder={novaOrdem => onReorderSubetapas?.(novaOrdem.map(g => g.nome))}
                  >
                  {(grupo, _i, dragSub) => {
                    const subFechada = subetapasFechadas[grupo.key] ?? false
                    const subtotalCalculado = grupo.itens.reduce((acc, item) => acc + getItemTotal(item), 0)
                    const subtotalSubetapa = grupo.meta?.ativo ? Number(grupo.meta.valor_manual || 0) : subtotalCalculado
                    const valorManualComComposicoes = Boolean(grupo.meta?.ativo && grupo.itens.length > 0)

                    return (
                      <Fragment key={grupo.key}>
                        <tr ref={dragSub.setNodeRef as React.Ref<HTMLTableRowElement>} style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))', borderBottom: '1px solid var(--border)', ...dragSub.style }}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-0.5">
                              {dragSub.handle}
                              <button
                                type="button"
                                onClick={() => setSubetapasFechadas(prev => ({ ...prev, [grupo.key]: !subFechada }))}
                                className="p-1 rounded hover:bg-[var(--bg-card)]"
                                style={{ color: 'var(--text-secondary)' }}
                              >
                                {subFechada ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                              </button>
                            </div>
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
                          <td className="px-3 py-2 text-right font-semibold" style={{ color: valorManualComComposicoes ? 'var(--danger)' : 'var(--accent)' }}>
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{formatCurrency(subtotalSubetapa)}</span>
                              {!isReadonly && onEditSubetapaValor && (
                                <button type="button" onClick={e => { e.stopPropagation(); onEditSubetapaValor(grupo.nome, subtotalSubetapa) }} className="p-1 rounded hover:bg-[var(--bg-card)]" title="Editar valor da subetapa">
                                  <Pencil size={12} />
                                </button>
                              )}
                              {valorManualComComposicoes && !isReadonly && onRestoreSubetapaValor && (
                                <button type="button" onClick={e => { e.stopPropagation(); onRestoreSubetapaValor(grupo.nome) }} className="p-1 rounded-full hover:bg-[var(--bg-card)]" title="Restaurar valor calculado">
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </div>
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
                                  <div className="fixed inset-x-4 bottom-4 z-[120] rounded-xl py-1.5 shadow-lg animate-enter sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-52"
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
                                    {onEditSubetapaValor && (
                                      <button onClick={() => { setSubMenuAberto(null); onEditSubetapaValor(grupo.nome, subtotalSubetapa) }}
                                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                        style={{ color: 'var(--text-primary)' }}>
                                        <Wallet size={13} /> Editar valor
                                      </button>
                                    )}
                                    {valorManualComComposicoes && onRestoreSubetapaValor && (
                                      <button onClick={() => { setSubMenuAberto(null); onRestoreSubetapaValor(grupo.nome) }}
                                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                        style={{ color: 'var(--text-primary)' }}>
                                        <RotateCcw size={13} /> Restaurar calculado
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

                        {!subFechada && (
                        <SortableList
                          items={grupo.itens}
                          disabled={!onReorderItens || mobileDragLocked}
                          onReorder={novaOrdem => onReorderItens?.(novaOrdem.map(it => it.id))}
                        >
                        {(item, _j, dragItem) => {
                          const hasInsumos = (item.composicao_itens?.length || 0) > 0
                          const isExpanded = expandedItems[item.id] || false
                          const itemTotal = getItemTotal(item)
                          const hasOverride = (item.composicao_itens || []).some(ins => {
                            const info = infoDoItem(ins, obraUf)
                            return insumoOverrides[overrideKey(item.id, info.codigo !== '\u2014' ? info.codigo : ins.id)] !== undefined
                          })
                          const hasValueMismatch = Boolean(item.valor_total_manual_ativo)

                          return (
                            <Fragment key={item.id}>
                              <tr ref={dragItem.setNodeRef as React.Ref<HTMLTableRowElement>} className="transition-colors hover:bg-[var(--bg-secondary)]" style={{ borderBottom: '1px solid var(--border)', ...dragItem.style }}>
                                <td className="px-3 py-2 align-top">
                                  <div className="flex items-center gap-0.5">
                                    {dragItem.handle}
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
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top" style={{ color: 'var(--text-primary)' }}>
                                  <span className="truncate block">{item.descricao}</span>
                                </td>
                                <td className="px-3 py-2 align-top text-center" style={{ color: 'var(--text-secondary)' }}>{item.unidade}</td>
                                <td className="px-3 py-2 align-top text-center">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    defaultValue={item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                    className="input-base input-compact text-center tabular-nums"
                                    style={{ width: 64, color: 'var(--text-primary)' }}
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
                                <td className="px-3 py-2 align-top text-right font-semibold tabular-nums" style={{ color: hasValueMismatch ? 'var(--danger)' : hasOverride ? 'var(--warning)' : 'var(--text-primary)' }}>
                                  <div className="flex items-center justify-end gap-1">
                                    <span title={hasValueMismatch ? item.importacao_alertas?.join(' ') : undefined}>{formatCurrency(itemTotal)}</span>
                                    {hasValueMismatch && !isReadonly && onRestoreItemValor && (
                                      <button type="button" onClick={() => onRestoreItemValor(item.id)} className="p-1 rounded-full hover:bg-[var(--bg-secondary)]" title="Usar soma calculada dos insumos">
                                        <RotateCcw size={11} />
                                      </button>
                                    )}
                                  </div>
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
                                        <div className="fixed inset-x-4 bottom-4 z-[120] rounded-xl py-1.5 shadow-lg animate-enter sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-52"
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
                                            const qtdCalculada = ins.quantidade_calculada != null ? Number(ins.quantidade_calculada) : item.quantidade * ins.coeficiente
                                            const qtdAdotada = insumoOverrides[key] ?? (ins.quantidade_adotada != null ? Number(ins.quantidade_adotada) : qtdCalculada)
                                            const preco = info.preco
                                            const totalIns = qtdAdotada * preco
                                            const isOverridden = insumoOverrides[key] !== undefined
                                            const totalDivergente = Boolean(ins.valor_total_divergente)
                                            const totalExibido = totalDivergente && ins.valor_total_informado_snapshot != null ? Number(ins.valor_total_informado_snapshot) : totalIns

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
                                                      className="input-base input-compact text-center tabular-nums"
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
                                                <td className="px-3 py-2 text-right font-semibold" style={{ color: totalDivergente ? 'var(--danger)' : isOverridden ? 'var(--warning)' : 'var(--text-primary)' }}>
                                                  <div className="flex items-center justify-end gap-1">
                                                    <span>{totalExibido > 0 ? formatCurrency(totalExibido) : '-'}</span>
                                                    {totalDivergente && !isReadonly && onRestoreInsumoValor && (
                                                      <button type="button" onClick={() => onRestoreInsumoValor(ins.id)} className="p-1 rounded-full" title="Usar quantidade × valor unitário"><RotateCcw size={10} /></button>
                                                    )}
                                                  </div>
                                                </td>
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
                        }}
                        </SortableList>
                        )}
                      </Fragment>
                    )
                  }}
                  </SortableList>
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:hidden">
              <SortableList
                items={gruposSubetapa.map(g => ({ ...g, id: g.key }))}
                disabled={!onReorderSubetapas || mobileDragLocked}
                onReorder={novaOrdem => onReorderSubetapas?.(novaOrdem.map(g => g.nome))}
              >
              {(grupo, _i, dragSub) => {
                const subFechada = subetapasFechadas[grupo.key] ?? false
                const subtotalCalculado = grupo.itens.reduce((acc, item) => acc + getItemTotal(item), 0)
                const subtotalSubetapa = grupo.meta?.ativo ? Number(grupo.meta.valor_manual || 0) : subtotalCalculado
                const valorManualComComposicoes = Boolean(grupo.meta?.ativo && grupo.itens.length > 0)

                return (
                  <section key={grupo.key} ref={dragSub.setNodeRef as React.Ref<HTMLElement>} className="border-b last:border-b-0" style={{ borderColor: 'color-mix(in srgb, var(--border) 70%, transparent)', ...dragSub.style }}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-secondary)] cursor-pointer"
                      onClick={() => setSubetapasFechadas(prev => ({ ...prev, [grupo.key]: !subFechada }))}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSubetapasFechadas(prev => ({ ...prev, [grupo.key]: !subFechada })) } }}
                    >
                      {dragSub.handle}
                      <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {subFechada ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug truncate" style={{ color: 'var(--text-primary)' }}>{grupo.nome}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
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
                      <span className="flex-shrink-0 text-right">
                        <span className="block text-sm font-bold tabular-nums" style={{ color: valorManualComComposicoes ? 'var(--danger)' : 'var(--accent)' }}>{formatCurrency(subtotalSubetapa)}</span>
                      </span>
                      {!isReadonly && (onDeleteSubetapa || onAddItemToSubetapa || onRenameSubetapa) && (
                        <span className="relative flex-shrink-0" data-submenu-container onClick={e => e.stopPropagation()}>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => setSubMenuAberto(v => v === grupo.key ? null : grupo.key)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--bg-card)]"
                            title="Ações da subetapa"
                          >
                            <MoreVertical size={14} style={{ color: 'var(--text-secondary)' }} />
                          </span>
                          {subMenuAberto === grupo.key && (
                            <span className="fixed inset-x-4 bottom-4 z-[120] rounded-xl py-1.5 shadow-lg animate-enter text-left"
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
                              {onEditSubetapaValor && (
                                <span role="button" tabIndex={0} onClick={() => { setSubMenuAberto(null); onEditSubetapaValor(grupo.nome, subtotalSubetapa) }}
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                  style={{ color: 'var(--text-primary)' }}>
                                  <Wallet size={13} /> Editar valor
                                </span>
                              )}
                              {valorManualComComposicoes && onRestoreSubetapaValor && (
                                <span role="button" tabIndex={0} onClick={() => { setSubMenuAberto(null); onRestoreSubetapaValor(grupo.nome) }}
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                                  style={{ color: 'var(--text-primary)' }}>
                                  <RotateCcw size={13} /> Restaurar calculado
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
                    </div>

                    {!subFechada && (
                      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        <SortableList
                          items={grupo.itens}
                          disabled={!onReorderItens || mobileDragLocked}
                          onReorder={novaOrdem => onReorderItens?.(novaOrdem.map(it => it.id))}
                        >
                        {(item, _j, dragItem) => {
                          const hasInsumos = (item.composicao_itens?.length || 0) > 0
                          const isExpanded = expandedItems[item.id] || false
                          const itemTotal = getItemTotal(item)
                          const hasOverride = (item.composicao_itens || []).some(ins => {
                            const info = infoDoItem(ins, obraUf)
                            return insumoOverrides[overrideKey(item.id, info.codigo !== '\u2014' ? info.codigo : ins.id)] !== undefined
                          })
                          const hasValueMismatch = Boolean(item.valor_total_manual_ativo)

                          return (
                            <div key={item.id} ref={dragItem.setNodeRef as React.Ref<HTMLDivElement>} className="px-3 py-2.5" style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 45%, transparent)', ...dragItem.style }}>
                              <div
                                role={hasInsumos ? 'button' : undefined}
                                tabIndex={hasInsumos ? 0 : undefined}
                                className="flex items-start gap-2"
                                style={{ cursor: hasInsumos ? 'pointer' : 'default' }}
                                onClick={() => hasInsumos && onToggleItem(item.id)}
                                onKeyDown={e => {
                                  if (!hasInsumos) return
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onToggleItem(item.id)
                                  }
                                }}
                              >
                                {dragItem.handle}
                                {hasInsumos ? (
                                  <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }}>
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </span>
                                ) : (
                                  <span className="flex-shrink-0" style={{ width: 14 }} />
                                )}

                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium leading-snug truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</p>
                                  <div className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }} onClick={e => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                      className="input-base input-compact text-center tabular-nums"
                                      style={{ width: 46, color: 'var(--text-primary)' }}
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
                                    <span className="flex-shrink-0">{item.unidade}</span>
                                    <span style={{ opacity: 0.5 }}>·</span>
                                    <span className="tabular-nums truncate">{formatCurrency(item.preco_unitario_snapshot)}</span>
                                    {hasInsumos && <span className="flex-shrink-0" style={{ opacity: 0.6 }}>· {item.composicao_itens?.length} insumos</span>}
                                  </div>
                                </div>

                                <div className="flex-shrink-0 flex items-center gap-1">
                                  <span className="flex items-center gap-1 text-sm font-semibold tabular-nums" style={{ color: hasValueMismatch ? 'var(--danger)' : hasOverride ? 'var(--warning)' : 'var(--text-primary)' }}>
                                    {formatCurrency(itemTotal)}
                                    {hasValueMismatch && !isReadonly && onRestoreItemValor && (
                                      <button type="button" onClick={e => { e.stopPropagation(); onRestoreItemValor(item.id) }} className="p-0.5 rounded-full" title="Usar soma calculada dos insumos"><RotateCcw size={11} /></button>
                                    )}
                                  </span>
                                  {!isReadonly && (
                                    <span className="relative inline-flex flex-shrink-0" data-itemmenu-container onClick={e => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => setItemMenuAberto(v => v === item.id ? null : item.id)}
                                        className="flex h-6 w-6 items-center justify-center rounded hover:bg-[var(--bg-secondary)] transition-colors"
                                        aria-label="Ações da composição"
                                        title="Ações da composição"
                                      >
                                        <MoreVertical size={14} style={{ color: 'var(--text-secondary)' }} />
                                      </button>
                                      {itemMenuAberto === item.id && (
                                        <span className="fixed inset-x-4 bottom-4 z-[120] rounded-xl py-1.5 shadow-lg animate-enter text-left"
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

                              {isExpanded && hasInsumos && (
                                <div className="mt-2 ml-[22px] rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                                  <div className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                    Insumos
                                  </div>
                                  <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                    {item.composicao_itens!.map(ins => {
                                      const info = infoDoItem(ins, obraUf)
                                      const insumoKey = info.codigo !== '\u2014' ? info.codigo : ins.id
                                      const key = overrideKey(item.id, insumoKey)
                                      const qtdCalculada = ins.quantidade_calculada != null ? Number(ins.quantidade_calculada) : item.quantidade * ins.coeficiente
                                      const qtdAdotada = insumoOverrides[key] ?? (ins.quantidade_adotada != null ? Number(ins.quantidade_adotada) : qtdCalculada)
                                      const preco = info.preco
                                      const totalIns = qtdAdotada * preco
                                      const isOverridden = insumoOverrides[key] !== undefined
                                      const totalDivergente = Boolean(ins.valor_total_divergente)
                                      const totalExibido = totalDivergente && ins.valor_total_informado_snapshot != null ? Number(ins.valor_total_informado_snapshot) : totalIns

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
                                            <span className="font-semibold flex items-center gap-1" style={{ color: totalDivergente ? 'var(--danger)' : isOverridden ? 'var(--warning)' : 'var(--text-secondary)' }}>
                                              {totalExibido > 0 ? formatCurrency(totalExibido) : '-'}
                                              {totalDivergente && !isReadonly && onRestoreInsumoValor && (
                                                <button type="button" onClick={e => { e.stopPropagation(); onRestoreInsumoValor(ins.id) }} className="p-0.5 rounded-full" title="Usar quantidade × valor unitário"><RotateCcw size={10} /></button>
                                              )}
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
                                                className="input-base input-compact text-center tabular-nums"
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
                        }}
                        </SortableList>
                      </div>
                    )}
                  </section>
                )
              }}
              </SortableList>
            </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
