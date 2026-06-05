'use client'

import { useEffect, useState } from 'react'
import { Plus, AlertTriangle, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Etapa } from '@/lib/types'
import { formatDate, diasAteData, STATUS_ETAPA_COLOR, STATUS_ETAPA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

export function ObraCronograma({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    data_inicio: '',
    data_fim: '',
    status: 'planejada' as Etapa['status'],
  })

  useEffect(() => {
    loadEtapas()
  }, [obraId])

  async function loadEtapas() {
    setLoading(true)
    const { data } = await supabase
      .from('etapas')
      .select('*')
      .eq('obra_id', obraId)
      .order('ordem')
    setEtapas(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.nome || !form.data_inicio || !form.data_fim) return
    setSaving(true)
    const maxOrdem = etapas.reduce((max, e) => Math.max(max, e.ordem), 0)
    await supabase.from('etapas').insert({
      obra_id: obraId,
      nome: form.nome,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      status: form.status,
      ordem: maxOrdem + 1,
    })
    setSaving(false)
    setShowModal(false)
    resetForm()
    loadEtapas()
  }

  async function updateStatus(etapaId: string, status: Etapa['status']) {
    await supabase.from('etapas').update({ status }).eq('id', etapaId)
    setEtapas(prev => prev.map(e => e.id === etapaId ? { ...e, status } : e))
  }

  function resetForm() {
    setForm({ nome: '', data_inicio: '', data_fim: '', status: 'planejada' })
  }

  const hoje = new Date().toISOString().split('T')[0]
  const proximos30 = etapas.filter(e => {
    const inicio = new Date(e.data_inicio)
    const limite = new Date()
    limite.setDate(limite.getDate() + 30)
    return inicio <= limite
  })

  if (loading) {
    return <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>
          Nova Etapa
        </Button>
      </div>

      {etapas.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma etapa cadastrada"
          description="Adicione etapas para organizar o cronograma da obra."
          action={<Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>Nova Etapa</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Linha do tempo visual */}
          <div className="card p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Calendar size={18} style={{ color: 'var(--accent)' }} />
              Cronograma — Próximos 30 dias
            </h2>

            {proximos30.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhuma etapa nos próximos 30 dias.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {proximos30.map(etapa => {
                  const dias = diasAteData(etapa.data_inicio)
                  const esCritica = dias <= 7 && etapa.status !== 'concluida'
                  return (
                    <div
                      key={etapa.id}
                      className="flex items-center gap-4 p-3 rounded-lg border"
                      style={{
                        background: 'var(--bg-secondary)',
                        borderColor: esCritica ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      {esCritica && <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                            {STATUS_ETAPA_LABEL[etapa.status]}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(etapa.data_inicio)} → {formatDate(etapa.data_fim)}
                          {dias > 0 && ` · inicia em ${dias} dias`}
                          {dias === 0 && ' · começa hoje'}
                          {dias < 0 && ` · iniciou há ${Math.abs(dias)} dias`}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabela completa de etapas */}
          <div className="card overflow-hidden">
            <table className="w-full table-zebra">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ord.', 'Etapa', 'Início', 'Fim', 'Status', 'Ação'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {etapas.map(etapa => (
                  <tr key={etapa.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{etapa.ordem}</td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{etapa.nome}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(etapa.data_inicio)}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{formatDate(etapa.data_fim)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_ETAPA_COLOR[etapa.status]}`}>
                        {STATUS_ETAPA_LABEL[etapa.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={etapa.status}
                        onChange={e => updateStatus(etapa.id, e.target.value as Etapa['status'])}
                        className="text-xs rounded-lg px-2 py-1"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                      >
                        <option value="planejada">Planejada</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluida">Concluída</option>
                        <option value="atrasada">Atrasada</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Nova Etapa" size="md">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da etapa *"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Fundação, Alvenaria, Cobertura..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data de início *" type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
            <Input label="Data de término *" type="date" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
          </div>
          <Select label="Status inicial" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Etapa['status'] }))}>
            <option value="planejada">Planejada</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
            <option value="atrasada">Atrasada</option>
          </Select>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.nome || !form.data_inicio || !form.data_fim} onClick={handleSave}>
              Adicionar Etapa
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
