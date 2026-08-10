'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, ChevronDown, ChevronRight, Lock, Plus, Trash2, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Medicao, MedicaoItem } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

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
type LinhaMaoObra = { id: string; tipo: 'subetapa'; nome: string; unidade: string; quantidade: number; valor: number }

const hoje = () => new Date().toISOString().slice(0, 10)
const SEPARADOR_HIERARQUIA = '|||'
const isMaoObra = (valor: string | null, descricao = '') =>
  (valor || '').toUpperCase() === 'MAO_DE_OBRA' || /m[aã]o\s+de\s+obra/i.test(descricao)

export function ObraMedicaoMaoObra({ obraId, orcamentoId, eixo = 'mao_obra' }: { obraId: string; orcamentoId: string; eixo?: 'mao_obra' | 'gerenciamento' }) {
  const supabase = useMemo(() => createClient(), [])
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [itens, setItens] = useState<Record<string, MedicaoItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', inicio: hoje(), fim: hoje() })

  const carregarMedicoes = useCallback(async () => {
    setLoading(true)
    if (!orcamentoId) { setMedicoes([]); setLoading(false); return }
    const { data } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).eq('orcamento_id', orcamentoId).eq('eixo', eixo).order('numero', { ascending: false })
    setMedicoes((data || []) as Medicao[])
    setLoading(false)
  }, [obraId, orcamentoId, supabase, eixo])

  useEffect(() => { Promise.resolve().then(carregarMedicoes) }, [carregarMedicoes])

  async function linhasDoOrcamento(): Promise<LinhaMaoObra[]> {
    type OrcRow = ItemOrcamento & {
      etapa_id: string | null
      subetapa: string | null
      tipo_linha: string
      subetapa_valor_manual: number | null
      subetapa_valor_manual_ativo: boolean
    }
    const [{ data: orc, error: orcError }, { data, error }] = await Promise.all([
      supabase.from('orcamentos').select('gerenciamento_percentual').eq('id', orcamentoId).single(),
      supabase.from('orcamento_itens')
        .select('id,etapa_id,subetapa,tipo_linha,descricao_snapshot,unidade_snapshot,quantidade,preco_unitario_snapshot,classificacao_snapshot,subetapa_valor_manual,subetapa_valor_manual_ativo,orcamento_item_insumos(*)')
        .eq('orcamento_id', orcamentoId),
    ])
    if (orcError) throw orcError
    if (error) throw error

    const percentualGerenciamento = Number(orc?.gerenciamento_percentual || 0)
    if (eixo === 'gerenciamento' && percentualGerenciamento <= 0) return []

    const rows = (data || []) as OrcRow[]
    const etapaIds = [...new Set(rows.map(item => item.etapa_id).filter((id): id is string => Boolean(id)))]
    const { data: etapas } = etapaIds.length
      ? await supabase.from('etapas').select('id,nome').in('id', etapaIds)
      : { data: [] as { id: string; nome: string }[] }
    const nomesEtapa = new Map(((etapas || []) as { id: string; nome: string }[]).map(etapa => [etapa.id, etapa.nome]))

    type Grupo = { id: string; etapaId: string; subetapa: string; valor: number }
    const grupos = new Map<string, Grupo>()
    const manuais = new Map<string, { id: string; valor: number }>()
    const chaveDe = (item: OrcRow) => `${item.etapa_id || 'sem-etapa'}::${item.subetapa?.trim() || 'Sem subetapa'}`
    const somar = (key: string, id: string, etapaId: string, subetapa: string, valor: number) => {
      const atual = grupos.get(key)
      if (atual) atual.valor += valor
      else grupos.set(key, { id, etapaId, subetapa, valor })
    }

    for (const item of rows) {
      const key = chaveDe(item)
      const etapaId = item.etapa_id || 'sem-etapa'
      const subetapa = item.subetapa?.trim() || 'Sem subetapa'
      if (item.tipo_linha === 'subetapa') {
        if (item.subetapa_valor_manual_ativo) manuais.set(key, { id: item.id, valor: Number(item.subetapa_valor_manual || 0) })
        continue
      }

      if (eixo === 'gerenciamento') {
        somar(key, item.id, etapaId, subetapa, Number(item.quantidade || 0) * Number(item.preco_unitario_snapshot || 0))
        continue
      }

      if (isMaoObra(item.classificacao_snapshot, item.descricao_snapshot || '')) {
        somar(key, item.id, etapaId, subetapa, Number(item.quantidade || 0) * Number(item.preco_unitario_snapshot || 0))
        continue
      }
      for (const insumo of (item.orcamento_item_insumos || []).filter(i => isMaoObra(i.classificacao_snapshot, i.descricao_snapshot || ''))) {
        const quantidade = Number(insumo.quantidade_adotada ?? insumo.quantidade_calculada ?? 0)
        somar(key, insumo.id, etapaId, subetapa, quantidade * Number(insumo.preco_unitario_snapshot || 0))
      }
    }

    if (eixo === 'gerenciamento') {
      for (const [key, manual] of manuais) {
        const [etapaId, subetapa] = key.split('::')
        grupos.set(key, { id: manual.id, etapaId, subetapa, valor: manual.valor })
      }
    }

    return [...grupos.values()]
      .map(grupo => {
        const etapa = grupo.etapaId === 'sem-etapa' ? 'Sem etapa' : (nomesEtapa.get(grupo.etapaId) || 'Etapa')
        const valor = eixo === 'gerenciamento' ? grupo.valor * percentualGerenciamento / 100 : grupo.valor
        return {
          id: grupo.id,
          tipo: 'subetapa' as const,
          nome: `${etapa}${SEPARADOR_HIERARQUIA}${grupo.subetapa}`,
          unidade: '%',
          quantidade: 1,
          valor,
        }
      })
      .filter(linha => linha.valor > 0)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  async function criar() {
    if (!orcamentoId) return
    setSaving(true)
    try {
      const linhas = await linhasDoOrcamento()
      if (linhas.length === 0) {
        alert(eixo === 'gerenciamento'
          ? 'Configure um percentual de gerenciamento maior que zero neste orçamento.'
          : 'Este orçamento não possui itens classificados como Mão de Obra.')
        return
      }
      const { data: ultima } = await supabase.from('medicoes').select('numero').eq('obra_id', obraId).eq('orcamento_id', orcamentoId).eq('eixo', eixo).order('numero', { ascending: false }).limit(1)
      const numero = Number(ultima?.[0]?.numero || 0) + 1
      const { data: medicao, error } = await supabase.from('medicoes').insert({
        obra_id: obraId, orcamento_id: orcamentoId, eixo, numero,
        nome: form.nome.trim() || `Medição de ${eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'} ${numero}`,
        periodo_inicio: form.inicio, periodo_fim: form.fim, status: 'rascunho', percentual_executado: 0, fotos: [],
      }).select().single()
      if (error || !medicao) throw error || new Error('Medição não criada')

      const { data: anteriores } = await supabase.from('medicao_itens')
        .select('item_id,pct_atual,medicoes!inner(obra_id,orcamento_id,eixo,status)')
        .eq('medicoes.obra_id', obraId).eq('medicoes.orcamento_id', orcamentoId).eq('medicoes.eixo', eixo).eq('medicoes.status', 'fechada')
      const anterior = new Map<string, number>()
      ;((anteriores || []) as { item_id: string; pct_atual: number }[]).forEach(i => anterior.set(i.item_id, Math.max(anterior.get(i.item_id) || 0, Number(i.pct_atual || 0))))
      const snapshots = linhas.map(l => ({ medicao_id: medicao.id, item_tipo: l.tipo, item_id: l.id, nome: l.nome, valor_contratado: l.valor, pct_anterior: anterior.get(l.id) || 0, pct_atual: anterior.get(l.id) || 0, valor_periodo: 0, valor_pago: 0 }))
      const { error: itensError } = await supabase.from('medicao_itens').insert(snapshots)
      if (itensError) { await supabase.from('medicoes').delete().eq('id', medicao.id); throw itensError }
      setShowForm(false); setForm({ nome: '', inicio: hoje(), fim: hoje() }); setAberta(medicao.id)
      await carregarMedicoes(); await carregarItens(medicao.id, true)
    } catch (error) {
      alert(`Não foi possível criar a medição: ${error instanceof Error ? error.message : eixo === 'gerenciamento' ? 'configure o percentual de gerenciamento no orçamento' : 'erro inesperado'}`)
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

  async function salvarPercentualEtapa(medicaoId: string, linhas: MedicaoItem[], valor: number) {
    const atualizacoes = linhas.map(item => {
      const pct = Math.max(Number(item.pct_anterior || 0), Math.min(100, Number(valor) || 0))
      return {
        id: item.id,
        pct,
        valorPeriodo: (pct - Number(item.pct_anterior || 0)) / 100 * Number(item.valor_contratado || 0),
      }
    })
    setItens(atual => ({
      ...atual,
      [medicaoId]: (atual[medicaoId] || []).map(item => {
        const update = atualizacoes.find(candidate => candidate.id === item.id)
        return update ? { ...item, pct_atual: update.pct, valor_periodo: update.valorPeriodo } : item
      }),
    }))
    await Promise.all(atualizacoes.map(update => supabase
      .from('medicao_itens')
      .update({ pct_atual: update.pct, valor_periodo: update.valorPeriodo })
      .eq('id', update.id)))
  }

  async function salvarPago(medicaoId: string, item: MedicaoItem, valor: number) {
    const pago = Math.max(0, Math.min(Number(item.valor_contratado || 0), Number(valor) || 0))
    setItens(atual => ({ ...atual, [medicaoId]: (atual[medicaoId] || []).map(i => i.id === item.id ? { ...i, valor_pago: pago } : i) }))
    await supabase.from('medicao_itens').update({ valor_pago: pago }).eq('id', item.id)
  }

  async function fechar(medicao: Medicao) {
    const linhas = itens[medicao.id] || []
    if (!linhas.length || !confirm(`Fechar esta medição de ${eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'}?`)) return
    const base = linhas.reduce((s, i) => s + Number(i.valor_contratado || 0), 0)
    const valorPeriodo = linhas.reduce((s, i) => s + Number(i.valor_periodo || 0), 0)
    const valorAcumulado = linhas.reduce((s, i) => s + Number(i.valor_contratado || 0) * Number(i.pct_atual || 0) / 100, 0)
    const acumulado = base > 0 ? valorAcumulado / base * 100 : linhas.reduce((s, i) => s + Number(i.pct_atual || 0), 0) / linhas.length
    const periodo = base > 0 ? valorPeriodo / base * 100 : 0
    await supabase.from('medicoes').update({ status: 'fechada', percentual_executado: acumulado, avanco_acumulado: acumulado, avanco_periodo: periodo, valor_periodo: valorPeriodo, valor_acumulado: valorAcumulado }).eq('id', medicao.id)
    await carregarMedicoes()
  }

  async function remover(id: string) {
    if (!confirm(`Excluir esta medição de ${eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'}?`)) return
    await supabase.from('medicoes').delete().eq('id', id)
    setMedicoes(atual => atual.filter(m => m.id !== id))
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return <div className="flex flex-col gap-3 pb-16">
    <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
      <div><p className="text-sm font-semibold">Medição de {eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{eixo === 'gerenciamento' ? 'Gerenciamento do orçamento distribuído por etapa e subetapa.' : 'Somente valores classificados como Mão de Obra, organizados por etapa e subetapa.'}</p></div>
    </div>

    <div className="flex items-center justify-between gap-3">
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Controle independente alimentado pelo orçamento da obra.</p>
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

    {medicoes.length === 0 && !showForm ? <div className="card p-10 text-center">{eixo === 'gerenciamento' ? <WalletCards className="mx-auto mb-2" size={28} style={{ color: 'var(--text-secondary)' }} /> : <BriefcaseBusiness className="mx-auto mb-2" size={28} style={{ color: 'var(--text-secondary)' }} />}<p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição de {eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'} neste orçamento.</p></div> : medicoes.map(m => {
      const expandida = aberta === m.id
      const fechada = m.status === 'fechada'
      const linhas = itens[m.id] || []
      const gruposLinhas = agruparPorEtapa(linhas)
      return <div key={m.id} className="card overflow-hidden">
        <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => toggle(m.id)}>
          {expandida ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{m.nome}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.periodo_inicio} → {m.periodo_fim}{fechada ? ` · ${Number(m.avanco_acumulado || 0).toFixed(1)}% acumulado` : ' · rascunho'}</p></div>
          {fechada && <Lock size={14} style={{ color: 'var(--success)' }} />}
          {!fechada && <button onClick={e => { e.stopPropagation(); remover(m.id) }} className="p-2" title="Excluir"><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>}
        </div>
        {expandida && <div className="p-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          {gruposLinhas.map(grupo => (
            <div key={grupo.etapa} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <div className="px-3 py-2.5 flex items-center gap-3" style={{ background: 'var(--bg-secondary)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{grupo.etapa}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {grupo.itens.length} subetapa(s) · {formatCurrency(grupo.valor)}
                  </p>
                </div>
                {fechada ? (
                  <strong className="text-sm" style={{ color: 'var(--accent)' }}>{grupo.percentual.toFixed(1)}%</strong>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Etapa
                    <input type="number" min={grupo.percentualMinimo} max={100} defaultValue={Number(grupo.percentual.toFixed(1))}
                      onBlur={event => salvarPercentualEtapa(m.id, grupo.itens.map(linha => linha.item), Number(event.target.value))}
                      className="input-base w-20 py-1 text-right" aria-label={`Percentual da etapa ${grupo.etapa}`} />
                  </label>
                )}
              </div>
              <div className="flex flex-col">
                {grupo.itens.map(({ item, subetapa }) => eixo === 'gerenciamento' ? (
                  <div key={item.id} className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-sm font-medium mb-2">{subetapa}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Metric label="Previsto" value={formatCurrency(Number(item.valor_contratado || 0))} />
                      <label className="rounded-md p-2" style={{ background: 'var(--bg-card)' }}>
                        <span className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Medido</span>
                        <span className="block text-xs font-semibold mb-1">{formatCurrency(Number(item.valor_contratado || 0) * Number(item.pct_atual || 0) / 100)}</span>
                        {fechada ? <span className="text-xs" style={{ color: 'var(--accent)' }}>{Number(item.pct_atual || 0).toFixed(1)}%</span> : (
                          <input type="number" min={Number(item.pct_anterior || 0)} max={100} defaultValue={item.pct_atual}
                            onBlur={event => salvarPercentual(m.id, item, Number(event.target.value))}
                            className="input-base w-full py-1 text-right text-xs" aria-label={`Percentual medido de ${subetapa}`} />
                        )}
                      </label>
                      <label className="rounded-md p-2" style={{ background: 'var(--bg-card)' }}>
                        <span className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Pago</span>
                        <input type="number" min={0} max={Number(item.valor_contratado || 0)} defaultValue={Number(item.valor_pago || 0)}
                          onBlur={event => salvarPago(m.id, item, Number(event.target.value))}
                          className="input-base w-full py-1 text-right text-xs" aria-label={`Valor pago de ${subetapa}`} />
                      </label>
                      <Metric label="Saldo" value={formatCurrency(Math.max(0, Number(item.valor_contratado || 0) - Number(item.valor_pago || 0)))} />
                    </div>
                  </div>
                ) : (
                  <div key={item.id} className="p-3 grid grid-cols-[minmax(0,1fr)_88px] gap-3 items-center" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="min-w-0"><p className="text-sm font-medium truncate">{subetapa}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(item.valor_contratado || 0))} · anterior {Number(item.pct_anterior || 0).toFixed(1)}%</p></div>
                    {fechada ? <strong className="text-right text-sm" style={{ color: 'var(--accent)' }}>{Number(item.pct_atual || 0).toFixed(1)}%</strong> : <input type="number" min={Number(item.pct_anterior || 0)} max={100} defaultValue={item.pct_atual} onBlur={event => salvarPercentual(m.id, item, Number(event.target.value))} className="input-base w-full text-right" aria-label={`Percentual de ${subetapa}`} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!fechada && linhas.length > 0 && <div className="flex justify-end"><button onClick={() => fechar(m)} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"><Lock size={14} /> Fechar medição</button></div>}
        </div>}
      </div>
    })}
  </div>
}

function agruparPorEtapa(linhas: MedicaoItem[]) {
  const grupos = new Map<string, { etapa: string; itens: { item: MedicaoItem; subetapa: string }[] }>()
  for (const item of linhas) {
    const [etapaOriginal, subetapaOriginal] = (item.nome || 'Itens').split(SEPARADOR_HIERARQUIA)
    const etapa = subetapaOriginal ? etapaOriginal : 'Itens anteriores'
    const subetapa = subetapaOriginal || item.nome || 'Item'
    const grupo = grupos.get(etapa) || { etapa, itens: [] }
    grupo.itens.push({ item, subetapa })
    grupos.set(etapa, grupo)
  }
  return [...grupos.values()].map(grupo => {
    const valor = grupo.itens.reduce((total, linha) => total + Number(linha.item.valor_contratado || 0), 0)
    const medido = grupo.itens.reduce((total, linha) => total + Number(linha.item.valor_contratado || 0) * Number(linha.item.pct_atual || 0) / 100, 0)
    return {
      ...grupo,
      valor,
      percentual: valor > 0 ? medido / valor * 100 : 0,
      percentualMinimo: Math.max(0, ...grupo.itens.map(linha => Number(linha.item.pct_anterior || 0))),
    }
  })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>{children}</label>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md p-2" style={{ background: 'var(--bg-card)' }}><span className="block text-[10px] uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</span><strong className="text-xs">{value}</strong></div>
}
