'use client'

import { useEffect, useState } from 'react'
import { Plus, BarChart3, Trash2, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

type MedicaoRow = {
  id: string
  obra_id: string
  etapa_id: string | null
  data_medicao: string | null
  periodo_inicio: string
  periodo_fim: string
  percentual_executado: number
  observacao: string | null
  etapas?: { nome: string } | null
}

export function ObraMedicoes({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [medicoes, setMedicoes] = useState<MedicaoRow[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    etapa_id: '',
    data_medicao: new Date().toISOString().split('T')[0],
    periodo_inicio: '',
    periodo_fim: '',
    percentual_executado: '',
    observacao: '',
  })

  useEffect(() => { loadData() }, [obraId])

  async function loadData() {
    setLoading(true)
    const [medsRes, etapasRes] = await Promise.all([
      supabase
        .from('medicoes')
        .select('*, etapas(nome)')
        .eq('obra_id', obraId)
        .order('data_medicao', { ascending: false }),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
    ])
    setMedicoes((medsRes.data || []) as MedicaoRow[])
    setEtapas(etapasRes.data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.periodo_inicio || !form.periodo_fim || !form.percentual_executado) return
    setSaving(true)
    await supabase.from('medicoes').insert({
      obra_id: obraId,
      etapa_id: form.etapa_id || null,
      data_medicao: form.data_medicao || null,
      periodo_inicio: form.periodo_inicio,
      periodo_fim: form.periodo_fim,
      percentual_executado: parseFloat(form.percentual_executado),
      observacao: form.observacao || null,
    })
    setSaving(false)
    setShowModal(false)
    resetForm()
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta medição?')) return
    await supabase.from('medicoes').delete().eq('id', id)
    setMedicoes(prev => prev.filter(m => m.id !== id))
  }

  function resetForm() {
    setForm({
      etapa_id: '', data_medicao: new Date().toISOString().split('T')[0],
      periodo_inicio: '', periodo_fim: '', percentual_executado: '', observacao: '',
    })
  }

  // Avanço por etapa (última medição de cada etapa)
  const progressoPorEtapa = etapas.map(etapa => {
    const meds = medicoes.filter(m => m.etapa_id === etapa.id)
    const ultima = meds[0]
    return { etapa, percentual: ultima?.percentual_executado ?? 0 }
  })

  // Avanço global (última medição sem etapa ou media das etapas)
  const medsSemEtapa = medicoes.filter(m => !m.etapa_id)
  const avancoGlobal = medsSemEtapa.length > 0
    ? medsSemEtapa[0].percentual_executado
    : progressoPorEtapa.length > 0
      ? progressoPorEtapa.reduce((a, p) => a + p.percentual, 0) / progressoPorEtapa.length
      : 0

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header com avanço global */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="card p-4 flex items-center gap-4 flex-1 min-w-[200px]">
          <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
          <div className="flex-1">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Avanço físico global</p>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, avancoGlobal)}%`,
                    background: avancoGlobal >= 100 ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
              <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                {avancoGlobal.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>Nova Medição</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Progresso por etapa */}
        {etapas.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
              Andamento por Etapa
            </h2>
            <div className="flex flex-col gap-4">
              {progressoPorEtapa.map(({ etapa, percentual }) => (
                <div key={etapa.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
                    <span className="font-semibold tabular-nums" style={{ color: percentual >= 100 ? 'var(--success)' : 'var(--accent)' }}>
                      {percentual.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, percentual)}%`,
                        background: percentual >= 100 ? 'var(--success)' : percentual >= 50 ? 'var(--accent)' : 'var(--warning)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Histórico */}
        <div className="card p-5">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Histórico de Medições
          </h2>
          {medicoes.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Sem medições"
              description="Registre medições para acompanhar o avanço físico da obra."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {medicoes.map(m => (
                <div key={m.id} className="p-3 rounded-lg group relative" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {(m as any).etapas?.nome || 'Obra geral'}
                        </p>
                        {m.data_medicao && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                            {new Date(m.data_medicao + 'T12:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(m.periodo_inicio + 'T12:00').toLocaleDateString('pt-BR')}
                        {' — '}
                        {new Date(m.periodo_fim + 'T12:00').toLocaleDateString('pt-BR')}
                      </p>
                      {m.observacao && (
                        <p className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary)' }}>
                          {m.observacao}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {m.percentual_executado}%
                      </span>
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                      >
                        <Trash2 size={12} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </div>
                  {/* Mini barra de progresso */}
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, m.percentual_executado)}%`,
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Nova Medição" size="md">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Etapa" value={form.etapa_id} onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}>
              <option value="">Obra geral</option>
              {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </Select>
            <Input
              label="Data da medição"
              type="date"
              value={form.data_medicao}
              onChange={e => setForm(f => ({ ...f, data_medicao: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Período início *" type="date" value={form.periodo_inicio} onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} />
            <Input label="Período fim *" type="date" value={form.periodo_fim} onChange={e => setForm(f => ({ ...f, periodo_fim: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              Percentual executado (%) *
            </label>
            <div className="relative">
              <input
                type="range"
                min={0} max={100} step={0.5}
                value={form.percentual_executado || '0'}
                onChange={e => setForm(f => ({ ...f, percentual_executado: e.target.value }))}
                className="w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                <span>0%</span>
                <span className="font-bold text-base" style={{ color: 'var(--accent)' }}>
                  {form.percentual_executado || '0'}%
                </span>
                <span>100%</span>
              </div>
            </div>
            <input
              type="number"
              min={0} max={100} step={0.5}
              value={form.percentual_executado}
              onChange={e => setForm(f => ({ ...f, percentual_executado: e.target.value }))}
              className="input-base mt-2 text-center"
              placeholder="ou digite o valor"
            />
          </div>
          <Input
            label="Observação"
            value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
            placeholder="Notas sobre esta medição..."
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>Cancelar</Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={!form.periodo_inicio || !form.periodo_fim || !form.percentual_executado}
              onClick={handleSave}
            >
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
