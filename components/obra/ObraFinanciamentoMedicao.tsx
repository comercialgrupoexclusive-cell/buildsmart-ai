'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calendar, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  Copy, Edit3, Eye, Plus, RefreshCw, Save, Trash2, TrendingUp, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Etapa, FinanciamentoItem, FinanciamentoCronogramaBanco, FinanciamentoMedicao, FinanciamentoMedicaoItem, ObraFonteRecurso, ObraReembolso, OrcamentoItem } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { TODOS_ORCAMENTOS } from '@/lib/obra-orcamento-context'
import { loadPlanejamentoProgresso } from '@/lib/planejamento-progresso'

// Sub-linhas de avanço por subetapa, mostradas na Execução — sempre
// derivadas da hierarquia estável do orçamento (lib/planejamento-progresso),
// nunca de subetapas_cronograma (cronograma legado).
type SubetapaProgresso = { id: string; etapa_id: string; nome: string; percentual_executado: number }

type TreeNode = Omit<FinanciamentoItem, 'children'> & { children: TreeNode[] }
type ViewTab = 'visao' | 'orcamento' | 'cronograma' | 'execucao' | 'acompanhamento'

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

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`
}

type OrcSubetapa = { subetapa: string; valor: number }

export function ObraFinanciamentoMedicao({ obraId, orcamentoId, orcamentoIds, view }: { obraId: string; orcamentoId: string; orcamentoIds: string[]; view: ViewTab }) {
  const supabase = createClient()
  const isTodos = orcamentoId === TODOS_ORCAMENTOS

  const [itens, setItens] = useState<FinanciamentoItem[]>([])
  const [medicoes, setMedicoes] = useState<FinanciamentoMedicao[]>([])
  const [cronoBanco, setCronoBanco] = useState<FinanciamentoCronogramaBanco[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [subetapasProgresso, setSubetapasProgresso] = useState<SubetapaProgresso[]>([])
  const [orcItens, setOrcItens] = useState<OrcamentoItem[]>([])
  const [gerenciamentoPct, setGerenciamentoPct] = useState(0)
  const [fontes, setFontes] = useState<ObraFonteRecurso[]>([])
  const [reembolsos, setReembolsos] = useState<ObraReembolso[]>([])
  const [loading, setLoading] = useState(true)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  const [pctLocal, setPctLocal] = useState<Record<string, number>>({})
  const [pctSim, setPctSim] = useState<Record<string, number>>({})
  const [registrando, setRegistrando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const orcId = orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId
    const idsProgresso = orcId ? [orcId] : orcamentoIds
    const [itensRes, medRes, cronoRes, etapasRes, progresso, orcItensRes, orcRes, fontesRes, reembRes] = await Promise.all([
      supabase.from('financiamento_itens').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('financiamento_medicoes').select('*').eq('obra_id', obraId).order('numero', { ascending: false }),
      supabase.from('financiamento_cronograma_banco').select('*').eq('obra_id', obraId).order('mes'),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      loadPlanejamentoProgresso(supabase, idsProgresso),
      orcId
        ? supabase.from('orcamento_itens').select('id,etapa_id,subetapa,quantidade,preco_unitario_snapshot,valor_total_informado_snapshot,valor_total_manual_ativo').eq('orcamento_id', orcId)
        : Promise.resolve({ data: [] }),
      orcId
        ? supabase.from('orcamentos').select('gerenciamento_percentual').eq('id', orcId).single()
        : Promise.resolve({ data: null }),
      supabase.from('obra_fontes_recursos').select('*').eq('obra_id', obraId),
      supabase.from('obra_reembolsos').select('*').eq('obra_id', obraId),
    ])
    setItens((itensRes.data || []) as FinanciamentoItem[])
    setMedicoes((medRes.data || []) as FinanciamentoMedicao[])
    setCronoBanco((cronoRes.data || []) as FinanciamentoCronogramaBanco[])
    setEtapas((etapasRes.data || []) as Etapa[])
    // Subetapas com avanço físico real, sempre pela fonte única do
    // orçamento (nunca subetapas_cronograma).
    setSubetapasProgresso(
      progresso.etapas.flatMap(e => e.subetapas
        .filter(s => s.id)
        .map(s => ({ id: s.id as string, etapa_id: e.id, nome: s.nome, percentual_executado: s.progressoExecutado })))
    )
    setOrcItens((orcItensRes.data || []) as OrcamentoItem[])
    setGerenciamentoPct(Number((orcRes.data as Record<string, unknown>)?.gerenciamento_percentual) || 0)
    setFontes((fontesRes.data || []) as ObraFonteRecurso[])
    setReembolsos((reembRes.data || []) as ObraReembolso[])
    setLoading(false)
  }, [obraId, orcamentoId, orcamentoIds, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  const tree = useMemo(() => buildTree(itens), [itens])
  const totalValor = useMemo(() => itens.filter(i => !i.parent_id).reduce((s, i) => s + Number(i.valor_financiado || 0), 0), [itens])
  const totalPeso = useMemo(() => itens.filter(i => !i.parent_id).reduce((s, i) => s + Number(i.peso || 0), 0), [itens])

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

  const orcSubetapasMap = useMemo(() => {
    const map = new Map<string, OrcSubetapa[]>()
    orcItens.forEach(oi => {
      if (!oi.etapa_id || !oi.subetapa) return
      const valor = oi.valor_total_manual_ativo && oi.valor_total_informado_snapshot != null
        ? Number(oi.valor_total_informado_snapshot)
        : Number(oi.quantidade) * Number(oi.preco_unitario_snapshot)
      const arr = map.get(oi.etapa_id) || []
      const existing = arr.find(s => s.subetapa === oi.subetapa)
      if (existing) existing.valor += valor
      else arr.push({ subetapa: oi.subetapa!, valor })
      map.set(oi.etapa_id, arr)
    })
    return map
  }, [orcItens])

  const itemValorObra = useCallback((item: FinanciamentoItem | TreeNode): number => {
    if (item.etapa_ref_id) return valorObraMap.get(item.etapa_ref_id) || 0
    return 0
  }, [valorObraMap])

  const totalValorObra = useMemo(() => {
    return itens.filter(i => !i.parent_id).reduce((s, i) => s + itemValorObra(i), 0)
  }, [itens, itemValorObra])

  const totalValorObraComGerenciamento = useMemo(() => {
    return totalValorObra * (1 + gerenciamentoPct / 100)
  }, [totalValorObra, gerenciamentoPct])

  const totalRecursos = useMemo(() => fontes.reduce((s, f) => s + Number(f.valor_previsto || 0), 0), [fontes])
  const totalSolicitado = useMemo(() => reembolsos.reduce((s, r) => s + Number(r.valor_solicitado || 0), 0), [reembolsos])
  const totalRecebido = useMemo(() => reembolsos.reduce((s, r) => s + Number(r.valor_recebido || 0), 0), [reembolsos])

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

  const cronogramaRef = useMemo(() => {
    const map = new Map<string, number>()
    itens.forEach(item => {
      if (item.etapa_ref_id) {
        const etapa = etapas.find(e => e.id === item.etapa_ref_id)
        if (etapa) map.set(item.id, etapa.percentual_executado || 0)
      }
    })
    return map
  }, [itens, etapas])

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

  async function salvarDatas(id: string, data_inicio: string | null, data_fim: string | null) {
    await supabase.from('financiamento_itens').update({ data_inicio, data_fim, updated_at: new Date().toISOString() }).eq('id', id)
    setItens(prev => prev.map(i => i.id === id ? { ...i, data_inicio, data_fim } : i))
  }

  async function registrarMedicao() {
    if (Object.keys(pctSim).length === 0 || registrando) return
    setRegistrando(true)
    const { data: maxRes } = await supabase
      .from('financiamento_medicoes')
      .select('numero')
      .eq('obra_id', obraId)
      .order('numero', { ascending: false })
      .limit(1)
    const maxNumero = (maxRes && maxRes.length > 0) ? (maxRes[0] as FinanciamentoMedicao).numero : 0
    const numero = maxNumero + 1
    const hoje = new Date().toISOString().split('T')[0]
    const { data: novaMed } = await supabase.from('financiamento_medicoes').insert({
      obra_id: obraId,
      orcamento_id: orcamentoId === TODOS_ORCAMENTOS ? null : orcamentoId,
      numero, data_medicao: hoje, status: 'fechada',
    }).select().single()
    if (!novaMed) { setRegistrando(false); return }
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
    setRegistrando(false)
  }

  async function excluirMedicao(id: string) {
    if (!confirm('Excluir esta medição e todos os seus dados?')) return
    await supabase.from('financiamento_medicao_itens').delete().eq('medicao_id', id)
    await supabase.from('financiamento_medicoes').delete().eq('id', id)
    setMedicoes(prev => prev.filter(m => m.id !== id))
    carregar()
  }

  async function editarMedicao(id: string, patch: Partial<FinanciamentoMedicao>) {
    await supabase.from('financiamento_medicoes').update({ ...patch }).eq('id', id)
    setMedicoes(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  function toggleAll(expand: boolean) {
    const map: Record<string, boolean> = {}
    flattenTree(tree).forEach(n => { map[n.id] = !expand })
    setCollapsed(map)
  }

  function updateParentSim(node: TreeNode, val: number) {
    const leaves = getLeaves([node])
    const next = { ...pctSim }
    leaves.forEach(l => {
      if (val === (pctLocal[l.id] ?? 0)) {
        delete next[l.id]
      } else {
        next[l.id] = Math.min(100, Math.max(0, val))
      }
    })
    setPctSim(next)
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  if (view === 'visao') return (
    <VisaoGeral
      tree={tree} itens={itens} totalValor={totalValor} totalValorObra={totalValorObra}
      totalValorObraComGerenciamento={totalValorObraComGerenciamento} gerenciamentoPct={gerenciamentoPct}
      acumuladoAtual={acumuladoAtual} cronoBanco={cronoBanco} medicoes={medicoes}
      calcPctItem={(n) => calcPctItem(n, pctLocal)} itemValorObra={itemValorObra}
      totalRecursos={totalRecursos} totalSolicitado={totalSolicitado} totalRecebido={totalRecebido}
      etapas={etapas}
    />
  )

  if (view === 'orcamento') return (
    <OrcamentoView
      tree={tree} itens={itens} totalValor={totalValor} totalPeso={totalPeso}
      totalValorObraComGerenciamento={totalValorObraComGerenciamento}
      gerenciamentoPct={gerenciamentoPct}
      collapsed={collapsed} setCollapsed={setCollapsed}
      editForm={editForm} setEditForm={setEditForm}
      saving={saving} salvarItem={salvarItem} removerItem={removerItem}
      toggleAll={toggleAll} isTodos={isTodos} itemValorObra={itemValorObra}
      orcSubetapasMap={orcSubetapasMap}
    />
  )

  if (view === 'cronograma') return (
    <CronogramaView
      tree={tree} etapas={etapas} salvarDatas={salvarDatas} isTodos={isTodos}
      cronoBanco={cronoBanco}
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
      registrarMedicao={registrarMedicao} registrando={registrando}
      collapsed={collapsed} setCollapsed={setCollapsed} toggleAll={toggleAll}
      isTodos={isTodos} subetapasProgresso={subetapasProgresso} itens={itens}
      updateParentSim={updateParentSim}
    />
  )

  return (
    <AcompanhamentoView medicoes={medicoes} cronoBanco={cronoBanco} acumuladoAtual={acumuladoAtual}
      excluirMedicao={excluirMedicao} editarMedicao={editarMedicao}
      itens={itens} obraId={obraId} />
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// VISÃO GERAL — Dashboard do Financiamento
// ════════════════════════════════════════════════════════════════════════════════
function VisaoGeral({ tree, itens, totalValor, totalValorObra, totalValorObraComGerenciamento, gerenciamentoPct, acumuladoAtual, cronoBanco, medicoes, calcPctItem, itemValorObra, totalRecursos, totalSolicitado, totalRecebido, etapas }: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalValorObra: number
  totalValorObraComGerenciamento: number; gerenciamentoPct: number
  acumuladoAtual: number; cronoBanco: FinanciamentoCronogramaBanco[]; medicoes: FinanciamentoMedicao[]
  calcPctItem: (n: TreeNode) => number; itemValorObra: (i: FinanciamentoItem | TreeNode) => number
  totalRecursos: number; totalSolicitado: number; totalRecebido: number
  etapas: Etapa[]
}) {
  const diferenca = totalValor - totalValorObraComGerenciamento
  const fechadas = medicoes.filter(m => m.status === 'fechada').sort((a, b) => a.numero - b.numero)
  const mesAtual = fechadas.length + 1
  const metaMes = cronoBanco.find(c => c.mes === mesAtual)
  const valorReembolsoAtual = totalValor * (acumuladoAtual / 100)
  const saldoReembolso = valorReembolsoAtual - totalRecebido

  return (
    <div className="flex flex-col gap-4">
      {/* Cards resumo principal */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SCard label="Valor Financiado" valor={formatCurrency(totalValor)} />
        <SCard label="% Executado" valor={fmtPct(acumuladoAtual)} accent />
        <SCard label={`Total Orçamento`} valor={formatCurrency(totalValorObraComGerenciamento)} sub={`c/ ${gerenciamentoPct}% gerenciamento`} />
        <SCard label="Diferença" valor={formatCurrency(Math.abs(diferenca))} accent={diferenca >= 0} danger={diferenca < 0} sub={diferenca >= 0 ? 'sobra' : 'déficit'} />
      </div>

      {/* Fontes & Reembolsos resumo */}
      <div className="card p-4">
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Fontes & Reembolsos</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Total Recursos</p>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalRecursos)}</p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Reembolso Solicitado</p>
            <p className="text-sm font-bold" style={{ color: totalSolicitado > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>{formatCurrency(totalSolicitado)}</p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Recebido</p>
            <p className="text-sm font-bold" style={{ color: totalRecebido > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>{formatCurrency(totalRecebido)}</p>
          </div>
          <div>
            <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Direito a Reembolsar</p>
            <p className="text-sm font-bold" style={{ color: saldoReembolso > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>{formatCurrency(Math.max(0, saldoReembolso))}</p>
            <p className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{fmtPct(acumuladoAtual)} executado</p>
          </div>
        </div>
      </div>

      {/* Cronograma Banco — Previsto vs Realizado */}
      {cronoBanco.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Cronograma Banco — Previsto vs Realizado</p>
          <div className="flex items-end gap-1" style={{ height: 140 }}>
            {cronoBanco.map(c => {
              const previsto = Number(c.pct_acumulado_previsto)
              const hPrev = (previsto / 100) * 120
              const realizado = c.mes <= fechadas.length ? Math.min(acumuladoAtual, previsto) : 0
              const hReal = (realizado / 100) * 120
              const isActive = c.mes <= fechadas.length
              return (
                <div key={c.mes} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-bold" style={{ color: 'var(--text-secondary)' }}>{previsto}%</span>
                  <div className="w-full flex items-end gap-px" style={{ height: 120 }}>
                    <div className="flex-1 rounded-t" style={{ height: hPrev, background: 'var(--border)', minHeight: 2 }} title={`Previsto: ${previsto}%`} />
                    <div className="flex-1 rounded-t" style={{ height: hReal, background: isActive ? 'var(--accent)' : 'transparent', minHeight: isActive ? 2 : 0 }} title={`Realizado: ${realizado.toFixed(1)}%`} />
                  </div>
                  <span className="text-[9px] font-medium" style={{ color: c.mes === mesAtual ? 'var(--accent)' : 'var(--text-secondary)' }}>M{c.mes}</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1"><div className="w-3 h-2 rounded" style={{ background: 'var(--border)' }} /><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Previsto</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-2 rounded" style={{ background: 'var(--accent)' }} /><span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Realizado</span></div>
          </div>
          {metaMes && (
            <div className="mt-2 p-2 rounded-lg text-xs" style={{ background: acumuladoAtual >= Number(metaMes.pct_acumulado_previsto) ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', color: acumuladoAtual >= Number(metaMes.pct_acumulado_previsto) ? 'var(--success)' : 'var(--danger)' }}>
              Mês {mesAtual}: meta {Number(metaMes.pct_acumulado_previsto)}% — {acumuladoAtual >= Number(metaMes.pct_acumulado_previsto) ? 'no prazo' : `atrasado (${(Number(metaMes.pct_acumulado_previsto) - acumuladoAtual).toFixed(1)}pp)`}
            </div>
          )}
        </div>
      )}

      {/* Cronograma da Obra vs Financiamento */}
      {tree.length > 0 && etapas.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Cronograma — Obra vs Financiamento</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ minWidth: 400 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-2 py-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Etapa</th>
                  <th className="text-center px-2 py-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Obra</th>
                  <th className="text-center px-2 py-1.5 font-semibold" style={{ color: 'var(--accent)' }}>Financ.</th>
                  <th className="text-center px-2 py-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tree.slice(0, 8).map(node => {
                  const etapa = node.etapa_ref_id ? etapas.find(e => e.id === node.etapa_ref_id) : null
                  const obraInicio = etapa?.data_inicio
                  const finInicio = node.data_inicio
                  const obraFim = etapa?.data_fim
                  const finFim = node.data_fim
                  const temDiferenca = (obraInicio && finInicio && obraInicio !== finInicio) || (obraFim && finFim && obraFim !== finFim)
                  return (
                    <tr key={node.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-2 py-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {node.codigo && <span style={{ color: 'var(--accent)', marginRight: 4 }}>{node.codigo}</span>}
                        {node.nome}
                      </td>
                      <td className="text-center px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                        {obraInicio ? new Date(obraInicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
                        {obraFim ? ` → ${new Date(obraFim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
                      </td>
                      <td className="text-center px-2 py-1.5" style={{ color: 'var(--accent)' }}>
                        {finInicio ? new Date(finInicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
                        {finFim ? ` → ${new Date(finFim + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
                      </td>
                      <td className="text-center px-2 py-1.5">
                        {temDiferenca ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>divergente</span>
                        ) : finInicio ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)' }}>alinhado</span>
                        ) : (
                          <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Execução por etapa */}
      {tree.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Execução por Etapa</p>
          <div className="flex flex-col gap-1.5">
            {tree.filter(n => Number(n.peso) > 0).map(node => {
              const pct = calcPctItem(node)
              return (
                <div key={node.id} className="flex items-center gap-2">
                  <span className="text-[10px] flex-shrink-0 truncate" style={{ color: 'var(--text-primary)', width: 140 }}>{node.codigo}. {node.nome}</span>
                  <div className="flex-1" style={{ height: 14, borderRadius: 7, background: 'var(--border)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 7, background: pct >= 100 ? 'var(--success)' : 'var(--accent)', transition: 'width .3s' }} />
                    {pct > 8 && (
                      <span style={{ position: 'absolute', right: 6, top: 0, lineHeight: '14px', fontSize: 9, fontWeight: 700, color: 'white' }}>{pct.toFixed(0)}%</span>
                    )}
                  </div>
                  {pct <= 8 && <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: pct > 0 ? 'var(--accent)' : 'var(--text-secondary)', width: 28 }}>{pct > 0 ? `${pct.toFixed(0)}%` : '0%'}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Últimas medições */}
      {fechadas.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Últimas Medições</p>
          <div className="flex flex-col gap-1">
            {fechadas.slice(-5).reverse().map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Medição {m.numero}</span>
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{new Date(m.data_medicao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>Fechada</span>
              </div>
            ))}
          </div>
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

function SCard({ label, valor, sub, accent, danger }: { label: string; valor: string; sub?: string; accent?: boolean; danger?: boolean }) {
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
function OrcamentoView({ tree, itens, totalValor, totalPeso, totalValorObraComGerenciamento, gerenciamentoPct, collapsed, setCollapsed, editForm, setEditForm, saving, salvarItem, removerItem, toggleAll, isTodos, itemValorObra, orcSubetapasMap }: {
  tree: TreeNode[]; itens: FinanciamentoItem[]; totalValor: number; totalPeso: number
  totalValorObraComGerenciamento: number; gerenciamentoPct: number
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void
  saving: boolean; salvarItem: () => void; removerItem: (id: string) => void
  toggleAll: (expand: boolean) => void; isTodos: boolean
  itemValorObra: (i: FinanciamentoItem | TreeNode) => number
  orcSubetapasMap: Map<string, OrcSubetapa[]>
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <SCard label="Total Financiado" valor={formatCurrency(totalValor)} />
        <SCard label="Total Orçamento" valor={formatCurrency(totalValorObraComGerenciamento)} sub={`c/ ${gerenciamentoPct}% gerenciamento`} accent />
        <SCard label="Diferença" valor={formatCurrency(Math.abs(totalValor - totalValorObraComGerenciamento))} accent={totalValor >= totalValorObraComGerenciamento} danger={totalValor < totalValorObraComGerenciamento} sub={totalValor >= totalValorObraComGerenciamento ? 'sobra' : 'déficit'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditForm(emptyEdit(1, null))} disabled={isTodos} className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
          <Plus size={14} /> Adicionar item
        </button>
        <div className="flex-1" />
        <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Recolher tudo"><ChevronsDownUp size={16} /></button>
        <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Expandir tudo"><ChevronsUpDown size={16} /></button>
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
                removerItem={removerItem} isTodos={isTodos} itemValorObra={itemValorObra}
                orcSubetapasMap={orcSubetapasMap} />)}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>TOTAL ORÇAMENTO</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--accent)' }}>{totalPeso.toFixed(2)}%</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalValor)}</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(totalValorObraComGerenciamento)}</td>
                <td className="text-right px-3 py-2 font-bold" style={{ color: totalValor - totalValorObraComGerenciamento >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatCurrency(totalValor - totalValorObraComGerenciamento)}
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

function TreeRowOrc({ node, depth, collapsed, setCollapsed, editForm, setEditForm, removerItem, isTodos, itemValorObra, orcSubetapasMap }: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  editForm: EditForm | null; setEditForm: (v: EditForm | null) => void; removerItem: (id: string) => void
  isTodos: boolean; itemValorObra: (i: FinanciamentoItem | TreeNode) => number
  orcSubetapasMap: Map<string, OrcSubetapa[]>
}) {
  const hasChildren = node.children.length > 0
  const subs = node.etapa_ref_id ? (orcSubetapasMap.get(node.etapa_ref_id) || []) : []
  const hasExpand = hasChildren || subs.length > 0
  const isCollapsed = collapsed[node.id] ?? false
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
            {hasExpand ? (
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
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{Number(node.peso) > 0 ? `${Number(node.peso).toFixed(2)}%` : ''}</td>
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
      {!isCollapsed && subs.length > 0 && !hasChildren && subs.map((sub, i) => (
        <tr key={`${node.id}-sub-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
          <td className="px-3 py-1.5" style={{ paddingLeft: `${32 + depth * 20}px` }}>
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{sub.subetapa}</span>
          </td>
          <td />
          <td />
          <td className="text-right px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span className="text-[11px]">{formatCurrency(sub.valor)}</span>
          </td>
          <td />
          <td />
        </tr>
      ))}
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowOrc key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          editForm={editForm} setEditForm={setEditForm}
          removerItem={removerItem} isTodos={isTodos} itemValorObra={itemValorObra}
          orcSubetapasMap={orcSubetapasMap} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// CRONOGRAMA VIEW — Duas abas: Obra (read-only) e Caixa (CRUD)
// ════════════════════════════════════════════════════════════════════════════════
function CronogramaView({ tree, etapas, salvarDatas, isTodos, cronoBanco }: {
  tree: TreeNode[]; etapas: Etapa[]; salvarDatas: (id: string, di: string | null, df: string | null) => void; isTodos: boolean
  cronoBanco: FinanciamentoCronogramaBanco[]
}) {
  const [subTab, setSubTab] = useState<'obra' | 'caixa'>('obra')
  const etapaMap = useMemo(() => new Map(etapas.map(e => [e.id, e])), [etapas])

  const allDates = tree.filter(n => {
    const etapa = n.etapa_ref_id ? etapaMap.get(n.etapa_ref_id) : null
    return n.data_inicio || n.data_fim || etapa?.data_inicio || etapa?.data_fim
  })
  const minDate = allDates.reduce((min, n) => {
    const d = n.data_inicio || ''
    return d && d < min ? d : min
  }, '9999-12-31')
  const maxDate = allDates.reduce((max, n) => {
    const d = n.data_fim || ''
    return d && d > max ? d : max
  }, '0000-01-01')

  function preencherTodos() {
    tree.forEach(node => {
      if (!node.etapa_ref_id) return
      const etapa = etapaMap.get(node.etapa_ref_id)
      if (!etapa) return
      salvarDatas(node.id, etapa.data_inicio || null, etapa.data_fim || null)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <button onClick={() => setSubTab('obra')}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={subTab === 'obra' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
            Cronograma da Obra
          </button>
          <button onClick={() => setSubTab('caixa')}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={subTab === 'caixa' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}>
            Cronograma da Caixa
          </button>
        </div>
        {subTab === 'caixa' && (
          <button onClick={preencherTodos} disabled={isTodos}
            className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50">
            <Copy size={14} /> Copiar da Obra
          </button>
        )}
      </div>

      {subTab === 'obra' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 450 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Etapa</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Início</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Fim</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Executado</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(node => {
                const etapa = node.etapa_ref_id ? etapaMap.get(node.etapa_ref_id) : null
                return (
                  <tr key={node.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {node.codigo && <span style={{ color: 'var(--accent)', marginRight: 6 }}>{node.codigo}</span>}
                        {node.nome}
                      </span>
                    </td>
                    <td className="text-center px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                      {etapa?.data_inicio ? new Date(etapa.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="text-center px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                      {etapa?.data_fim ? new Date(etapa.data_fim + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="text-center px-3 py-2">
                      <span style={{ color: (etapa?.percentual_executado || 0) >= 100 ? 'var(--success)' : (etapa?.percentual_executado || 0) > 0 ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600 }}>
                        {(etapa?.percentual_executado || 0).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tree.length === 0 && (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa vinculada.</div>
          )}
        </div>
      )}

      {subTab === 'caixa' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 450 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Etapa</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Início</th>
                <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Fim</th>
                <th className="text-center px-2 py-2" style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {tree.map(node => {
                const etapa = node.etapa_ref_id ? etapaMap.get(node.etapa_ref_id) : null
                return (
                  <tr key={node.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {node.codigo && <span style={{ color: 'var(--accent)', marginRight: 6 }}>{node.codigo}</span>}
                        {node.nome}
                      </span>
                    </td>
                    <td className="text-center px-2 py-1">
                      <input type="date" value={node.data_inicio || ''} disabled={isTodos}
                        onChange={e => salvarDatas(node.id, e.target.value || null, node.data_fim)}
                        className="input-base input-compact w-full text-center" />
                    </td>
                    <td className="text-center px-2 py-1">
                      <input type="date" value={node.data_fim || ''} disabled={isTodos}
                        onChange={e => salvarDatas(node.id, node.data_inicio, e.target.value || null)}
                        className="input-base input-compact w-full text-center" />
                    </td>
                    <td className="text-center px-2 py-2">
                      {etapa && !isTodos && (
                        <button onClick={() => salvarDatas(node.id, etapa.data_inicio || null, etapa.data_fim || null)} className="p-1 rounded" style={{ color: 'var(--accent)' }} title="Copiar da obra">
                          <RefreshCw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {tree.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>PERÍODO GERAL</td>
                  <td className="text-center px-3 py-2 font-bold text-[11px]" style={{ color: 'var(--accent)' }}>
                    {minDate !== '9999-12-31' ? new Date(minDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="text-center px-3 py-2 font-bold text-[11px]" style={{ color: 'var(--accent)' }}>
                    {maxDate !== '0000-01-01' ? new Date(maxDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          {tree.length === 0 && (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre as etapas na aba Orçamento primeiro.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// EXECUÇÃO VIEW
// ════════════════════════════════════════════════════════════════════════════════
function ExecucaoView({ tree, totalValor, pctLocal, pctSim, setPctSim, calcPctItemAtual, calcPctItemSim, calcExecObraAtual, calcExecObraSim, acumuladoAtual, acumuladoSim, cronogramaRef, cronoBanco, medicoes, registrarMedicao, registrando, collapsed, setCollapsed, toggleAll, isTodos, subetapasProgresso, itens, updateParentSim }: {
  tree: TreeNode[]; totalValor: number
  pctLocal: Record<string, number>; pctSim: Record<string, number>; setPctSim: (v: Record<string, number>) => void
  calcPctItemAtual: (n: TreeNode) => number; calcPctItemSim: (n: TreeNode) => number
  calcExecObraAtual: (n: TreeNode) => number; calcExecObraSim: (n: TreeNode) => number
  acumuladoAtual: number; acumuladoSim: number
  cronogramaRef: Map<string, number>; cronoBanco: FinanciamentoCronogramaBanco[]; medicoes: FinanciamentoMedicao[]
  registrarMedicao: () => void; registrando: boolean
  collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void; toggleAll: (e: boolean) => void
  isTodos: boolean; subetapasProgresso: SubetapaProgresso[]; itens: FinanciamentoItem[]
  updateParentSim: (node: TreeNode, val: number) => void
}) {
  const hasSim = Object.keys(pctSim).length > 0
  const fechadas = medicoes.filter(m => m.status === 'fechada')
  const mesAtual = fechadas.length + 1
  const metaMes = cronoBanco.find(c => c.mes === mesAtual)
  const metaPct = metaMes ? Number(metaMes.pct_acumulado_previsto) : null

  const valorReembolsoSim = totalValor * (acumuladoSim / 100)
  const valorReembolsoAtual = totalValor * (acumuladoAtual / 100)
  const ganhoMedicao = valorReembolsoSim - valorReembolsoAtual

  const subMap = useMemo(() => {
    const map = new Map<string, SubetapaProgresso[]>()
    subetapasProgresso.forEach(s => {
      const arr = map.get(s.etapa_id) || []
      arr.push(s)
      map.set(s.etapa_id, arr)
    })
    return map
  }, [subetapasProgresso])

  if (tree.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cadastre o orçamento do financiamento antes de medir.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SCard label="% Atual" valor={fmtPct(acumuladoAtual)} />
        <SCard label="Andamento" valor={fmtPct(acumuladoSim)} accent={hasSim} sub={hasSim ? `+${(acumuladoSim - acumuladoAtual).toFixed(1)}pp` : 'igual ao atual'} />
        <SCard label={`Meta Mês ${mesAtual}`} valor={metaPct ? `${metaPct.toFixed(0)}%` : '—'} accent={metaPct != null && acumuladoSim >= metaPct} danger={metaPct != null && acumuladoSim < metaPct} sub={metaPct != null ? (acumuladoSim >= metaPct ? 'atingida' : `faltam ${(metaPct - acumuladoSim).toFixed(1)}pp`) : ''} />
        <SCard label="Previsão Reembolso" valor={formatCurrency(ganhoMedicao)} sub={hasSim ? `acumulado: ${formatCurrency(valorReembolsoSim)}` : 'simule para prever'} accent={ganhoMedicao > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasSim && (
          <>
            <button onClick={registrarMedicao} disabled={isTodos || registrando}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg font-semibold transition-all disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <Save size={14} /> {registrando ? 'Registrando...' : `Registrar Medição ${fechadas.length + 1}`}
            </button>
            <button onClick={() => setPctSim({})}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <X size={13} /> Limpar
            </button>
          </>
        )}
        <div className="flex-1" />
        <button onClick={() => toggleAll(false)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Recolher tudo"><ChevronsDownUp size={15} /></button>
        <button onClick={() => toggleAll(true)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Expandir tudo"><ChevronsUpDown size={15} /></button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 500 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Serviço</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>Peso</th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Atual</th>
              <th className="text-center px-3 py-2 font-semibold" style={{ color: 'var(--accent)' }}>Andamento</th>
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
                cronogramaRef={cronogramaRef} subMap={subMap}
                updateParentSim={updateParentSim} />
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'rgba(59,123,248,0.08)' }}>
              <td className="px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>TOTAL</td>
              <td />
              <td className="text-center px-3 py-2 font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{fmtPct(acumuladoAtual)}</td>
              <td className="text-center px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>{fmtPct(acumuladoSim)}</td>
              <td className="text-right px-3 py-2 font-bold text-sm" style={{ color: 'var(--accent)' }}>{acumuladoSim.toFixed(2)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Previsão de reembolso */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} style={{ color: 'var(--accent)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Previsão de Reembolso</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Reembolso acumulado anterior</p>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(valorReembolsoAtual)}</p>
            <p style={{ color: 'var(--text-secondary)' }}>{fmtPct(acumuladoAtual)} de {formatCurrency(totalValor)}</p>
          </div>
          <div className="p-3 rounded-lg" style={{ background: 'rgba(59,123,248,0.06)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Reembolso com esta medição</p>
            <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(valorReembolsoSim)}</p>
            <p style={{ color: 'var(--text-secondary)' }}>{fmtPct(acumuladoSim)} de {formatCurrency(totalValor)}</p>
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
    </div>
  )
}

function TreeRowExec({ node, depth, collapsed, setCollapsed, pctLocal, pctSim, setPctSim, calcPctItemAtual, calcPctItemSim, calcExecObraSim, cronogramaRef, subMap, updateParentSim }: {
  node: TreeNode; depth: number; collapsed: Record<string, boolean>; setCollapsed: (v: Record<string, boolean>) => void
  pctLocal: Record<string, number>; pctSim: Record<string, number>; setPctSim: (v: Record<string, number>) => void
  calcPctItemAtual: (n: TreeNode) => number; calcPctItemSim: (n: TreeNode) => number
  calcExecObraSim: (n: TreeNode) => number
  cronogramaRef: Map<string, number>; subMap: Map<string, SubetapaProgresso[]>
  updateParentSim: (node: TreeNode, val: number) => void
}) {
  const hasChildren = node.children.length > 0
  const subs = node.etapa_ref_id ? (subMap.get(node.etapa_ref_id) || []) : []
  const hasExpand = hasChildren || subs.length > 0
  const isCollapsed = collapsed[node.id] ?? false
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

  function handleParentInput(raw: string) {
    const n = Number(raw.replace('%', '').trim()) || 0
    const v = Math.min(100, Math.max(0, n))
    updateParentSim(node, v)
  }

  return (
    <>
      <tr style={{ background: changed ? 'rgba(59,123,248,0.04)' : bg, borderBottom: '1px solid var(--border)' }}>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <div className="flex items-center gap-1.5">
            {hasExpand ? (
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
        <td className="text-right px-3 py-2" style={{ color: 'var(--text-primary)' }}>{Number(node.peso) > 0 ? `${Number(node.peso).toFixed(2)}%` : ''}</td>
        <td className="text-center px-3 py-2">
          <span style={{ color: pctColor, fontWeight: 600 }}>{fmtPct(pctAtual)}</span>
        </td>
        <td className="text-center px-3 py-2">
          {isLeaf ? (
            <div className="flex items-center justify-center gap-1">
              <input type="text"
                defaultValue={`${(simVal ?? pctLocal[node.id] ?? 0).toFixed(0)}%`}
                onFocus={e => e.target.select()}
                onBlur={e => {
                  const raw = e.target.value.replace('%', '').trim()
                  const n = Number(raw) || 0
                  updateSim(n)
                  e.target.value = `${Math.min(100, Math.max(0, n)).toFixed(0)}%`
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="input-base input-compact w-16 text-center"
                style={changed ? { borderColor: 'var(--accent)', background: 'rgba(59,123,248,0.06)' } : {}}
              />
              {pctSistema !== undefined && (
                <button onClick={() => { updateSim(pctSistema) }} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }} title={`Sugestão sistema: ${pctSistema.toFixed(0)}%`}>
                  <RefreshCw size={12} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <input type="text"
                defaultValue={`${pctSimCalc.toFixed(0)}%`}
                onFocus={e => e.target.select()}
                onBlur={e => handleParentInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="input-base input-compact w-16 text-center"
                style={{ borderColor: pctSimCalc !== pctAtual ? 'var(--accent)' : undefined, background: pctSimCalc !== pctAtual ? 'rgba(59,123,248,0.06)' : undefined }}
                title="Alterar distribui para todos os filhos"
              />
            </div>
          )}
        </td>
        <td className="text-right px-3 py-2 font-semibold" style={{ color: execObraSim > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
          {execObraSim > 0 ? `${execObraSim.toFixed(2)}%` : ''}
        </td>
      </tr>
      {/* Subetapas from cronograma da obra */}
      {!isCollapsed && subs.length > 0 && !hasChildren && subs.map(sub => (
        <tr key={`${node.id}-sub-${sub.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
          <td className="px-3 py-1.5" style={{ paddingLeft: `${32 + depth * 20}px` }}>
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{sub.nome}</span>
          </td>
          <td />
          <td className="text-center px-3 py-1.5">
            <span className="text-[10px]" style={{ color: Number(sub.percentual_executado) >= 100 ? 'var(--success)' : Number(sub.percentual_executado) > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {Number(sub.percentual_executado).toFixed(0)}%
            </span>
          </td>
          <td />
          <td />
        </tr>
      ))}
      {hasChildren && !isCollapsed && node.children.map(child => (
        <TreeRowExec key={child.id} node={child} depth={depth + 1}
          collapsed={collapsed} setCollapsed={setCollapsed}
          pctLocal={pctLocal} pctSim={pctSim} setPctSim={setPctSim}
          calcPctItemAtual={calcPctItemAtual} calcPctItemSim={calcPctItemSim}
          calcExecObraSim={calcExecObraSim} cronogramaRef={cronogramaRef} subMap={subMap}
          updateParentSim={updateParentSim} />
      ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// ACOMPANHAMENTO VIEW — com detalhes da medição
// ════════════════════════════════════════════════════════════════════════════════
function AcompanhamentoView({ medicoes, cronoBanco, acumuladoAtual, excluirMedicao, editarMedicao, itens, obraId }: {
  medicoes: FinanciamentoMedicao[]; cronoBanco: FinanciamentoCronogramaBanco[]; acumuladoAtual: number
  excluirMedicao: (id: string) => void; editarMedicao: (id: string, patch: Partial<FinanciamentoMedicao>) => void
  itens: FinanciamentoItem[]; obraId: string
}) {
  const supabase = createClient()
  const fechadas = medicoes.filter(m => m.status === 'fechada').sort((a, b) => a.numero - b.numero)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState('')
  const [editObs, setEditObs] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [medItens, setMedItens] = useState<FinanciamentoMedicaoItem[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingPct, setEditingPct] = useState('')

  const itensMap = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens])

  async function toggleExpand(medId: string) {
    if (expandedId === medId) {
      setExpandedId(null)
      setMedItens([])
      return
    }
    setExpandedId(medId)
    setLoadingItens(true)
    const { data } = await supabase.from('financiamento_medicao_itens').select('*').eq('medicao_id', medId)
    setMedItens((data || []) as FinanciamentoMedicaoItem[])
    setLoadingItens(false)
  }

  function startEdit(m: FinanciamentoMedicao) {
    setEditId(m.id)
    setEditData(m.data_medicao || '')
    setEditObs(m.observacao || '')
  }

  function saveEdit() {
    if (!editId) return
    editarMedicao(editId, { data_medicao: editData || new Date().toISOString().split('T')[0], observacao: editObs || null })
    setEditId(null)
  }

  async function salvarItemPct(itemId: string, medId: string, pct: number) {
    const existing = medItens.find(mi => mi.item_id === itemId && mi.medicao_id === medId)
    if (existing) {
      await supabase.from('financiamento_medicao_itens').update({ pct_executado: pct }).eq('id', existing.id)
      setMedItens(prev => prev.map(mi => mi.id === existing.id ? { ...mi, pct_executado: pct } : mi))
    }
    setEditingItemId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card overflow-x-auto">
        <div className="px-3 py-2 text-xs font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
          Histórico de Medições
        </div>
        {medicoes.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição registrada.</div>
        ) : (
          <div className="flex flex-col">
            {medicoes.sort((a, b) => a.numero - b.numero).map(m => {
              const isExpanded = expandedId === m.id
              const isEditing = editId === m.id
              return (
                <div key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Header row */}
                  <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:opacity-80"
                    onClick={() => !isEditing && toggleExpand(m.id)}>
                    <button className="p-0.5 rounded flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--text-primary)', minWidth: 80 }}>
                      Medição {m.numero}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                      {isEditing ? (
                        <input type="date" value={editData} onChange={e => setEditData(e.target.value)}
                          onClick={e => e.stopPropagation()} className="input-base input-compact w-32" />
                      ) : (
                        new Date(m.data_medicao + 'T12:00:00').toLocaleDateString('pt-BR')
                      )}
                    </span>
                    <span className="text-[11px] flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                      {isEditing ? (
                        <input value={editObs} onChange={e => setEditObs(e.target.value)}
                          onClick={e => e.stopPropagation()} className="input-base input-compact w-full" placeholder="Observação" />
                      ) : (
                        m.observacao || ''
                      )}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0" style={{
                      background: m.status === 'fechada' ? 'rgba(34,197,94,0.12)' : 'rgba(59,123,248,0.12)',
                      color: m.status === 'fechada' ? 'var(--success)' : 'var(--accent)',
                    }}>{m.status === 'fechada' ? 'Fechada' : 'Aberta'}</span>
                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit} className="p-1 rounded" style={{ color: 'var(--success)' }} title="Salvar"><Save size={13} /></button>
                          <button onClick={() => setEditId(null)} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }} title="Cancelar"><X size={13} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(m)} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }} title="Editar"><Edit3 size={13} /></button>
                          <button onClick={() => excluirMedicao(m.id)} className="p-1 rounded" style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      {loadingItens ? (
                        <div className="flex justify-center py-4"><div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>
                      ) : medItens.length === 0 ? (
                        <p className="text-xs py-3 text-center" style={{ color: 'var(--text-secondary)' }}>Nenhum item registrado nesta medição.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)' }}>
                                <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Item</th>
                                <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>Peso</th>
                                <th className="text-center px-3 py-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>% Executado</th>
                                <th className="text-center px-2 py-1.5" style={{ width: 40 }} />
                              </tr>
                            </thead>
                            <tbody>
                              {medItens.map(mi => {
                                const item = itensMap.get(mi.item_id)
                                if (!item) return null
                                const isEditingThis = editingItemId === mi.id
                                return (
                                  <tr key={mi.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td className="px-3 py-1.5" style={{ color: 'var(--text-primary)' }}>
                                      {item.codigo && <span style={{ color: 'var(--accent)', marginRight: 4 }}>{item.codigo}</span>}
                                      {item.nome}
                                    </td>
                                    <td className="text-right px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                                      {Number(item.peso) > 0 ? `${Number(item.peso).toFixed(2)}%` : ''}
                                    </td>
                                    <td className="text-center px-3 py-1.5">
                                      {isEditingThis ? (
                                        <input type="text" value={editingPct}
                                          onChange={e => setEditingPct(e.target.value)}
                                          onBlur={() => salvarItemPct(mi.item_id, mi.medicao_id, Number(editingPct.replace('%', '')) || 0)}
                                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                          onFocus={e => e.target.select()}
                                          className="input-base input-compact w-16 text-center text-[11px]"
                                          autoFocus />
                                      ) : (
                                        <span style={{ color: Number(mi.pct_executado) >= 100 ? 'var(--success)' : Number(mi.pct_executado) > 0 ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600 }}>
                                          {Number(mi.pct_executado).toFixed(0)}%
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-center px-2 py-1.5">
                                      {!isEditingThis && (
                                        <button onClick={() => { setEditingItemId(mi.id); setEditingPct(`${Number(mi.pct_executado).toFixed(0)}`) }}
                                          className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }} title="Editar %"><Edit3 size={11} /></button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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
