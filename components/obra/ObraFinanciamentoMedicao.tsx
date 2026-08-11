'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  Download, Edit3, Filter, Plus, Save, Trash2, X, ClipboardList, Eye, EyeOff
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Etapa, FinanciamentoItem, FinanciamentoMedicao, FinanciamentoMedicaoItem, SubetapaCronograma } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'

type TreeNode = Omit<FinanciamentoItem, 'children'> & { children: TreeNode[] }

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
  function walk(list: TreeNode[]) {
    list.forEach(n => { result.push(n); walk(n.children) })
  }
  walk(nodes)
  return result
}

function getLeaves(nodes: TreeNode[]): TreeNode[] {
  return flattenTree(nodes).filter(n => n.children.length === 0)
}

function sumPesoChildren(node: TreeNode): number {
  if (node.children.length === 0) return Number(node.peso) || 0
  return node.children.reduce((s, c) => s + sumPesoChildren(c), 0)
}

type EditForm = { id?: string; parent_id: string | null; codigo: string; nome: string; valor_financiado: string; peso: string; nivel: 1 | 2 | 3 }

const emptyEdit = (nivel: 1 | 2 | 3, parent_id: string | null): EditForm => ({
  parent_id, codigo: '', nome: '', valor_financiado: '', peso: '', nivel,
})

