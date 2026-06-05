'use client'

import { useEffect, useState } from 'react'
import { Plus, Lock, Unlock, Download, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Orcamento, OrcamentoItem, ComposicaoPropria } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

export function ObraOrcamento({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [itens, setItens] = useState<OrcamentoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [composicoes, setComposicoes] = useState<ComposicaoPropria[]>([])
  const [busca, setBusca] = useState('')
  const [selectedComp, setSelectedComp] = useState<ComposicaoPropria | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [bdi, setBdi] = useState(25)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadOrcamento()
    loadComposicoes()
  }, [obraId])

  async function loadOrcamento() {
    setLoading(true)
    const { data: orc } = await supabase
      .from('orcamentos')
      .select('*')
      .eq('obra_id', obraId)
      .eq('tipo', 'executivo')
      .order('versao', { ascending: false })
      .limit(1)
      .single()

    if (orc) {
      setOrcamento(orc)
      setBdi(orc.bdi_percentual)
      await loadItens(orc.id)
    }
    setLoading(false)
  }

  async function loadItens(orcamentoId: string) {
    const { data } = await supabase
      .from('orcamento_itens')
      .select('*, composicoes_proprias(id, codigo, descricao, unidade, custo_calculado:composicao_insumos(coeficiente, sinapi_insumos(preco_unitario)))')
      .eq('orcamento_id', orcamentoId)

    const itensComPreco = (data || []).map((item: any) => {
      let custo = 0
      if (item.composicoes_proprias?.composicao_insumos) {
        custo = item.composicoes_proprias.composicao_insumos.reduce(
          (acc: number, ci: any) => acc + (ci.coeficiente * (ci.sinapi_insumos?.preco_unitario || 0)),
          0
        )
      }
      return {
        ...item,
        preco_unitario_snapshot: orcamento?.status !== 'finalizado' ? custo : item.preco_unitario_snapshot,
        composicao: item.composicoes_proprias,
      }
    })
    setItens(itensComPreco)
  }

  async function loadComposicoes() {
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*')
      .eq('ativo', true)
      .order('codigo')
    setComposicoes(data || [])
  }

  async function handleUpdateBdi() {
    if (!orcamento) return
    await supabase.from('orcamentos').update({ bdi_percentual: bdi }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, bdi_percentual: bdi } : o)
  }

  async function handleAddItem() {
    if (!orcamento || !selectedComp || !quantidade) return
    setSaving(true)
    const qtd = parseFloat(quantidade)
    await supabase.from('orcamento_itens').insert({
      orcamento_id: orcamento.id,
      composicao_id: selectedComp.id,
      quantidade: qtd,
      preco_unitario_snapshot: selectedComp.custo_calculado || 0,
    })
    setShowAddItem(false)
    setSelectedComp(null)
    setQuantidade('')
    setSaving(false)
    loadItens(orcamento.id)
  }

  async function handleRemoveItem(itemId: string) {
    await supabase.from('orcamento_itens').delete().eq('id', itemId)
    setItens(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleFinalizar() {
    if (!orcamento || !confirm('Finalizar orçamento? Os preços serão congelados.')) return
    await supabase.from('orcamentos')
      .update({ status: 'finalizado' })
      .eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, status: 'finalizado' } : o)
  }

  async function handleReabrir() {
    if (!orcamento) return
    const novaVersao = orcamento.versao + 1
    const { data: novoOrc } = await supabase
      .from('orcamentos')
      .insert({
        obra_id: obraId,
        tipo: 'executivo',
        bdi_percentual: orcamento.bdi_percentual,
        status: 'rascunho',
        versao: novaVersao,
      })
      .select()
      .single()

    if (novoOrc) {
      for (const item of itens) {
        await supabase.from('orcamento_itens').insert({
          orcamento_id: novoOrc.id,
          composicao_id: item.composicao_id,
          quantidade: item.quantidade,
          preco_unitario_snapshot: item.preco_unitario_snapshot,
        })
      }
      setOrcamento(novoOrc)
      loadItens(novoOrc.id)
    }
  }

  const subtotal = itens.reduce((acc, item) => acc + item.preco_unitario_snapshot * item.quantidade, 0)
  const totalBdi = subtotal * (bdi / 100)
  const totalGeral = subtotal + totalBdi

  const compsFiltradas = composicoes.filter(c =>
    !busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) {
    return <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  }

  if (!orcamento) {
    return <EmptyState icon={Plus} title="Nenhum orçamento encontrado" description="Crie um orçamento para esta obra." />
  }

  const isReadonly = orcamento.status === 'finalizado'

  return (
    <div className="flex flex-col gap-4">
      {/* Header do orçamento */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Orçamento Executivo</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              v{orcamento.versao} — {orcamento.status === 'rascunho' ? 'Rascunho' : orcamento.status === 'ativo' ? 'Ativo' : 'Finalizado'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>BDI %</label>
            <input
              type="number"
              value={bdi}
              onChange={e => setBdi(Number(e.target.value))}
              onBlur={handleUpdateBdi}
              disabled={isReadonly}
              className="input-base w-20 text-center py-1"
              min={0}
              max={100}
            />
          </div>
        </div>

        <div className="flex gap-2">
          {!isReadonly && (
            <>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddItem(true)}>
                Adicionar item
              </Button>
              <Button size="sm" icon={<Lock size={14} />} onClick={handleFinalizar}>
                Finalizar
              </Button>
            </>
          )}
          {isReadonly && (
            <Button variant="secondary" size="sm" icon={<Unlock size={14} />} onClick={handleReabrir}>
              Reabrir (nova versão)
            </Button>
          )}
        </div>
      </div>

      {/* Tabela de itens */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-zebra">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Código', 'Descrição', 'Unid.', 'Qtd.', 'Unit. (R$)', 'Total (R$)', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Nenhum item no orçamento. {!isReadonly && 'Clique em "Adicionar item" para começar.'}
                  </td>
                </tr>
              ) : (
                itens.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {(item.composicao as any)?.codigo || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)', maxWidth: '300px' }}>
                      <span className="truncate block">{(item.composicao as any)?.descricao || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {(item.composicao as any)?.unidade || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                      {item.quantidade.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(item.preco_unitario_snapshot)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(item.preco_unitario_snapshot * item.quantidade)}
                    </td>
                    <td className="px-4 py-3">
                      {!isReadonly && (
                        <button onClick={() => handleRemoveItem(item.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                          <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de totais */}
        <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
          <div className="flex justify-end">
            <div className="flex flex-col gap-1 min-w-64">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>BDI ({bdi}%)</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatCurrency(totalBdi)}</span>
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <span>Total Geral</span>
                <span style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>{formatCurrency(totalGeral)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal adicionar item */}
      <Modal open={showAddItem} onClose={() => { setShowAddItem(false); setSelectedComp(null); setQuantidade('') }} title="Adicionar item ao orçamento" size="lg">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar composição por código ou descrição..."
              className="input-base pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {compsFiltradas.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                Nenhuma composição encontrada. Crie composições na Base SINAPI.
              </p>
            ) : (
              compsFiltradas.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedComp(c)}
                  className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                  style={{
                    background: selectedComp?.id === c.id ? 'rgba(59,123,248,0.15)' : 'var(--bg-secondary)',
                    border: `1px solid ${selectedComp?.id === c.id ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {c.codigo}
                  </span>
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.unidade}</span>
                </button>
              ))
            )}
          </div>

          {selectedComp && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.2)' }}>
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--accent)' }}>
                Selecionado: {selectedComp.descricao}
              </p>
              <Input
                label={`Quantidade (${selectedComp.unidade})`}
                type="number"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                placeholder="0"
                min={0}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowAddItem(false); setSelectedComp(null); setQuantidade('') }}>
              Cancelar
            </Button>
            <Button className="flex-1" loading={saving} disabled={!selectedComp || !quantidade} onClick={handleAddItem}>
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
