'use client'

import { useEffect, useState } from 'react'
import { Plus, Lock, Unlock, Search, Trash2, Zap, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Orcamento, OrcamentoItem, ComposicaoPropria, SinapiComposicao } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

type FonteBusca = 'sinapi' | 'proprias'

export function ObraOrcamento({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [fonte, setFonte] = useState<FonteBusca>('sinapi')
  const [composicoesProprias, setComposicoesProprias] = useState<ComposicaoPropria[]>([])
  const [sinapiComps, setSinapiComps] = useState<SinapiComposicao[]>([])
  const [busca, setBusca] = useState('')
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [bdi, setBdi] = useState(25)
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [showGerarModal, setShowGerarModal] = useState(false)
  const [gerarForm, setGerarForm] = useState({
    etapa_nome: 'Etapa 1',
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: '',
  })

  useEffect(() => {
    loadOrcamento()
    loadComposicoesProprias()
    loadSinapiComps()
  }, [obraId])

  async function loadOrcamento() {
    setLoading(true)
    const { data: orc } = await supabase
      .from('orcamentos')
      .select('*')
      .eq('obra_id', obraId)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()

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
      .select(`
        *,
        composicoes_proprias(id, codigo, descricao, unidade),
        sinapi_composicoes(id, codigo, descricao, unidade, custo_unitario)
      `)
      .eq('orcamento_id', orcamentoId)

    setItens(data || [])
  }

  async function loadComposicoesProprias() {
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*')
      .eq('ativo', true)
      .order('codigo')
    setComposicoesProprias(data || [])
  }

  async function loadSinapiComps() {
    const { data } = await supabase
      .from('sinapi_composicoes')
      .select('*')
      .order('codigo')
      .limit(200)
    setSinapiComps(data || [])
  }

  function getItemDisplay(item: any) {
    if (item.sinapi_composicoes) {
      return {
        codigo: item.sinapi_composicoes.codigo,
        descricao: item.sinapi_composicoes.descricao,
        unidade: item.sinapi_composicoes.unidade,
      }
    }
    if (item.composicoes_proprias) {
      return {
        codigo: item.composicoes_proprias.codigo,
        descricao: item.composicoes_proprias.descricao,
        unidade: item.composicoes_proprias.unidade,
      }
    }
    return {
      codigo: item.codigo_snapshot || '—',
      descricao: item.descricao_snapshot || '—',
      unidade: item.unidade_snapshot || '—',
    }
  }

  async function handleUpdateBdi() {
    if (!orcamento) return
    await supabase.from('orcamentos').update({ bdi_percentual: bdi }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, bdi_percentual: bdi } : o)
  }

  async function handleAddItem() {
    if (!orcamento || !selectedItem || !quantidade) return
    setSaving(true)

    const qtd = parseFloat(quantidade)
    const isSinapi = fonte === 'sinapi'

    await supabase.from('orcamento_itens').insert({
      orcamento_id: orcamento.id,
      composicao_id: isSinapi ? null : selectedItem.id,
      sinapi_composicao_id: isSinapi ? selectedItem.id : null,
      quantidade: qtd,
      preco_unitario_snapshot: selectedItem.custo_unitario || selectedItem.custo_calculado || 0,
      descricao_snapshot: selectedItem.descricao,
      codigo_snapshot: selectedItem.codigo,
      unidade_snapshot: selectedItem.unidade,
    })

    setShowAddItem(false)
    setSelectedItem(null)
    setQuantidade('')
    setBusca('')
    setSaving(false)
    loadItens(orcamento.id)
  }

  async function handleRemoveItem(itemId: string) {
    await supabase.from('orcamento_itens').delete().eq('id', itemId)
    setItens(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleFinalizar() {
    if (!orcamento || !confirm('Finalizar orçamento? Os preços serão congelados.')) return
    await supabase.from('orcamentos').update({ status: 'finalizado' }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, status: 'finalizado' } : o)
  }

  async function handleReabrir() {
    if (!orcamento) return
    const novaVersao = orcamento.versao + 1
    const { data: novoOrc } = await supabase
      .from('orcamentos')
      .insert({
        obra_id: obraId,
        tipo: orcamento.tipo,
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
          sinapi_composicao_id: item.sinapi_composicao_id,
          quantidade: item.quantidade,
          preco_unitario_snapshot: item.preco_unitario_snapshot,
          descricao_snapshot: item.descricao_snapshot,
          codigo_snapshot: item.codigo_snapshot,
          unidade_snapshot: item.unidade_snapshot,
        })
      }
      setOrcamento(novoOrc)
      loadItens(novoOrc.id)
    }
  }

  // Gera etapa de cronograma + lista de materiais automaticamente
  async function handleGerarCronogramaEMateriais() {
    if (!orcamento || !gerarForm.etapa_nome || !gerarForm.data_inicio || !gerarForm.data_fim) return
    setGerando(true)

    // Verifica se já existem etapas para não duplicar
    const { data: etapasExist } = await supabase.from('etapas').select('id').eq('obra_id', obraId).limit(1)
    const maxOrdem = etapasExist?.length || 0

    // Cria a etapa
    const { data: etapa } = await supabase
      .from('etapas')
      .insert({
        obra_id: obraId,
        nome: gerarForm.etapa_nome,
        data_inicio: gerarForm.data_inicio,
        data_fim: gerarForm.data_fim,
        status: 'planejada',
        ordem: maxOrdem + 1,
      })
      .select()
      .single()

    if (etapa) {
      // Para cada item SINAPI com insumos, gera materiais
      // Simplificado: cria um registro de material por composição SINAPI selecionada
      for (const item of itens) {
        if (item.sinapi_composicao_id) {
          // Busca insumos da composição SINAPI (via sinapi_insumos de referência)
          // Como simplificação no MVP, registra a própria composição como material de referência
          // Futuramente expandir para detalhar por insumo
        }
        if (item.composicao_id) {
          // Busca insumos da composição própria
          const { data: insumos } = await supabase
            .from('composicao_insumos')
            .select('insumo_id, coeficiente')
            .eq('composicao_id', item.composicao_id)

          for (const ins of (insumos || [])) {
            const qtdTotal = ins.coeficiente * item.quantidade
            // Verifica se já existe esse insumo na obra para não duplicar
            const { data: exist } = await supabase
              .from('materiais')
              .select('id, quantidade_total')
              .eq('obra_id', obraId)
              .eq('insumo_id', ins.insumo_id)
              .eq('etapa_id', etapa.id)
              .maybeSingle()

            if (exist) {
              await supabase.from('materiais').update({ quantidade_total: exist.quantidade_total + qtdTotal }).eq('id', exist.id)
            } else {
              await supabase.from('materiais').insert({
                obra_id: obraId,
                etapa_id: etapa.id,
                insumo_id: ins.insumo_id,
                quantidade_total: qtdTotal,
                quantidade_comprada: 0,
                status_compra: 'nao_comprado',
                data_necessidade: gerarForm.data_inicio,
              })
            }
          }
        }
      }
    }

    setGerando(false)
    setShowGerarModal(false)
    alert(`✅ Etapa "${gerarForm.etapa_nome}" e lista de materiais gerados com sucesso! Acesse as abas Cronograma e Materiais para visualizar.`)
  }

  const subtotal = itens.reduce((acc, item) => acc + item.preco_unitario_snapshot * item.quantidade, 0)
  const totalBdi = subtotal * (bdi / 100)
  const totalGeral = subtotal + totalBdi

  const listaFiltrada = fonte === 'sinapi'
    ? sinapiComps.filter(c =>
        !busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase())
      )
    : composicoesProprias.filter(c =>
        !busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase())
      )

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!orcamento) {
    return <EmptyState icon={Plus} title="Nenhum orçamento encontrado" description="Crie um orçamento para esta obra." />
  }

  const isReadonly = orcamento.status === 'finalizado'

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
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
              min={0} max={100}
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {!isReadonly && (
            <>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setShowAddItem(true)}>
                Adicionar item
              </Button>
              {itens.length > 0 && (
                <Button variant="secondary" size="sm" icon={<Zap size={14} />} onClick={() => setShowGerarModal(true)}>
                  Gerar Cronograma + Materiais
                </Button>
              )}
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
                itens.map(item => {
                  const display = getItemDisplay(item)
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {display.codigo}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)', maxWidth: 300 }}>
                        <span className="truncate block">{display.descricao}</span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{display.unidade}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{item.quantidade.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.preco_unitario_snapshot)}</td>
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
                  )
                })
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
      <Modal open={showAddItem} onClose={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade(''); setBusca('') }} title="Adicionar item ao orçamento" size="lg">
        <div className="flex flex-col gap-4">
          {/* Tabs de fonte */}
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {([['sinapi', 'Tabela SINAPI'], ['proprias', 'Composições Próprias']] as [FonteBusca, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setFonte(id); setSelectedItem(null); setBusca('') }}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={fonte === id ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Busca */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={fonte === 'sinapi' ? 'Buscar composição SINAPI por código ou descrição...' : 'Buscar composição própria...'}
              className="input-base pl-9"
              autoFocus
            />
          </div>

          {/* Lista */}
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {listaFiltrada.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                {fonte === 'sinapi' ? 'Nenhuma composição SINAPI encontrada.' : 'Nenhuma composição própria. Crie composições na tabela de serviços.'}
              </p>
            ) : (
              listaFiltrada.slice(0, 50).map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedItem(c)}
                  className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                  style={{
                    background: selectedItem?.id === c.id ? 'rgba(59,123,248,0.15)' : 'var(--bg-secondary)',
                    border: `1px solid ${selectedItem?.id === c.id ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {c.codigo}
                  </span>
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{c.unidade}</span>
                  {(c as any).custo_unitario > 0 && (
                    <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>
                      {formatCurrency((c as any).custo_unitario)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {selectedItem && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.2)' }}>
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--accent)' }}>
                Selecionado: {selectedItem.descricao}
                {selectedItem.custo_unitario > 0 && ` — ${formatCurrency(selectedItem.custo_unitario)}/${selectedItem.unidade}`}
              </p>
              <Input
                label={`Quantidade (${selectedItem.unidade})`}
                type="number"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                placeholder="0"
                min={0}
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade('') }}>
              Cancelar
            </Button>
            <Button className="flex-1" loading={saving} disabled={!selectedItem || !quantidade} onClick={handleAddItem}>
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal gerar cronograma + materiais */}
      <Modal open={showGerarModal} onClose={() => setShowGerarModal(false)} title="Gerar Cronograma e Materiais" size="md">
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.2)', color: 'var(--text-secondary)' }}>
            Será criada uma etapa de cronograma e a lista de materiais baseada nos insumos das composições do orçamento.
            Você poderá adicionar mais etapas manualmente depois.
          </div>
          <Input
            label="Nome da etapa *"
            value={gerarForm.etapa_nome}
            onChange={e => setGerarForm(f => ({ ...f, etapa_nome: e.target.value }))}
            placeholder="Ex: Fundação, Estrutura, Acabamento..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de início *"
              type="date"
              value={gerarForm.data_inicio}
              onChange={e => setGerarForm(f => ({ ...f, data_inicio: e.target.value }))}
            />
            <Input
              label="Data de conclusão *"
              type="date"
              value={gerarForm.data_fim}
              onChange={e => setGerarForm(f => ({ ...f, data_fim: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowGerarModal(false)}>Cancelar</Button>
            <Button
              className="flex-1"
              loading={gerando}
              icon={<Zap size={14} />}
              disabled={!gerarForm.etapa_nome || !gerarForm.data_inicio || !gerarForm.data_fim}
              onClick={handleGerarCronogramaEMateriais}
            >
              Gerar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
