'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, ChevronDown, ChevronRight, Gauge, Lock, Plus, Ruler, SlidersHorizontal, Trash2, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Medicao, MedicaoItem } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { ObraEixoAvanco } from '@/components/obra/ObraEixoAvanco'
import { ObraAjusteDistribuicao } from '@/components/obra/ObraAjusteDistribuicao'
import { ProgressControl } from '@/components/obra/ProgressControl'

type InsumoLinha = {
  id: string
  descricao_snapshot: string | null
  quantidade_adotada: number | null
  quantidade_calculada: number | null
  preco_unitario_snapshot: number | null
  classificacao_snapshot: string | null
}

type ItemOrcamento = {
  id: string
  etapa_id: string | null
  subetapa: string | null
  tipo_linha: string
  descricao_snapshot: string | null
  quantidade: number
  preco_unitario_snapshot: number
  classificacao_snapshot: string | null
  subetapa_valor_manual: number | null
  subetapa_valor_manual_ativo: boolean
  orcamento_item_insumos: InsumoLinha[]
}

type LinhaMedicao = {
  id: string
  tipo: 'subetapa'
  nome: string
  valor: number
}

type LinhaVisual = { item: MedicaoItem; nome: string }
type SubetapaVisual = { nome: string; itens: LinhaVisual[]; valor: number; percentual: number; percentualMinimo: number }
type EtapaVisual = { nome: string; subetapas: SubetapaVisual[]; valor: number; percentual: number; percentualMinimo: number }

const hoje = () => new Date().toISOString().slice(0, 10)
const SEPARADOR_HIERARQUIA = '|||'
const isMaoObra = (valor: string | null, descricao = '') =>
  (valor || '').toUpperCase() === 'MAO_DE_OBRA' || /m[aã]o\s+de\s+obra/i.test(descricao)
const clamp = (valor: number, minimo = 0) => Math.max(minimo, Math.min(100, Number(valor) || 0))

export function ObraMedicaoMaoObra({ obraId, orcamentoId, eixo = 'mao_obra' }: { obraId: string; orcamentoId: string; eixo?: 'mao_obra' | 'gerenciamento' }) {
  const [aba, setAba] = useState<'avanco' | 'medicao' | 'ajustes'>('avanco')
  const abas = [
    { id: 'avanco' as const, label: 'Avanço físico', icon: Gauge },
    { id: 'medicao' as const, label: 'Medição', icon: Ruler },
    { id: 'ajustes' as const, label: 'Ajustes', icon: SlidersHorizontal },
  ]
  return <div className="flex flex-col gap-3">
    <div className="flex overflow-x-auto rounded-lg p-1" style={{ background: 'var(--bg-secondary)' }}>
      {abas.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setAba(item.id)} className="flex min-w-max flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors" style={aba === item.id ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-secondary)' }}><Icon size={15} />{item.label}</button> })}
    </div>
    {aba === 'avanco' && <ObraEixoAvanco obraId={obraId} orcamentoId={orcamentoId} eixo={eixo} />}
    {aba === 'medicao' && <ObraMedicaoConteudo obraId={obraId} orcamentoId={orcamentoId} eixo={eixo} />}
    {aba === 'ajustes' && <ObraAjusteDistribuicao obraId={obraId} orcamentoId={orcamentoId} eixo={eixo} />}
  </div>
}

