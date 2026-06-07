'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra, Medicao, Etapa } from '@/lib/types'
import { formatPercent, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import Link from 'next/link'

export default function MedicoesPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [medicoes, setMedicoes] = useState<any[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [obraId, setObraId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    etapa_id: '',
    periodo_inicio: '',
    periodo_fim: '',
    percentual_executado: '',
    observacao: '',
  })

  useEffect(() => { loadObras() }, [])
  useEffect(() => {
    if (obraId) { loadMedicoes(obraId); loadEtapas(obraId) }
    else { setMedicoes([]); setEtapas([]) }
  }, [obraId])

  async function loadObras() {
    const { data } = await supabase.from('obras').select('*').order('created_at', { ascending: false })
    const list = data || []
    setObras(list)
    if (list.length > 0) setObraId(list[0].id)
  }

  async function loadMedicoes(id: string) {
    setLoading(true)
    const { data } = await supabase
      .from('medicoes')
      .select('*, etapas(nome)')
      .eq('obra_id', id)
      .order('created_at', { ascending: false })
    setMedicoes(data || [])
    setLoading(false)
  }

  async function loadEtapas(id: string) {
    const { data } = await supabase.from('etapas').select('*').eq('obra_id', id).order('ordem')
    setEtapas(data || [])
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
    loadMedicoes(obraId)
  }

  function resetForm() {
    setForm({ etapa_id: '', periodo_inicio: '', periodo_fim: '', percentual_executado: '', observacao: '' })
  }

  // Avanço por etapa (última medição de cada etapa)
  const avancoPorEtapa = etapas.map(e => {
    const medsEtapa = medicoes.filter(m => m.etapa_id === e.id)
    const ultimo = medsEtapa[0]
    return { etapa: e, percentual: ultimo?.percentual_executado || 0 }
  })

  const avancoGlobal = avancoPorEtapa.length > 0
    ? avancoPorEtapa.reduce((acc, a) => acc + a.percentual, 0) / avancoPorEtapa.length
    : 0

  const obraAtual = obras.find(o => o.id === obraId)

  return (
    <div className="flex flex-col gap-6">
      {/* Seletor de obra */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Obra</label>
          <select value={obraId} onChange={e => setObraId(e.target.value)} className="input-base min-w-72">
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        <div className="flex gap-3 items-center">
          {obraAtual && (
            <Link href={`/obras/${obraAtual.id}?tab=medicoes`} className="text-sm font-medium hover:opacity-80" style={{ color: 'var(--accent)' }}>
              Abrir na obra →
            </Link>
          )}
          {obraId && (
            <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>
              Novo registro
            </Button>
          )}
        </div>
      </div>

      {/* Avanço global */}
      {avancoPorEtapa.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Avanço físico previsto / executado</h2>
            <span className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{formatPercent(avancoGlobal)}</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, avancoGlobal)}%`, background: 'var(--accent)' }} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {avancoPorEtapa.map(({ etapa, percentual }) => (
              <div key={etapa.id} className="flex items-center gap-3">
                <span className="text-xs min-w-40 truncate" style={{ color: 'var(--text-secondary)' }}>{etapa.nome}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, percentual)}%`, background: 'var(--accent)', opacity: 0.7 }} />
                </div>
                <span className="text-xs min-w-10 text-right" style={{ color: 'var(--text-primary)' }}>{formatPercent(percentual)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : !obraId ? (
        <EmptyState icon={ClipboardList} title="Selecione uma obra" description="Escolha uma obra para ver diário, avanço e medições." />
      ) : medicoes.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum registro diário"
          description="Registre o percentual executado por etapa para acompanhar o avanço físico da obra."
          action={<Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>Novo registro diário</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Diário e medições registradas</h3>
          </div>
          <table className="w-full table-zebra">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Etapa', 'Período', '% Executado', 'Observação'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {medicoes.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {m.etapas?.nome || 'Obra geral'}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {formatDate(m.periodo_inicio)} → {formatDate(m.periodo_fim)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                        <div className="h-full rounded-full" style={{ width: `${m.percentual_executado}%`, background: 'var(--accent)' }} />
                      </div>
                      <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
                        {formatPercent(m.percentual_executado)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {m.observacao || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Novo registro diário / medição" size="md">
        <div className="flex flex-col gap-4">
          <Select
            label="Etapa (opcional)"
            value={form.etapa_id}
            onChange={e => setForm(f => ({ ...f, etapa_id: e.target.value }))}
          >
            <option value="">Obra geral (sem etapa específica)</option>
            {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Período início *" type="date" value={form.periodo_inicio}
              onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} />
            <Input label="Período fim *" type="date" value={form.periodo_fim}
              onChange={e => setForm(f => ({ ...f, periodo_fim: e.target.value }))} />
          </div>
          <Input
            label="% Executado *"
            type="number"
            value={form.percentual_executado}
            onChange={e => setForm(f => ({ ...f, percentual_executado: e.target.value }))}
            placeholder="0 a 100"
            min={0}
            max={100}
          />
          <Input
            label="Observação"
            value={form.observacao}
            onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
            placeholder="O que foi executado, equipe presente, fotos pendentes, decisões e observações..."
          />
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving}
              disabled={!form.periodo_inicio || !form.periodo_fim || !form.percentual_executado}
              onClick={handleSave}>
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
