'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Search, Pencil, Trash2, X, Check,
  ChevronRight, Layers, Hash, AlertTriangle, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ComposicaoPropria, ComposicaoItem, SINAPI_UFS } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'

const GRUPOS = [
  'GERAL', 'FUNDACAO', 'ESTRUTURA', 'ALVENARIA', 'COBERTURA',
  'REVESTIMENTO', 'PISO', 'INSTALACOES', 'ACABAMENTO', 'SERVICOS_GERAIS',
]

type SinapiInsumoLite = {
  codigo: string
  classificacao: string
  descricao: string
  unidade: string
  precos: Record<string, number>
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ServicosPage() {
  const supabase = createClient()
  const [composicoes, setComposicoes] = useState<ComposicaoPropria[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')

  // Modal de cabeçalho (criar/editar composição)
  const [showModalHeader, setShowModalHeader] = useState(false)
  const [editando, setEditando] = useState<ComposicaoPropria | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: 'M2', grupo: 'GERAL' })

  // Modal de itens
  const [composicaoItens, setComposicaoItens] = useState<ComposicaoPropria | null>(null)
  const [showModalItens, setShowModalItens] = useState(false)

  useEffect(() => { loadComposicoes() }, [])

  async function loadComposicoes() {
    setLoading(true)
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*')
      .order('grupo').order('codigo')
    setComposicoes(data || [])
    setLoading(false)
  }

  async function handleSaveHeader() {
    if (!form.codigo.trim() || !form.descricao.trim()) return
    setSaving(true)
    if (editando) {
      await supabase.from('composicoes_proprias').update({
        codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, grupo: form.grupo,
      }).eq('id', editando.id)
    } else {
      await supabase.from('composicoes_proprias').insert({
        codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, grupo: form.grupo, ativo: true,
      })
    }
    setSaving(false)
    setShowModalHeader(false)
    resetForm()
    loadComposicoes()
  }

  async function handleToggleAtivo(comp: ComposicaoPropria) {
    await supabase.from('composicoes_proprias').update({ ativo: !comp.ativo }).eq('id', comp.id)
    setComposicoes(prev => prev.map(c => c.id === comp.id ? { ...c, ativo: !c.ativo } : c))
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover composição? Itens de orçamento vinculados serão desvinculados.')) return
    await supabase.from('composicoes_proprias').delete().eq('id', id)
    setComposicoes(prev => prev.filter(c => c.id !== id))
  }

  function openEdit(comp: ComposicaoPropria) {
    setEditando(comp)
    setForm({ codigo: comp.codigo, descricao: comp.descricao, unidade: comp.unidade, grupo: comp.grupo })
    setShowModalHeader(true)
  }

  function openItens(comp: ComposicaoPropria) {
    setComposicaoItens(comp)
    setShowModalItens(true)
  }

  function resetForm() {
    setForm({ codigo: '', descricao: '', unidade: 'M2', grupo: 'GERAL' })
    setEditando(null)
  }

  const grupos = ['TODOS', ...Array.from(new Set(composicoes.map(c => c.grupo)))]

  const filtradas = composicoes.filter(c => {
    const matchBusca = !busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase())
    const matchGrupo = filtroGrupo === 'TODOS' || c.grupo === filtroGrupo
    return matchBusca && matchGrupo
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {grupos.map(g => (
            <button key={g}
              onClick={() => setFiltroGrupo(g)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtroGrupo === g
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {g === 'TODOS' ? 'Todos' : g.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço..." className="input-base input-search" />
          </div>
          <Button onClick={() => { resetForm(); setShowModalHeader(true) }} icon={<Plus size={16} />}>
            Nova Composição
          </Button>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtradas.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhuma composição cadastrada"
          description="Crie composições de serviço para usar nos seus orçamentos."
          action={<Button onClick={() => { resetForm(); setShowModalHeader(true) }} icon={<Plus size={16} />}>Nova Composição</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full table-zebra">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Código', 'Descrição', 'Unid.', 'Grupo', 'Itens', 'Ativo', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(comp => (
                <tr
                  key={comp.id}
                  style={{ borderBottom: '1px solid var(--border)', opacity: comp.ativo ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => openItens(comp)}
                >
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {comp.codigo}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)', maxWidth: 320 }}>
                    <span className="truncate block">{comp.descricao}</span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{comp.unidade}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      {comp.grupo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); openItens(comp) }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ color: 'var(--accent)', border: '1px solid var(--accent)', opacity: 0.8 }}
                    >
                      <Layers size={11} /> Editar itens
                    </button>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleToggleAtivo(comp)} className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]">
                      {comp.ativo
                        ? <Check size={14} style={{ color: 'var(--success)' }} />
                        : <X size={14} style={{ color: 'var(--danger)' }} />}
                    </button>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(comp)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                        <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <button onClick={() => handleDelete(comp.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                        <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal — criar/editar cabeçalho */}
      <Modal open={showModalHeader} onClose={() => { setShowModalHeader(false); resetForm() }}
        title={editando ? 'Editar composição' : 'Nova composição'} size="md">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Código *" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
              placeholder="Ex: CP-009" autoFocus />
            <Input label="Unidade *" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
              placeholder="M2, M3, UN, H..." />
          </div>
          <Input label="Descrição *" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Nome do serviço/composição" />
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Grupo</label>
            <select value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} className="input-base">
              {GRUPOS.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModalHeader(false); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.codigo.trim() || !form.descricao.trim()} onClick={handleSaveHeader}>
              {editando ? 'Salvar alterações' : 'Criar composição'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal — itens da composição */}
      {composicaoItens && (
        <ModalItens
          composicao={composicaoItens}
          open={showModalItens}
          onClose={() => { setShowModalItens(false); setComposicaoItens(null) }}
        />
      )}
    </div>
  )
}

// ─── Modal de edição de itens ─────────────────────────────────────────────────
function ModalItens({
  composicao, open, onClose,
}: {
  composicao: ComposicaoPropria
  open: boolean
  onClose: () => void
}) {
  const supabase = createClient()

  // Itens existentes
  const [itens, setItens] = useState<ComposicaoItem[]>([])
  const [loadingItens, setLoadingItens] = useState(true)

  // UF para preview de preço
  const [ufPreview, setUfPreview] = useState('SP')

  // Busca de insumo SINAPI
  const [buscaSinapi, setBuscaSinapi] = useState('')
  const [resultsSinapi, setResultsSinapi] = useState<SinapiInsumoLite[]>([])
  const [loadingBusca, setLoadingBusca] = useState(false)
  const [insumoSelecionado, setInsumoSelecionado] = useState<SinapiInsumoLite | null>(null)

  // Form novo item
  const [tipoNovo, setTipoNovo] = useState<'SINAPI_INSUMO' | 'SINAPI_COMPOSICAO' | 'MANUAL'>('SINAPI_INSUMO')
  const [coefNovo, setCoefNovo] = useState('')
  const [descManual, setDescManual] = useState('')
  const [undManual, setUndManual] = useState('')
  const [codManual, setCodManual] = useState('')
  const [savingItem, setSavingItem] = useState(false)

  useEffect(() => {
    if (open) loadItens()
  }, [open, composicao.id])

  async function loadItens() {
    setLoadingItens(true)
    const { data } = await supabase
      .from('composicao_itens')
      .select('*')
      .eq('composicao_id', composicao.id)
      .order('ordem')
    setItens((data || []) as ComposicaoItem[])
    setLoadingItens(false)
  }

  // Busca debounced no SINAPI
  useEffect(() => {
    if (buscaSinapi.length < 2) { setResultsSinapi([]); return }
    const t = setTimeout(() => buscaSinapiInsumos(buscaSinapi), 300)
    return () => clearTimeout(t)
  }, [buscaSinapi])

  async function buscaSinapiInsumos(q: string) {
    setLoadingBusca(true)
    const { data } = await supabase
      .from('sinapi_insumos')
      .select('codigo, classificacao, descricao, unidade, precos')
      .or(`descricao.ilike.%${q}%,codigo.ilike.%${q}%`)
      .order('codigo')
      .limit(15)
    setResultsSinapi((data || []) as SinapiInsumoLite[])
    setLoadingBusca(false)
  }

  function selecionarInsumo(ins: SinapiInsumoLite) {
    setInsumoSelecionado(ins)
    setBuscaSinapi('')
    setResultsSinapi([])
  }

  async function handleAddItem() {
    if (!coefNovo || parseFloat(coefNovo) <= 0) return

    const isSinapi = tipoNovo === 'SINAPI_INSUMO' || tipoNovo === 'SINAPI_COMPOSICAO'
    if (isSinapi && !insumoSelecionado) return
    if (tipoNovo === 'MANUAL' && !descManual.trim()) return

    setSavingItem(true)
    const payload = {
      composicao_id: composicao.id,
      tipo: tipoNovo,
      sinapi_codigo: isSinapi ? insumoSelecionado!.codigo : (codManual.trim() || null),
      descricao: isSinapi ? insumoSelecionado!.descricao : descManual.trim(),
      unidade: isSinapi ? insumoSelecionado!.unidade : undManual.trim() || 'UN',
      coeficiente: parseFloat(coefNovo),
      ordem: itens.length,
    }
    await supabase.from('composicao_itens').insert(payload)
    setSavingItem(false)
    setInsumoSelecionado(null)
    setCoefNovo('')
    setDescManual('')
    setUndManual('')
    setCodManual('')
    loadItens()
  }

  async function handleDeleteItem(id: string) {
    await supabase.from('composicao_itens').delete().eq('id', id)
    setItens(prev => prev.filter(i => i.id !== id))
  }

  // Calcula custo total com base nos itens e UF selecionada
  const custoTotal = itens.reduce((acc, item) => {
    if (item.tipo === 'MANUAL') return acc // sem preço automático
    if (!item.insumo) return acc
    const preco = (item.insumo as any).precos?.[ufPreview] ?? 0
    return acc + item.coeficiente * preco
  }, 0)

  const TIPO_LABEL: Record<string, string> = {
    SINAPI_INSUMO: 'Insumo SINAPI',
    SINAPI_COMPOSICAO: 'Comp. SINAPI',
    MANUAL: 'Manual',
  }
  const TIPO_COLOR: Record<string, string> = {
    SINAPI_INSUMO: 'rgba(59,123,248,0.15)',
    SINAPI_COMPOSICAO: 'rgba(139,92,246,0.15)',
    MANUAL: 'rgba(245,158,11,0.15)',
  }
  const TIPO_TEXT: Record<string, string> = {
    SINAPI_INSUMO: '#3B7BF8',
    SINAPI_COMPOSICAO: '#8B5CF6',
    MANUAL: '#F59E0B',
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Itens — ${composicao.codigo}: ${composicao.descricao}`}
      size="xl"
    >
      <div className="flex flex-col gap-5">
        {/* Barra UF + Custo estimado */}
        <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-secondary)' }}>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Preview de preço por UF:</label>
            <select
              value={ufPreview}
              onChange={e => setUfPreview(e.target.value)}
              className="input-base py-1 text-xs"
              style={{ width: 'auto', paddingLeft: 8, paddingRight: 8 }}
            >
              {SINAPI_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Custo estimado ({ufPreview})</p>
            <p className="text-base font-bold" style={{ color: 'var(--accent)' }}>
              {formatCurrency(custoTotal)}<span className="text-xs font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>/{composicao.unidade}</span>
            </p>
          </div>
        </div>

        {/* Tabela de itens */}
        {loadingItens ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
            {itens.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nenhum item. Use o formulário abaixo para adicionar insumos.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {['Tipo', 'Código', 'Descrição', 'Unid.', 'Coeficiente', `Preço ${ufPreview}`, 'Total', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, i) => {
                    const precoUF = (item.insumo as any)?.precos?.[ufPreview] ?? 0
                    const totalItem = item.coeficiente * precoUF
                    return (
                      <tr key={item.id} style={{ borderBottom: i < itens.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: TIPO_COLOR[item.tipo], color: TIPO_TEXT[item.tipo] }}>
                            {TIPO_LABEL[item.tipo]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                          {item.sinapi_codigo || '—'}
                        </td>
                        <td className="px-3 py-2 max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
                          <span className="truncate block text-xs">{item.descricao}</span>
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{item.unidade}</td>
                        <td className="px-3 py-2 text-xs tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {item.coeficiente.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: precoUF > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {precoUF > 0 ? formatCurrency(precoUF) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium" style={{ color: totalItem > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {totalItem > 0 ? formatCurrency(totalItem) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded hover:bg-red-500/20 transition-colors">
                            <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Formulário — adicionar item */}
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>+ Adicionar insumo / item</p>

          {/* Tipo */}
          <div className="flex gap-2">
            {(['SINAPI_INSUMO', 'SINAPI_COMPOSICAO', 'MANUAL'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTipoNovo(t); setInsumoSelecionado(null); setBuscaSinapi('') }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={tipoNovo === t
                  ? { background: TIPO_COLOR[t], color: TIPO_TEXT[t], border: `1px solid ${TIPO_TEXT[t]}50` }
                  : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                {TIPO_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Busca SINAPI */}
          {(tipoNovo === 'SINAPI_INSUMO' || tipoNovo === 'SINAPI_COMPOSICAO') && (
            <div className="relative">
              {insumoSelecionado ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{insumoSelecionado.codigo}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{insumoSelecionado.descricao}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {insumoSelecionado.unidade}
                      {insumoSelecionado.precos[ufPreview] != null &&
                        ` · ${ufPreview}: ${formatCurrency(insumoSelecionado.precos[ufPreview])}`}
                    </p>
                  </div>
                  <button onClick={() => setInsumoSelecionado(null)} className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                    <input
                      value={buscaSinapi}
                      onChange={e => setBuscaSinapi(e.target.value)}
                      placeholder="Buscar por código ou descrição SINAPI..."
                      className="input-base input-search text-xs"
                    />
                    {loadingBusca && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--accent)' }} />}
                  </div>
                  {resultsSinapi.length > 0 && (
                    <div className="absolute z-30 w-full mt-1 rounded-xl overflow-hidden shadow-xl"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      {resultsSinapi.map(ins => (
                        <button
                          key={ins.codigo}
                          onClick={() => selecionarInsumo(ins)}
                          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <Hash size={12} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>{ins.codigo}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {ins.unidade}
                              {ins.precos[ufPreview] != null && ` · ${ufPreview}: ${formatCurrency(ins.precos[ufPreview])}`}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {buscaSinapi.length >= 2 && resultsSinapi.length === 0 && !loadingBusca && (
                    <div className="absolute z-30 w-full mt-1 rounded-xl px-3 py-3 text-xs text-center shadow-xl"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <AlertTriangle size={12} className="inline mr-1" />
                      Nenhum insumo encontrado — importe o SINAPI em Base SINAPI.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Campos manual */}
          {tipoNovo === 'MANUAL' && (
            <div className="grid grid-cols-3 gap-2">
              <input value={codManual} onChange={e => setCodManual(e.target.value)} placeholder="Código (opc.)" className="input-base text-xs" />
              <input value={descManual} onChange={e => setDescManual(e.target.value)} placeholder="Descrição *" className="input-base col-span-2 text-xs" />
              <input value={undManual} onChange={e => setUndManual(e.target.value)} placeholder="Unidade (M2, UN...)" className="input-base col-span-3 text-xs" />
            </div>
          )}

          {/* Coeficiente + Adicionar */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Coeficiente <span className="opacity-60">(qtd por unidade da composição)</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={coefNovo}
                onChange={e => setCoefNovo(e.target.value)}
                placeholder="Ex: 1.5"
                className="input-base text-xs"
              />
            </div>
            <Button
              onClick={handleAddItem}
              loading={savingItem}
              disabled={
                !coefNovo || parseFloat(coefNovo) <= 0 ||
                ((tipoNovo === 'SINAPI_INSUMO' || tipoNovo === 'SINAPI_COMPOSICAO') && !insumoSelecionado) ||
                (tipoNovo === 'MANUAL' && !descManual.trim())
              }
              icon={<Plus size={14} />}
            >
              Adicionar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