function ObraMedicaoConteudo({ obraId, orcamentoId, eixo }: { obraId: string; orcamentoId: string; eixo: 'mao_obra' | 'gerenciamento' }) {
  const supabase = useMemo(() => createClient(), [])
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [itens, setItens] = useState<Record<string, MedicaoItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [gerenciamentoPercentual, setGerenciamentoPercentual] = useState(0)
  const [form, setForm] = useState({ nome: '', inicio: hoje(), fim: hoje() })

  const carregarMedicoes = useCallback(async () => {
    setLoading(true)
    if (!orcamentoId) { setMedicoes([]); setLoading(false); return }
    const [{ data }, { data: orcamento }] = await Promise.all([
      supabase.from('medicoes').select('*').eq('obra_id', obraId).eq('orcamento_id', orcamentoId).eq('eixo', eixo).order('numero', { ascending: false }),
      supabase.from('orcamentos').select('gerenciamento_percentual').eq('id', orcamentoId).maybeSingle(),
    ])
    setMedicoes((data || []) as Medicao[])
    setGerenciamentoPercentual(Number(orcamento?.gerenciamento_percentual || 0))
    setLoading(false)
  }, [obraId, orcamentoId, supabase, eixo])

  useEffect(() => { Promise.resolve().then(carregarMedicoes) }, [carregarMedicoes])

  async function linhasDoOrcamento(): Promise<LinhaMedicao[]> {
    const [{ data: orc, error: orcError }, { data, error }] = await Promise.all([
      supabase.from('orcamentos').select('gerenciamento_percentual').eq('id', orcamentoId).single(),
      supabase.from('orcamento_itens')
        .select('id,etapa_id,subetapa,tipo_linha,descricao_snapshot,quantidade,preco_unitario_snapshot,classificacao_snapshot,subetapa_valor_manual,subetapa_valor_manual_ativo,orcamento_item_insumos(id,descricao_snapshot,quantidade_adotada,quantidade_calculada,preco_unitario_snapshot,classificacao_snapshot)')
        .eq('orcamento_id', orcamentoId),
    ])
    if (orcError) throw orcError
    if (error) throw error

    const rows = (data || []) as ItemOrcamento[]
    const etapaIds = [...new Set(rows.map(item => item.etapa_id).filter((id): id is string => Boolean(id)))]
    const { data: etapas } = etapaIds.length
      ? await supabase.from('etapas').select('id,nome,ordem').in('id', etapaIds)
      : { data: [] as { id: string; nome: string; ordem: number }[] }
    const nomesEtapa = new Map(((etapas || []) as { id: string; nome: string }[]).map(etapa => [etapa.id, etapa.nome]))
    const nomeEtapa = (item: ItemOrcamento) => item.etapa_id ? nomesEtapa.get(item.etapa_id) || 'Etapa' : 'Sem etapa'
    const nomeSubetapa = (item: ItemOrcamento) => item.subetapa?.trim() || 'Sem subetapa'

    if (eixo === 'mao_obra') {
      const linhas: LinhaMedicao[] = []
      for (const item of rows) {
        if (item.tipo_linha === 'subetapa') continue
        if (isMaoObra(item.classificacao_snapshot, item.descricao_snapshot || '')) {
          linhas.push({
            id: item.id,
            tipo: 'subetapa',
            nome: [nomeEtapa(item), nomeSubetapa(item), item.descricao_snapshot || 'Mão de obra'].join(SEPARADOR_HIERARQUIA),
            valor: Number(item.quantidade || 0) * Number(item.preco_unitario_snapshot || 0),
          })
        }
        for (const insumo of (item.orcamento_item_insumos || []).filter(linha => isMaoObra(linha.classificacao_snapshot, linha.descricao_snapshot || ''))) {
          linhas.push({
            id: insumo.id,
            tipo: 'subetapa',
            nome: [nomeEtapa(item), nomeSubetapa(item), insumo.descricao_snapshot || 'Mão de obra'].join(SEPARADOR_HIERARQUIA),
            valor: Number(insumo.quantidade_adotada ?? insumo.quantidade_calculada ?? 0) * Number(insumo.preco_unitario_snapshot || 0),
          })
        }
      }
      return linhas.filter(linha => linha.valor > 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    }

    const percentual = Number(orc?.gerenciamento_percentual || 0)
    const valores = new Map<string, { id: string; etapa: string; subetapa: string; valor: number }>()
    const manuais = new Map<string, { id: string; etapa: string; subetapa: string; valor: number }>()
    for (const item of rows) {
      const etapa = nomeEtapa(item)
      const subetapa = nomeSubetapa(item)
      const chave = `${etapa}${SEPARADOR_HIERARQUIA}${subetapa}`
      if (item.tipo_linha === 'subetapa') {
        if (item.subetapa_valor_manual_ativo) manuais.set(chave, { id: item.id, etapa, subetapa, valor: Number(item.subetapa_valor_manual || 0) })
        continue
      }
      const atual = valores.get(chave)
      const valor = Number(item.quantidade || 0) * Number(item.preco_unitario_snapshot || 0)
      if (atual) atual.valor += valor
      else valores.set(chave, { id: item.id, etapa, subetapa, valor })
    }
    for (const [chave, manual] of manuais) valores.set(chave, manual)
    return [...valores.values()].map(grupo => ({
      id: grupo.id,
      tipo: 'subetapa' as const,
      nome: [grupo.etapa, grupo.subetapa].join(SEPARADOR_HIERARQUIA),
      valor: grupo.valor * percentual / 100,
    })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  async function criar() {
    if (!orcamentoId) return
    setSaving(true)
    try {
      const linhas = await linhasDoOrcamento()
      if (linhas.length === 0) {
        alert(eixo === 'gerenciamento'
          ? 'O orçamento ainda não possui etapas e subetapas com valores para distribuir o gerenciamento.'
          : 'Este orçamento não possui itens classificados como Mão de Obra.')
        return
      }
      const { data: ultima } = await supabase.from('medicoes').select('numero').eq('obra_id', obraId).eq('orcamento_id', orcamentoId).eq('eixo', eixo).order('numero', { ascending: false }).limit(1)
      const numero = Number(ultima?.[0]?.numero || 0) + 1
      const { data: medicao, error } = await supabase.from('medicoes').insert({
        obra_id: obraId, orcamento_id: orcamentoId, eixo, numero,
        nome: form.nome.trim() || `Medição ${numero} — ${eixo === 'gerenciamento' ? 'Gerenciamento' : 'Mão de obra'}`,
        periodo_inicio: form.inicio, periodo_fim: form.fim, status: 'rascunho', percentual_executado: 0, fotos: [],
      }).select().single()
      if (error || !medicao) throw error || new Error('Medição não criada')

      const { data: anteriores } = await supabase.from('medicao_itens')
        .select('item_id,pct_atual,medicoes!inner(obra_id,orcamento_id,eixo,status)')
        .eq('medicoes.obra_id', obraId).eq('medicoes.orcamento_id', orcamentoId).eq('medicoes.eixo', eixo).eq('medicoes.status', 'fechada')
      const anterior = new Map<string, number>()
      ;((anteriores || []) as { item_id: string; pct_atual: number }[]).forEach(item => anterior.set(item.item_id, Math.max(anterior.get(item.item_id) || 0, Number(item.pct_atual || 0))))
      const snapshots = linhas.map(linha => ({ medicao_id: medicao.id, item_tipo: linha.tipo, item_id: linha.id, nome: linha.nome, valor_contratado: linha.valor, pct_anterior: anterior.get(linha.id) || 0, pct_atual: anterior.get(linha.id) || 0, valor_periodo: 0, valor_pago: 0 }))
      const { error: itensError } = await supabase.from('medicao_itens').insert(snapshots)
      if (itensError) { await supabase.from('medicoes').delete().eq('id', medicao.id); throw itensError }
      setShowForm(false)
      setForm({ nome: '', inicio: hoje(), fim: hoje() })
      setAberta(medicao.id)
      await carregarMedicoes()
      await carregarItens(medicao.id, true)
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
    const pct = clamp(valor, Number(item.pct_anterior || 0))
    const valorPeriodo = (pct - Number(item.pct_anterior || 0)) / 100 * Number(item.valor_contratado || 0)
    setItens(atual => ({ ...atual, [medicaoId]: (atual[medicaoId] || []).map(linha => linha.id === item.id ? { ...linha, pct_atual: pct, valor_periodo: valorPeriodo } : linha) }))
    await supabase.from('medicao_itens').update({ pct_atual: pct, valor_periodo: valorPeriodo }).eq('id', item.id)
  }

  async function salvarPercentualGrupo(medicaoId: string, linhas: MedicaoItem[], valor: number) {
    await Promise.all(linhas.map(item => salvarPercentual(medicaoId, item, valor)))
  }

  async function salvarPago(medicaoId: string, item: MedicaoItem, valor: number) {
    const pago = Math.max(0, Math.min(Number(item.valor_contratado || 0), Number(valor) || 0))
    setItens(atual => ({ ...atual, [medicaoId]: (atual[medicaoId] || []).map(linha => linha.id === item.id ? { ...linha, valor_pago: pago } : linha) }))
    await supabase.from('medicao_itens').update({ valor_pago: pago }).eq('id', item.id)
  }

  async function fechar(medicao: Medicao) {
    const linhas = itens[medicao.id] || []
    if (!linhas.length || !confirm(`Fechar esta medição de ${eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'}?`)) return
    const base = linhas.reduce((soma, item) => soma + Number(item.valor_contratado || 0), 0)
    const valorPeriodo = linhas.reduce((soma, item) => soma + Number(item.valor_periodo || 0), 0)
    const valorAcumulado = linhas.reduce((soma, item) => soma + Number(item.valor_contratado || 0) * Number(item.pct_atual || 0) / 100, 0)
    const acumulado = base > 0 ? valorAcumulado / base * 100 : linhas.reduce((soma, item) => soma + Number(item.pct_atual || 0), 0) / linhas.length
    const periodo = base > 0 ? valorPeriodo / base * 100 : 0
    await supabase.from('medicoes').update({ status: 'fechada', percentual_executado: acumulado, avanco_acumulado: acumulado, avanco_periodo: periodo, valor_periodo: valorPeriodo, valor_acumulado: valorAcumulado }).eq('id', medicao.id)
    await carregarMedicoes()
  }

  async function remover(id: string) {
    if (!confirm(`Excluir esta medição de ${eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'}?`)) return
    await supabase.from('medicoes').delete().eq('id', id)
    setMedicoes(atual => atual.filter(medicao => medicao.id !== id))
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} /></div>

  return <div className="flex flex-col gap-3 pb-16">
    <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
      <div>
        <p className="text-sm font-semibold">Medição de {eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'}</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {eixo === 'gerenciamento'
            ? `Etapas do orçamento com gerenciamento de ${gerenciamentoPercentual.toLocaleString('pt-BR')}%.`
            : 'Itens classificados como Mão de Obra, na mesma cascata do orçamento.'}
        </p>
      </div>
    </div>

    <div className="flex items-center justify-between gap-3">
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Peso e avanço aparecem juntos; a barra salva somente ao ser solta.</p>
      <button onClick={() => setShowForm(valor => !valor)} disabled={!orcamentoId} className="btn-primary px-3 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-50"><Plus size={15} /> Nova medição</button>
    </div>

    {showForm && <div className="card p-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Nome"><input value={form.nome} onChange={event => setForm(atual => ({ ...atual, nome: event.target.value }))} className="input-base w-full" placeholder="Ex.: Medição de agosto" /></Field>
        <Field label="Início"><input type="date" value={form.inicio} onChange={event => setForm(atual => ({ ...atual, inicio: event.target.value }))} className="input-base w-full" /></Field>
        <Field label="Fim"><input type="date" value={form.fim} onChange={event => setForm(atual => ({ ...atual, fim: event.target.value }))} className="input-base w-full" /></Field>
      </div>
      <div className="flex justify-end gap-2"><button onClick={() => setShowForm(false)} className="px-3 py-2 text-sm">Cancelar</button><button onClick={criar} disabled={saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Criando...' : 'Criar medição'}</button></div>
    </div>}

    {medicoes.length === 0 && !showForm ? <Empty eixo={eixo} /> : medicoes.map(medicao => {
      const expandida = aberta === medicao.id
      const fechada = medicao.status === 'fechada'
      const linhas = itens[medicao.id] || []
      const grupos = agruparPorEtapa(linhas)
      const total = grupos.reduce((soma, grupo) => soma + grupo.valor, 0)
      return <div key={medicao.id} className="card overflow-hidden">
        <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => toggle(medicao.id)}>
          {expandida ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{medicao.nome}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{medicao.periodo_inicio} → {medicao.periodo_fim}{fechada ? ` · ${Number(medicao.avanco_acumulado || 0).toFixed(1)}% acumulado` : ' · em edição'}</p></div>
          {fechada && <Lock size={14} style={{ color: 'var(--success)' }} />}
          {!fechada && <button onClick={event => { event.stopPropagation(); remover(medicao.id) }} className="p-2" title="Excluir"><Trash2 size={14} style={{ color: 'var(--danger)' }} /></button>}
        </div>
        {expandida && <div className="p-2 sm:p-3 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          {grupos.map(grupo => <EtapaMedicao key={grupo.nome} grupo={grupo} total={total} fechada={fechada} eixo={eixo}
            onSetEtapa={valor => salvarPercentualGrupo(medicao.id, grupo.subetapas.flatMap(sub => sub.itens.map(linha => linha.item)), valor)}
            onSetSub={(sub, valor) => salvarPercentualGrupo(medicao.id, sub.itens.map(linha => linha.item), valor)}
            onSetItem={(item, valor) => salvarPercentual(medicao.id, item, valor)}
            onSetPago={(item, valor) => salvarPago(medicao.id, item, valor)} />)}
          {!fechada && linhas.length > 0 && <div className="flex justify-end"><button onClick={() => fechar(medicao)} className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"><Lock size={14} /> Fechar medição</button></div>}
        </div>}
      </div>
    })}
  </div>
}

function EtapaMedicao({ grupo, total, fechada, eixo, onSetEtapa, onSetSub, onSetItem, onSetPago }: {
  grupo: EtapaVisual
  total: number
  fechada: boolean
  eixo: 'mao_obra' | 'gerenciamento'
  onSetEtapa: (valor: number) => void
  onSetSub: (sub: SubetapaVisual, valor: number) => void
  onSetItem: (item: MedicaoItem, valor: number) => void
  onSetPago: (item: MedicaoItem, valor: number) => void
}) {
  const [aberta, setAberta] = useState(true)
  const peso = total > 0 ? grupo.valor / total * 100 : 0
  return <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
    <div className="px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center" style={{ background: 'var(--bg-secondary)' }}>
      <button onClick={() => setAberta(valor => !valor)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
        {aberta ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="text-sm font-semibold truncate">{grupo.nome}</span>
        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>peso {peso.toFixed(1)}%</span>
      </button>
      <PctBar key={grupo.percentual} valor={grupo.percentual} minimo={grupo.percentualMinimo} disabled={fechada} onChange={onSetEtapa} />
    </div>
    {aberta && grupo.subetapas.map(sub => {
      const pesoSub = grupo.valor > 0 ? sub.valor / grupo.valor * 100 : 0
      return <div key={sub.nome} style={{ borderTop: '1px solid var(--border)' }}>
        <div className="pl-7 pr-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0 flex items-center gap-2"><span className="text-sm font-medium truncate">{sub.nome}</span><span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>peso {pesoSub.toFixed(1)}%</span></div>
          <PctBar key={sub.percentual} valor={sub.percentual} minimo={sub.percentualMinimo} disabled={fechada} onChange={valor => onSetSub(sub, valor)} small />
        </div>
        {sub.itens.filter(linha => linha.nome).map(({ item, nome }) => <div key={item.id} className="pl-10 pr-3 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{nome}</p><p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{formatCurrency(Number(item.valor_contratado || 0))} · anterior {Number(item.pct_anterior || 0).toFixed(1)}%</p></div>
            <PctBar key={Number(item.pct_atual || 0)} valor={Number(item.pct_atual || 0)} minimo={Number(item.pct_anterior || 0)} disabled={fechada} onChange={valor => onSetItem(item, valor)} small />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span>Medido <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(Number(item.valor_contratado || 0) * Number(item.pct_atual || 0) / 100)}</strong></span>
            <label className="flex items-center gap-1">Pago <input type="number" min={0} max={Number(item.valor_contratado || 0)} defaultValue={Number(item.valor_pago || 0)} disabled={fechada} onBlur={event => onSetPago(item, Number(event.target.value))} className="input-base w-28 py-1 text-right text-xs" /></label>
            <span>Saldo <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(Math.max(0, Number(item.valor_contratado || 0) - Number(item.valor_pago || 0)))}</strong></span>
          </div>
        </div>)}
      </div>
    })}
  </div>
}

function PctBar({ valor, minimo, disabled, onChange, small = false }: { valor: number; minimo: number; disabled: boolean; onChange: (valor: number) => void; small?: boolean }) {
  return <ProgressControl valor={valor} minimo={minimo} disabled={disabled} compact={small} onChange={onChange} />
}

function agruparPorEtapa(linhas: MedicaoItem[]): EtapaVisual[] {
  const etapas = new Map<string, Map<string, LinhaVisual[]>>()
  for (const item of linhas) {
    const partes = (item.nome || 'Itens').split(SEPARADOR_HIERARQUIA)
    const etapa = partes.length >= 2 ? partes[0] : 'Itens anteriores'
    const subetapa = partes.length >= 2 ? partes[1] : (item.nome || 'Item')
    // Snapshots antigos eram agregados por subetapa e não possuíam o terceiro nível.
    // Eles continuam editáveis na própria linha da subetapa, sem repetir o nome abaixo.
    const nome = partes.length >= 3 ? partes.slice(2).join(' / ') : ''
    const subs = etapas.get(etapa) || new Map<string, LinhaVisual[]>()
    const itens = subs.get(subetapa) || []
    itens.push({ item, nome })
    subs.set(subetapa, itens)
    etapas.set(etapa, subs)
  }
  return [...etapas.entries()].map(([nome, subs]) => {
    const subetapas = [...subs.entries()].map(([nomeSub, linhasSub]) => {
      const valor = linhasSub.reduce((soma, linha) => soma + Number(linha.item.valor_contratado || 0), 0)
      const medido = linhasSub.reduce((soma, linha) => soma + Number(linha.item.valor_contratado || 0) * Number(linha.item.pct_atual || 0) / 100, 0)
      return { nome: nomeSub, itens: linhasSub, valor, percentual: valor > 0 ? medido / valor * 100 : media(linhasSub.map(linha => Number(linha.item.pct_atual || 0))), percentualMinimo: Math.max(0, ...linhasSub.map(linha => Number(linha.item.pct_anterior || 0))) }
    })
    const valor = subetapas.reduce((soma, sub) => soma + sub.valor, 0)
    const medido = subetapas.reduce((soma, sub) => soma + sub.valor * sub.percentual / 100, 0)
    return { nome, subetapas, valor, percentual: valor > 0 ? medido / valor * 100 : media(subetapas.map(sub => sub.percentual)), percentualMinimo: Math.max(0, ...subetapas.map(sub => sub.percentualMinimo)) }
  })
}

function media(valores: number[]) { return valores.length ? valores.reduce((soma, valor) => soma + valor, 0) / valores.length : 0 }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>{children}</label> }
function Empty({ eixo }: { eixo: 'mao_obra' | 'gerenciamento' }) { return <div className="card p-10 text-center">{eixo === 'gerenciamento' ? <WalletCards className="mx-auto mb-2" size={28} style={{ color: 'var(--text-secondary)' }} /> : <BriefcaseBusiness className="mx-auto mb-2" size={28} style={{ color: 'var(--text-secondary)' }} />}<p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma medição de {eixo === 'gerenciamento' ? 'gerenciamento' : 'mão de obra'} neste orçamento.</p></div> }
