'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ShoppingCart, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  CheckSquare, Square, Scale, FileText, X, Building2, Zap,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, FORMA_PAGAMENTO_LABEL, TIPO_CUSTO_LABEL, TIPO_CUSTO_COLOR } from '@/lib/utils'
import { CompraItem, Etapa, Fornecedor, TipoCusto } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'

const STATUS_VALOR_LABEL: Record<CompraItem['status_valor'], string> = {
  confirmado: 'Confirmado',
  estimado: 'Estimado',
}

const STATUS_VALOR_COLOR: Record<CompraItem['status_valor'], string> = {
  confirmado: 'var(--success)',
  estimado: 'var(--warning)',
}

const SEM_ETAPA = 'sem_etapa'

type CotacaoLinha = { id: string; fornecedorNome: string; valor: string }

export type PrefillLancamento = {
  fornecedorNome?: string
  valorTotal?: number
  descricao?: string
} | null

/**
 * Sub-aba "Lançamentos" (1ª sub-aba de Materiais): formulário de lançamento
 * rápido sempre visível no topo + lista dos itens já lançados logo abaixo,
 * na mesma tela — sem sub-abas escondendo uma coisa atrás da outra.
 */
export function ComprasLancamentos({
  obraId, prefill, onPrefillConsumed,
}: {
  obraId: string
  prefill?: PrefillLancamento
  onPrefillConsumed?: () => void
}) {
  const supabase = createClient()
  const [itens, setItens] = useState<CompraItem[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<CompraItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [fornecedorManual, setFornecedorManual] = useState(false)
  const [form, setForm] = useState({
    descricao: '',
    etapa_id: '',
    fornecedor_id: '',
    fornecedor_nome: '',
    valor_total: '',
    tipo_custo: '' as TipoCusto | '',
    status_valor: 'estimado' as CompraItem['status_valor'],
    forma_pagamento: '' as CompraItem['forma_pagamento'] | '',
    data_limite_pagamento: '',
  })

  const [cotacaoItem, setCotacaoItem] = useState<CompraItem | null>(null)
  const [cotacaoLinhas, setCotacaoLinhas] = useState<CotacaoLinha[]>([])

  useEffect(() => {
    Promise.resolve().then(() => loadDados())
  }, [obraId])

  async function loadDados() {
    setLoading(true)
    const [itensRes, etapasRes, fornecedoresRes] = await Promise.all([
      supabase.from('compra_itens').select('*, etapa:etapas(*), fornecedor:fornecedores(*)').eq('obra_id', obraId).order('created_at', { ascending: false }),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
      supabase.from('fornecedores').select('*').or(`obra_id.is.null,obra_id.eq.${obraId}`).order('nome'),
    ])
    setItens((itensRes.data || []) as CompraItem[])
    setEtapas((etapasRes.data || []) as Etapa[])
    setFornecedores((fornecedoresRes.data || []) as Fornecedor[])
    setLoading(false)
  }

  function resetForm() {
    setForm({
      descricao: '', etapa_id: '', fornecedor_id: '', fornecedor_nome: '',
      valor_total: '', tipo_custo: '', status_valor: 'estimado', forma_pagamento: '', data_limite_pagamento: '',
    })
    setFornecedorManual(false)
  }

  function openNew() {
    setEditando(null)
    resetForm()
    setShowModal(true)
  }

  function openEdit(item: CompraItem) {
    setEditando(item)
    setForm({
      descricao: item.descricao,
      etapa_id: item.etapa_id || '',
      fornecedor_id: item.fornecedor_id || '',
      fornecedor_nome: item.fornecedor_nome || '',
      valor_total: String(item.valor_total ?? ''),
      tipo_custo: item.tipo_custo || '',
      status_valor: item.status_valor,
      forma_pagamento: item.forma_pagamento || '',
      data_limite_pagamento: item.data_limite_pagamento || '',
    })
    setFornecedorManual(!item.fornecedor_id && !!item.fornecedor_nome)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.descricao.trim() || !form.valor_total) return
    setSaving(true)
    const payload = {
      obra_id: obraId,
      etapa_id: form.etapa_id || null,
      descricao: form.descricao.trim(),
      fornecedor_id: fornecedorManual ? null : (form.fornecedor_id || null),
      fornecedor_nome: fornecedorManual ? (form.fornecedor_nome.trim() || null) : null,
      valor_total: parseFloat(form.valor_total),
      tipo_custo: form.tipo_custo || null,
      status_valor: form.status_valor,
      forma_pagamento: form.forma_pagamento || null,
      data_limite_pagamento: form.data_limite_pagamento || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = editando
      ? await supabase.from('compra_itens').update(payload).eq('id', editando.id).select('*, etapa:etapas(*), fornecedor:fornecedores(*)').single()
      : await supabase.from('compra_itens').insert(payload).select('*, etapa:etapas(*), fornecedor:fornecedores(*)').single()
    setSaving(false)
    if (error) {
      alert(`Não foi possível salvar o item.\n\nErro: ${error.message}`)
      return
    }
    if (data) {
      setItens(prev => editando ? prev.map(i => i.id === data.id ? data as CompraItem : i) : [data as CompraItem, ...prev])
    }
    setShowModal(false)
    setEditando(null)
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item de compra?')) return
    await supabase.from('compra_itens').delete().eq('id', id)
    setItens(prev => prev.filter(i => i.id !== id))
  }

  async function alternarPago(item: CompraItem) {
    const novoStatus = item.status_pagamento === 'pago' ? 'pendente' : 'pago'
    await supabase.from('compra_itens').update({ status_pagamento: novoStatus, updated_at: new Date().toISOString() }).eq('id', item.id)
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, status_pagamento: novoStatus } : i))
  }

  function abrirCotacao(item: CompraItem) {
    setCotacaoItem(item)
    setCotacaoLinhas([{ id: crypto.randomUUID(), fornecedorNome: '', valor: '' }])
  }

  function adicionarLinhaCotacao() {
    setCotacaoLinhas(prev => [...prev, { id: crypto.randomUUID(), fornecedorNome: '', valor: '' }])
  }

  function removerLinhaCotacao(id: string) {
    setCotacaoLinhas(prev => prev.filter(l => l.id !== id))
  }

  async function selecionarVencedor(linha: CotacaoLinha) {
    if (!cotacaoItem || !linha.fornecedorNome.trim() || !linha.valor) return
    const fornecedorExistente = fornecedores.find(f => f.nome.toLowerCase() === linha.fornecedorNome.trim().toLowerCase())
    const payload = {
      fornecedor_id: fornecedorExistente?.id || null,
      fornecedor_nome: fornecedorExistente ? null : linha.fornecedorNome.trim(),
      valor_total: parseFloat(linha.valor),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase.from('compra_itens').update(payload).eq('id', cotacaoItem.id)
      .select('*, etapa:etapas(*), fornecedor:fornecedores(*)').single()
    if (error) { alert(`Não foi possível aplicar o vencedor.\n\nErro: ${error.message}`); return }
    if (data) setItens(prev => prev.map(i => i.id === data.id ? data as CompraItem : i))
    setCotacaoItem(null)
    setCotacaoLinhas([])
  }

  const itensFiltrados = useMemo(
    () => itens.filter(i => filtroEtapa === 'todas' || (i.etapa_id || SEM_ETAPA) === filtroEtapa),
    [itens, filtroEtapa]
  )

  const totais = useMemo(() => {
    const confirmado = itens.filter(i => i.status_valor === 'confirmado').reduce((s, i) => s + (i.valor_total || 0), 0)
    const estimado = itens.filter(i => i.status_valor === 'estimado').reduce((s, i) => s + (i.valor_total || 0), 0)
    return { confirmado, estimado, teto: confirmado + estimado }
  }, [itens])

  const itensPorEtapa = useMemo(() => {
    const grupos: Record<string, CompraItem[]> = { [SEM_ETAPA]: [] }
    etapas.forEach(e => { grupos[e.id] = [] })
    itensFiltrados.forEach(i => {
      const chave = i.etapa_id && grupos[i.etapa_id] ? i.etapa_id : SEM_ETAPA
      grupos[chave].push(i)
    })
    return grupos
  }, [itensFiltrados, etapas])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Totalizadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Confirmado</p>
          <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{formatCurrency(totais.confirmado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Com estimativa</p>
          <p className="text-xl font-bold" style={{ color: 'var(--warning)' }}>{formatCurrency(totais.estimado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Teto máximo</p>
          <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{formatCurrency(totais.teto)}</p>
        </div>
      </div>

      {/* Formulário de lançamento rápido — sempre visível */}
      <LancamentoRapidoForm
        obraId={obraId}
        etapas={etapas}
        fornecedores={fornecedores}
        prefill={prefill}
        onPrefillConsumed={onPrefillConsumed}
        onSaved={item => setItens(prev => [item, ...prev])}
      />

      {/* Barra de ações da lista */}
      <div className="flex flex-wrap items-center gap-2 justify-between pt-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Itens lançados</p>
        <div className="flex items-center gap-2">
          {etapas.length > 0 && (
            <select value={filtroEtapa} onChange={e => setFiltroEtapa(e.target.value)} className="input-base w-full sm:w-56">
              <option value="todas">Todas etapas</option>
              <option value={SEM_ETAPA}>Sem etapa</option>
              {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          )}
          <Link href={`/obras/${obraId}/compras/relatorio`}>
            <Button size="sm" variant="secondary" icon={<FileText size={14} />}>Relatório</Button>
          </Link>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={openNew}>Item detalhado</Button>
        </div>
      </div>

      {itensFiltrados.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhum item lançado"
          description="Use o formulário acima para lançar rapidamente, ou adicione um item detalhado com fornecedor, forma de pagamento e status."
        />
      ) : (
        <div className="flex flex-col gap-3 pb-8">
          {itensPorEtapa[SEM_ETAPA].length > 0 && (
            <GrupoEtapaCompra
              chave={SEM_ETAPA}
              nome="Sem etapa"
              itens={itensPorEtapa[SEM_ETAPA]}
              collapsed={collapsed[SEM_ETAPA]}
              onToggle={() => setCollapsed(c => ({ ...c, [SEM_ETAPA]: !c[SEM_ETAPA] }))}
              onEdit={openEdit}
              onDelete={handleDelete}
              onTogglePago={alternarPago}
              onCotacao={abrirCotacao}
            />
          )}
          {etapas.map(etapa => {
            const itensDaEtapa = itensPorEtapa[etapa.id] || []
            if (itensDaEtapa.length === 0) return null
            return (
              <GrupoEtapaCompra
                key={etapa.id}
                chave={etapa.id}
                nome={etapa.nome}
                itens={itensDaEtapa}
                collapsed={collapsed[etapa.id]}
                onToggle={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
                onEdit={openEdit}
                onDelete={handleDelete}
                onTogglePago={alternarPago}
                onCotacao={abrirCotacao}
              />
            )
          })}
        </div>
      )}

      {/* Modal Adicionar/Editar item detalhado */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null); resetForm() }}
        title={editando ? 'Editar item de compra' : 'Adicionar item de compra'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Descrição *"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Cimento CP-II 50kg, Aluguel de andaime..."
            autoFocus={!editando}
          />

          <Select
            label="Etapa"
            value={form.etapa_id}
            onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}
          >
            <option value="">Sem etapa</option>
            {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Select>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Fornecedor</label>
              <button
                type="button"
                onClick={() => setFornecedorManual(v => !v)}
                className="text-xs font-medium"
                style={{ color: 'var(--accent)' }}
              >
                {fornecedorManual ? 'Selecionar cadastrado' : 'Digitar manualmente'}
              </button>
            </div>
            {fornecedorManual ? (
              <Input
                value={form.fornecedor_nome}
                onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))}
                placeholder="Nome do fornecedor"
              />
            ) : (
              <select
                value={form.fornecedor_id}
                onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}
                className="input-base"
              >
                <option value="">Sem fornecedor definido</option>
                {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor (R$) *"
              type="number"
              min="0"
              step="0.01"
              value={form.valor_total}
              onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))}
              placeholder="0,00"
            />
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Status do valor</label>
              <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                {(['confirmado', 'estimado'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, status_valor: s }))}
                    className="flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all"
                    style={form.status_valor === s
                      ? { background: 'var(--accent)', color: 'white' }
                      : { color: 'var(--text-secondary)' }}
                  >
                    {STATUS_VALOR_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Tipo de custo"
              value={form.tipo_custo}
              onChange={e => setForm(f => ({ ...f, tipo_custo: e.target.value as TipoCusto }))}
            >
              <option value="">Não classificado</option>
              {Object.entries(TIPO_CUSTO_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <Select
              label="Forma de pagamento"
              value={form.forma_pagamento || ''}
              onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value as CompraItem['forma_pagamento'] }))}
            >
              <option value="">Não definida</option>
              {Object.entries(FORMA_PAGAMENTO_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>

          <Input
            label="Data limite de pagamento"
            type="date"
            value={form.data_limite_pagamento}
            onChange={e => setForm(f => ({ ...f, data_limite_pagamento: e.target.value }))}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>
              Cancelar
            </Button>
            <Button className="flex-1" loading={saving} disabled={!form.descricao.trim() || !form.valor_total} onClick={handleSave}>
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Painel de cotação / comparação de fornecedores */}
      <Modal
        open={!!cotacaoItem}
        onClose={() => { setCotacaoItem(null); setCotacaoLinhas([]) }}
        title={`Cotação — ${cotacaoItem?.descricao ?? ''}`}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Adicione os fornecedores cotados e seus valores. Ao selecionar o vencedor, o item é atualizado automaticamente.
          </p>
          <div className="flex flex-col gap-2">
            {cotacaoLinhas.map(linha => (
              <div key={linha.id} className="flex items-center gap-2">
                <Input
                  value={linha.fornecedorNome}
                  onChange={e => setCotacaoLinhas(prev => prev.map(l => l.id === linha.id ? { ...l, fornecedorNome: e.target.value } : l))}
                  placeholder="Fornecedor"
                  className="flex-1"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={linha.valor}
                  onChange={e => setCotacaoLinhas(prev => prev.map(l => l.id === linha.id ? { ...l, valor: e.target.value } : l))}
                  placeholder="Valor"
                  className="w-32"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!linha.fornecedorNome.trim() || !linha.valor}
                  onClick={() => selecionarVencedor(linha)}
                >
                  Selecionar vencedor
                </Button>
                <button onClick={() => removerLinhaCotacao(linha.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
                  <X size={14} style={{ color: 'var(--danger)' }} />
                </button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={adicionarLinhaCotacao}>
            Adicionar fornecedor
          </Button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Formulário de lançamento rápido ──────────────────────────────────────────
function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function formInicial() {
  return {
    valor_total: '',
    etapa_id: '',
    tipo_custo: '' as TipoCusto | '',
    fornecedor_id: '',
    fornecedor_nome: '',
    data_compra: hoje(),
    vencimento: '',
    descricao: '',
  }
}

function LancamentoRapidoForm({
  obraId, etapas, fornecedores, prefill, onPrefillConsumed, onSaved,
}: {
  obraId: string
  etapas: Etapa[]
  fornecedores: Fornecedor[]
  prefill?: PrefillLancamento
  onPrefillConsumed?: () => void
  onSaved: (item: CompraItem) => void
}) {
  const supabase = createClient()
  const [fornecedorManual, setFornecedorManual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(formInicial)

  // Pré-preenche o formulário quando chega uma cotação vencedora de Requisições.
  useEffect(() => {
    if (!prefill) return
    const fornecedorCadastrado = prefill.fornecedorNome
      ? fornecedores.find(f => f.nome.toLowerCase() === prefill.fornecedorNome!.toLowerCase())
      : undefined
    setForm(f => ({
      ...f,
      valor_total: prefill.valorTotal != null ? String(prefill.valorTotal) : f.valor_total,
      descricao: prefill.descricao || f.descricao,
      fornecedor_id: fornecedorCadastrado?.id || '',
      fornecedor_nome: !fornecedorCadastrado ? (prefill.fornecedorNome || '') : '',
    }))
    setFornecedorManual(!fornecedorCadastrado && !!prefill.fornecedorNome)
    onPrefillConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  async function salvar() {
    if (!form.valor_total) return
    setSaving(true)
    const nomeFornecedor = fornecedorManual
      ? form.fornecedor_nome.trim()
      : fornecedores.find(f => f.id === form.fornecedor_id)?.nome
    const payload = {
      obra_id: obraId,
      etapa_id: form.etapa_id || null,
      descricao: form.descricao.trim() || `Nota — ${nomeFornecedor || 'lançamento rápido'}`,
      fornecedor_id: fornecedorManual ? null : form.fornecedor_id || null,
      fornecedor_nome: fornecedorManual ? form.fornecedor_nome.trim() || null : null,
      valor_total: parseFloat(String(form.valor_total).replace(',', '.')),
      tipo_custo: form.tipo_custo || null,
      data_compra: form.data_compra || hoje(),
      data_limite_pagamento: form.vencimento || null,
      status_valor: 'confirmado' as const,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('compra_itens')
      .insert(payload)
      .select('*, etapa:etapas(*), fornecedor:fornecedores(*)')
      .single()
    setSaving(false)
    if (error) {
      alert(`Não foi possível salvar o lançamento.\n\nErro: ${error.message}`)
      return
    }
    if (data) onSaved(data as CompraItem)
    setForm(f => ({ ...f, valor_total: '', descricao: '', vencimento: '' }))
  }

  const podeSalvar = !!form.valor_total && !saving

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Zap size={16} style={{ color: 'var(--accent)' }} />
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Lançamento rápido</h2>
      </div>
      <p className="text-xs -mt-2" style={{ color: 'var(--text-secondary)' }}>
        Valor total, centro de custo (etapa) e tipo. O detalhamento por item pode ser feito com "Item detalhado" abaixo.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Valor total da nota (R$) *"
          type="number"
          min="0"
          step="0.01"
          value={form.valor_total}
          onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))}
          placeholder="0,00"
          autoFocus
        />
        <Input
          label="Data da compra"
          type="date"
          value={form.data_compra}
          onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Centro de custo (etapa)"
          value={form.etapa_id}
          onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}
        >
          <option value="">Sem etapa</option>
          {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </Select>
        <Select
          label="Tipo de custo"
          value={form.tipo_custo}
          onChange={e => setForm(f => ({ ...f, tipo_custo: e.target.value as TipoCusto }))}
        >
          <option value="">Não classificado</option>
          {Object.entries(TIPO_CUSTO_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Fornecedor</label>
          <button
            type="button"
            onClick={() => setFornecedorManual(v => !v)}
            className="text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {fornecedorManual ? 'Selecionar cadastrado' : 'Digitar manualmente'}
          </button>
        </div>
        {fornecedorManual ? (
          <Input
            value={form.fornecedor_nome}
            onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))}
            placeholder="Nome do fornecedor"
          />
        ) : (
          <select
            value={form.fornecedor_id}
            onChange={e => setForm(f => ({ ...f, fornecedor_id: e.target.value }))}
            className="input-base"
          >
            <option value="">Sem fornecedor definido</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Vencimento"
          type="date"
          value={form.vencimento}
          onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))}
        />
        <Input
          label="Descrição (opcional)"
          value={form.descricao}
          onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
          placeholder="Ex: Aço infraestrutura"
        />
      </div>

      <div>
        <Button icon={<Zap size={14} />} loading={saving} disabled={!podeSalvar} onClick={salvar}>
          Salvar lançamento
        </Button>
      </div>
    </div>
  )
}

function GrupoEtapaCompra({
  chave, nome, itens, collapsed, onToggle, onEdit, onDelete, onTogglePago, onCotacao,
}: {
  chave: string
  nome: string
  itens: CompraItem[]
  collapsed?: boolean
  onToggle: () => void
  onEdit: (item: CompraItem) => void
  onDelete: (id: string) => void
  onTogglePago: (item: CompraItem) => void
  onCotacao: (item: CompraItem) => void
}) {
  const subtotal = itens.reduce((s, i) => s + (i.valor_total || 0), 0)
  const pagos = itens.filter(i => i.status_pagamento === 'pago').length

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={onToggle}
      >
        <span className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{nome}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {pagos} {pagos === 1 ? 'pago' : 'pagos'}
          </p>
        </div>
        <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</span>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {itens.map(item => (
            <LinhaCompra key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} onTogglePago={onTogglePago} onCotacao={onCotacao} />
          ))}
        </div>
      )}
    </div>
  )
}

