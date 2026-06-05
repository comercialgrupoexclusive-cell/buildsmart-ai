'use client'

import { useEffect, useState } from 'react'
import { Plus, BarChart3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Medicao, Etapa } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

export function ObraMedicoes({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [medicoes, setMedicoes] = useState<any[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    etapa_id: '',
    periodo_inicio: '',
    periodo_fim: '',
    percentual_executado: '',
    observacao: '',
  })

  useEffect(() => {
    loadData()
  }, [obraId])

  async function loadData() {
    setLoading(true)
    const [medsRes, etapasRes] = await Promise.all([
      supabase
        .from('medicoes')
        .select('*, etapas(nome)')
        .eq('obra_id', obraId)
        .order('created_at', { ascending: false }),
      supabase.from('etapas').select('*').eq('obra_id', obraId).order('ordem'),
    ])
    setMedicoes(medsRes.data || [])
    setEtapas(etapasRes.data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.periodo_inicio || !form.periodo_fim || !form.percentual_executado) return
    setSaving(true)
    await supabase.from('medicoes').insert({
      obra_id: obraId,
      etapa_id: form.etapa_id || null,
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

  function resetForm() {
    setForm({ etapa_id: '', periodo_inicio: '', periodo_fim: '', percentual_executado: '', observacao: '' })
  }

  // Calcular progresso por etapa
  const progressoPorEtapa = etapas.map(etapa => {
    const medicoesDaEtapa = medicoes.filter(m => m.etapa_id === etapa.id)
    const ultimaMedicao = medicoesDaEtapa[0]
    return {
      etapa,
      percentual: ultimaMedicao?.percentual_executado || 0,
    }
  })

  if (loading) {
    return <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>Nova Medição</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Progresso por etapa */}
        {etapas.length > 0 && (
          <div className="card p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <BarChart3 size={18} style={{ color: 'var(--accent)' }} />
              Andamento Físico por Etapa
            </h2>
            <div className="flex flex-col gap-4">
              {progressoPorEtapa.map(({ etapa, percentual }) => (
                <div key={etapa.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span style={{ color: 'var(--text-primary)' }}>{etapa.nome}</span>
                    <span className="font-semibold" style={{ color: 'var(--accent)' }}>{percentual.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percentual}%`,
                        background: percentual >= 100 ? 'var(--success)' : percentual >= 50 ? 'var(--accent)' : 'var(--warning)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Histórico de medições */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Histórico de Medições</h2>
          {medicoes.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Sem medições"
              description="Registre medições para acompanhar o avanço físico da obra."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {medicoes.map(m => (
                <div key={m.id} className="p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {m.etapas?.nome || 'Obra geral'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(m.periodo_inicio).toLocaleDateString('pt-BR')} — {new Date(m.periodo_fim).toLocaleDateString('pt-BR')}
                      </p>
                      {m.observacao && (
                        <p className="text-xs mt-1 italic" style={{ color: 'var(--text-secondary)' }}>{m.observacao}</p>
                      )}
                    </div>
                    <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                      {m.percentual_executado}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Nova Medição" size="md">
        <div className="flex flex-col gap-4">
          <Select label="Etapa (opcional)" value={form.etapa_id} onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}>
            <option value="">Obra geral</option>
            {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Período início *" type="date" value={form.periodo_inicio} onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} />
            <Input label="Período fim *" type="date" value={form.periodo_fim} onChange={e => setForm(f => ({ ...f, periodo_fim: e.target.value }))} />
          </div>
          <Input
            label="Percentual executado (%) *"
            type="number"
            min={0} max={100}
            value={form.percentual_executado}
            onChange={e => setForm(f => ({ ...f, percentual_executado: e.target.value }))}
            placeholder="0 a 100"
          />
          <Input
            label="Observação"
            value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
            placeholder="Notas sobre esta medição..."
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.periodo_inicio || !form.periodo_fim || !form.percentual_executado} onClick={handleSave}>
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
