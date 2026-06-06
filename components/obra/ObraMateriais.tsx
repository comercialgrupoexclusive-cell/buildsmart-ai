'use client'

import { useEffect, useState } from 'react'
import {
  Package, AlertTriangle, CheckCircle, Clock,
  Plus, Pencil, Trash2, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { diasAteData } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'

const STATUS_LABEL: Record<string, string> = {
  nao_comprado: 'Não comprado',
  parcial: 'Parcial',
  comprado: 'Comprado',
}

const STATUS_DOT: Record<string, string> = {
  nao_comprado: '#EF4444',
  parcial: '#F59E0B',
  comprado: '#10B981',
}

type MaterialRow = {
  id: string
  obra_id: string
  etapa_id: string | null
  sinapi_codigo: string | null
  descricao: string
  unidade: string
  quantidade_total: number
  quantidade_comprada: number
  status_compra: 'nao_comprado' | 'parcial' | 'comprado'
  data_necessidade: string | null
  etapas?: { nome: string } | null
}

export function ObraMateriais({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [materiais, setMateriais] = useState<MaterialRow[]>([])
  const [etapas, setEtapas] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEtapa, setFiltroEtapa] = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // Modal editar / novo
  const [editando, setEditando] = useState<MaterialRow | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    sinapi_codigo: '',
    descricao: '',
    unidade: '',
    quantidade_total: '',
    quantidade_comprada: '',
    data_necessidade: '',
    etapa_id: '',
    status_compra: 'nao_comprado' as MaterialRow['status_compra'],
  })

  useEffect(() => { loadMateriais() }, [obraId])

  async function loadMateriais() {
    setLoading(true)
    const [matsRes, etapasRes] = await Promise.all([
      supabase
        .from('materiais')
        // Colunas diretas no schema v3 — sem join a sinapi_insumos
        .select('*, etapas(nome)')
        .eq('obra_id', obraId)
        .order('data_necessidade', { ascending: true, nullsFirst: false }),
      supabase.from('etapas').select('id, nome').eq('obra_id', obraId).order('ordem'),
    ])
    setMateriais((matsRes.data || []) as MaterialRow[])
    setEtapas(etapasRes.data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.descricao.trim() || !form.quantidade_total) return
    setSaving(true)
    const payload = {
      obra_id: obraId,
      etapa_id: form.etapa_id || null,
      sinapi_codigo: form.sinapi_codigo.trim() || null,
      descricao: form.descricao.trim(),
      unidade: form.unidade.trim() || 'UN',
      quantidade_total: parseFloat(form.quantidade_total),
      quantidade_comprada: parseFloat(form.quantidade_comprada) || 0,
      status_compra: form.status_compra,
      data_necessidade: form.data_necessidade || null,
    }
    if (editando) {
      await supabase.from('materiais').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('materiais').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    setEditando(null)
    resetForm()
    loadMateriais()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este material?')) return
    await supabase.from('materiais').delete().eq('id', id)
    setMateriais(prev => prev.filter(m => m.id !== id))
  }

  async function marcarComprado(m: MaterialRow) {
    await supabase.from('materiais').update({
      status_compra: 'comprado',
      quantidade_comprada: m.quantidade_total,
    }).eq('id', m.id)
    setMateriais(prev => prev.map(mat => mat.id === m.id
      ? { ...mat, status_compra: 'comprado', quantidade_comprada: mat.quantidade_total }
      : mat))
  }

  function openEdit(m: MaterialRow) {
    setEditando(m)
    setForm({
      sinapi_codigo: m.sinapi_codigo || '',
      descricao: m.descricao,
      unidade: m.unidade,
      quantidade_total: String(m.quantidade_total),
      quantidade_comprada: String(m.quantidade_comprada),
      data_necessidade: m.data_necessidade || '',
      etapa_id: m.etapa_id || '',
      status_compra: m.status_compra,
    })
    setShowModal(true)
  }

  function openNew() {
    setEditando(null)
    resetForm()
    setShowModal(true)
  }

  function resetForm() {
    setForm({
      sinapi_codigo: '', descricao: '', unidade: '', quantidade_total: '',
      quantidade_comprada: '0', data_necessidade: '', etapa_id: '', status_compra: 'nao_comprado',
    })
  }

  const materiaisFiltrados = materiais.filter(m => {
    const matchEtapa = filtroEtapa === 'todas' || m.etapa_id === filtroEtapa
    const matchStatus = filtroStatus === 'todos' || m.status_compra === filtroStatus
    return matchEtapa && matchStatus
  })

  const pendentes = materiais.filter(m => m.status_compra !== 'comprado')
  const urgentes = pendentes.filter(m => m.data_necessidade && diasAteData(m.data_necessidade) <= 7)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Alerta urgentes */}
      {urgentes.length > 0 && (
        <div className="card p-4 border-l-4 flex items-start gap-3" style={{ borderLeftColor: 'var(--danger)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {urgentes.length} {urgentes.length === 1 ? 'material urgente' : 'materiais urgentes'} (prazo ≤ 7 dias)
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {urgentes.map(m => m.descricao.substring(0, 30)).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* KPIs mini */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: materiais.length, color: 'var(--accent)' },
          { label: 'Pendentes', value: pendentes.length, color: pendentes.length > 0 ? 'var(--warning)' : 'var(--success)' },
          { label: 'Comprados', value: materiais.length - pendentes.length, color: 'var(--success)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-3 text-center">
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Barra filtros + botão */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2 flex-wrap">
          {/* Filtro status */}
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'nao_comprado', label: 'Não comprado' },
            { id: 'parcial', label: 'Parcial' },
            { id: 'comprado', label: 'Comprado' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setFiltroStatus(id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtroStatus === id
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>
          Adicionar
        </Button>
      </div>

      {/* Filtro por etapa */}
      {etapas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltroEtapa('todas')}
            className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
            style={filtroEtapa === 'todas'
              ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
              : { color: 'var(--text-secondary)' }}
          >
            Todas etapas
          </button>
          {etapas.map(e => (
            <button
              key={e.id}
              onClick={() => setFiltroEtapa(e.id)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={filtroEtapa === e.id
                ? { background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
                : { color: 'var(--text-secondary)' }}
            >
              {e.nome}
            </button>
          ))}
        </div>
      )}

      {/* Tabela */}
      {materiaisFiltrados.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum material"
          description="Os materiais são gerados pelas composições do orçamento ou adicionados manualmente."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Adicionar material</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Status', 'Material', 'Etapa', 'Total', 'Comprado', 'Falta', 'Prazo', ''].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materiaisFiltrados.map(m => {
                  const falta = Math.max(0, m.quantidade_total - m.quantidade_comprada)
                  const diasParaNecessidade = m.data_necessidade ? diasAteData(m.data_necessidade) : null
                  const urgente = diasParaNecessidade !== null && diasParaNecessidade <= 7 && m.status_compra !== 'comprado'
                  const pctComprado = m.quantidade_total > 0 ? (m.quantidade_comprada / m.quantidade_total) * 100 : 0

                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Status */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: STATUS_DOT[m.status_compra] }}
                          />
                          <span className="text-xs" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {STATUS_LABEL[m.status_compra]}
                          </span>
                        </div>
                      </td>
                      {/* Material */}
                      <td className="px-3 py-3" style={{ maxWidth: 220 }}>
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.descricao}</p>
                        {m.sinapi_codigo && (
                          <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {m.sinapi_codigo}
                          </p>
                        )}
                      </td>
                      {/* Etapa */}
                      <td className="px-3 py-3 text-xs" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {(m as any).etapas?.nome || '—'}
                      </td>
                      {/* Total */}
                      <td className="px-3 py-3 text-sm" style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {m.quantidade_total} <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{m.unidade}</span>
                      </td>
                      {/* Comprado + barra */}
                      <td className="px-3 py-3" style={{ minWidth: 100 }}>
                        <div className="text-xs mb-1" style={{ color: 'var(--success)' }}>
                          {m.quantidade_comprada} {m.unidade}
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, pctComprado)}%`, background: 'var(--success)' }}
                          />
                        </div>
                      </td>
                      {/* Falta */}
                      <td className="px-3 py-3 text-sm font-semibold" style={{ color: falta > 0 ? 'var(--danger)' : 'var(--success)', whiteSpace: 'nowrap' }}>
                        {falta > 0 ? `${falta} ${m.unidade}` : '✓'}
                      </td>
                      {/* Data */}
                      <td className="px-3 py-3 text-xs" style={{ whiteSpace: 'nowrap' }}>
                        {m.data_necessidade ? (
                          <span
                            className="flex items-center gap-1"
                            style={{ color: urgente ? 'var(--danger)' : 'var(--text-secondary)' }}
                          >
                            {urgente && <AlertTriangle size={11} />}
                            {new Date(m.data_necessidade + 'T12:00').toLocaleDateString('pt-BR')}
                            {diasParaNecessidade !== null && m.status_compra !== 'comprado' && (
                              <span className="ml-1" style={{ opacity: 0.7 }}>
                                ({diasParaNecessidade}d)
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      {/* Ações */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {m.status_compra !== 'comprado' && (
                            <button
                              onClick={() => marcarComprado(m)}
                              title="Marcar como comprado"
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors"
                              style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}
                            >
                              <CheckCircle size={11} /> OK
                            </button>
                          )}
                          <button onClick={() => openEdit(m)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                            <Pencil size={12} style={{ color: 'var(--text-secondary)' }} />
                          </button>
                          <button onClick={() => handleDelete(m.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                            <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal editar/criar */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null); resetForm() }}
        title={editando ? 'Editar material' : 'Adicionar material'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Código SINAPI"
              value={form.sinapi_codigo}
              onChange={e => setForm(f => ({ ...f, sinapi_codigo: e.target.value }))}
              placeholder="opcional"
            />
            <Input
              label="Unidade"
              value={form.unidade}
              onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
              placeholder="M2, UN, KG..."
            />
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Etapa</label>
              <select
                value={form.etapa_id}
                onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}
                className="input-base"
              >
                <option value="">Sem etapa</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          </div>

          <Input
            label="Descrição *"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Nome/descrição do material"
            autoFocus={!editando}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Qtd total *"
              type="number"
              min="0"
              step="any"
              value={form.quantidade_total}
              onChange={e => setForm(f => ({ ...f, quantidade_total: e.target.value }))}
              placeholder="0"
            />
            <Input
              label="Qtd comprada"
              type="number"
              min="0"
              step="any"
              value={form.quantidade_comprada}
              onChange={e => setForm(f => ({ ...f, quantidade_comprada: e.target.value }))}
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Data de necessidade"
              type="date"
              value={form.data_necessidade}
              onChange={e => setForm(f => ({ ...f, data_necessidade: e.target.value }))}
            />
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Status</label>
              <select
                value={form.status_compra}
                onChange={e => setForm(f => ({ ...f, status_compra: e.target.value as MaterialRow['status_compra'] }))}
                className="input-base"
              >
                <option value="nao_comprado">Não comprado</option>
                <option value="parcial">Parcial</option>
                <option value="comprado">Comprado</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={!form.descricao.trim() || !form.quantidade_total}
              onClick={handleSave}
            >
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
