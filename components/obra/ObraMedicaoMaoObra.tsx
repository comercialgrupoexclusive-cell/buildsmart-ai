'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, ChevronDown, ChevronRight, Lock, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Medicao, MedicaoItem } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

type OrcamentoOpcao = { id: string; nome: string | null; versao: number; status: string }
type InsumoLinha = {
  id: string
  descricao_snapshot: string | null
  unidade_snapshot: string | null
  quantidade_adotada: number | null
  quantidade_calculada: number | null
  preco_unitario_snapshot: number | null
  classificacao_snapshot: string | null
}
type ItemOrcamento = {
  id: string
  descricao_snapshot: string | null
  unidade_snapshot: string | null
  quantidade: number
  preco_unitario_snapshot: number
  classificacao_snapshot: string | null
  orcamento_item_insumos: InsumoLinha[]
}
type LinhaMaoObra = { id: string; tipo: 'orcamento_item' | 'orcamento_insumo'; nome: string; unidade: string; quantidade: number; valor: number }

const hoje = () => new Date().toISOString().slice(0, 10)
const isMaoObra = (valor: string | null, descricao = '') =>
  (valor || '').toUpperCase() === 'MAO_DE_OBRA' || /m[aã]o\s+de\s+obra/i.test(descricao)

export function ObraMedicaoMaoObra({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [orcamentos, setOrcamentos] = useState<OrcamentoOpcao[]>([])
  const [orcamentoId, setOrcamentoId] = useState('')
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [itens, setItens] = useState<Record<string, MedicaoItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', inicio: hoje(), fim: hoje() })

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data: orcs } = await supabase.from('orcamentos').select('id,nome,versao,status').eq('obra_id', obraId).order('versao', { ascending: false })
    const opcoes = (orcs || []) as OrcamentoOpcao[]
    setOrcamentos(opcoes)
    setOrcamentoId(atual => atual || opcoes.find(o => o.status === 'ativo')?.id || opcoes[0]?.id || '')
    setLoading(false)
  }, [obraId, supabase])

  const carregarMedicoes = useCallback(async () => {
    if (!orcamentoId) { setMedicoes([]); return }
    const { data } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).eq('orcamento_id', orcamentoId).eq('eixo', 'mao_obra').order('numero', { ascending: false })
    setMedicoes((data || []) as Medicao[])
  }, [obraId, orcamentoId, supabase])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])
  useEffect(() => { Promise.resolve().then(carregarMedicoes) }, [carregarMedicoes])

  async function linhasDoOrcamento(): Promise<LinhaMaoObra[]> {
    const { data, error } = await supabase.from('orcamento_itens')
      .select('id,descricao_snapshot,unidade_snapshot,quantidade,preco_unitario_snapshot,classificacao_snapshot,orcamento_item_insumos(*)')
      .eq('orcamento_id', orcamentoId)
    if (error) throw error
    const linhas: LinhaMaoObra[] = []
    for (const item of (data || []) as ItemOrcamento[]) {
      if (isMaoObra(item.classificacao_snapshot, item.descricao_snapshot || '')) {
        linhas.push({ id: item.id, tipo: 'orcamento_item', nome: item.descricao_snapshot || 'Mão de obra', unidade: item.unidade_snapshot || 'un', quantidade: Number(item.quantidade || 0), valor: Number(item.quantidade || 0) * Number(item.preco_unitario_snapshot || 0) })
        continue
      }
      for (const i of (item.orcamento_item_insumos || []).filter(insumo => isMaoObra(insumo.classificacao_snapshot, insumo.descricao_snapshot || ''))) {
        const quantidade = Number(i.quantidade_adotada ?? i.quantidade_calculada ?? 0)
        linhas.push({ id: i.id, tipo: 'orcamento_insumo', nome: i.descricao_snapshot || 'Mão de obra', unidade: i.unidade_snapshot || 'un', quantidade, valor: quantidade * Number(i.preco_unitario_snapshot || 0) })
      }
    }
    return linhas
  }

  async function criar() {
    if (!orcamentoId) return
    setSaving(true)
    try {
      const linhas = await linhasDoOrcamento()
      if (linhas.length === 0) { alert('Este orçamento não possui itens classificados como Mão de Obra.'); return }
      const { data: ultima } = await supabase.from('medicoes').select('numero').eq('obra_id', obraId).eq('orcamento_id', orcamentoId).eq('eixo', 'mao_obra').order('numero', { ascending: false }).limit(1)
      const numero = Number(ultima?.[0]?.numero || 0) + 1
      const { data: medicao, error } = await supabase.from('medicoes').insert({
        obra_id: obraId, orcamento_id: orcamentoId, eixo: 'mao_obra', numero,
        nome: form.nome.trim() || `Medição de mão de obra ${numero}`,
        periodo_inicio: form.inicio, periodo_fim: form.fim, status: 'rascunho', percentual_executado: 0, fotos: [],
      }).select().single()
      if (error || !medicao) throw error || new Error('Medição não criada')

      const { data: anteriores } = await supabase.from('medicao_itens')
        .select('item_id,pct_atual,medicoes!inner(obra_id,orcamento_id,eixo,status)')
        .eq('medicoes.obra_id', obraId).eq('medicoes.orcamento_id', orcamentoId).eq('medicoes.eixo', 'mao_obra').eq('medicoes.status', 'fechada')
      const anterior = new Map<string, number>()
      ;((anteriores || []) as { item_id: string; pct_atual: number }[]).forEach(i => anterior.set(i.item_id, Math.max(anterior.get(i.item_id) || 0, Number(i.pct_atual || 0))))
      const snapshots = linhas.map(l => ({ medicao_id: medicao.id, item_tipo: l.tipo, item_id: l.id, nome: l.nome, valor_contratado: l.valor, pct_anterior: anterior.get(l.id) || 0, pct_atual: anterior.get(l.id) || 0, valor_periodo: 0 }))
      const { error: itensError } = await supabase.from('medicao_itens').insert(snapshots)
      if (itensError) { await supabase.from('medicoes').delete().eq('id', medicao.id); throw itensError }
      setShowForm(false); setForm({ nome: '', inicio: hoje(), fim: hoje() }); setAberta(medicao.id)
      await carregarMedicoes(); await carregarItens(medicao.id, true)
    } catch (error) {
      alert(`Não foi possível criar a medição: ${error instanceof Error ? error.message : 'erro inesperado'}`)
    } finally { setSaving(false) }
  }

  async function carregarItens(id: string, force = false) {
    if (itens[id] && !force) return
    const { data } = await supabase.from('medicao_itens').select('*').eq('medicao_id', id).order('nome')
    setItens(atual => ({ ...atual, [id]: (data || []) as MedicaoItem[] }))
  }

  function toggle(id: string) {
    const proxima = aberta === id ? null : id
    setAberta(proxima)
    if (proxima) carregarItens(proxima)
  }

  async function salvarPercentual(medicaoId: string, item: MedicaoItem, valor: number) {
    const pct = Math.max(Number(item.pct_anterior || 0), Math.min(100, Number(valor) || 0))
    const valorPeriodo = (pct - Number(item.pct_anterior || 0)) / 100 * Number(item.valor_contratado || 0)
    setItens(atual => ({ ...atual, [medicaoId]: (atual[medicaoId] || []).map(i => i.id === item.id ? { ...i, pct_atual: pct, valor_periodo: valorPeriodo } : i) }))
    await supabase.from('medicao_itens').update({ pct_atual: pct, valor_periodo: valorPeriodo }).eq('id', item.id)
  }

  async function fechar(medicao: Medicao) {
    const linhas = itens[medicao.id] || []
    if (!linhas.length || !confirm('Fechar esta medição de mão de obra?')) return
    const base = linhas.reduce((s, i) => s + Number(i.valor_contratado || 0), 0)
    const valorPeriodo = linhas.reduce((s, i) => s + Number(i.valor_periodo || 0), 0)
    const valorAcumulado = linhas.reduce((s, i) => s + Number(i.valor_contratado || 0) * Number(i.pct_atual || 0) / 100, 0)
    const acumulado = base > 0 ? valorAcumulado / base * 100 : linhas.reduce((s, i) => s + Number(i.pct_atual || 0), 0) / linhas.length
    const periodo = base > 0 ? valorPeriodo / base * 100 : 0
    await supabase.from('medicoes').update({ status: 'fechada', percentual_executado: acumulado, avanco_acumulado: acumulado, avanco_periodo: periodo, valor_periodo: valorPeriodo, valor_acumulado: valorAcumulado }).eq('id', medicao.id)
    await carregarMedicoes()
  }

  async function remover(id: string) {
    if (!confirm('Excluir esta medição de mão de obra?')) return
    await supabase.from('medicoes').delete().eq('id', id)
    setMedicoes(atual => atual.filter(m => m.id !== id))
  }

  const selecionado = useMemo(() => orcamentos.find(o => o.id === orcamentoId), [orcamentos, orcamentoId])
  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return <div className="flex flex-col gap-3 pb-16">
    <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
      <div><p className="text-sm font-semibold">Medição de mão de obra</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Somente itens classificados como Mão de Obra.</p></div>
      <select value={orcamentoId} onChange={e => { setOrcamentoId(e.target.value); setAberta(null); setItens({}) }} className="input-base text-sm sm:w-72">
        {orcamentos.length === 0 && <option value="">Nenhum orçamento vinculado</option>}
        {orcamentos.map(o => <option key={o.id} value={o.id}>{o.nome || `Orçamento v${o.versao}`} · {o.status}</option>)}
      </select>
    </div>

    <div className="flex items-center justify-between gap-3">
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{selecionado ? `Controle independente de ${selecionado.nome || `orçamento v${selecionado.versao}`}.` : 'Vincule um orçamento para medir.'}</p>
      <button onClick={() => setShowForm(v => !v)} disabled={!orcamentoId} className="btn-primary px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"><Plus size={15} /> Nova medição</button>
    </div>

    {showForm && <div className="card p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Nome"><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="input-base w-full" placeholder="Ex.: Equipe de julho" /></Field>
        <Field label="Início"><input type="date" value={form.inicio} onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} className="input-base w-full" /></Field>
        <Field label="Fim"><input type="date" value={form.fim} onChange={e => setForm(f => ({ ...f, fim: e.target.value }))} className="input-base w-full" /></Field>
      </div>
      <div className="flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm">Cancelar</button><button onClick={criar} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Criando...' : 'Criar medição'}</button></div>
    </div>}

    {medicoes.length === 0 && !showForm ? <div className="card p-10 text-center"><BriefcaseBusiness className="mx-auto mb-2" size={28} style={{ color: 'var(--text-secondary)' }} /><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição de mão de obra neste orçamento.</p></div> : medicoes.map(m => {
      const expandida = aberta === m.id
      const fechada = m.status === 'fechada'
      const linhas = itens[m.id] || []
      return <div key={m.id} className="card overflow-hidden">
        <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => toggle(m.id)}>
          {expandida ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{m.nome}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.periodo_inicio} → {m.periodo_fim}{fechada ? ` · ${Number(m.avanco_acumulado || 0).toFixed(1)}% acumulado` : ' · rascunho'}</p></div>
          {fechada && <Lock size={14} style={{ color: 'var(--success)' }} />}
          {!fechada && <button onClick={e => { e.stopPropagation(); remover(m.id) }} className="p-2" title="Excluir"><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>}
        </div>
        {expandida && <div className="p-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          {linhas.map(item => <div key={item.id} className="rounded-lg p-3 grid grid-cols-[minmax(0,1fr)_88px] gap-3 items-center" style={{ background: 'var(--bg-secondary)' }}>
            <div className="min-w-0"><p className="text-sm font-medium truncate">{item.nome}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(item.valor_contratado || 0))} · anterior {Number(item.pct_anterior || 0).toFixed(1)}%</p></div>
            {fechada ? <strong className="text-right text-sm" style={{ color: 'var(--accent)' }}>{Number(item.pct_atual || 0).toFixed(1)}%</strong> : <input type="number" min={Number(item.pct_anterior || 0)} max={100} defaultValue={item.pct_atual} onBlur={e => salvarPercentual(m.id, item, Number(e.target.value))} className="input-base w-full text-right" aria-label={`Percentual de ${item.nome}`} />}
          </div>)}
          {!fechada && linhas.length > 0 && <div className="flex justify-end"><button onClick={() => fechar(m)} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"><Lock size={14} /> Fechar medição</button></div>}
        </div>}
      </div>
    })}
  </div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>{children}</label>
}
