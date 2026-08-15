'use client'

import { Fragment, useEffect, useState, useRef, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, CalendarRange, AlertCircle,
  CheckSquare, Square, Loader2, Link2, Unlink, Check,
  Table2, GanttChartSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa, PlanejamentoItem, PlanejamentoDependencia, PlanejamentoStatus } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useProfile } from '@/lib/profile-context'
import { Gantt, Willow, WillowDark, type ITask, type ILink, type IApi } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'

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

const DEP_TIPO_TO_LINKTYPE: Record<string, 'e2s' | 'e2e' | 's2s' | 's2e'> = {
  FS: 'e2s', FF: 'e2e', SS: 's2s', SF: 's2e',
}
const LINKTYPE_TO_DEP_TIPO: Record<string, 'FS' | 'FF' | 'SS' | 'SF'> = {
  e2s: 'FS', e2e: 'FF', s2s: 'SS', s2e: 'SF',
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

export function ObraPlanejamento2({ obraId, orcamentoId }: { obraId: string; orcamentoId: string }) {
  const supabase = createClient()
  const { theme } = useProfile()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [deps, setDeps] = useState<PlanejamentoDependencia[]>([])
  const [pickerNode, setPickerNode] = useState<TreeNode | null>(null)
  const planIdMapRef = useRef<Map<string, TreeNode>>(new Map())
  const nodeByKeyRef = useRef<Map<string, TreeNode>>(new Map())
  const allNodesRef = useRef<TreeNode[]>([])
  const [successKey, setSuccessKey] = useState<string | null>(null)
  const [view, setView] = useState<'tabela' | 'gantt'>('tabela')
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => { if (obraId && orcamentoId) load() }, [obraId, orcamentoId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [etapasRes, itemsRes, planRes, depsRes] = await Promise.all([
        supabase.from('etapas').select('id, nome, ordem, data_inicio, data_fim, status, percentual_executado').eq('obra_id', obraId).order('ordem'),
        supabase.from('orcamento_itens').select('id, etapa_id, subetapa, tipo_linha, descricao_snapshot, codigo_snapshot').eq('orcamento_id', orcamentoId).eq('tipo_linha', 'item'),
        supabase.from('planejamento_itens').select('*').eq('orcamento_id', orcamentoId),
        supabase.from('planejamento_dependencias').select('*').eq('obra_id', obraId),
      ])

      if (etapasRes.error) throw etapasRes.error
      if (itemsRes.error) throw itemsRes.error

      const etapas = (etapasRes.data || []) as Etapa[]
      const orcItems = (itemsRes.data || []) as OrcItem[]
      const plans = (planRes.data || []) as PlanejamentoItem[]
      const dependencies = (depsRes.data || []) as PlanejamentoDependencia[]

      setDeps(dependencies)

      const planByRef = new Map<string, PlanejamentoItem>()
      plans.forEach(p => planByRef.set(refKey(p.ref_tipo, p.etapa_id, p.subetapa_key, p.orcamento_item_id), p))

      const newTree = buildTree(etapas, orcItems, planByRef)
      setTree(newTree)
      allNodesRef.current = newTree

      const idMap = new Map<string, TreeNode>()
      const keyMap = new Map<string, TreeNode>()
      function walk(nodes: TreeNode[]) {
        nodes.forEach(n => { if (n.plan) idMap.set(n.plan.id, n); keyMap.set(n.key, n); walk(n.children) })
      }
      walk(newTree)
      planIdMapRef.current = idMap
      nodeByKeyRef.current = keyMap

      if (expanded.size === 0) setExpanded(new Set(etapas.map(e => `E:${e.id}`)))
      setReloadCount(c => c + 1)
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao carregar:', e)
      setError(e.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  function buildTree(etapas: Etapa[], orcItems: OrcItem[], planByRef: Map<string, PlanejamentoItem>): TreeNode[] {
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

        noSub.forEach(oi => {
          children.push({
            key: `I:${oi.id}`, level: 2, codigo: oi.codigo_snapshot || '—',
            descricao: oi.descricao_snapshot || '(sem descrição)',
            refTipo: 'item', etapaId: etapa.id, subetapaKey: null, orcItemId: oi.id,
            plan: planByRef.get(`I:${oi.id}`) || null, children: [],
          })
        })

        let subIdx = 1
        subGroups.forEach((items, subName) => {
          const subKey = `S:${etapa.id}:${subName}`
          children.push({
            key: subKey, level: 1,
            codigo: `${String(etapa.ordem).padStart(2, '0')}.${subIdx}`,
            descricao: subName, refTipo: 'subetapa',
            etapaId: etapa.id, subetapaKey: subName, orcItemId: null,
            plan: planByRef.get(subKey) || null,
            children: items.map(oi => ({
              key: `I:${oi.id}`, level: 2 as const,
              codigo: oi.codigo_snapshot || '—',
              descricao: oi.descricao_snapshot || '(sem descrição)',
              refTipo: 'item' as const, etapaId: etapa.id,
              subetapaKey: subName, orcItemId: oi.id,
              plan: planByRef.get(`I:${oi.id}`) || null, children: [],
            })),
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
      const { data, error } = await supabase
        .from('planejamento_itens')
        .insert({
          obra_id: obraId, orcamento_id: orcamentoId,
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
    const { data, error } = await supabase
      .from('planejamento_itens')
      .insert({
        obra_id: obraId, orcamento_id: orcamentoId,
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
        const rows: { obra_id: string; item_id: string; predecessor_id: string; tipo: string }[] = []
        for (const pred of predecessorNodes) {
          const predId = await ensurePlanId(pred)
          rows.push({ obra_id: obraId, item_id: itemId, predecessor_id: predId, tipo: 'FS' })
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

  // ─── Gantt: build tasks/links from tree + deps ──────────────────────────────

  const ganttData = useMemo(() => {
    const tasks: ITask[] = []
    const today = toISODateOnly(new Date())

    function walk(nodes: TreeNode[], parentKey?: string) {
      nodes.forEach(n => {
        const isLeaf = n.level === 2
        let inicio = n.plan?.data_inicio || null
        let fim = n.plan?.data_fim || null
        if (isLeaf && !inicio) inicio = today
        if (isLeaf && !fim) fim = inicio
        const hasDates = !!(inicio && fim)
        const progresso = isLeaf
          ? Number(n.plan?.progresso_planejado ?? 0)
          : Number(n.fallbackProgress ?? 0)

        const task: ITask = {
          id: n.key,
          text: `${n.codigo} — ${n.descricao}`,
          progress: progresso,
          type: isLeaf ? 'task' : 'summary',
          parent: parentKey,
        }
        if (hasDates) {
          task.start = parseISODate(inicio!)
          task.duration = calcDuracao(inicio!, fim!) || 1
        }
        if (!isLeaf) task.open = true
        tasks.push(task)
        if (n.children.length > 0) walk(n.children, n.key)
      })
    }
    walk(tree)

    const links: ILink[] = deps.map(d => ({
      id: d.id,
      source: planIdMapRef.current.get(d.predecessor_id)?.key ?? d.predecessor_id,
      target: planIdMapRef.current.get(d.item_id)?.key ?? d.item_id,
      type: DEP_TIPO_TO_LINKTYPE[d.tipo] || 'e2s',
    }))

    return { tasks, links }
  }, [tree, deps])

  // ─── Gantt: persistence handlers ────────────────────────────────────────────

  async function handleGanttTaskUpdate(id: string, changes: Partial<ITask>) {
    const node = nodeByKeyRef.current.get(String(id))
    if (!node || node.level !== 2) return

    const updates: Record<string, any> = {}
    const newStart = changes.start ? toISODateOnly(changes.start) : (node.plan?.data_inicio || null)

    let duracao: number | null = null
    if (typeof changes.duration === 'number' && changes.duration > 0) duracao = changes.duration
    else if (node.plan?.data_inicio && node.plan?.data_fim) duracao = calcDuracao(node.plan.data_inicio, node.plan.data_fim)

    if (newStart) {
      updates.data_inicio = newStart
      updates.data_fim = calcFim(newStart, duracao && duracao > 0 ? duracao : 1)
    }
    if (typeof changes.progress === 'number') {
      updates.progresso_planejado = Math.max(0, Math.min(100, Math.round(changes.progress)))
    }
    if (Object.keys(updates).length === 0) return

    setSaving(node.key)
    try {
      await upsertPlan(node, updates)
      showSuccess(node.key)
      await load()
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao salvar (Gantt):', e)
      alert(`Erro ao salvar: ${e.message}`)
    } finally {
      setSaving(null)
    }
  }

  async function handleGanttAddLink(link: Partial<ILink>) {
    const sourceNode = nodeByKeyRef.current.get(String(link.source))
    const targetNode = nodeByKeyRef.current.get(String(link.target))
    if (!sourceNode || !targetNode || sourceNode.key === targetNode.key) return
    if (sourceNode.level !== 2 || targetNode.level !== 2) return

    setSaving(targetNode.key)
    try {
      const predId = await ensurePlanId(sourceNode)
      const itemId = await ensurePlanId(targetNode)
      const tipo = LINKTYPE_TO_DEP_TIPO[link.type || 'e2s'] || 'FS'
      const { error } = await supabase
        .from('planejamento_dependencias')
        .insert({ obra_id: obraId, item_id: itemId, predecessor_id: predId, tipo })
      if (error) throw error
      showSuccess(targetNode.key)
      await load()
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao criar dependência (Gantt):', e)
      alert(`Erro ao criar predecessora: ${e.message}`)
      await load()
    } finally {
      setSaving(null)
    }
  }

  async function handleGanttDeleteLink(linkId: string) {
    try {
      await supabase.from('planejamento_dependencias').delete().eq('id', linkId)
      await load()
    } catch (e: any) {
      console.error('Planejamento 2.0 — erro ao remover dependência (Gantt):', e)
      alert(`Erro ao remover predecessora: ${e.message}`)
    }
  }

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
        description="Crie um orçamento para esta obra antes de usar o Planejamento 2.0."
      />
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle size={32} className="mx-auto mb-3" style={{ color: '#EF4444' }} />
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Erro ao carregar planejamento</p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <Button onClick={load}>Tentar novamente</Button>
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Sem itens no orçamento"
        description="Adicione etapas e itens ao orçamento para visualizar o planejamento."
      />
    )
  }

  const visibleRows = flattenVisible(tree)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Planejamento 2.0</h2>
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
        <GanttPane
          key={reloadCount}
          tasks={ganttData.tasks}
          links={ganttData.links}
          theme={theme}
          onTaskUpdate={handleGanttTaskUpdate}
          onAddLink={handleGanttAddLink}
          onDeleteLink={handleGanttDeleteLink}
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
              const pExec = Number(plan?.progresso_executado ?? (node.fallbackProgress ?? 0))
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

                  {/* % Executado */}
                  <td className="px-2 py-2 text-center">
                    <ProgressCell
                      value={pExec}
                      onCommit={v => saveField(node, 'progresso_executado', v)}
                      disabled={!!saving}
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

// ─── Gantt Pane ────────────────────────────────────────────────────────────────

function GanttPane({
  tasks, links, theme, onTaskUpdate, onAddLink, onDeleteLink,
}: {
  tasks: ITask[]
  links: ILink[]
  theme: 'dark' | 'light'
  onTaskUpdate: (id: string, changes: Partial<ITask>) => void
  onAddLink: (link: Partial<ILink>) => void
  onDeleteLink: (id: string) => void
}) {
  const ThemeWrap = theme === 'dark' ? WillowDark : Willow
  const handlersRef = useRef({ onTaskUpdate, onAddLink, onDeleteLink })
  handlersRef.current = { onTaskUpdate, onAddLink, onDeleteLink }

  const columns = [
    { id: 'text', header: 'Descrição', flexgrow: 3, minWidth: 240 },
    { id: 'start', header: 'Início', width: 95, align: 'center' as const },
    { id: 'duration', header: 'Dur.', width: 55, align: 'center' as const },
  ]

  function handleInit(api: IApi) {
    api.on('update-task', (ev: { id: string | number; task: Partial<ITask>; inProgress?: boolean }) => {
      if (ev.inProgress) return
      handlersRef.current.onTaskUpdate(String(ev.id), ev.task)
    })
    api.on('drag-task', (ev: { id: string | number; inProgress?: boolean }) => {
      if (ev.inProgress) return
      const task = api.getTask(ev.id)
      if (task) handlersRef.current.onTaskUpdate(String(ev.id), { start: task.start, end: task.end, duration: task.duration })
    })
    api.on('add-link', (ev: { link: Partial<ILink> }) => handlersRef.current.onAddLink(ev.link))
    api.on('delete-link', (ev: { id: string | number }) => handlersRef.current.onDeleteLink(String(ev.id)))
  }

  return (
    <div className="card" style={{ height: 560, overflow: 'hidden' }}>
      <ThemeWrap>
        <Gantt
          tasks={tasks}
          links={links}
          columns={columns}
          cellHeight={34}
          scaleHeight={36}
          init={handleInit}
        />
      </ThemeWrap>
    </div>
  )
}
