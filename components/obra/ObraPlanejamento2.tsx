'use client'

import { Fragment, useEffect, useState, useRef, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, CalendarRange, CalendarClock, LineChart, AlertCircle,
  CheckSquare, Square, Loader2, Link2, Check,
  Table2, GanttChartSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, PlanejamentoItem, PlanejamentoDependencia, PlanejamentoStatus } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ObraPrevisoes } from '@/components/obra/ObraPrevisoes'
import { ObraCurvaS } from '@/components/obra/ObraCurvaS'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PlanejamentoStatus, string> = {
  nao_iniciado: 'Não Iniciado',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  atrasado: 'Atrasado',
  suspenso: 'Suspenso',
}

const STATUS_COLORS: Record<PlanejamentoStatus, { bg: string; text: string }> = {
  nao_iniciado: { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' },
  em_andamento: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
  concluido: { bg: 'rgba(16,185,129,0.15)', text: '#34D399' },
  atrasado: { bg: 'rgba(239,68,68,0.15)', text: '#F87171' },
  suspenso: { bg: 'rgba(245,158,11,0.15)', text: '#FBBF24' },
}

// ─── Local types ──────────────────────────────────────────────────────────────

type OrcItem = {
  id: string
  etapa_id: string | null
  subetapa: string | null
  tipo_linha: string
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  quantidade: number
  preco_unitario_snapshot: number
}

type TreeNode = {
  key: string
  level: 0 | 1 | 2
  codigo: string
  descricao: string
  refTipo: 'etapa' | 'subetapa' | 'item'
  etapaId: string | null
  subetapaKey: string | null
  orcItemId: string | null
  plan: PlanejamentoItem | null
  children: TreeNode[]
  fallbackProgress?: number
  valorContratado: number
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtBR(v: string | null | undefined) {
  if (!v) return null
  const [y, m, d] = v.split('-')
  return `${d}/${m}/${String(y).slice(2)}`
}

function calcDuracao(inicio: string | null | undefined, fim: string | null | undefined): number | null {
  if (!inicio || !fim) return null
  const d1 = new Date(inicio + 'T00:00:00')
  const d2 = new Date(fim + 'T00:00:00')
  const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1
  return diff > 0 ? diff : null
}

function calcFim(inicio: string, duracao: number): string {
  const d = new Date(inicio + 'T00:00:00')
  d.setDate(d.getDate() + duracao - 1)
  return d.toISOString().split('T')[0]
}

function toISODateOnly(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseISODate(v: string): Date {
  return new Date(v + 'T00:00:00')
}

function refKey(tipo: string, etapaId: string | null, subKey: string | null, orcItemId: string | null) {
  if (tipo === 'etapa') return `E:${etapaId}`
  if (tipo === 'subetapa') return `S:${etapaId}:${subKey}`
  return `I:${orcItemId}`
}

// ─── Inline-edit cells (adapted from ObraCronograma patterns) ─────────────────

function DateCell({ value, onCommit, disabled }: { value: string | null | undefined; onCommit: (v: string) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false)
  if (disabled) return <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtBR(value) || '—'}</span>
  if (editing) {
    return (
      <input type="date" autoFocus
        className="text-xs rounded border px-1 py-0.5 outline-none w-full"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)', maxWidth: 130 }}
        defaultValue={value ?? ''}
        onChange={e => { if (e.target.value) { onCommit(e.target.value); setEditing(false) } }}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }
  return (
    <button className="text-left w-full rounded px-1 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
      onClick={() => setEditing(true)}>
      {value ? (
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtBR(value)}</span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>definir</span>
      )}
    </button>
  )
}

function DurationCell({ inicio, fim, onCommit, disabled }: { inicio: string | null | undefined; fim: string | null | undefined; onCommit: (d: number) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false)
  const dur = calcDuracao(inicio, fim)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing && inputRef.current) inputRef.current.select() }, [editing])

  if (disabled) return <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dur ? `${dur}d` : '—'}</span>

  if (editing) {
    return (
      <input ref={inputRef} type="number" autoFocus min={1} max={9999}
        className="text-xs w-14 rounded border px-1 py-0.5 outline-none text-center"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
        defaultValue={dur ?? ''}
        onBlur={e => {
          const v = parseInt(e.target.value)
          if (!isNaN(v) && v > 0) onCommit(v)
          setEditing(false)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v) && v > 0) onCommit(v); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button className="text-xs rounded px-1 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
      style={{ color: 'var(--text-secondary)' }}
      onClick={() => setEditing(true)}>
      {dur ? `${dur}d` : <span style={{ opacity: 0.5 }}>—</span>}
    </button>
  )
}