export function ObraFinanciamentoMedicao({ obraId, orcamentoId, orcamentoIds }: { obraId: string; orcamentoId: string; orcamentoIds: string[] }) {
  const supabase = createClient()
  const isTodos = orcamentoId === TODOS_ORCAMENTOS

  const [subTab, setSubTab] = useState<'planilha' | 'medicoes'>('planilha')
  const [itens, setItens] = useState<FinanciamentoItem[]>([])
  const [medicoes, setMedicoes] = useState<FinanciamentoMedicao[]>([])
  const [medItens, setMedItens] = useState<FinanciamentoMedicaoItem[]>([])
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
  const [showSistema, setShowSistema] = useState(true)
  const [filtroMed, setFiltroMed] = useState<'todos' | 'pendentes' | 'executados'>('todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    const [itensRes, medRes, etapasRes, subRes] = await Promise.all([
      supabase.from('financiamento_itens').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('financiamento_medicoes').select('*').eq('obra_id', obraId).order('numero', { ascending: false }),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('subetapas_cronograma').select('*').order('ordem'),
    ])
    setItens((itensRes.data || []) as FinanciamentoItem[])
    setMedicoes((medRes.data || []) as FinanciamentoMedicao[])
    setEtapas((etapasRes.data || []) as Etapa[])
    const allSub = (subRes.data || []) as SubetapaCronograma[]
    const etapaIds = new Set((etapasRes.data || []).map((e: Etapa) => e.id))
    setSubetapas(allSub.filter(s => etapaIds.has(s.etapa_id)))
    setLoading(false)
  }, [obraId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const tree = useMemo(() => buildTree(itens), [itens])
  const leaves = useMemo(() => getLeaves(tree), [tree])
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

  const pctMedAnterior = useMemo(() => {
    if (!medicaoSel) return new Map<string, number>()
    const anteriores = medicoes.filter(m => m.numero < medicaoSel.numero)
    if (anteriores.length === 0) return new Map<string, number>()
    const ultimaAnterior = anteriores.sort((a, b) => b.numero - a.numero)[0]
    const map = new Map<string, number>()
    medItens.forEach(mi => {
      if (mi.medicao_id === ultimaAnterior.id) map.set(mi.item_id, Number(mi.pct_executado) || 0)
    })
    return map
  }, [medicaoSel, medicoes, medItens])

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

  function calcExecObra(node: TreeNode): number {
    if (node.children.length === 0) {
      const pct = pctLocal[node.id] ?? 0
      return (Number(node.peso) || 0) * pct / 100
    }
    return node.children.reduce((s, c) => s + calcExecObra(c), 0)
  }

  function calcPctItem(node: TreeNode): number {
    if (node.children.length === 0) return pctLocal[node.id] ?? 0
    const pesoTotal = sumPesoChildren(node)
    if (pesoTotal === 0) return 0
    const execTotal = node.children.reduce((s, c) => s + calcExecObra(c), 0)
    return (execTotal / pesoTotal) * 100
  }

  const acumuladoAtual = useMemo(() => tree.reduce((s, n) => s + calcExecObra(n), 0), [tree, pctLocal])

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
      const { error } = await supabase.from('financiamento_itens').update(payload).eq('id', editForm.id)
      if (error) { alert(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('financiamento_itens').insert(payload)
      if (error) { alert(error.message); setSaving(false); return }
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

  async function importarCronograma() {
    if (isTodos || etapas.length === 0) return
    if (!confirm(`Importar ${etapas.length} etapas e suas subetapas do cronograma?\n\nItens já existentes com mesma referência serão ignorados.`)) return
    const existentes = new Set(itens.filter(i => i.etapa_ref_id).map(i => i.etapa_ref_id))
    const existentesSub = new Set(itens.filter(i => i.subetapa_ref_id).map(i => i.subetapa_ref_id))
    const novasEtapas = etapas.filter(e => !existentes.has(e.id))
    const ordemBase = itens.filter(i => !i.parent_id).length

    for (let idx = 0; idx < novasEtapas.length; idx++) {
      const etapa = novasEtapas[idx]
      const { data: etapaRow } = await supabase.from('financiamento_itens').insert({
        obra_id: obraId,
        orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
        codigo: `${ordemBase + idx + 1}`,
        nome: etapa.nome,
        nivel: 1,
        ordem: ordemBase + idx,
        origem: 'sistema',
        etapa_ref_id: etapa.id,
      }).select().single()

      if (etapaRow) {
        const subs = subetapas.filter(s => s.etapa_id === etapa.id && !existentesSub.has(s.id))
        for (let si = 0; si < subs.length; si++) {
          await supabase.from('financiamento_itens').insert({
            obra_id: obraId,
            orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
            parent_id: (etapaRow as FinanciamentoItem).id,
            codigo: `${ordemBase + idx + 1}.${si + 1}`,
            nome: subs[si].nome,
            nivel: 2,
            ordem: si,
            origem: 'sistema',
            subetapa_ref_id: subs[si].id,
          })
        }
      }
    }
    carregar()
  }

  // --- CRUD Medições ---
  async function criarMedicao() {
    if (!medForm.data_medicao) return
    const numero = medicoes.length > 0 ? Math.max(...medicoes.map(m => m.numero)) + 1 : 1
    const { data, error } = await supabase.from('financiamento_medicoes').insert({
      obra_id: obraId,
      orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
      numero,
      data_medicao: medForm.data_medicao,
      observacao: medForm.observacao.trim() || null,
    }).select().single()
    if (error) { alert(error.message); return }
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
      const { data } = await supabase.from('financiamento_medicao_itens').insert({
        medicao_id: selMedicao, item_id: itemId, pct_executado: v,
      }).select().single()
      if (data) setMedItens(prev => [...prev, data as FinanciamentoMedicaoItem])
    }
  }

  async function fecharMedicao(id: string) {
    if (!confirm('Fechar esta medição? Ela não poderá mais ser editada.')) return
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

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {([
          { id: 'planilha' as const, label: 'Planilha de Financiamento', icon: ClipboardList },
          { id: 'medicoes' as const, label: 'Medições', icon: Edit3 },
        ]).map(t => {
          const Ic = t.icon
          const badge = t.id === 'medicoes' ? medicoes.length : undefined
          return (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
              style={subTab === t.id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
              <Ic size={15} /> {t.label}
              {badge !== undefined && badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: subTab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--accent)', color: subTab === t.id ? 'white' : 'white' }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {subTab === 'planilha' && (
        <PlanilhaView
          tree={tree} itens={itens} totalValor={totalValor} totalPeso={totalPeso}
          collapsed={collapsed} setCollapsed={setCollapsed}
          editForm={editForm} setEditForm={setEditForm}
          saving={saving} salvarItem={salvarItem} removerItem={removerItem}
          importarCronograma={importarCronograma}
          toggleAll={toggleAll} isTodos={isTodos}
          cronogramaRef={cronogramaRef} showSistema={showSistema} setShowSistema={setShowSistema}
        />
      )}

      {subTab === 'medicoes' && (
        <MedicoesView
          tree={tree} leaves={leaves} medicoes={medicoes} medicaoSel={medicaoSel}
          selMedicao={selMedicao} setSelMedicao={setSelMedicao}
          showNewMed={showNewMed} setShowNewMed={setShowNewMed}
          medForm={medForm} setMedForm={setMedForm}
          criarMedicao={criarMedicao}
          pctLocal={pctLocal} salvarPct={salvarPct}
          calcExecObra={calcExecObra} calcPctItem={calcPctItem}
          acumuladoAtual={acumuladoAtual}
          fecharMedicao={fecharMedicao} reabrirMedicao={reabrirMedicao} excluirMedicao={excluirMedicao}
          collapsed={collapsed} setCollapsed={setCollapsed} toggleAll={toggleAll}
          isTodos={isTodos}
          cronogramaRef={cronogramaRef} showSistema={showSistema} setShowSistema={setShowSistema}
          filtroMed={filtroMed} setFiltroMed={setFiltroMed}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PLANILHA VIEW — Árvore CRUD
// ════════════════════════════════════════════════════════════════════════════════
function PlanilhaView({
  tree, itens, totalValor, totalPeso,
  collapsed, setCollapsed, editForm, setEditForm,
  saving, salvarItem, removerItem, importarCronograma,
  toggleAll, isTodos, cronogramaRef, showSistema, setShowSistema,
}: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalPeso: number
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void
  saving: boolean; salvarItem: () => void; removerItem: (id: string) => void
  importarCronograma: () => void; toggleAll: (expand: boolean) => void
  isTodos: boolean; cronogramaRef: Map<string, number>; showSistema: boolean; setShowSistema: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditForm(emptyEdit(1, null))} disabled={isTodos} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          <Plus size={14} /> Etapa
        </button>
        <button onClick={importarCronograma} disabled={isTodos} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium disabled:opacity-50" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <Download size={14} /> Importar do Cronograma
        </button>
        <div className="flex-1" />
        <button onClick={() => setShowSistema(!showSistema)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          {showSistema ? <EyeOff size={13} /> : <Eye size={13} />} {showSistema ? 'Ocultar' : 'Mostrar'} % Sistema
        </button>
        <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Recolher tudo"><ChevronsDownUp size={16} /></button>
        <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Expandir tudo"><ChevronsUpDown size={16} /></button>
      </div>

      {/* Edit form */}
      {editForm && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{editForm.id ? 'Editar item' : `Novo item (nível ${editForm.nivel})`}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Código</span><input value={editForm.codigo} onChange={e => setEditForm({ ...editForm, codigo: e.target.value })} className="input-base w-full" placeholder="1.1" /></label>
            <label className="block sm:col-span-3"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Nome</span><input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} className="input-base w-full" placeholder="Infraestrutura" /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Valor financiado (R$)</span><input type="number" min={0} step="0.01" value={editForm.valor_financiado} onChange={e => setEditForm({ ...editForm, valor_financiado: e.target.value })} className="input-base w-full" /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Peso / Incidência (%)</span><input type="number" min={0} max={100} step="0.01" value={editForm.peso} onChange={e => setEditForm({ ...editForm, peso: e.target.value })} className="input-base w-full" /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditForm(null)} className="px-3 py-1.5 text-xs rounded-lg" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
            <button onClick={salvarItem} disabled={saving || !editForm.nome.trim()} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      )}

      {/* Tree table */}
      {tree.length === 0 ? (
        <div className="card p-10 text-center">
          <ClipboardList size={28} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum item cadastrado. Adicione etapas ou importe do cronograma.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)', width: '40%' }}>Serviço</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Valor Financiado</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Incidência (%)</th>
                {showSistema && <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Sistema</th>}
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)', width: 100 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => <TreeRowPlanilha key={node.id} node={node} depth={0}
                collapsed={collapsed} setCollapsed={setCollapsed}
                editForm={editForm} setEditForm={setEditForm}
                removerItem={removerItem} isTodos={isTodos}
                cronogramaRef={cronogramaRef} showSistema={showSistema} />)}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>CUSTO TOTAL</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalValor)}</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--accent)' }}>{totalPeso.toFixed(2)}%</td>
                {showSistema && <td />}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function TreeRowPlanilha({
  node, depth, collapsed, setCollapsed, editForm, setEditForm, removerItem, isTodos, cronogramaRef, showSistema,
}: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void; removerItem: (id: string) => void
  isTodos: boolean; cronogramaRef: Map<string, number>; showSistema: boolean
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed[node.id]
  const isParent = node.nivel < 3

  const bg = depth === 0 ? 'var(--bg-secondary)' : undefined
  const fw = depth === 0 ? 700 : depth === 1 ? 600 : 400
  const pctSistema = cronogramaRef.get(node.id)

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
            {node.origem === 'sistema' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>SIS</span>}
          </div>
        </td>
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{Number(node.valor_financiado) > 0 ? formatCurrency(Number(node.valor_financiado)) : ''}</td>
        <td className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-primary)' }}>{Number(node.peso) > 0 ? `${Number(node.peso).toFixed(2)}` : ''}</td>
        {showSistema && (
          <td className="text-right px-3 py-2" style={{ color: pctSistema !== undefined ? 'var(--success)' : 'var(--text-secondary)' }}>
            {pctSistema !== undefined ? `${pctSistema.toFixed(0)}%` : '—'}
          </td>
        )}
        <td className="text-center px-3 py-2">
          {!isTodos && (
            <div className="flex items-center justify-center gap-1">
              {isParent && (
                <button onClick={() => setEditForm(emptyEdit((node.nivel + 1) as 1 | 2 | 3, node.id))} className="p-1 rounded" style={{ color: 'var(--accent)' }} title="Adicionar sub-item">
                  <Plus size={13} />
                </button>
              )}
              <button onClick={() => setEditForm({ id: node.id, parent_id: node.parent_id, codigo: node.codigo || '', nome: node.nome, valor_financiado: String(node.valor_financiado || ''), peso: String(node.peso || ''), nivel: node.nivel })} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }} title="Editar">
                <Edit3 size={13} />
              </button>
              <button onClick={() => removerItem(node.id)} className="p-1 rounded" style={{ color: 'var(--danger)' }} title="Excluir">
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </td>
      </tr>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowPlanilha key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          editForm={editForm} setEditForm={setEditForm}
          removerItem={removerItem} isTodos={isTodos}
          cronogramaRef={cronogramaRef} showSistema={showSistema} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// MEDIÇÕES VIEW
// ════════════════════════════════════════════════════════════════════════════════
function MedicoesView({
  tree, leaves, medicoes, medicaoSel, selMedicao, setSelMedicao,
  showNewMed, setShowNewMed, medForm, setMedForm, criarMedicao,
  pctLocal, salvarPct, calcExecObra, calcPctItem, acumuladoAtual,
  fecharMedicao, reabrirMedicao, excluirMedicao,
  collapsed, setCollapsed, toggleAll, isTodos,
  cronogramaRef, showSistema, setShowSistema, filtroMed, setFiltroMed,
}: {
  tree: TreeNode[]; leaves: TreeNode[]; medicoes: FinanciamentoMedicao[]
  medicaoSel: FinanciamentoMedicao | undefined; selMedicao: string | null
  setSelMedicao: (v: string | null) => void
  showNewMed: boolean; setShowNewMed: (v: boolean) => void
  medForm: { data_medicao: string; observacao: string }; setMedForm: (v: { data_medicao: string; observacao: string }) => void
  criarMedicao: () => void; pctLocal: Record<string, number>
  salvarPct: (itemId: string, valor: number) => void
  calcExecObra: (node: TreeNode) => number; calcPctItem: (node: TreeNode) => number
  acumuladoAtual: number
  fecharMedicao: (id: string) => void; reabrirMedicao: (id: string) => void; excluirMedicao: (id: string) => void
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void; toggleAll: (e: boolean) => void
  isTodos: boolean; cronogramaRef: Map<string, number>; showSistema: boolean; setShowSistema: (v: boolean) => void
  filtroMed: 'todos' | 'pendentes' | 'executados'; setFiltroMed: (v: 'todos' | 'pendentes' | 'executados') => void
}) {
  if (tree.length === 0) {
    return (
      <div className="card p-10 text-center">
        <ClipboardList size={28} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre a planilha de financiamento antes de criar medições.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Medição selector */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={selMedicao || ''} onChange={e => setSelMedicao(e.target.value || null)} className="input-base text-sm py-1.5 w-64">
          <option value="">Selecionar medição...</option>
          {medicoes.map(m => (
            <option key={m.id} value={m.id}>
              Medição {m.numero} — {new Date(m.data_medicao + 'T12:00:00').toLocaleDateString('pt-BR')} {m.status === 'fechada' ? '(fechada)' : ''}
            </option>
          ))}
        </select>
        <button onClick={() => setShowNewMed(true)} disabled={isTodos} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          <Plus size={14} /> Nova Medição
        </button>
        {medicaoSel && (
          <>
            <div className="flex-1" />
            {medicaoSel.status === 'aberta' ? (
              <button onClick={() => fecharMedicao(medicaoSel.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <Save size={13} /> Fechar Medição
              </button>
            ) : (
              <button onClick={() => reabrirMedicao(medicaoSel.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Reabrir
              </button>
            )}
            <button onClick={() => excluirMedicao(medicaoSel.id)} className="p-1.5 rounded-lg" style={{ color: 'var(--danger)' }} title="Excluir medição"><Trash2 size={15} /></button>
          </>
        )}
      </div>

      {/* New medição form */}
      {showNewMed && (
        <div className="card p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nova medição de financiamento</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Data da medição</span><input type="date" value={medForm.data_medicao} onChange={e => setMedForm({ ...medForm, data_medicao: e.target.value })} className="input-base w-full" /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Observação</span><input value={medForm.observacao} onChange={e => setMedForm({ ...medForm, observacao: e.target.value })} className="input-base w-full" placeholder="Ex.: 1ª medição de obra" /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewMed(false)} className="px-3 py-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
            <button onClick={criarMedicao} disabled={!medForm.data_medicao} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50">Criar</button>
          </div>
        </div>
      )}

      {/* Measurement view */}
      {medicaoSel && (
        <>
          {/* Toolbar */}
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
            <button onClick={() => setShowSistema(!showSistema)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {showSistema ? <EyeOff size={12} /> : <Eye size={12} />} Sugestão
            </button>
            <div className="flex-1" />
            <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Recolher"><ChevronsDownUp size={15} /></button>
            <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }} title="Expandir"><ChevronsUpDown size={15} /></button>
          </div>

          {/* Measurement tree */}
          <div className="card overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 750 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)', width: '38%' }}>Serviço</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Incidência (%)</th>
                  {showSistema && <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Sugestão Sistema</th>}
                  <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Execução do Item (%)</th>
                  <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Execução na Obra (%)</th>
                </tr>
              </thead>
              <tbody>
                {tree.map(node => (
                  <TreeRowMedicao key={node.id} node={node} depth={0}
                    collapsed={collapsed} setCollapsed={setCollapsed}
                    pctLocal={pctLocal} salvarPct={salvarPct}
                    calcExecObra={calcExecObra} calcPctItem={calcPctItem}
                    editable={medicaoSel.status === 'aberta'}
                    cronogramaRef={cronogramaRef} showSistema={showSistema}
                    filtroMed={filtroMed} />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'rgba(59,123,248,0.08)' }}>
                  <td colSpan={showSistema ? 4 : 3} className="px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>Mensurado Acumulado Atual</td>
                  <td className="text-right px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>{acumuladoAtual.toFixed(2)}%</td>
                </tr>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <td colSpan={showSistema ? 4 : 3} className="px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Executado nessa etapa</td>
                  <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--success)' }}>{acumuladoAtual.toFixed(2)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!selMedicao && medicoes.length === 0 && !showNewMed && (
        <div className="card p-10 text-center">
          <Edit3 size={28} className="mx-auto mb-2" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição criada. Clique em "Nova Medição" para iniciar.</p>
        </div>
      )}
    </div>
  )
}

function TreeRowMedicao({
  node, depth, collapsed, setCollapsed,
  pctLocal, salvarPct, calcExecObra, calcPctItem, editable,
  cronogramaRef, showSistema, filtroMed,
}: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  pctLocal: Record<string, number>; salvarPct: (itemId: string, valor: number) => void
  calcExecObra: (node: TreeNode) => number; calcPctItem: (node: TreeNode) => number
  editable: boolean; cronogramaRef: Map<string, number>; showSistema: boolean
  filtroMed: 'todos' | 'pendentes' | 'executados'
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed[node.id]
  const isLeaf = !hasChildren
  const pct = isLeaf ? (pctLocal[node.id] ?? 0) : calcPctItem(node)
  const execObra = calcExecObra(node)
  const pctSistema = cronogramaRef.get(node.id)

  if (filtroMed === 'pendentes' && isLeaf && pct >= 100) return null
  if (filtroMed === 'executados' && isLeaf && pct < 100) return null

  const bg = depth === 0 ? 'var(--bg-secondary)' : undefined
  const fw = depth === 0 ? 700 : depth === 1 ? 600 : 400

  const pctColor = pct >= 100 ? 'var(--success)' : pct > 0 ? 'var(--accent)' : 'var(--text-secondary)'

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
        {showSistema && (
          <td className="text-right px-3 py-2" style={{ color: pctSistema !== undefined ? 'var(--success)' : 'var(--text-secondary)' }}>
            {pctSistema !== undefined ? `${pctSistema.toFixed(0)}%` : '—'}
          </td>
        )}
        <td className="text-center px-3 py-2">
          {isLeaf && editable ? (
            <input type="number" min={0} max={100} step={1}
              value={pctLocal[node.id] ?? ''}
              onChange={e => {
                const v = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                salvarPct(node.id, v)
              }}
              className="input-base w-20 text-center text-xs py-1 mx-auto"
              style={{ display: 'block' }}
            />
          ) : (
            <span style={{ color: pctColor, fontWeight: isLeaf ? 400 : 600 }}>{pct > 0 ? `${pct.toFixed(0)}%` : isLeaf ? '' : ''}</span>
          )}
        </td>
        <td className="text-right px-3 py-2 font-semibold" style={{ color: execObra > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
          {execObra > 0 ? execObra.toFixed(2) : '0,00'}
        </td>
      </tr>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowMedicao key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          pctLocal={pctLocal} salvarPct={salvarPct}
          calcExecObra={calcExecObra} calcPctItem={calcPctItem}
          editable={editable}
          cronogramaRef={cronogramaRef} showSistema={showSistema}
          filtroMed={filtroMed} />
      ))}
    </>
  )
}