function LinhaCompra({
  item, onEdit, onDelete, onTogglePago, onCotacao,
}: {
  item: CompraItem
  onEdit: (item: CompraItem) => void
  onDelete: (id: string) => void
  onTogglePago: (item: CompraItem) => void
  onCotacao: (item: CompraItem) => void
}) {
  const pago = item.status_pagamento === 'pago'
  const fornecedorNome = item.fornecedor?.nome || item.fornecedor_nome

  return (
    <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.descricao}</p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {item.tipo_custo && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded font-medium"
              style={{ color: TIPO_CUSTO_COLOR[item.tipo_custo], background: `${TIPO_CUSTO_COLOR[item.tipo_custo]}22` }}
            >
              {TIPO_CUSTO_LABEL[item.tipo_custo]}
            </span>
          )}
          {fornecedorNome && (
            <span className="inline-flex items-center gap-1"><Building2 size={11} /> {fornecedorNome}</span>
          )}
          {item.forma_pagamento && <span>{FORMA_PAGAMENTO_LABEL[item.forma_pagamento]}</span>}
          {item.data_limite_pagamento && (
            <span>até {new Date(item.data_limite_pagamento + 'T12:00').toLocaleDateString('pt-BR')}</span>
          )}
        </div>
      </div>

      <span
        className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
        style={{ color: STATUS_VALOR_COLOR[item.status_valor], background: 'var(--bg-card)' }}
      >
        {STATUS_VALOR_LABEL[item.status_valor]}
      </span>

      <span className="text-sm font-semibold flex-shrink-0 pt-0.5" style={{ color: 'var(--text-primary)' }}>
        {formatCurrency(item.valor_total)}
      </span>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onTogglePago(item)}
          title={pago ? 'Marcar como pendente' : 'Marcar como pago'}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={pago
            ? { background: 'rgba(16,185,129,0.16)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.35)' }
            : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          {pago ? <CheckSquare size={14} /> : <Square size={14} />}
          <span className="hidden sm:inline">{pago ? 'Pago' : 'Pagar'}</span>
        </button>
        <button onClick={() => onCotacao(item)} title="Comparar cotações" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
          <Scale size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={() => onEdit(item)} title="Editar" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
          <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={() => onDelete(item.id)} title="Remover" className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
          <Trash2 size={14} style={{ color: 'var(--danger)' }} />
        </button>
      </div>
    </div>
  )
}
