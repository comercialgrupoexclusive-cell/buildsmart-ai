'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, Lock, Unlock, Search, Trash2, MoreHorizontal, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Orcamento, ComposicaoPropria, SinapiComposicao, Etapa } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

type FonteBusca = 'proprias' | 'sinapi'

// Item com dados enriquecidos para exibição
type ItemEnriquecido = {
  id: string
  orcamento_id: string
  etapa_id: string | null
  composicao_id: string | null
  sinapi_composicao_id: string | null
  quantidade: number
  preco_unitario_snapshot: number
  descricao_snapshot: string | null
  codigo_snapshot: string | null
  unidade_snapshot: string | null
  // calculados
  codigo: string
  descricao: string
  unidade: string
}

export function ObraOrcamento({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null)
  const [itens, setItens] = useState<ItemEnriquecido[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [bdi, setBdi] = useState(25)

  // Modal adicionar item
  const [showAddItem, setShowAddItem] = useState(false)
  const [addToEtapaId, setAddToEtapaId] = useState<string | null>(null)
  const [fonte, setFonte] = useState<FonteBusca>('proprias')
  const [composicoesProprias, setComposicoesProprias] = useState<ComposicaoPropria[]>([])
  const [sinapiComps, setSinapiComps] = useState<SinapiComposicao[]>([])
  const [busca, setBusca] = useState('')
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [saving, setSaving] = useState(false)
  const qtdInputRef = useRef<HTMLInputElement>(null)

  // Modal nova etapa inline
  const [showNovaEtapa, setShowNovaEtapa] = useState(false)
  const [novaEtapaNome, setNovaEtapaNome] = useState('')
  const [criandoEtapa, setCriandoEtapa] = useState(false)

  // Grupos colapsados
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Menu de opções do orçamento (finalizar etc)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAll()
  }, [obraId])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadOrcamento(), loadEtapas(), loadComposicoesProprias(), loadSinapiComps()])
    setLoading(false)
  }

  async function loadOrcamento() {
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
  }

  async function loadItens(orcamentoId: string) {
    const { data } = await supabase
      .from('orcamento_itens')
      .select(`*, composicoes_proprias(id,codigo,descricao,unidade), sinapi_composicoes(id,codigo,descricao,unidade,custo_unitario)`)
      .eq('orcamento_id', orcamentoId)

    const enriched: ItemEnriquecido[] = (data || []).map((item: any) => {
      const cp = item.composicoes_proprias
      const sc = item.sinapi_composicoes
      return {
        ...item,
        codigo: cp?.codigo || sc?.codigo || item.codigo_snapshot || '—',
        descricao: cp?.descricao || sc?.descricao || item.descricao_snapshot || '—',
        unidade: cp?.unidade || sc?.unidade || item.unidade_snapshot || '—',
      }
    })
    setItens(enriched)
  }

  async function loadEtapas() {
    const { data } = await supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem')
    setEtapas(data || [])
  }

  async function loadComposicoesProprias() {
    const { data } = await supabase.from('composicoes_proprias').select('*').eq('ativo', true).order('codigo')
    setComposicoesProprias(data || [])
  }

  async function loadSinapiComps() {
    const { data } = await supabase.from('sinapi_composicoes').select('*').order('codigo').limit(200)
    setSinapiComps(data || [])
  }

  // ─── Criar etapa inline ─────────────────────────────────────────────────────
  async function handleCriarEtapa() {
    if (!novaEtapaNome.trim()) return
    setCriandoEtapa(true)
    const maxOrdem = etapas.reduce((m, e) => Math.max(m, e.ordem), 0)
    const { data } = await supabase
      .from('etapas')
      .insert({ obra_id: obraId, nome: novaEtapaNome.trim(), status: 'planejada', ordem: maxOrdem + 1 })
      .select()
      .single()
    if (data) {
      setEtapas(prev => [...prev, data])
      // Abre o modal de adicionar item já nessa etapa nova
      setAddToEtapaId(data.id)
      setShowAddItem(true)
    }
    setCriandoEtapa(false)
    setShowNovaEtapa(false)
    setNovaEtapaNome('')
  }

  // ─── Adicionar item ─────────────────────────────────────────────────────────
  async function handleAddItem() {
    if (!orcamento || !selectedItem || !quantidade) return
    setSaving(true)
    const isSinapi = fonte === 'sinapi'
    await supabase.from('orcamento_itens').insert({
      orcamento_id: orcamento.id,
      etapa_id: addToEtapaId,
      composicao_id: isSinapi ? null : selectedItem.id,
      sinapi_composicao_id: isSinapi ? selectedItem.id : null,
      quantidade: parseFloat(quantidade),
      preco_unitario_snapshot: selectedItem.custo_unitario || selectedItem.custo_calculado || 0,
      descricao_snapshot: selectedItem.descricao,
      codigo_snapshot: selectedItem.codigo,
      unidade_snapshot: selectedItem.unidade,
    })
    setSaving(false)
    setSelectedItem(null)
    setQuantidade('')
    setBusca('')
    // Mantém o modal aberto para adicionar mais itens na mesma etapa
    // Usuário fecha manualmente
    loadItens(orcamento.id)
  }

  async function handleRemoveItem(itemId: string) {
    await supabase.from('orcamento_itens').delete().eq('id', itemId)
    setItens(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleUpdateBdi() {
    if (!orcamento) return
    await supabase.from('orcamentos').update({ bdi_percentual: bdi }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, bdi_percentual: bdi } : o)
  }

  async function handleFinalizar() {
    if (!orcamento || !confirm('Finalizar orçamento? Os preços serão congelados.')) return
    await supabase.from('orcamentos').update({ status: 'finalizado' }).eq('id', orcamento.id)
    setOrcamento(o => o ? { ...o, status: 'finalizado' } : o)
    setShowMenu(false)
  }

  async function handleReabrir() {
    if (!orcamento) return
    const novaVersao = orcamento.versao + 1
    const { data: novoOrc } = await supabase
      .from('orcamentos')
      .insert({ obra_id: obraId, tipo: orcamento.tipo, bdi_percentual: orcamento.bdi_percentual, status: 'rascunho', versao: novaVersao })
      .select().single()
    if (novoOrc) {
      for (const item of itens) {
        await supabase.from('orcamento_itens').insert({
          orcamento_id: novoOrc.id, etapa_id: item.etapa_id,
          composicao_id: item.composicao_id, sinapi_composicao_id: item.sinapi_composicao_id,
          quantidade: item.quantidade, preco_unitario_snapshot: item.preco_unitario_snapshot,
          descricao_snapshot: item.descricao_snapshot, codigo_snapshot: item.codigo_snapshot, unidade_snapshot: item.unidade_snapshot,
        })
      }
      setOrcamento(novoOrc)
      loadItens(novoOrc.id)
    }
    setShowMenu(false)
  }

  // ─── Totais ──────────────────────────────────────────────────────────────────
  const subtotal = itens.reduce((a, i) => a + i.preco_unitario_snapshot * i.quantidade, 0)
  const totalBdi = subtotal * (bdi / 100)
  const totalGeral = subtotal + totalBdi

  // Agrupa itens: { etapaId → itens[] }, mais "sem_etapa"
  const itensPorEtapa: Record<string, ItemEnriquecido[]> = { sem_etapa: [] }
  for (const etapa of etapas) itensPorEtapa[etapa.id] = []
  for (const item of itens) {
    const key = item.etapa_id && itensPorEtapa[item.etapa_id] !== undefined ? item.etapa_id : 'sem_etapa'
    itensPorEtapa[key].push(item)
  }

  const listaFiltrada = (fonte === 'proprias' ? composicoesProprias : sinapiComps).filter(c =>
    !busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase())
  )

  const isReadonly = orcamento?.status === 'finalizado'

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  )

  if (!orcamento) return <EmptyState icon={Plus} title="Nenhum orçamento encontrado" description="Crie um orçamento para esta obra." />

  return (
    <div className="flex flex-col gap-4">

      {/* ── Barra do orçamento ── */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Orçamento Executivo</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              v{orcamento.versao} —{' '}
              <span style={{ color: orcamento.status === 'finalizado' ? 'var(--success)' : orcamento.status === 'ativo' ? 'var(--accent)' : 'var(--warning)' }}>
                {orcamento.status === 'rascunho' ? 'Rascunho' : orcamento.status === 'ativo' ? 'Ativo' : 'Finalizado'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>BDI %</label>
            <input
              type="number" value={bdi}
              onChange={e => setBdi(Number(e.target.value))}
              onBlur={handleUpdateBdi}
              disabled={isReadonly}
              className="input-base w-20 text-center py-1"
              min={0} max={100}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isReadonly && (
            <Button
              size="sm"
              icon={<FolderPlus size={14} />}
              variant="secondary"
              onClick={() => setShowNovaEtapa(true)}
            >
              Nova Etapa
            </Button>
          )}
          {/* Menu ... */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(v => !v)}
              className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                {!isReadonly ? (
                  <button
                    onClick={handleFinalizar}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Lock size={13} style={{ color: 'var(--text-secondary)' }} />
                    Finalizar orçamento
                  </button>
                ) : (
                  <button
                    onClick={handleReabrir}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Unlock size={13} style={{ color: 'var(--text-secondary)' }} />
                    Reabrir (nova versão)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Grupos por etapa ── */}
      {etapas.length === 0 && itens.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="Orçamento vazio"
          description='Crie uma etapa (ex: Fundação, Estrutura) para começar a adicionar serviços.'
          action={!isReadonly ? (
            <Button icon={<FolderPlus size={16} />} onClick={() => setShowNovaEtapa(true)}>
              Criar primeira etapa
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Itens sem etapa (se houver) */}
          {itensPorEtapa.sem_etapa.length > 0 && (
            <GrupoEtapa
              nome="Sem etapa"
              itens={itensPorEtapa.sem_etapa}
              isReadonly={isReadonly}
              collapsed={collapsed['sem_etapa']}
              onToggle={() => setCollapsed(c => ({ ...c, sem_etapa: !c['sem_etapa'] }))}
              onAddItem={() => { setAddToEtapaId(null); setShowAddItem(true) }}
              onRemove={handleRemoveItem}
              bdi={bdi}
            />
          )}

          {/* Grupos por etapa */}
          {etapas.map(etapa => (
            <GrupoEtapa
              key={etapa.id}
              nome={etapa.nome}
              itens={itensPorEtapa[etapa.id] || []}
              isReadonly={isReadonly}
              collapsed={collapsed[etapa.id]}
              onToggle={() => setCollapsed(c => ({ ...c, [etapa.id]: !c[etapa.id] }))}
              onAddItem={() => { setAddToEtapaId(etapa.id); setShowAddItem(true) }}
              onRemove={handleRemoveItem}
              bdi={bdi}
            />
          ))}

          {/* Botão adicionar nova etapa inline (quando já existem etapas) */}
          {!isReadonly && (
            <button
              onClick={() => setShowNovaEtapa(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors hover:bg-[var(--bg-card)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <FolderPlus size={16} />
              Adicionar etapa
            </button>
          )}

          {/* Totais */}
          <div className="card p-4">
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
      )}

      {/* ── Modal nova etapa ── */}
      <Modal open={showNovaEtapa} onClose={() => { setShowNovaEtapa(false); setNovaEtapaNome('') }} title="Nova Etapa" size="sm">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da etapa"
            value={novaEtapaNome}
            onChange={e => setNovaEtapaNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCriarEtapa()}
            placeholder="Ex: Fundação, Estrutura, Cobertura..."
            autoFocus
          />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Datas serão definidas depois no Cronograma.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowNovaEtapa(false); setNovaEtapaNome('') }}>Cancelar</Button>
            <Button className="flex-1" loading={criandoEtapa} disabled={!novaEtapaNome.trim()} onClick={handleCriarEtapa}>
              Criar e adicionar serviços
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal adicionar composição ── */}
      <Modal
        open={showAddItem}
        onClose={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade(''); setBusca('') }}
        title={addToEtapaId ? `Adicionar em: ${etapas.find(e => e.id === addToEtapaId)?.nome || ''}` : 'Adicionar serviço'}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          {/* Tabs fonte */}
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            {([['proprias', 'Composições Próprias'], ['sinapi', 'Referência SINAPI']] as [FonteBusca, string][]).map(([id, label]) => (
              <button key={id}
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
              placeholder={fonte === 'proprias' ? 'Buscar por código ou descrição...' : 'Buscar na tabela SINAPI...'}
              className="input-base input-search"
              autoFocus
            />
          </div>

          {/* Item selecionado + campo quantidade */}
          {selectedItem ? (
            <div className="p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(59,123,248,0.08)', border: '1px solid rgba(59,123,248,0.25)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {selectedItem.codigo}
                  </span>
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--accent)' }}>
                    {selectedItem.descricao}
                  </span>
                  {selectedItem.custo_unitario > 0 && (
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {formatCurrency(selectedItem.custo_unitario)}/{selectedItem.unidade}
                    </span>
                  )}
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Input
                      ref={qtdInputRef}
                      label={`Quantidade (${selectedItem.unidade})`}
                      type="number"
                      value={quantidade}
                      onChange={e => setQuantidade(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && quantidade && handleAddItem()}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <div className="flex gap-2 pb-0.5">
                    <Button variant="secondary" size="sm" onClick={() => { setSelectedItem(null); setQuantidade('') }}>
                      Limpar
                    </Button>
                    <Button size="sm" loading={saving} disabled={!quantidade} onClick={handleAddItem}>
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Lista de composições */
            <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
              {listaFiltrada.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                  {fonte === 'proprias'
                    ? 'Nenhuma composição própria. Crie em Serviços no menu.'
                    : 'Nenhuma composição SINAPI encontrada.'}
                </p>
              ) : (
                listaFiltrada.slice(0, 60).map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedItem(c)
                      setBusca('')
                      setTimeout(() => qtdInputRef.current?.focus(), 60)
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ border: '1px solid transparent' }}
                  >
                    <span className="text-xs font-mono flex-shrink-0 w-20 truncate" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
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
          )}

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setShowAddItem(false); setSelectedItem(null); setQuantidade('') }}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Componente de grupo por etapa ──────────────────────────────────────────
function GrupoEtapa({
  nome, itens, isReadonly, collapsed, onToggle, onAddItem, onRemove, bdi,
}: {
  nome: string
  itens: ItemEnriquecido[]
  isReadonly: boolean
  collapsed?: boolean
  onToggle: () => void
  onAddItem: () => void
  onRemove: (id: string) => void
  bdi: number
}) {
  const subtotalGrupo = itens.reduce((a, i) => a + i.preco_unitario_snapshot * i.quantidade, 0)
  const totalGrupo = subtotalGrupo * (1 + bdi / 100)

  return (
    <div className="card overflow-hidden">
      {/* Cabeçalho do grupo */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        style={{ background: 'var(--bg-secondary)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={onToggle}
      >
        <button className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{nome}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {itens.length} {itens.length === 1 ? 'serviço' : 'serviços'}
        </span>
        <span className="text-sm font-semibold ml-4" style={{ color: 'var(--accent)' }}>
          {formatCurrency(totalGrupo)}
        </span>
        {!isReadonly && (
          <button
            onClick={e => { e.stopPropagation(); onAddItem() }}
            className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-card)]"
            style={{ color: 'var(--accent)', border: '1px solid var(--accent)', opacity: 0.8 }}
          >
            <Plus size={12} /> serviço
          </button>
        )}
      </div>

      {/* Linhas */}
      {!collapsed && (
        <>
          {itens.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isReadonly ? 'Nenhum serviço.' : (
                <button onClick={onAddItem} className="hover:underline" style={{ color: 'var(--accent)' }}>
                  + Adicionar primeiro serviço
                </button>
              )}
            </div>
          ) : (
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Código', 'Descrição', 'Unid.', 'Qtd.', 'Unit. R$', 'Total R$', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {item.codigo}
                    </td>
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)', maxWidth: 280 }}>
                      <span className="truncate block">{item.descricao}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{item.unidade}</td>
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>{item.quantidade.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.preco_unitario_snapshot)}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(item.preco_unitario_snapshot * item.quantidade)}
                    </td>
                    <td className="px-4 py-2.5">
                      {!isReadonly && (
                        <button onClick={() => onRemove(item.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                          <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
