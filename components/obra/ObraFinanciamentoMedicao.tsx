'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  Edit3, Plus, RefreshCw, Save, Trash2, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Etapa, FinanciamentoItem, FinanciamentoCronogramaBanco, FinanciamentoMedicao, FinanciamentoMedicaoItem, SubetapaCronograma } from '@/lib/types'
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
  const [loading, setLoading] = useState(true)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  const [selMedicao, setSelMedicao] = useState<string | null>(null)
  const [showNewMed, setShowNewMed] = useState(false)
  const [medForm, setMedForm] = useState({ data_medicao: '', observacao: '' })
  const [pctLocal, setPctLocal] = useState<Record<string, number>>({})
  const [filtroMed, setFiltroMed] = useState<'todos' | 'pendentes' | 'executados'>('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [itensRes, medRes, cronoRes, etapasRes, subRes] = await Promise.all([
      supabase.from('financiamento_itens').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('financiamento_medicoes').select('*').eq('obra_id', obraId).order('numero', { ascending: false }),
      supabase.from('financiamento_cronograma_banco').select('*').eq('obra_id', obraId).order('mes'),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('subetapas_cronograma').select('*').order('ordem'),
    ])
    setItens((itensRes.data || []) as FinanciamentoItem[])
    setMedicoes((medRes.data || []) as FinanciamentoMedicao[])
    setCronoBanco((cronoRes.data || []) as FinanciamentoCronogramaBanco[])
    setEtapas((etapasRes.data || []) as Etapa[])
    const allSub = (subRes.data || []) as SubetapaCronograma[]
    const etapaIds = new Set((etapasRes.data || []).map((e: Etapa) => e.id))
    setSubetapas(allSub.filter(s => etapaIds.has(s.etapa_id)))
    setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const tree = useMemo(() => buildTree(itens), [itens])
  const totalValor = useMemo(() => itens.filter(i => !i.parent_id).reduce((s, i) => s + Number(i.valor_financiado || 0), 0), [itens])
  const totalPeso = useMemo(() => itens.filter(i => !i.parent_id).reduce((s, i) => s + Number(i.peso || 0), 0), [itens])

  const medicaoSel = useMemo(() => medicoes.find(m => m.id === selMedicao), [medicoes, selMedicao])

  useEffect(() => {
    if (!selMedicao) { setMedItens([]); setPctLocal({}); return }
    supabase.from('financiamento_medicao_itens').select('*').eq('medicao_id', selMedicao).then(({ data }: { data: FinanciamentoMedicaoItem[] | null }) => {
      const items = (data || []) as FinanciamentoMedicaoItem[]
      setMedItens(items)
      const map: Record<string, number> = {}
      items.forEach(mi => { map[mi.item_id] = Number(mi.pct_executado) || 0 })
      setPctLocal(map)
    })
  }, [selMedicao, supabase])

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

  const etapaValorObra = useMemo(() => {
    const map = new Map<string, { valor: number; pctExec: number }>()
    etapas.forEach(e => map.set(e.nome.toLowerCase().trim(), { valor: 0, pctExec: Number(e.percentual_executado || 0) }))
    return map
  }, [etapas])

  function calcExecObra(node: TreeNode): number {
    if (node.children.length === 0) {
      const pct = pctLocal[node.id] ?? 0
      return (Number(node.peso) || 0) * pct / 100
    }
    return node.children.reduce((s, c) => s + calcExecObra(c), 0)
  }

  function calcPctItem(node: TreeNode): number {
    if (node.children.length === 0) return pctLocal[node.id] ?? 0
    const leaves = getLeaves([node])
    if (leaves.length === 0) return 0
    const totalPesoLeaves = leaves.reduce((s, l) => s + (Number(l.peso) || 0), 0)
    if (totalPesoLeaves === 0) return 0
    const execTotal = leaves.reduce((s, l) => s + (Number(l.peso) || 0) * (pctLocal[l.id] ?? 0) / 100, 0)
    return (execTotal / totalPesoLeaves) * 100
  }

  const acumuladoAtual = useMemo(() => tree.reduce((s, n) => s + calcExecObra(n), 0), [tree, pctLocal])

  const totalValorObra = useMemo(() => {
    let total = 0
    etapaValorObra.forEach(v => { total += v.valor })
    return total
  }, [etapaValorObra])

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

  // --- CRUD Medições ---
  async function criarMedicao() {
    if (!medForm.data_medicao) return
    const numero = medicoes.length > 0 ? Math.max(...medicoes.map(m => m.numero)) + 1 : 1
    const { data } = await supabase.from('financiamento_medicoes').insert({
      obra_id: obraId,
      orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
      numero, data_medicao: medForm.data_medicao,
      observacao: medForm.observacao.trim() || null,
    }).select().single()
    setShowNewMed(false)
    setMedForm({ data_medicao: '', observacao: '' })
    if (data) {
      setMedicoes(prev => [data as FinanciamentoMedicao, ...prev])
      setSelMedicao((data as FinanciamentoMedicao).id)
    }
  }

  async function salvarPct(itemId: string, valor: number) {
    if (!selMedicao) return
    const v = Math.min(100, Math.max(0, valor))
    setPctLocal(prev => ({ ...prev, [itemId]: v }))
    const existing = medItens.find(mi => mi.item_id === itemId && mi.medicao_id === selMedicao)
    if (existing) {
      await supabase.from('financiamento_medicao_itens').update({ pct_executado: v }).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('financiamento_medicao_itens').insert({ medicao_id: selMedicao, item_id: itemId, pct_executado: v }).select().single()
      if (data) setMedItens(prev => [...prev, data as FinanciamentoMedicaoItem])
    }
  }

  async function fecharMedicao(id: string) {
    if (!confirm('Fechar esta medição?')) return
    await supabase.from('financiamento_medicoes').update({ status: 'fechada', updated_at: new Date().toISOString() }).eq('id', id)
    setMedicoes(prev => prev.map(m => m.id === id ? { ...m, status: 'fechada' as const } : m))
  }

  async function reabrirMedicao(id: string) {
    await supabase.from('financiamento_medicoes').update({ status: 'aberta', updated_at: new Date().toISOString() }).eq('id', id)
    setMedicoes(prev => prev.map(m => m.id === id ? { ...m, status: 'aberta' as const } : m))
  }

  async function excluirMedicao(id: string) {
    if (!confirm('Excluir esta medição e todos os seus dados?')) return
    await supabase.from('financiamento_medicoes').delete().eq('id', id)
    setMedicoes(prev => prev.filter(m => m.id !== id))
    if (selMedicao === id) setSelMedicao(null)
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
      calcPctItem={calcPctItem}
    />
  )

  if (view === 'orcamento') return (
    <OrcamentoView
      tree={tree} itens={itens} totalValor={totalValor} totalPeso={totalPeso} totalValorObra={totalValorObra}
      collapsed={collapsed} setCollapsed={setCollapsed}
      editForm={editForm} setEditForm={setEditForm}
      saving={saving} salvarItem={salvarItem} removerItem={removerItem}
      toggleAll={toggleAll} isTodos={isTodos} etapaValorObra={etapaValorObra}
    />
  )

  if (view === 'execucao') return (
    <ExecucaoView
      tree={tree} medicoes={medicoes} medicaoSel={medicaoSel}
      selMedicao={selMedicao} setSelMedicao={setSelMedicao}
      showNewMed={showNewMed} setShowNewMed={setShowNewMed}
      medForm={medForm} setMedForm={setMedForm} criarMedicao={criarMedicao}
      pctLocal={pctLocal} salvarPct={salvarPct}
      calcExecObra={calcExecObra} calcPctItem={calcPctItem}
      acumuladoAtual={acumuladoAtual}
      fecharMedicao={fecharMedicao} reabrirMedicao={reabrirMedicao} excluirMedicao={excluirMedicao}
      collapsed={collapsed} setCollapsed={setCollapsed} toggleAll={toggleAll}
      isTodos={isTodos} cronogramaRef={cronogramaRef}
      filtroMed={filtroMed} setFiltroMed={setFiltroMed}
    />
  )

  return (
    <AcompanhamentoView medicoes={medicoes} cronoBanco={cronoBanco} acumuladoAtual={acumuladoAtual} />
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// VISÃO GERAL
// ════════════════════════════════════════════════════════════════════════════════
function VisaoGeral({ tree, itens, totalValor, totalValorObra, acumuladoAtual, cronoBanco, medicoes, calcPctItem }: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalValorObra: number
  acumuladoAtual: number; cronoBanco: FinanciamentoCronogramaBanco[]; medicoes: FinanciamentoMedicao[]
  calcPctItem: (n: TreeNode) => number
}) {
  const diferenca = totalValor - totalValorObra
  const mesAtual = medicoes.filter(m => m.status === 'fechada').length + 1
  const metaMes = cronoBanco.find(c => c.mes === mesAtual)

  return (
    <div className="flex flex-col gap-4">
      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Valor Financiado" valor={formatCurrency(totalValor)} />
        <Card label="% Executado" valor={`${acumuladoAtual.toFixed(1)}%`} accent />
        <Card label="Diferença Fin. vs Obra" valor={formatCurrency(Math.abs(diferenca))} sub={diferenca >= 0 ? 'acima' : 'abaixo'} />
        <Card label={`Meta Mês ${mesAtual}`} valor={metaMes ? `${Number(metaMes.pct_acumulado_previsto).toFixed(0)}%` : '—'} sub={metaMes ? (acumuladoAtual >= Number(metaMes.pct_acumulado_previsto) ? 'no prazo' : 'atrasado') : ''} accent={!!metaMes && acumuladoAtual >= Number(metaMes.pct_acumulado_previsto)} danger={!!metaMes && acumuladoAtual < Number(metaMes.pct_acumulado_previsto)} />
      </div>

      {/* Mini cascata nível 1 */}
      {tree.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Etapas do Financiamento
          </div>
          {tree.map(node => {
            const pct = calcPctItem(node)
            const barW = Math.min(pct, 100)
            return (
              <div key={node.id} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--accent)', width: 24 }}>{node.codigo}</span>
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{node.nome}</span>
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
function OrcamentoView({ tree, itens, totalValor, totalPeso, totalValorObra, collapsed, setCollapsed, editForm, setEditForm, saving, salvarItem, removerItem, toggleAll, isTodos, etapaValorObra }: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalPeso: number; totalValorObra: number
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void
  saving: boolean; salvarItem: () => void; removerItem: (id: string) => void
  toggleAll: (expand: boolean) => void; isTodos: boolean
  etapaValorObra: Map<string, { valor: number; pctExec: number }>
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
                removerItem={removerItem} isTodos={isTodos} etapaValorObra={etapaValorObra} />)}
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

function TreeRowOrc({ node, depth, collapsed, setCollapsed, editForm, setEditForm, removerItem, isTodos, etapaValorObra }: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void; removerItem: (id: string) => void
  isTodos: boolean; etapaValorObra: Map<string, { valor: number; pctExec: number }>
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed[node.id]
  const bg = depth === 0 ? 'var(--bg-secondary)' : undefined
  const fw = depth === 0 ? 700 : depth === 1 ? 600 : 400

  const obraMatch = etapaValorObra.get(node.nome.toLowerCase().trim())
  const valorObra = obraMatch?.valor ?? 0
  const valorFin = Number(node.valor_financiado) || 0
  const dif = valorFin > 0 && valorObra > 0 ? valorFin - valorObra : 0

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
          {dif !== 0 ? formatCurrency(dif) : '—'}
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
          removerItem={removerItem} isTodos={isTodos} etapaValorObra={etapaValorObra} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// EXECUÇÃO VIEW
// ════════════════════════════════════════════════════════════════════════════════
function ExecucaoView({ tree, medicoes, medicaoSel, selMedicao, setSelMedicao, showNewMed, setShowNewMed, medForm, setMedForm, criarMedicao, pctLocal, salvarPct, calcExecObra, calcPctItem, acumuladoAtual, fecharMedicao, reabrirMedicao, excluirMedicao, collapsed, setCollapsed, toggleAll, isTodos, cronogramaRef, filtroMed, setFiltroMed }: {
  tree: TreeNode[]; medicoes: FinanciamentoMedicao[]
  medicaoSel: FinanciamentoMedicao | undefined; selMedicao: string | null; setSelMedicao: (v: string | null) => void
  showNewMed: boolean; setShowNewMed: (v: boolean) => void
  medForm: { data_medicao: string; observacao: string }; setMedForm: (v: { data_medicao: string; observacao: string }) => void
  criarMedicao: () => void; pctLocal: Record<string, number>; salvarPct: (itemId: string, valor: number) => void
  calcExecObra: (node: TreeNode) => number; calcPctItem: (node: TreeNode) => number; acumuladoAtual: number
  fecharMedicao: (id: string) => void; reabrirMedicao: (id: string) => void; excluirMedicao: (id: string) => void
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void; toggleAll: (e: boolean) => void
  isTodos: boolean; cronogramaRef: Map<string, number>
  filtroMed: 'todos' | 'pendentes' | 'executados'; setFiltroMed: (v: 'todos' | 'pendentes' | 'executados') => void
}) {
  if (tree.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre o orçamento do financiamento antes de criar medições.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Medição selector */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={selMedicao || ''} onChange={e => setSelMedicao(e.target.value || null)} className="input-base text-sm py-1.5 w-full sm:w-64">
          <option value="">Selecionar medição...</option>
          {medicoes.map(m => (
            <option key={m.id} value={m.id}>
              Medição {m.numero} — {new Date(m.data_medicao + 'T12:00:00').toLocaleDateString('pt-BR')} {m.status === 'fechada' ? '(fechada)' : ''}
            </option>
          ))}
        </select>
        <button onClick={() => setShowNewMed(true)} disabled={isTodos} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          <Plus size={14} /> Nova
        </button>
        {medicaoSel && (
          <>
            <div className="flex-1" />
            {medicaoSel.status === 'aberta' ? (
              <button onClick={() => fecharMedicao(medicaoSel.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <Save size={13} /> Fechar
              </button>
            ) : (
              <button onClick={() => reabrirMedicao(medicaoSel.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Reabrir</button>
            )}
            <button onClick={() => excluirMedicao(medicaoSel.id)} className="p-1.5 rounded-lg" style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={15} /></button>
          </>
        )}
      </div>

      {showNewMed && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nova medição</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Data</span><input type="date" value={medForm.data_medicao} onChange={e => setMedForm({ ...medForm, data_medicao: e.target.value })} className="input-base w-full" /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Observação</span><input value={medForm.observacao} onChange={e => setMedForm({ ...medForm, observacao: e.target.value })} className="input-base w-full" /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewMed(false)} className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
            <button onClick={criarMedicao} disabled={!medForm.data_medicao} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50">Criar</button>
          </div>
        </div>
      )}

      {medicaoSel && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
              {(['todos', 'pendentes', 'executados'] as const).map(f => (
                <button key={f} onClick={() => setFiltroMed(f)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={filtroMed === f ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
                  {f === 'todos' ? 'Todos' : f === 'pendentes' ? 'Pendentes' : 'Executados'}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Recolher"><ChevronsDownUp size={15} /></button>
            <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Expandir"><ChevronsUpDown size={15} /></button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 550 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Serviço</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Peso</th>
                  <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Atual</th>
                  <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Próxima</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Exec. Obra</th>
                </tr>
              </thead>
              <tbody>
                {tree.map(node => (
                  <TreeRowExec key={node.id} node={node} depth={0}
                    collapsed={collapsed} setCollapsed={setCollapsed}
                    pctLocal={pctLocal} salvarPct={salvarPct}
                    calcExecObra={calcExecObra} calcPctItem={calcPctItem}
                    editable={medicaoSel.status === 'aberta'}
                    cronogramaRef={cronogramaRef} filtroMed={filtroMed} />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(59,123,248,0.08)' }}>
                  <td colSpan={4} className="px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>Mensurado Acumulado</td>
                  <td className="text-right px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>{acumuladoAtual.toFixed(2)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!selMedicao && medicoes.length === 0 && !showNewMed && (
        <div className="card p-10 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição criada. Clique em "Nova" para iniciar.</p>
        </div>
      )}
    </div>
  )
}

function TreeRowExec({ node, depth, collapsed, setCollapsed, pctLocal, salvarPct, calcExecObra, calcPctItem, editable, cronogramaRef, filtroMed }: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  pctLocal: Record<string, number>; salvarPct: (itemId: string, valor: number) => void
  calcExecObra: (node: TreeNode) => number; calcPctItem: (node: TreeNode) => number
  editable: boolean; cronogramaRef: Map<string, number>
  filtroMed: 'todos' | 'pendentes' | 'executados'
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed[node.id]
  const isLeaf = !hasChildren
  const pctAtual = isLeaf ? (pctLocal[node.id] ?? 0) : calcPctItem(node)
  const execObra = calcExecObra(node)
  const pctSistema = cronogramaRef.get(node.id)

  if (filtroMed === 'pendentes' && isLeaf && pctAtual >= 100) return null
  if (filtroMed === 'executados' && isLeaf && pctAtual < 100) return null

  const bg = depth === 0 ? 'var(--bg-secondary)' : undefined
  const fw = depth === 0 ? 700 : depth === 1 ? 600 : 400
  const pctColor = pctAtual >= 100 ? 'var(--success)' : pctAtual > 0 ? 'var(--accent)' : 'var(--text-secondary)'

  function resetToSistema() {
    if (pctSistema !== undefined) salvarPct(node.id, pctSistema)
  }

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
          </div>
        </td>
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{Number(node.peso) > 0 ? Number(node.peso).toFixed(2) : ''}</td>
        <td className="text-center px-3 py-2">
          <span style={{ color: pctColor, fontWeight: 600 }}>{pctAtual > 0 ? `${pctAtual.toFixed(0)}%` : ''}</span>
        </td>
        <td className="text-center px-3 py-2">
          {isLeaf && editable ? (
            <div className="flex items-center justify-center gap-1">
              <input type="number" min={0} max={100} step={1}
                value={pctLocal[node.id] ?? (pctSistema ?? '')}
                onChange={e => { const v = Math.min(100, Math.max(0, Number(e.target.value) || 0)); salvarPct(node.id, v) }}
                className="input-base w-16 text-center text-xs py-1"
              />
              {pctSistema !== undefined && (
                <button onClick={resetToSistema} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }} title={`Sugestão: ${pctSistema.toFixed(0)}%`}>
                  <RefreshCw size={12} />
                </button>
              )}
            </div>
          ) : (
            <span style={{ color: pctColor }}>{isLeaf ? '' : ''}</span>
          )}
        </td>
        <td className="text-right px-3 py-2 font-semibold" style={{ color: execObra > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
          {execObra > 0 ? execObra.toFixed(2) : ''}
        </td>
      </tr>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowExec key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          pctLocal={pctLocal} salvarPct={salvarPct}
          calcExecObra={calcExecObra} calcPctItem={calcPctItem}
          editable={editable} cronogramaRef={cronogramaRef} filtroMed={filtroMed} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ACOMPANHAMENTO VIEW
// ════════════════════════════════════════════════════════════════════════════════
function AcompanhamentoView({ medicoes, cronoBanco, acumuladoAtual }: {
  medicoes: FinanciamentoMedicao[]; cronoBanco: FinanciamentoCronogramaBanco[]; acumuladoAtual: number
}) {
  const fechadas = medicoes.filter(m => m.status === 'fechada').sort((a, b) => a.numero - b.numero)

  return (
    <div className="flex flex-col gap-4">
      {/* Histórico de medições */}
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cronograma do banco */}
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
