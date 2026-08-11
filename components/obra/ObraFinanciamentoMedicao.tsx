'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  Edit3, Plus, RefreshCw, Save, Trash2, TrendingUp, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Etapa, FinanciamentoItem, FinanciamentoCronogramaBanco, FinanciamentoMedicao, FinanciamentoMedicaoItem, OrcamentoItem, SubetapaCronograma } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'

type TreeNode = Omit<FinanciamentoItem, 'children'> & { children: TreeNode[] }
type ViewTab = 'visao' | 'orcamento' | 'execucao' | 'acompanhamento'

function buildTree(flat: FinanciamentoItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  const sorted = [...flat].sort((a, b) => a.ordem - b.ordem)
  sorted.forEach(item => map.set(item.id, { ...item, children: [] }))
  sorted.forEach(item => {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = []
  function walk(list: TreeNode[]) { list.forEach(n => { result.push(n); walk(n.children) }) }
  walk(nodes)
  return result
}

function getLeaves(nodes: TreeNode[]): TreeNode[] {
  return flattenTree(nodes).filter(n => n.children.length === 0)
}

type EditForm = { id?: string; parent_id: string | null; codigo: string; nome: string; valor_financiado: string; peso: string; nivel: 1 | 2 | 3 }

const emptyEdit = (nivel: 1 | 2 | 3, parent_id: string | null): EditForm => ({
  parent_id, codigo: '', nome: '', valor_financiado: '', peso: '', nivel,
})

export function ObraFinanciamentoMedicao({ obraId, orcamentoId, orcamentoIds, view }: { obraId: string; orcamentoId: string; orcamentoIds: string[]; view: ViewTab }) {
  const supabase = createClient()
  const isTodos = orcamentoId === TODOS_ORCAMENTOS

  const [itens, setItens] = useState<FinanciamentoItem[]>([])
  const [medicoes, setMedicoes] = useState<FinanciamentoMedicao[]>([])
  const [medItens, setMedItens] = useState<FinanciamentoMedicaoItem[]>([])
  const [cronoBanco, setCronoBanco] = useState<FinanciamentoCronogramaBanco[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapas, setSubetapas] = useState<SubetapaCronograma[]>([])
  const [orcItens, setOrcItens] = useState<OrcamentoItem[]>([])
  const [loading, setLoading] = useState(true)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  const [pctLocal, setPctLocal] = useState<Record<string, number>>({})
  const [pctSim, setPctSim] = useState<Record<string, number>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    const orcId = orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId
    const [itensRes, medRes, cronoRes, etapasRes, subRes, orcItensRes] = await Promise.all([
      supabase.from('financiamento_itens').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('financiamento_medicoes').select('*').eq('obra_id', obraId).order('numero', { ascending: false }),
      supabase.from('financiamento_cronograma_banco').select('*').eq('obra_id', obraId).order('mes'),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('subetapas_cronograma').select('*').order('ordem'),
      orcId
        ? supabase.from('orcamento_itens').select('id,etapa_id,quantidade,preco_unitario_snapshot,valor_total_informado_snapshot,valor_total_manual_ativo').eq('orcamento_id', orcId)
        : Promise.resolve({ data: [] }),
    ])
    setItens((itensRes.data || []) as FinanciamentoItem[])
    setMedicoes((medRes.data || []) as FinanciamentoMedicao[])
    setCronoBanco((cronoRes.data || []) as FinanciamentoCronogramaBanco[])
    setEtapas((etapasRes.data || []) as Etapa[])
    const allSub = (subRes.data || []) as SubetapaCronograma[]
    const etapaIds = new Set((etapasRes.data || []).map((e: Etapa) => e.id))
    setSubetapas(allSub.filter(s => etapaIds.has(s.etapa_id)))
    setOrcItens((orcItensRes.data || []) as OrcamentoItem[])
    setLoading(false)
  }, [obraId, orcamentoId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const tree = useMemo(() => buildTree(itens), [itens])
  const totalValor = useMemo(() => itens.filter(i => !i.parent_id).reduce((s, i) => s + Number(i.valor_financiado || 0), 0), [itens])
  const totalPeso = useMemo(() => itens.filter(i => !i.parent_id).reduce((s, i) => s + Number(i.peso || 0), 0), [itens])

  // Valor Obra per etapa: sum orcamento_itens grouped by etapa_id
  const valorObraMap = useMemo(() => {
    const map = new Map<string, number>()
    orcItens.forEach(oi => {
      if (!oi.etapa_id) return
      const valor = oi.valor_total_manual_ativo && oi.valor_total_informado_snapshot != null
        ? Number(oi.valor_total_informado_snapshot)
        : Number(oi.quantidade) * Number(oi.preco_unitario_snapshot)
      map.set(oi.etapa_id, (map.get(oi.etapa_id) || 0) + valor)
    })
    return map
  }, [orcItens])

  // Map financiamento item -> valor obra via etapa_ref_id
  const itemValorObra = useCallback((item: FinanciamentoItem | TreeNode): number => {
    if (item.etapa_ref_id) return valorObraMap.get(item.etapa_ref_id) || 0
    return 0
  }, [valorObraMap])

  const totalValorObra = useMemo(() => {
    return itens.filter(i => !i.parent_id).reduce((s, i) => s + itemValorObra(i), 0)
  }, [itens, itemValorObra])

  // Load last closed measurement's pct as "% Atual"
  const ultimaMedicaoFechada = useMemo(() => {
    return medicoes.find(m => m.status === 'fechada')
  }, [medicoes])

  useEffect(() => {
    if (!ultimaMedicaoFechada) { setPctLocal({}); return }
    supabase.from('financiamento_medicao_itens').select('*').eq('medicao_id', ultimaMedicaoFechada.id).then(({ data }: { data: FinanciamentoMedicaoItem[] | null }) => {
      const items = (data || []) as FinanciamentoMedicaoItem[]
      const map: Record<string, number> = {}
      items.forEach(mi => { map[mi.item_id] = Number(mi.pct_executado) || 0 })
      setPctLocal(map)
    })
  }, [ultimaMedicaoFechada, supabase])

  // Cross-ref: etapas do cronograma -> % executado no sistema
  const cronogramaRef = useMemo(() => {
    const map = new Map<string, number>()
    itens.forEach(item => {
      if (item.etapa_ref_id) {
        const etapa = etapas.find(e => e.id === item.etapa_ref_id)
        if (etapa) map.set(item.id, etapa.percentual_executado || 0)
      }
      if (item.subetapa_ref_id) {
        const sub = subetapas.find(s => s.id === item.subetapa_ref_id)
        if (sub) map.set(item.id, sub.percentual_executado || 0)
      }
    })
    return map
  }, [itens, etapas, subetapas])

  function calcPctItem(node: TreeNode, source: Record<string, number>): number {
    if (node.children.length === 0) return source[node.id] ?? 0
    const leaves = getLeaves([node])
    if (leaves.length === 0) return 0
    const totalPesoLeaves = leaves.reduce((s, l) => s + (Number(l.peso) || 0), 0)
    if (totalPesoLeaves === 0) return 0
    const execTotal = leaves.reduce((s, l) => s + (Number(l.peso) || 0) * (source[l.id] ?? 0) / 100, 0)
    return (execTotal / totalPesoLeaves) * 100
  }

  function calcExecObra(node: TreeNode, source: Record<string, number>): number {
    if (node.children.length === 0) {
      const pct = source[node.id] ?? 0
      return (Number(node.peso) || 0) * pct / 100
    }
    return node.children.reduce((s, c) => s + calcExecObra(c, source), 0)
  }

  const acumuladoAtual = useMemo(() => tree.reduce((s, n) => s + calcExecObra(n, pctLocal), 0), [tree, pctLocal])
  const acumuladoSim = useMemo(() => {
    if (Object.keys(pctSim).length === 0) return acumuladoAtual
    const merged = { ...pctLocal, ...pctSim }
    return tree.reduce((s, n) => s + calcExecObra(n, merged), 0)
  }, [tree, pctLocal, pctSim, acumuladoAtual])

  // --- CRUD Árvore ---
  async function salvarItem() {
    if (!editForm || !editForm.nome.trim() || isTodos) return
    setSaving(true)
    const payload = {
      obra_id: obraId,
      orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
      parent_id: editForm.parent_id || null,
      codigo: editForm.codigo.trim() || null,
      nome: editForm.nome.trim(),
      valor_financiado: Number(editForm.valor_financiado) || 0,
      peso: Number(editForm.peso) || 0,
      nivel: editForm.nivel,
      ordem: editForm.id ? (itens.find(i => i.id === editForm.id)?.ordem || 0) : itens.filter(i => i.parent_id === (editForm.parent_id || null)).length,
      updated_at: new Date().toISOString(),
    }
    if (editForm.id) {
      await supabase.from('financiamento_itens').update(payload).eq('id', editForm.id)
    } else {
      await supabase.from('financiamento_itens').insert(payload)
    }
    setEditForm(null)
    setSaving(false)
    carregar()
  }

  async function removerItem(id: string) {
    if (!confirm('Excluir este item e todos os filhos?')) return
    await supabase.from('financiamento_itens').delete().eq('id', id)
    carregar()
  }

  // --- Registrar medição a partir da simulação ---
  async function registrarMedicao() {
    if (Object.keys(pctSim).length === 0) return
    const numero = medicoes.length > 0 ? Math.max(...medicoes.map(m => m.numero)) + 1 : 1
    const hoje = new Date().toISOString().split('T')[0]
    const { data: novaMed } = await supabase.from('financiamento_medicoes').insert({
      obra_id: obraId,
      orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
      numero, data_medicao: hoje, status: 'fechada',
    }).select().single()
    if (!novaMed) return
    const med = novaMed as FinanciamentoMedicao
    const merged = { ...pctLocal, ...pctSim }
    const leaves = getLeaves(tree)
    const rows = leaves.map(l => ({
      medicao_id: med.id,
      item_id: l.id,
      pct_executado: merged[l.id] ?? 0,
    }))
    if (rows.length > 0) {
      await supabase.from('financiamento_medicao_itens').insert(rows)
    }
    setPctLocal(merged)
    setPctSim({})
    setMedicoes(prev => [med, ...prev])
  }

  async function excluirMedicao(id: string) {
    if (!confirm('Excluir esta medição e todos os seus dados?')) return
    await supabase.from('financiamento_medicoes').delete().eq('id', id)
    setMedicoes(prev => prev.filter(m => m.id !== id))
    carregar()
  }

  function toggleAll(expand: boolean) {
    const map: Record<string, boolean> = {}
    flattenTree(tree).forEach(n => { if (n.children.length > 0) map[n.id] = !expand })
    setCollapsed(map)
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  if (view === 'visao') return (
    <VisaoGeral
      tree={tree} itens={itens} totalValor={totalValor} totalValorObra={totalValorObra}
      acumuladoAtual={acumuladoAtual} cronoBanco={cronoBanco} medicoes={medicoes}
      calcPctItem={(n) => calcPctItem(n, pctLocal)} itemValorObra={itemValorObra}
    />
  )

  if (view === 'orcamento') return (
    <OrcamentoView
      tree={tree} itens={itens} totalValor={totalValor} totalPeso={totalPeso} totalValorObra={totalValorObra}
      collapsed={collapsed} setCollapsed={setCollapsed}
      editForm={editForm} setEditForm={setEditForm}
      saving={saving} salvarItem={salvarItem} removerItem={removerItem}
      toggleAll={toggleAll} isTodos={isTodos} itemValorObra={itemValorObra}
    />
  )

  if (view === 'execucao') return (
    <ExecucaoView
      tree={tree} totalValor={totalValor}
      pctLocal={pctLocal} pctSim={pctSim} setPctSim={setPctSim}
      calcPctItemAtual={(n) => calcPctItem(n, pctLocal)}
      calcPctItemSim={(n) => calcPctItem(n, { ...pctLocal, ...pctSim })}
      calcExecObraAtual={(n) => calcExecObra(n, pctLocal)}
      calcExecObraSim={(n) => calcExecObra(n, { ...pctLocal, ...pctSim })}
      acumuladoAtual={acumuladoAtual} acumuladoSim={acumuladoSim}
      cronogramaRef={cronogramaRef} cronoBanco={cronoBanco} medicoes={medicoes}
      registrarMedicao={registrarMedicao}
      collapsed={collapsed} setCollapsed={setCollapsed} toggleAll={toggleAll}
      isTodos={isTodos}
    />
  )

  return (
    <AcompanhamentoView medicoes={medicoes} cronoBanco={cronoBanco} acumuladoAtual={acumuladoAtual}
      excluirMedicao={excluirMedicao} />
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// VISÃO GERAL
// ════════════════════════════════════════════════════════════════════════════════
function VisaoGeral({ tree, itens, totalValor, totalValorObra, acumuladoAtual, cronoBanco, medicoes, calcPctItem, itemValorObra }: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalValorObra: number
  acumuladoAtual: number; cronoBanco: FinanciamentoCronogramaBanco[]; medicoes: FinanciamentoMedicao[]
  calcPctItem: (n: TreeNode) => number; itemValorObra: (i: FinanciamentoItem | TreeNode) => number
}) {
  const diferenca = totalValor - totalValorObra
  const mesAtual = medicoes.filter(m => m.status === 'fechada').length + 1
  const metaMes = cronoBanco.find(c => c.mes === mesAtual)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Valor Financiado" valor={formatCurrency(totalValor)} />
        <Card label="% Executado" valor={`${acumuladoAtual.toFixed(1)}%`} accent />
        <Card label="Diferença Fin. vs Obra" valor={formatCurrency(Math.abs(diferenca))} sub={diferenca >= 0 ? 'acima' : 'abaixo'} />
        <Card label={`Meta Mês ${mesAtual}`} valor={metaMes ? `${Number(metaMes.pct_acumulado_previsto).toFixed(0)}%` : '—'} sub={metaMes ? (acumuladoAtual >= Number(metaMes.pct_acumulado_previsto) ? 'no prazo' : 'atrasado') : ''} accent={!!metaMes && acumuladoAtual >= Number(metaMes.pct_acumulado_previsto)} danger={!!metaMes && acumuladoAtual < Number(metaMes.pct_acumulado_previsto)} />
      </div>

      {tree.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Etapas do Financiamento
          </div>
          {tree.map(node => {
            const pct = calcPctItem(node)
            const barW = Math.min(pct, 100)
            const vObra = itemValorObra(node)
            return (
              <div key={node.id} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--accent)', width: 24 }}>{node.codigo}</span>
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{node.nome}</span>
                <span className="text-[10px] flex-shrink-0 hidden sm:block" style={{ color: 'var(--text-secondary)', width: 70, textAlign: 'right' }}>{vObra > 0 ? formatCurrency(vObra) : '—'}</span>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-secondary)', width: 40, textAlign: 'right' }}>{Number(node.peso).toFixed(1)}%</span>
                <div className="flex-shrink-0" style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--border)' }}>
                  <div style={{ width: `${barW}%`, height: '100%', borderRadius: 3, background: pct >= 100 ? 'var(--success)' : 'var(--accent)', transition: 'width .3s' }} />
                </div>
                <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: pct >= 100 ? 'var(--success)' : pct > 0 ? 'var(--accent)' : 'var(--text-secondary)', width: 32, textAlign: 'right' }}>
                  {pct > 0 ? `${pct.toFixed(0)}%` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {tree.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa cadastrada. Vá para a aba Orçamento para começar.</p>
        </div>
      )}
    </div>
  )
}

function Card({ label, valor, sub, accent, danger }: { label: string; valor: string; sub?: string; accent?: boolean; danger?: boolean }) {
  const color = danger ? 'var(--danger)' : accent ? 'var(--accent)' : 'var(--text-primary)'
  return (
    <div className="card p-3">
      <p className="text-[10px] sm:text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-sm sm:text-lg font-bold truncate" style={{ color }}>{valor}</p>
      {sub && <p className="text-[10px] truncate" style={{ color: danger ? 'var(--danger)' : 'var(--text-secondary)' }}>{sub}</p>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ORÇAMENTO VIEW
// ════════════════════════════════════════════════════════════════════════════════
function OrcamentoView({ tree, itens, totalValor, totalPeso, totalValorObra, collapsed, setCollapsed, editForm, setEditForm, saving, salvarItem, removerItem, toggleAll, isTodos, itemValorObra }: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalPeso: number; totalValorObra: number
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void
  saving: boolean; salvarItem: () => void; removerItem: (id: string) => void
  toggleAll: (expand: boolean) => void; isTodos: boolean
  itemValorObra: (i: FinanciamentoItem | TreeNode) => number
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditForm(emptyEdit(1, null))} disabled={isTodos} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          <Plus size={14} /> Adicionar item
        </button>
        <div className="flex-1" />
        <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Recolher"><ChevronsDownUp size={16} /></button>
        <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Expandir"><ChevronsUpDown size={16} /></button>
      </div>

      {editForm && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{editForm.id ? 'Editar item' : `Novo item (nível ${editForm.nivel})`}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Código</span><input value={editForm.codigo} onChange={e => setEditForm({ ...editForm, codigo: e.target.value })} className="input-base w-full" placeholder="1" /></label>
            <label className="block sm:col-span-3"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Nome</span><input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} className="input-base w-full" placeholder="Infraestrutura" /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Valor financiado (R$)</span><input type="number" min={0} step="0.01" value={editForm.valor_financiado} onChange={e => setEditForm({ ...editForm, valor_financiado: e.target.value })} className="input-base w-full" /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Peso (%)</span><input type="number" min={0} max={100} step="0.01" value={editForm.peso} onChange={e => setEditForm({ ...editForm, peso: e.target.value })} className="input-base w-full" /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditForm(null)} className="px-3 py-1.5 text-xs rounded-lg" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
            <button onClick={salvarItem} disabled={saving || !editForm.nome.trim()} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {tree.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum item cadastrado. Adicione as etapas do financiamento.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Serviço</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Peso</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Valor Financ.</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Valor Obra</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Diferença</th>
                <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--text-secondary)', width: 70 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => <TreeRowOrc key={node.id} node={node} depth={0}
                collapsed={collapsed} setCollapsed={setCollapsed}
                editForm={editForm} setEditForm={setEditForm}
                removerItem={removerItem} isTodos={isTodos} itemValorObra={itemValorObra} />)}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>TOTAL</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--accent)' }}>{totalPeso.toFixed(2)}%</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalValor)}</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(totalValorObra)}</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: totalValor - totalValorObra >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatCurrency(totalValor - totalValorObra)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function TreeRowOrc({ node, depth, collapsed, setCollapsed, editForm, setEditForm, removerItem, isTodos, itemValorObra }: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void; removerItem: (id: string) => void
  isTodos: boolean; itemValorObra: (i: FinanciamentoItem | TreeNode) => number
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed[node.id]
  const bg = depth === 0 ? 'var(--bg-secondary)' : undefined
  const fw = depth === 0 ? 700 : depth === 1 ? 600 : 400

  const valorObra = itemValorObra(node)
  const valorFin = Number(node.valor_financiado) || 0
  const dif = valorFin - valorObra

  return (
    <>
      <tr style={{ background: bg, borderBottom: '1px solid var(--border)' }}>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button onClick={() => setCollapsed({ ...collapsed, [node.id]: !isCollapsed })} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : <span style={{ width: 18 }} />}
            <span style={{ fontWeight: fw, color: 'var(--text-primary)' }}>
              {node.codigo && <span style={{ color: 'var(--accent)', marginRight: 6 }}>{node.codigo}</span>}
              {node.nome}
            </span>
            {node.origem === 'manual' && <span className="px-1 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--warning)' }}>MAN</span>}
          </div>
        </td>
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{Number(node.peso) > 0 ? `${Number(node.peso).toFixed(2)}` : ''}</td>
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{valorFin > 0 ? formatCurrency(valorFin) : ''}</td>
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{valorObra > 0 ? formatCurrency(valorObra) : '—'}</td>
        <td className="text-right px-3 py-2" style={{ color: dif > 0 ? 'var(--success)' : dif < 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
          {valorFin > 0 || valorObra > 0 ? formatCurrency(dif) : '—'}
        </td>
        <td className="text-center px-2 py-2">
          {!isTodos && (
            <div className="flex items-center justify-center gap-0.5">
              {node.nivel < 3 && (
                <button onClick={() => setEditForm(emptyEdit((node.nivel + 1) as 1 | 2 | 3, node.id))} className="p-1 rounded" style={{ color: 'var(--accent)' }} title="Adicionar sub-item"><Plus size={13} /></button>
              )}
              <button onClick={() => setEditForm({ id: node.id, parent_id: node.parent_id, codigo: node.codigo || '', nome: node.nome, valor_financiado: String(node.valor_financiado || ''), peso: String(node.peso || ''), nivel: node.nivel })} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }} title="Editar"><Edit3 size={13} /></button>
              <button onClick={() => removerItem(node.id)} className="p-1 rounded" style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={13} /></button>
            </div>
          )}
        </td>
      </tr>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowOrc key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          editForm={editForm} setEditForm={setEditForm}
          removerItem={removerItem} isTodos={isTodos} itemValorObra={itemValorObra} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// EXECUÇÃO VIEW
// ════════════════════════════════════════════════════════════════════════════════
function ExecucaoView({ tree, totalValor, pctLocal, pctSim, setPctSim, calcPctItemAtual, calcPctItemSim, calcExecObraAtual, calcExecObraSim, acumuladoAtual, acumuladoSim, cronogramaRef, cronoBanco, medicoes, registrarMedicao, collapsed, setCollapsed, toggleAll, isTodos }: {
  tree: TreeNode[]; totalValor: number
  pctLocal: Record<string, number>; pctSim: Record<string, number>; setPctSim: (v: Record<string, number>) => void
  calcPctItemAtual: (n: TreeNode) => number; calcPctItemSim: (n: TreeNode) => number
  calcExecObraAtual: (n: TreeNode) => number; calcExecObraSim: (n: TreeNode) => number
  acumuladoAtual: number; acumuladoSim: number
  cronogramaRef: Map<string, number>; cronoBanco: FinanciamentoCronogramaBanco[]; medicoes: FinanciamentoMedicao[]
  registrarMedicao: () => void
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void; toggleAll: (e: boolean) => void
  isTodos: boolean
}) {
  const hasSim = Object.keys(pctSim).length > 0
  const mesAtual = medicoes.filter(m => m.status === 'fechada').length + 1
  const metaMes = cronoBanco.find(c => c.mes === mesAtual)
  const metaPct = metaMes ? Number(metaMes.pct_acumulado_previsto) : null

  // Previsão de reembolso
  const valorReembolsoSim = totalValor * (acumuladoSim / 100)
  const valorReembolsoAtual = totalValor * (acumuladoAtual / 100)
  const ganhoMedicao = valorReembolsoSim - valorReembolsoAtual

  if (tree.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre o orçamento do financiamento antes de medir.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="% Atual" valor={`${acumuladoAtual.toFixed(1)}%`} />
        <Card label="% Simulação" valor={`${acumuladoSim.toFixed(1)}%`} accent={hasSim} sub={hasSim ? `+${(acumuladoSim - acumuladoAtual).toFixed(1)}pp` : 'igual ao atual'} />
        <Card label={`Meta Mês ${mesAtual}`} valor={metaPct ? `${metaPct.toFixed(0)}%` : '—'} accent={metaPct != null && acumuladoSim >= metaPct} danger={metaPct != null && acumuladoSim < metaPct} sub={metaPct != null ? (acumuladoSim >= metaPct ? 'atingida' : `faltam ${(metaPct - acumuladoSim).toFixed(1)}pp`) : ''} />
        <Card label="Previsão Reembolso" valor={formatCurrency(ganhoMedicao)} sub={hasSim ? `acumulado: ${formatCurrency(valorReembolsoSim)}` : 'simule para prever'} accent={ganhoMedicao > 0} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {hasSim && (
          <>
            <button onClick={registrarMedicao} disabled={isTodos}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-semibold transition-all"
              style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <Save size={14} /> Registrar Medição {medicoes.filter(m => m.status === 'fechada').length + 1}
            </button>
            <button onClick={() => setPctSim({})}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <X size={13} /> Limpar simulação
            </button>
          </>
        )}
        <div className="flex-1" />
        <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Recolher"><ChevronsDownUp size={15} /></button>
        <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Expandir"><ChevronsUpDown size={15} /></button>
      </div>

      {/* Cascata */}
      <div className="card overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 500 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Serviço</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Peso</th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Atual</th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--accent)' }}>% Simulação</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Exec.</th>
            </tr>
          </thead>
          <tbody>
            {tree.map(node => (
              <TreeRowExec key={node.id} node={node} depth={0}
                collapsed={collapsed} setCollapsed={setCollapsed}
                pctLocal={pctLocal} pctSim={pctSim} setPctSim={setPctSim}
                calcPctItemAtual={calcPctItemAtual} calcPctItemSim={calcPctItemSim}
                calcExecObraSim={calcExecObraSim}
                cronogramaRef={cronogramaRef} />
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'rgba(59,123,248,0.08)' }}>
              <td className="px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>TOTAL</td>
              <td />
              <td className="text-center px-3 py-2 font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{acumuladoAtual.toFixed(1)}%</td>
              <td className="text-center px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>{acumuladoSim.toFixed(1)}%</td>
              <td className="text-right px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>{acumuladoSim.toFixed(2)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Previsão de reembolso detalhada */}
      {hasSim && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Previsão de Reembolso</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Reembolso acumulado anterior</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(valorReembolsoAtual)}</p>
              <p style={{ color: 'var(--text-secondary)' }}>{acumuladoAtual.toFixed(1)}% de {formatCurrency(totalValor)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(59,123,248,0.06)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Reembolso com esta medição</p>
              <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(valorReembolsoSim)}</p>
              <p style={{ color: 'var(--text-secondary)' }}>{acumuladoSim.toFixed(1)}% de {formatCurrency(totalValor)}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Ganho nesta medição</p>
              <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{formatCurrency(ganhoMedicao)}</p>
              <p style={{ color: 'var(--text-secondary)' }}>+{(acumuladoSim - acumuladoAtual).toFixed(1)}pp de evolução</p>
            </div>
          </div>
          {metaPct != null && (
            <div className="mt-3 p-2 rounded-lg text-xs" style={{ background: acumuladoSim >= metaPct ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', color: acumuladoSim >= metaPct ? 'var(--success)' : 'var(--danger)' }}>
              {acumuladoSim >= metaPct
                ? `Meta do mês ${mesAtual} (${metaPct}%) atingida! Evolução ${(acumuladoSim - metaPct).toFixed(1)}pp acima.`
                : `Atenção: meta do mês ${mesAtual} é ${metaPct}%, faltam ${(metaPct - acumuladoSim).toFixed(1)}pp para atingir.`
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TreeRowExec({ node, depth, collapsed, setCollapsed, pctLocal, pctSim, setPctSim, calcPctItemAtual, calcPctItemSim, calcExecObraSim, cronogramaRef }: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  pctLocal: Record<string, number>; pctSim: Record<string, number>; setPctSim: (v: Record<string, number>) => void
  calcPctItemAtual: (n: TreeNode) => number; calcPctItemSim: (n: TreeNode) => number
  calcExecObraSim: (n: TreeNode) => number
  cronogramaRef: Map<string, number>
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed[node.id]
  const isLeaf = !hasChildren
  const pctAtual = isLeaf ? (pctLocal[node.id] ?? 0) : calcPctItemAtual(node)
  const simVal = pctSim[node.id]
  const pctSimCalc = isLeaf ? (simVal ?? pctLocal[node.id] ?? 0) : calcPctItemSim(node)
  const execObraSim = calcExecObraSim(node)
  const pctSistema = cronogramaRef.get(node.id)
  const changed = isLeaf && simVal !== undefined && simVal !== (pctLocal[node.id] ?? 0)

  const bg = depth === 0 ? 'var(--bg-secondary)' : undefined
  const fw = depth === 0 ? 700 : depth === 1 ? 600 : 400
  const pctColor = pctAtual >= 100 ? 'var(--success)' : pctAtual > 0 ? 'var(--accent)' : 'var(--text-secondary)'

  function updateSim(val: number) {
    const v = Math.min(100, Math.max(0, val))
    if (v === (pctLocal[node.id] ?? 0)) {
      const next = { ...pctSim }
      delete next[node.id]
      setPctSim(next)
    } else {
      setPctSim({ ...pctSim, [node.id]: v })
    }
  }

  function resetToSistema() {
    if (pctSistema !== undefined) updateSim(pctSistema)
  }

  return (
    <>
      <tr style={{ background: changed ? 'rgba(59,123,248,0.04)' : bg, borderBottom: '1px solid var(--border)' }}>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button onClick={() => setCollapsed({ ...collapsed, [node.id]: !isCollapsed })} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : <span style={{ width: 18 }} />}
            <span style={{ fontWeight: fw, color: 'var(--text-primary)' }}>
              {node.codigo && <span style={{ color: 'var(--accent)', marginRight: 6 }}>{node.codigo}</span>}
              {node.nome}
            </span>
          </div>
        </td>
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{Number(node.peso) > 0 ? Number(node.peso).toFixed(2) : ''}</td>
        <td className="text-center px-3 py-2">
          <span style={{ color: pctColor, fontWeight: 600 }}>{pctAtual > 0 ? `${pctAtual.toFixed(0)}%` : '—'}</span>
        </td>
        <td className="text-center px-3 py-2">
          {isLeaf ? (
            <div className="flex items-center justify-center gap-1">
              <input type="number" min={0} max={100} step={1}
                value={simVal ?? pctLocal[node.id] ?? 0}
                onChange={e => updateSim(Number(e.target.value) || 0)}
                className="input-base w-16 text-center text-xs py-1"
                style={changed ? { borderColor: 'var(--accent)', background: 'rgba(59,123,248,0.06)' } : {}}
              />
              {pctSistema !== undefined && (
                <button onClick={resetToSistema} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }} title={`Sugestão sistema: ${pctSistema.toFixed(0)}%`}>
                  <RefreshCw size={12} />
                </button>
              )}
            </div>
          ) : (
            <span style={{ color: pctSimCalc !== pctAtual ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600 }}>
              {pctSimCalc > 0 ? `${pctSimCalc.toFixed(0)}%` : '—'}
            </span>
          )}
        </td>
        <td className="text-right px-3 py-2 font-semibold" style={{ color: execObraSim > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
          {execObraSim > 0 ? execObraSim.toFixed(2) : ''}
        </td>
      </tr>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowExec key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          pctLocal={pctLocal} pctSim={pctSim} setPctSim={setPctSim}
          calcPctItemAtual={calcPctItemAtual} calcPctItemSim={calcPctItemSim}
          calcExecObraSim={calcExecObraSim} cronogramaRef={cronogramaRef} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ACOMPANHAMENTO VIEW
// ════════════════════════════════════════════════════════════════════════════════
function AcompanhamentoView({ medicoes, cronoBanco, acumuladoAtual, excluirMedicao }: {
  medicoes: FinanciamentoMedicao[]; cronoBanco: FinanciamentoCronogramaBanco[]; acumuladoAtual: number
  excluirMedicao: (id: string) => void
}) {
  const fechadas = medicoes.filter(m => m.status === 'fechada').sort((a, b) => a.numero - b.numero)

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-x-auto">
        <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          Histórico de Medições
        </div>
        {medicoes.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição registrada.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-3 py-2" style={{ color: 'var(--text-secondary)' }}>Medição</th>
                <th className="text-left px-3 py-2" style={{ color: 'var(--text-secondary)' }}>Data</th>
                <th className="text-center px-3 py-2" style={{ color: 'var(--text-secondary)' }}>Status</th>
                <th className="text-center px-2 py-2" style={{ color: 'var(--text-secondary)', width: 50 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {medicoes.sort((a, b) => a.numero - b.numero).map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>Medição {m.numero}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{new Date(m.data_medicao + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="text-center px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{
                      background: m.status === 'fechada' ? 'rgba(34,197,94,0.12)' : 'rgba(59,123,248,0.12)',
                      color: m.status === 'fechada' ? 'var(--success)' : 'var(--accent)',
                    }}>{m.status === 'fechada' ? 'Fechada' : 'Aberta'}</span>
                  </td>
                  <td className="text-center px-2 py-2">
                    <button onClick={() => excluirMedicao(m.id)} className="p-1 rounded" style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {cronoBanco.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Cronograma do Banco — Previsto vs Realizado
          </div>
          <div className="p-3">
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {cronoBanco.map(c => {
                const previsto = Number(c.pct_acumulado_previsto)
                const hPrev = (previsto / 100) * 100
                const realizado = c.mes <= fechadas.length ? Math.min(acumuladoAtual, previsto) : 0
                const hReal = (realizado / 100) * 100
                return (
                  <div key={c.mes} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex items-end gap-px" style={{ height: 100 }}>
                      <div className="flex-1 rounded-t" style={{ height: hPrev, background: 'var(--border)', minHeight: 2 }} title={`Previsto: ${previsto}%`} />
                      <div className="flex-1 rounded-t" style={{ height: hReal, background: c.mes <= fechadas.length ? 'var(--accent)' : 'transparent', minHeight: c.mes <= fechadas.length ? 2 : 0 }} title={`Realizado: ${realizado.toFixed(1)}%`} />
                    </div>
                    <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{c.mes}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1"><div className="w-3 h-2 rounded" style={{ background: 'var(--border)' }} /><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Previsto</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-2 rounded" style={{ background: 'var(--accent)' }} /><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Realizado</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