function ProgressCell({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing && inputRef.current) inputRef.current.select() }, [editing])

  if (disabled) return <span className="text-xs" style={{ color: value >= 100 ? '#10b981' : 'var(--text-secondary)' }}>{value}%</span>

  if (editing) {
    return (
      <input ref={inputRef} type="number" autoFocus min={0} max={100}
        className="text-xs w-12 rounded border px-0.5 py-0.5 outline-none text-center"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
        defaultValue={value}
        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) onCommit(v); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v) && v >= 0 && v <= 100) onCommit(v); setEditing(false) }
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <button className="text-xs rounded px-0.5 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors"
      style={{ color: value >= 100 ? '#10b981' : 'var(--text-secondary)' }}
      onClick={() => setEditing(true)}>
      {value}%
    </button>
  )
}

function StatusCell({ value, onCommit, disabled }: { value: PlanejamentoStatus; onCommit: (v: PlanejamentoStatus) => void; disabled?: boolean }) {
  const c = STATUS_COLORS[value]
  if (disabled) return <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.text }}>{STATUS_LABELS[value]}</span>

  return (
    <select
      value={value}
      onChange={e => onCommit(e.target.value as PlanejamentoStatus)}
      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border-0 cursor-pointer outline-none"
      style={{ background: c.bg, color: c.text, colorScheme: 'dark' }}
    >
      {(Object.keys(STATUS_LABELS) as PlanejamentoStatus[]).map(s => (
        <option key={s} value={s} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  )
}

// ─── Predecessor Picker Modal ─────────────────────────────────────────────────

function PredecessorPickerModal({
  open, onClose, allNodes, excludeKeys, selectedPlanIds, onConfirm,
}: {
  open: boolean
  onClose: () => void
  allNodes: TreeNode[]
  excludeKeys: Set<string>
  selectedPlanIds: Set<string>
  onConfirm: (nodes: TreeNode[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) {
      const initial = new Set<string>()
      function walk(nodes: TreeNode[]) {
        nodes.forEach(n => {
          if (n.plan && selectedPlanIds.has(n.plan.id)) initial.add(n.key)
          walk(n.children)
        })
      }
      walk(allNodes)
      setSelected(initial)
    }
  }, [open, allNodes, selectedPlanIds])

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleConfirm() {
    const result: TreeNode[] = []
    function walk(nodes: TreeNode[]) {
      nodes.forEach(n => {
        if (selected.has(n.key)) result.push(n)
        walk(n.children)
      })
    }
    walk(allNodes)
    onConfirm(result)
    onClose()
  }

  function renderNodes(nodes: TreeNode[], indent: number) {
    return nodes.filter(n => !excludeKeys.has(n.key)).map(n => {
      const hasChildren = n.children.filter(c => !excludeKeys.has(c.key)).length > 0
      const isCollapsed = collapsed[n.key] ?? false
      return (
        <Fragment key={n.key}>
          <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: indent * 20 + 12, borderBottom: '1px solid var(--border)' }}>
            {hasChildren && (
              <button onClick={() => setCollapsed(c => ({ ...c, [n.key]: !c[n.key] }))} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
            {!hasChildren && <span style={{ width: 18 }} />}
            <button onClick={() => toggle(n.key)} className="flex items-center gap-2 flex-1 min-w-0 text-left"
              style={{ color: selected.has(n.key) ? 'var(--accent)' : 'var(--text-primary)' }}>
              {selected.has(n.key) ? <CheckSquare size={14} /> : <Square size={14} />}
              <span className="text-xs truncate"><strong>{n.codigo}</strong> {n.descricao}</span>
            </button>
          </div>
          {!isCollapsed && hasChildren && renderNodes(n.children, indent + 1)}
        </Fragment>
      )
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Selecionar predecessoras (Fim → Início)" size="lg">
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Marque as atividades que precisam terminar antes desta começar.
        </p>
        <div className="flex flex-col rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto" style={{ border: '1px solid var(--border)' }}>
          {renderNodes(allNodes, 0)}
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleConfirm}>Confirmar ({selected.size})</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ObraPlanejamento2({ obraId, projetoId, orcamentoId, orcamentoIds }: { obraId?: string; projetoId?: string; orcamentoId: string; orcamentoIds?: string[] }) {
  const supabase = createClient()
  const [subTab, setSubTab] = useState<'estrutura' | 'previsoes' | 'curva'>('estrutura')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [deps, setDeps] = useState<PlanejamentoDependencia[]>([])
  const [pickerNode, setPickerNode] = useState<TreeNode | null>(null)
  const planIdMapRef = useRef<Map<string, TreeNode>>(new Map())
  const allNodesRef = useRef<TreeNode[]>([])
  const [successKey, setSuccessKey] = useState<string | null>(null)
  const [view, setView] = useState<'tabela' | 'gantt'>('tabela')
  const [baselineInfo, setBaselineInfo] = useState<{ capturadaEm: string; totalItens: number } | null>(null)

  // Cada orçamento tem seu próprio planejamento, inclusive antes de a obra
  // existir (fase de Projeto): as etapas ficam presas a obra_id OU
  // projeto_id, nunca os dois. planejamento_itens/dependencias sempre são
  // gravados com orcamento_id + o contexto atual (obra ou projeto).
  const etapaContexto = obraId
    ? { coluna: 'obra_id' as const, id: obraId, fk: { obra_id: obraId, projeto_id: null as string | null }, orcamentoFiltro: null as string | null }
    : projetoId
      ? { coluna: 'projeto_id' as const, id: projetoId, fk: { obra_id: null as string | null, projeto_id: projetoId }, orcamentoFiltro: orcamentoId || null }
      : null

  useEffect(() => { if (etapaContexto && orcamentoId) load() }, [obraId, projetoId, orcamentoId])

  // Baseline: capturada uma unica vez quando a obra e iniciada (RPC
  // iniciar_obra_por_orcamento) — leitura apenas, nunca escrita por aqui.
  useEffect(() => {
    if (!orcamentoId) { setBaselineInfo(null); return }
    let cancelled = false
    supabase
      .from('planejamento_itens_baseline')
      .select('criado_em')
      .eq('orcamento_id', orcamentoId)
      .order('criado_em', { ascending: true })
      .then(({ data }: { data: { criado_em: string }[] | null }) => {
        if (cancelled) return
        const rows = data || []
        setBaselineInfo(rows.length > 0 ? { capturadaEm: rows[0].criado_em, totalItens: rows.length } : null)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentoId])

  async function load() {
    if (!etapaContexto) return
    setLoading(true)
    setError(null)
    try {
      let etapasQuery = supabase.from('etapas').select('id, nome, ordem, data_inicio, data_fim, status, percentual_executado').eq(etapaContexto.coluna, etapaContexto.id)
      if (etapaContexto.orcamentoFiltro) etapasQuery = etapasQuery.eq('orcamento_id', etapaContexto.orcamentoFiltro)

      const [etapasRes, itemsRes, headersRes, planRes, depsRes] = await Promise.all([
        etapasQuery.order('ordem'),
        supabase.from('orcamento_itens').select('id, etapa_id, subetapa, tipo_linha, descricao_snapshot, codigo_snapshot, quantidade, preco_unitario_snapshot').eq('orcamento_id', orcamentoId).eq('tipo_linha', 'item'),
        supabase.from('orcamento_itens').select('id, etapa_id, subetapa').eq('orcamento_id', orcamentoId).eq('tipo_linha', 'subetapa'),
        supabase.from('planejamento_itens').select('*').eq('orcamento_id', orcamentoId),
        supabase.from('planejamento_dependencias').select('*').eq('orcamento_id', orcamentoId),
      ])

      if (etapasRes.error) throw etapasRes.error
      if (itemsRes.error) throw itemsRes.error

      const etapas = (etapasRes.data || []) as Etapa[]
      const orcItems = (itemsRes.data || []) as OrcItem[]
      const headers = (headersRes.data || []) as { id: string; etapa_id: string | null; subetapa: string | null }[]
      const plans = (planRes.data || []) as PlanejamentoItem[]
      const dependencies = (depsRes.data || []) as PlanejamentoDependencia[]

      setDeps(dependencies)

      // Regra 3: subetapa reaproveita a linha orcamento_itens (tipo_linha='subetapa')
      // já existente como identidade estável, em vez de derivar só do nome.
      const headerPorSubetapa = new Map<string, string>()
      headers.forEach(h => {
        const nome = h.subetapa?.trim()
        if (!nome) return
        headerPorSubetapa.set(`${h.etapa_id}::${nome}`, h.id)
      })

      const planByRef = new Map<string, PlanejamentoItem>()
      plans.forEach(p => planByRef.set(refKey(p.ref_tipo, p.etapa_id, p.subetapa_key, p.orcamento_item_id), p))

      const newTree = buildTree(etapas, orcItems, planByRef, headerPorSubetapa)
      setTree(newTree)
      allNodesRef.current = newTree

      const idMap = new Map<string, TreeNode>()
      function walk(nodes: TreeNode[]) {
        nodes.forEach(n => { if (n.plan) idMap.set(n.plan.id, n); walk(n.children) })
      }
      walk(newTree)
      planIdMapRef.current = idMap

      if (expanded.size === 0) setExpanded(new Set(etapas.map(e => `E:${e.id}`)))
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao carregar:', e)
      setError(e.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  function buildTree(etapas: Etapa[], orcItems: OrcItem[], planByRef: Map<string, PlanejamentoItem>, headerPorSubetapa: Map<string, string>): TreeNode[] {
    const etapaIdsInBudget = new Set(orcItems.map(oi => oi.etapa_id).filter(Boolean))

    return etapas
      .filter(e => etapaIdsInBudget.has(e.id))
      .map(etapa => {
        const etapaKey = `E:${etapa.id}`
        const etapaItems = orcItems.filter(oi => oi.etapa_id === etapa.id)

        const subGroups = new Map<string, OrcItem[]>()
        const noSub: OrcItem[] = []
        etapaItems.forEach(oi => {
          const sub = oi.subetapa?.trim()
          if (sub) {
            if (!subGroups.has(sub)) subGroups.set(sub, [])
            subGroups.get(sub)!.push(oi)
          } else {
            noSub.push(oi)
          }
        })

        const children: TreeNode[] = []

        const valorItem = (oi: OrcItem) => (Number(oi.quantidade) || 0) * (Number(oi.preco_unitario_snapshot) || 0)

        noSub.forEach(oi => {
          children.push({
            key: `I:${oi.id}`, level: 2, codigo: oi.codigo_snapshot || '—',
            descricao: oi.descricao_snapshot || '(sem descrição)',
            refTipo: 'item', etapaId: etapa.id, subetapaKey: null, orcItemId: oi.id,
            plan: planByRef.get(`I:${oi.id}`) || null, children: [],
            valorContratado: valorItem(oi),
          })
        })

        let subIdx = 1
        subGroups.forEach((items, subName) => {
          const subKey = `S:${etapa.id}:${subName}`
          const itemNodes: TreeNode[] = items.map(oi => ({
            key: `I:${oi.id}`, level: 2 as const,
            codigo: oi.codigo_snapshot || '—',
            descricao: oi.descricao_snapshot || '(sem descrição)',
            refTipo: 'item' as const, etapaId: etapa.id,
            subetapaKey: subName, orcItemId: oi.id,
            plan: planByRef.get(`I:${oi.id}`) || null, children: [],
            valorContratado: valorItem(oi),
          }))
          children.push({
            key: subKey, level: 1,
            codigo: `${String(etapa.ordem).padStart(2, '0')}.${subIdx}`,
            descricao: subName, refTipo: 'subetapa',
            etapaId: etapa.id, subetapaKey: subName, orcItemId: headerPorSubetapa.get(`${etapa.id}::${subName}`) || null,
            plan: planByRef.get(subKey) || null,
            children: itemNodes,
            valorContratado: itemNodes.reduce((acc, n) => acc + n.valorContratado, 0),
          })
          subIdx++
        })

        return {
          key: etapaKey, level: 0 as const,
          codigo: String(etapa.ordem).padStart(2, '0'),
          descricao: etapa.nome, refTipo: 'etapa' as const,
          etapaId: etapa.id, subetapaKey: null, orcItemId: null,
          plan: planByRef.get(etapaKey) || null, children,
          fallbackProgress: Number(etapa.percentual_executado) || 0,
          valorContratado: children.reduce((acc, n) => acc + n.valorContratado, 0),
        }
      })
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async function upsertPlan(node: TreeNode, updates: Record<string, any>): Promise<string> {
    if (node.plan) {
      const { error } = await supabase
        .from('planejamento_itens')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', node.plan.id)
      if (error) throw error
      return node.plan.id
    } else {
      if (!etapaContexto) throw new Error('Obra ou projeto nao identificado para criar o planejamento.')
      const { data, error } = await supabase
        .from('planejamento_itens')
        .insert({
          ...etapaContexto.fk, orcamento_id: orcamentoId,
          ref_tipo: node.refTipo, etapa_id: node.etapaId,
          subetapa_key: node.subetapaKey, orcamento_item_id: node.orcItemId,
          ...updates,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    }
  }

  async function saveField(node: TreeNode, field: string, value: any) {
    setSaving(node.key)
    try {
      await upsertPlan(node, { [field]: value })
      showSuccess(node.key)
      await load()
    } catch (e: any) {
      console.error(`Planejamento 2.0 — erro ao salvar ${field}:`, e)
      alert(`Erro ao salvar: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  async function saveDuration(node: TreeNode, duracao: number) {
    const inicio = node.plan?.data_inicio
    if (!inicio) {
      alert('Defina a data de início antes de alterar a duração.')
      return
    }
    const fim = calcFim(inicio, duracao)
    setSaving(node.key)
    try {
      await upsertPlan(node, { data_fim: fim })
      showSuccess(node.key)
      await load()
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao salvar duração:', e)
      alert(`Erro ao salvar: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  async function ensurePlanId(node: TreeNode): Promise<string> {
    if (node.plan) return node.plan.id
    if (!etapaContexto) throw new Error('Obra ou projeto nao identificado para criar o planejamento.')
    const { data, error } = await supabase
      .from('planejamento_itens')
      .insert({
        ...etapaContexto.fk, orcamento_id: orcamentoId,
        ref_tipo: node.refTipo, etapa_id: node.etapaId,
        subetapa_key: node.subetapaKey, orcamento_item_id: node.orcItemId,
      })
      .select('id').single()
    if (error) throw error
    return data.id
  }

  async function saveDependencies(node: TreeNode, predecessorNodes: TreeNode[]) {
    setSaving(node.key)
    try {
      const itemId = await ensurePlanId(node)
      await supabase.from('planejamento_dependencias').delete().eq('item_id', itemId)

      if (predecessorNodes.length > 0) {
        if (!etapaContexto) throw new Error('Obra ou projeto nao identificado para criar dependencias.')
        const rows: { obra_id: string | null; projeto_id: string | null; orcamento_id: string; item_id: string; predecessor_id: string; tipo: string }[] = []
        for (const pred of predecessorNodes) {
          const predId = await ensurePlanId(pred)
          rows.push({ ...etapaContexto.fk, orcamento_id: orcamentoId, item_id: itemId, predecessor_id: predId, tipo: 'FS' })
        }
        const { error } = await supabase.from('planejamento_dependencias').insert(rows)
        if (error) throw error
      }

      showSuccess(node.key)
      await load()
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao salvar predecessoras:', e)
      alert(`Erro ao salvar predecessoras: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  function showSuccess(key: string) {
    setSuccessKey(key)
    setTimeout(() => setSuccessKey(null), 1500)
  }

  // ─── Gantt simplificado: intervalo de datas (rollup) por nó ─────────────────

  function nodeRange(node: TreeNode): { inicio: string; fim: string } | null {
    if (node.level === 2) {
      if (node.plan?.data_inicio && node.plan?.data_fim) return { inicio: node.plan.data_inicio, fim: node.plan.data_fim }
      return null
    }
    let inicio: string | null = null
    let fim: string | null = null
    function scan(n: TreeNode) {
      if (n.plan?.data_inicio && n.plan?.data_fim) {
        if (!inicio || n.plan.data_inicio < inicio) inicio = n.plan.data_inicio
        if (!fim || n.plan.data_fim > fim) fim = n.plan.data_fim
      }
      n.children.forEach(scan)
    }
    scan(node)
    return inicio && fim ? { inicio, fim } : null
  }

  function nodeProgress(node: TreeNode): { plan: number; exec: number } {
    if (node.level === 2) {
      return { plan: Number(node.plan?.progresso_planejado ?? 0), exec: Number(node.plan?.progresso_executado ?? 0) }
    }
    // Regra 8: subetapa/etapa não têm % executado próprio — sempre calculado
    // a partir dos itens (folhas) filhos, ponderado pelo valor do orçamento.
    const folhas: TreeNode[] = []
    function collectFolhas(n: TreeNode) {
      if (n.level === 2) { folhas.push(n); return }
      n.children.forEach(collectFolhas)
    }
    node.children.forEach(collectFolhas)
    const valorFolhas = folhas.reduce((acc, f) => acc + f.valorContratado, 0)
    const exec = folhas.length === 0
      ? Number(node.fallbackProgress ?? 0)
      : valorFolhas > 0
        ? folhas.reduce((acc, f) => acc + Number(f.plan?.progresso_executado ?? 0) * f.valorContratado, 0) / valorFolhas
        : folhas.reduce((acc, f) => acc + Number(f.plan?.progresso_executado ?? 0), 0) / folhas.length

    // % planejado (cronograma-alvo) não é o foco da regra 8 — segue a lógica
    // anterior: nós com data própria contam diretamente.
    const planned: TreeNode[] = []
    function collectPlanned(n: TreeNode) {
      if (n.plan) { planned.push(n); return }
      n.children.forEach(collectPlanned)
    }
    node.children.forEach(collectPlanned)
    const plan = planned.length === 0 ? 0 : planned.reduce((s, l) => s + Number(l.plan?.progresso_planejado ?? 0), 0) / planned.length

    return { plan: Math.round(plan), exec: Math.round(exec) }
  }

  const timelineScale = useMemo(() => {
    let minDate: string | null = null
    let maxDate: string | null = null
    function scan(nodes: TreeNode[]) {
      nodes.forEach(n => {
        if (n.plan?.data_inicio && n.plan?.data_fim) {
          if (!minDate || n.plan.data_inicio < minDate) minDate = n.plan.data_inicio
          if (!maxDate || n.plan.data_fim > maxDate) maxDate = n.plan.data_fim
        }
        scan(n.children)
      })
    }
    scan(tree)
    if (!minDate || !maxDate) return null
    const start = parseISODate(minDate)
    start.setDate(start.getDate() - 3)
    const end = parseISODate(maxDate)
    end.setDate(end.getDate() + 3)
    const totalDays = Math.max(1, calcDuracao(toISODateOnly(start), toISODateOnly(end)) || 1)
    return { start, totalDays, pxPerDay: 22 }
  }, [tree])

  // ─── Helper: get predecessors for a node ────────────────────────────────────

  function getPredecessors(node: TreeNode): { names: string[]; planIds: Set<string> } {
    if (!node.plan) return { names: [], planIds: new Set() }
    const nodeDeps = deps.filter(d => d.item_id === node.plan!.id)
    const names: string[] = []
    const planIds = new Set<string>()
    nodeDeps.forEach(d => {
      planIds.add(d.predecessor_id)
      const predNode = planIdMapRef.current.get(d.predecessor_id)
      if (predNode) names.push(predNode.codigo)
    })
    return { names, planIds }
  }

  function getExcludeKeys(node: TreeNode): Set<string> {
    const keys = new Set<string>()
    keys.add(node.key)
    function walkChildren(n: TreeNode) {
      n.children.forEach(c => { keys.add(c.key); walkChildren(c) })
    }
    walkChildren(node)
    return keys
  }

  // ─── Toggle expand ─────────────────────────────────────────────────────────

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ─── Flatten visible tree ───────────────────────────────────────────────────

  function flattenVisible(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = []
    nodes.forEach(n => {
      result.push(n)
      if (expanded.has(n.key) && n.children.length > 0) result.push(...flattenVisible(n.children))
    })
    return result
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!orcamentoId) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Sem orçamento"
        description="Crie um orçamento para esta obra antes de usar o Planejamento."
      />
    )
  }

  // Previsões e Curva S (só existem no contexto de obra) ficam como sub-abas
  // do Planejamento — regra 1: uma única entrada de navegação, sem duplicar
  // a árvore Etapa → Subetapa → Item.
  const idsOrcamentos = orcamentoIds?.length ? orcamentoIds : [orcamentoId]
  const subTabBar = obraId && (
    <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit overflow-x-auto max-w-full" style={{ background: 'var(--bg-secondary)' }}>
      {([
        { id: 'estrutura' as const, label: 'Estrutura', icon: CalendarRange },
        { id: 'previsoes' as const, label: 'Previsões', icon: CalendarClock },
        { id: 'curva' as const, label: 'Curva S', icon: LineChart },
      ]).map(t => {
        const Ic = t.icon
        return (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
            style={subTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
            <Ic size={15} /> {t.label}
          </button>
        )
      })}
    </div>
  )

  if (obraId && subTab === 'previsoes') {
    return (
      <div className="flex flex-col gap-4">
        {subTabBar}
        <ObraPrevisoes obraId={obraId} orcamentoId={orcamentoId} />
      </div>
    )
  }
  if (obraId && subTab === 'curva') {
    return (
      <div className="flex flex-col gap-4">
        {subTabBar}
        <ObraCurvaS obraId={obraId} orcamentoId={orcamentoId} orcamentoIds={idsOrcamentos} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {subTabBar}
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {subTabBar}
        <div className="card p-6 text-center">
          <AlertCircle size={32} className="mx-auto mb-3" style={{ color: '#EF4444' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Erro ao carregar planejamento</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <Button onClick={load}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {subTabBar}
        <EmptyState
          icon={CalendarRange}
          title="Sem itens no orçamento"
          description="Adicione etapas e itens ao orçamento para visualizar o planejamento."
        />
      </div>
    )
  }

  const visibleRows = flattenVisible(tree)

  return (
    <div className="flex flex-col gap-4">
      {subTabBar}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Planejamento</h2>
            {baselineInfo && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                title={`Linha de base capturada com ${baselineInfo.totalItens} item(ns) ao iniciar a obra. O planejamento atual continua editável; a baseline não é sobrescrita.`}
              >
                Baseline capturada em {fmtBR(baselineInfo.capturadaEm.slice(0, 10))}
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Estrutura derivada do orçamento — alterações no orçamento refletem automaticamente aqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <button
              onClick={() => setView('tabela')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: view === 'tabela' ? 'var(--accent)' : 'transparent',
                color: view === 'tabela' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <Table2 size={13} /> Tabela
            </button>
            <button
              onClick={() => setView('gantt')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: view === 'gantt' ? 'var(--accent)' : 'transparent',
                color: view === 'gantt' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <GanttChartSquare size={13} /> Gantt
            </button>
          </div>
          <Button variant="secondary" onClick={load} disabled={!!saving}>
            Atualizar
          </Button>
        </div>
      </div>

      {view === 'gantt' ? (
        <SimpleGanttPane
          rows={visibleRows}
          scale={timelineScale}
          getRange={nodeRange}
          getProgress={nodeProgress}
          toggleExpand={toggleExpand}
          expanded={expanded}
        />
      ) : (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 1000 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th className="text-left px-3 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', minWidth: 350 }}>Descrição</th>
              <th className="text-left px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 80 }}>Código</th>
              <th className="text-left px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 100 }}>Início</th>
              <th className="text-left px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 100 }}>Fim</th>
              <th className="text-center px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 65 }}>Duração</th>
              <th className="text-left px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 130 }}>Predecessora</th>
              <th className="text-center px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 110 }}>Status</th>
              <th className="text-center px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 65 }}>% Plan.</th>
              <th className="text-center px-2 py-2.5 font-semibold text-xs" style={{ color: 'var(--text-secondary)', width: 65 }}>% Exec.</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(node => {
              const isSaving = saving === node.key
              const isSuccess = successKey === node.key
              const hasChildren = node.children.length > 0
              const isExpanded = expanded.has(node.key)
              const indent = node.level * 20
              const plan = node.plan
              const status: PlanejamentoStatus = plan?.status || 'nao_iniciado'
              const pPlan = Number(plan?.progresso_planejado ?? 0)
              // Regra 8: só o item (folha) tem % executado próprio — etapa e
              // subetapa são sempre calculados a partir dos itens filhos.
              const pExec = node.level === 2 ? Number(plan?.progresso_executado ?? 0) : nodeProgress(node).exec
              const { names: predNames, planIds: predPlanIds } = getPredecessors(node)

              const bgLevel = node.level === 0 ? 'var(--bg-secondary)' : node.level === 1 ? 'rgba(var(--accent-rgb, 59,123,248),0.04)' : 'transparent'
              const fontWeight = node.level === 0 ? 600 : node.level === 1 ? 500 : 400

              return (
                <tr key={node.key}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: isSuccess ? 'rgba(16,185,129,0.08)' : isSaving ? 'rgba(59,130,246,0.05)' : bgLevel,
                    transition: 'background 0.3s',
                  }}
                >
                  {/* Descrição (with expand/collapse) */}
                  <td className="px-3 py-2" style={{ paddingLeft: indent + 12 }}>
                    <div className="flex items-center gap-1.5">
                      {hasChildren ? (
                        <button onClick={() => toggleExpand(node.key)} className="p-0.5 rounded hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : (
                        <span style={{ width: 18 }} />
                      )}
                      <span className="truncate text-xs" style={{ color: 'var(--text-primary)', fontWeight }}>
                        {node.descricao}
                      </span>
                      {isSaving && <Loader2 size={12} className="animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />}
                      {isSuccess && <Check size={12} className="flex-shrink-0" style={{ color: '#10b981' }} />}
                    </div>
                  </td>

                  {/* Código */}
                  <td className="px-2 py-2">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{node.codigo}</span>
                  </td>

                  {/* Início */}
                  <td className="px-2 py-2">
                    <DateCell
                      value={plan?.data_inicio}
                      onCommit={v => saveField(node, 'data_inicio', v)}
                      disabled={!!saving}
                    />
                  </td>

                  {/* Fim */}
                  <td className="px-2 py-2">
                    <DateCell
                      value={plan?.data_fim}
                      onCommit={v => saveField(node, 'data_fim', v)}
                      disabled={!!saving}
                    />
                  </td>

                  {/* Duração */}
                  <td className="px-2 py-2 text-center">
                    <DurationCell
                      inicio={plan?.data_inicio}
                      fim={plan?.data_fim}
                      onCommit={d => saveDuration(node, d)}
                      disabled={!!saving}
                    />
                  </td>

                  {/* Predecessora */}
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setPickerNode(node)}
                      disabled={!!saving}
                      className="flex items-center gap-1 text-xs rounded px-1 py-0.5 hover:bg-[var(--bg-secondary)] transition-colors w-full text-left"
                      style={{ color: predNames.length > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}
                    >
                      {predNames.length > 0 ? (
                        <>
                          <Link2 size={11} className="flex-shrink-0" />
                          <span className="truncate">{predNames.join(', ')}</span>
                        </>
                      ) : (
                        <span style={{ opacity: 0.5 }}>selecionar</span>
                      )}
                    </button>
                  </td>

                  {/* Status */}
                  <td className="px-2 py-2 text-center">
                    <StatusCell
                      value={status}
                      onCommit={v => saveField(node, 'status', v)}
                      disabled={!!saving}
                    />
                  </td>

                  {/* % Planejado */}
                  <td className="px-2 py-2 text-center">
                    <ProgressCell
                      value={pPlan}
                      onCommit={v => saveField(node, 'progresso_planejado', v)}
                      disabled={!!saving}
                    />
                  </td>

                  {/* % Executado — só o item é editável (regra 8: pais são sempre calculados) */}
                  <td className="px-2 py-2 text-center">
                    <ProgressCell
                      value={pExec}
                      onCommit={v => saveField(node, 'progresso_executado', v)}
                      disabled={!!saving || node.level !== 2}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Predecessor Picker Modal */}
      {pickerNode && (
        <PredecessorPickerModal
          open={!!pickerNode}
          onClose={() => setPickerNode(null)}
          allNodes={tree}
          excludeKeys={getExcludeKeys(pickerNode)}
          selectedPlanIds={getPredecessors(pickerNode).planIds}
          onConfirm={nodes => saveDependencies(pickerNode, nodes)}
        />
      )}
    </div>
  )
}

// ─── Gantt simplificado (somente leitura, sem drag) ────────────────────────────
//
// Visualização de linha do tempo derivada dos mesmos dados da Tabela — edição
// continua sendo feita por lá. Cada barra mostra previsto (marcador tracejado)
// x realizado (preenchimento sólido), sem depender de arrastar/soltar.

type GanttScale = { start: Date; totalDays: number; pxPerDay: number }

function monthLabel(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
}

function SimpleGanttPane({
  rows, scale, getRange, getProgress, toggleExpand, expanded,
}: {
  rows: TreeNode[]
  scale: GanttScale | null
  getRange: (node: TreeNode) => { inicio: string; fim: string } | null
  getProgress: (node: TreeNode) => { plan: number; exec: number }
  toggleExpand: (key: string) => void
  expanded: Set<string>
}) {
  if (!scale) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Nenhuma data definida"
        description="Defina datas de início e fim na Tabela para visualizar a linha do tempo."
      />
    )
  }

  const totalWidth = scale.totalDays * scale.pxPerDay
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayOffset = Math.round((today.getTime() - scale.start.getTime()) / 86400000) * scale.pxPerDay

  const months: { label: string; left: number; width: number }[] = []
  {
    let cursor = new Date(scale.start)
    let dayIdx = 0
    while (dayIdx < scale.totalDays) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const daysInto = Math.max(0, Math.round((cursor.getTime() - monthStart.getTime()) / 86400000))
      const daysLeftInMonth = Math.round((monthEnd.getTime() - cursor.getTime()) / 86400000)
      const span = Math.min(daysLeftInMonth, scale.totalDays - dayIdx)
      months.push({ label: monthLabel(cursor), left: dayIdx * scale.pxPerDay, width: span * scale.pxPerDay })
      dayIdx += span
      cursor = new Date(scale.start)
      cursor.setDate(cursor.getDate() + dayIdx)
    }
  }

  return (
    <div className="card overflow-x-auto">
      <div className="flex" style={{ minWidth: 1000 }}>
        {/* Coluna fixa de descrição */}
        <div style={{ minWidth: 300, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center px-3 font-semibold text-xs" style={{ height: 60, color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)' }}>
            Descrição
          </div>
          {rows.map(node => {
            const hasChildren = node.children.length > 0
            const isExpanded = expanded.has(node.key)
            const fontWeight = node.level === 0 ? 600 : node.level === 1 ? 500 : 400
            return (
              <div key={node.key} className="flex items-center gap-1.5 px-3" style={{ height: 34, borderBottom: '1px solid var(--border)', paddingLeft: node.level * 16 + 12 }}>
                {hasChildren ? (
                  <button onClick={() => toggleExpand(node.key)} className="p-0.5 rounded hover:bg-[var(--bg-secondary)] flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                ) : <span style={{ width: 17 }} />}
                <span className="truncate text-xs" style={{ color: 'var(--text-primary)', fontWeight }} title={node.descricao}>
                  {node.codigo} — {node.descricao}
                </span>
              </div>
            )
          })}
        </div>

        {/* Linha do tempo */}
        <div className="overflow-x-auto flex-1">
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Cabeçalho de meses */}
            <div style={{ height: 60, position: 'relative', borderBottom: '2px solid var(--border)' }}>
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full flex items-center justify-center text-xs font-semibold capitalize"
                  style={{ left: m.left, width: m.width, color: 'var(--text-secondary)', borderLeft: '1px solid var(--border)' }}>
                  {m.label}
                </div>
              ))}
            </div>

            {/* Linha do "hoje" */}
            {todayOffset >= 0 && todayOffset <= totalWidth && (
              <div className="absolute top-0 bottom-0" style={{ left: todayOffset, width: 1, background: 'var(--accent)', opacity: 0.5, zIndex: 1 }} />
            )}

            {rows.map(node => {
              const range = getRange(node)
              const { plan, exec } = getProgress(node)
              const isLeaf = node.level === 2

              if (!range) {
                return (
                  <div key={node.key} className="flex items-center" style={{ height: 34, borderBottom: '1px solid var(--border)' }}>
                    <span className="text-xs px-2" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>sem data</span>
                  </div>
                )
              }

              const offsetDays = calcDuracao(toISODateOnly(scale.start), range.inicio)! - 1
              const left = Math.max(0, offsetDays * scale.pxPerDay)
              const durDays = calcDuracao(range.inicio, range.fim) || 1
              const width = Math.max(6, durDays * scale.pxPerDay)
              const barColor = isLeaf ? 'var(--accent)' : '#8b5cf6'

              return (
                <div key={node.key} className="relative flex items-center" style={{ height: 34, borderBottom: '1px solid var(--border)' }}>
                  <div
                    className="absolute rounded"
                    title={`${node.codigo} — ${node.descricao}\n${fmtBR(range.inicio)} a ${fmtBR(range.fim)}\nPrevisto: ${plan}% · Realizado: ${exec}%`}
                    style={{
                      left, width, height: isLeaf ? 16 : 12,
                      background: 'var(--bg-secondary)',
                      border: `1px solid ${barColor}`,
                      opacity: isLeaf ? 1 : 0.85,
                    }}
                  >
                    <div className="h-full rounded" style={{ width: `${Math.min(100, exec)}%`, background: barColor, opacity: isLeaf ? 0.85 : 0.6 }} />
                    <div
                      className="absolute top-0 bottom-0"
                      style={{ left: `${Math.min(100, plan)}%`, width: 2, background: 'var(--text-primary)', opacity: 0.6 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
        <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} /> Realizado</span>
        <span className="flex items-center gap-1.5"><span style={{ width: 2, height: 10, background: 'var(--text-primary)', opacity: 0.6, display: 'inline-block' }} /> Previsto</span>
        <span>Edite datas, status e predecessoras na aba Tabela.</span>
      </div>
    </div>
  )
}
