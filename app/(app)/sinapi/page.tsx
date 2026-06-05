'use client'

import { useEffect, useState } from 'react'
import { Search, Plus, Trash2, Calculator } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SinapiInsumo, ComposicaoPropria } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'

type Tab = 'insumos' | 'composicoes'

export default function SinapiPage() {
  const [tab, setTab] = useState<Tab>('insumos')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {(['insumos', 'composicoes'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
          >
            {t === 'insumos' ? 'Insumos SINAPI' : 'Composições Próprias'}
          </button>
        ))}
      </div>

      <div className="animate-enter">
        {tab === 'insumos' ? <InsumosTab /> : <ComposicoesTab />}
      </div>
    </div>
  )
}

function InsumosTab() {
  const supabase = createClient()
  const [insumos, setInsumos] = useState<SinapiInsumo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('TODAS')
  const [page, setPage] = useState(0)
  const PER_PAGE = 50

  useEffect(() => {
    const timer = setTimeout(loadInsumos, 300)
    return () => clearTimeout(timer)
  }, [busca, categoria, page])

  async function loadInsumos() {
    setLoading(true)
    let query = supabase
      .from('sinapi_insumos')
      .select('*', { count: 'exact' })
      .order('codigo')
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1)

    if (busca) {
      query = query.or(`codigo.ilike.%${busca}%,descricao.ilike.%${busca}%`)
    }
    if (categoria !== 'TODAS') {
      query = query.eq('categoria', categoria)
    }

    const { data } = await query
    setInsumos(data || [])
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(0) }}
            placeholder="Buscar por código ou descrição..."
            className="input-base pl-9"
          />
        </div>
        <select
          value={categoria}
          onChange={e => { setCategoria(e.target.value); setPage(0) }}
          className="input-base sm:w-48"
        >
          <option value="TODAS">Todas categorias</option>
          <option value="MATERIAL">Material</option>
          <option value="MAO_DE_OBRA">Mão de Obra</option>
          <option value="EQUIPAMENTO">Equipamento</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-zebra">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Código', 'Descrição', 'Unidade', 'Preço Unitário', 'Categoria', 'Referência'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>Carregando...</td></tr>
              ) : insumos.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum insumo encontrado</td></tr>
              ) : (
                insumos.map(insumo => (
                  <tr key={insumo.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                      {insumo.codigo}
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)', maxWidth: '350px' }}>
                      <span className="truncate block">{insumo.descricao}</span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{insumo.unidade}</td>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'var(--success)' }}>
                      {formatCurrency(insumo.preco_unitario)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {insumo.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{insumo.mes_referencia}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Mostrando {page * PER_PAGE + 1}–{page * PER_PAGE + insumos.length}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              ← Anterior
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} disabled={insumos.length < PER_PAGE}>
              Próxima →
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComposicoesTab() {
  const supabase = createClient()
  const [composicoes, setComposicoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showInsumoModal, setShowInsumoModal] = useState(false)
  const [selectedComp, setSelectedComp] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ descricao: '', unidade: 'UN', grupo: 'GERAL' })
  const [insumos, setInsumos] = useState<SinapiInsumo[]>([])
  const [buscaInsumo, setBuscaInsumo] = useState('')
  const [coeficiente, setCoeficiente] = useState('')
  const [insumoSelecionado, setInsumoSelecionado] = useState<SinapiInsumo | null>(null)

  useEffect(() => {
    loadComposicoes()
  }, [])

  async function loadComposicoes() {
    setLoading(true)
    const { data } = await supabase
      .from('composicoes_proprias')
      .select('*, composicao_insumos(*, sinapi_insumos(*))')
      .order('codigo')
    const withCusto = (data || []).map((c: any) => ({
      ...c,
      custo_calculado: (c.composicao_insumos || []).reduce(
        (acc: number, ci: any) => acc + (ci.coeficiente * (ci.sinapi_insumos?.preco_unitario || 0)),
        0
      ),
    }))
    setComposicoes(withCusto)
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.descricao) return
    setSaving(true)
    const { count } = await supabase.from('composicoes_proprias').select('*', { count: 'exact', head: true })
    const codigo = `COMP-${String((count || 0) + 1).padStart(3, '0')}`
    await supabase.from('composicoes_proprias').insert({ ...form, codigo })
    setSaving(false)
    setShowModal(false)
    setForm({ descricao: '', unidade: 'UN', grupo: 'GERAL' })
    loadComposicoes()
  }

  async function handleAddInsumo() {
    if (!selectedComp || !insumoSelecionado || !coeficiente) return
    setSaving(true)
    await supabase.from('composicao_insumos').insert({
      composicao_id: selectedComp.id,
      insumo_id: insumoSelecionado.id,
      coeficiente: parseFloat(coeficiente),
    })
    setSaving(false)
    setInsumoSelecionado(null)
    setCoeficiente('')
    loadComposicoes()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta composição?')) return
    await supabase.from('composicoes_proprias').delete().eq('id', id)
    loadComposicoes()
  }

  useEffect(() => {
    if (!buscaInsumo) { setInsumos([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('sinapi_insumos')
        .select('*')
        .or(`codigo.ilike.%${buscaInsumo}%,descricao.ilike.%${buscaInsumo}%`)
        .limit(10)
      setInsumos(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [buscaInsumo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>
          Nova Composição
        </Button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : composicoes.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nenhuma composição cadastrada. Crie a primeira.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {composicoes.map(c => (
              <div key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono font-semibold" style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>{c.codigo}</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.descricao}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{c.grupo}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>Unid: {c.unidade}</span>
                      <span className="font-semibold" style={{ color: 'var(--success)' }}>
                        Custo: {formatCurrency(c.custo_calculado)}
                      </span>
                    </div>

                    {/* Insumos da composição */}
                    {c.composicao_insumos?.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {c.composicao_insumos.map((ci: any) => (
                          <div key={ci.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                            <span className="font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{ci.sinapi_insumos?.codigo}</span>
                            <span className="flex-1 truncate">{ci.sinapi_insumos?.descricao}</span>
                            <span>× {ci.coeficiente}</span>
                            <span style={{ color: 'var(--text-primary)' }}>= {formatCurrency(ci.coeficiente * (ci.sinapi_insumos?.preco_unitario || 0))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setSelectedComp(c); setShowInsumoModal(true) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                      style={{ background: 'rgba(59,123,248,0.15)', color: 'var(--accent)' }}
                    >
                      <Calculator size={12} /> Add insumo
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
                      <Trash2 size={14} style={{ color: 'var(--danger)' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nova composição */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nova Composição" size="sm">
        <div className="flex flex-col gap-4">
          <Input label="Descrição *" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Alvenaria de bloco cerâmico" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Unidade" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} placeholder="M2, M3, UN..." />
            <Input label="Grupo" value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} placeholder="ESTRUTURA, ACABAMENTO..." />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.descricao} onClick={handleCreate}>Criar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal adicionar insumo */}
      <Modal open={showInsumoModal} onClose={() => { setShowInsumoModal(false); setInsumoSelecionado(null); setBuscaInsumo('') }} title={`Adicionar insumo — ${selectedComp?.descricao}`} size="lg">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input value={buscaInsumo} onChange={e => setBuscaInsumo(e.target.value)} placeholder="Buscar insumo SINAPI..." className="input-base pl-9" autoFocus />
          </div>

          {insumos.length > 0 && (
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
              {insumos.map(ins => (
                <button
                  key={ins.id}
                  onClick={() => setInsumoSelecionado(ins)}
                  className="flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors"
                  style={{ background: insumoSelecionado?.id === ins.id ? 'rgba(59,123,248,0.15)' : 'var(--bg-secondary)' }}
                >
                  <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{ins.codigo}</span>
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{ins.descricao}</span>
                  <span className="text-xs" style={{ color: 'var(--success)' }}>{formatCurrency(ins.preco_unitario)}/{ins.unidade}</span>
                </button>
              ))}
            </div>
          )}

          {insumoSelecionado && (
            <Input
              label={`Coeficiente (${insumoSelecionado.unidade} por unidade da composição)`}
              type="number"
              value={coeficiente}
              onChange={e => setCoeficiente(e.target.value)}
              placeholder="Ex: 1.5"
              min={0}
            />
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowInsumoModal(false); setInsumoSelecionado(null); setBuscaInsumo('') }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!insumoSelecionado || !coeficiente} onClick={handleAddInsumo}>Adicionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
