'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { NovoCadastroModal } from '@/components/cadastro/NovoCadastroModal'
import { ObraCronograma } from '@/components/obra/ObraCronograma'

type ObraOption = { id: string; nome: string }
type CronoOption = { id: string; nome: string; obra_id: string | null }

export default function CronogramaPage() {
  const supabase = createClient()
  const [obras, setObras] = useState<ObraOption[]>([])
  const [projetos, setProjetos] = useState<ObraOption[]>([])
  const [cronogramas, setCronogramas] = useState<CronoOption[]>([])
  const [selectedObraId, setSelectedObraId] = useState<string>('')
  const [selectedCronoId, setSelectedCronoId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showNovoModal, setShowNovoModal] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: obrasData }, { data: projData }, { data: cronosData }] = await Promise.all([
      supabase.from('obras').select('id, nome').order('nome'),
      supabase.from('projetos').select('id, nome').order('nome'),
      supabase.from('cronogramas').select('id, nome, obra_id').order('created_at', { ascending: false }),
    ])
    const obrasList = (obrasData || []) as ObraOption[]
    const cronosList = (cronosData || []) as CronoOption[]
    setObras(obrasList)
    setProjetos((projData || []) as ObraOption[])
    setCronogramas(cronosList)

    if (cronosList.length > 0) {
      if (!selectedObraId && !selectedCronoId) {
        const first = cronosList[0]
        setSelectedObraId(first.obra_id || '')
        setSelectedCronoId(first.id)
      }
    }
    setLoading(false)
  }

  function handleObraChange(obraId: string) {
    setSelectedObraId(obraId)
    const filtered = obraId
      ? cronogramas.filter(c => c.obra_id === obraId)
      : cronogramas
    if (filtered.length > 0) {
      setSelectedCronoId(filtered[0].id)
    } else {
      setSelectedCronoId('')
    }
  }

  const cronosFiltered = selectedObraId
    ? cronogramas.filter(c => c.obra_id === selectedObraId)
    : cronogramas

  const selectedCrono = cronogramas.find(c => c.id === selectedCronoId)

  return (
    <div className="flex flex-col gap-5">
      {/* Toolbar: dropdowns cascata + ações */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {/* Dropdown obra */}
          <select
            value={selectedObraId}
            onChange={e => handleObraChange(e.target.value)}
            className="input-base text-sm font-medium"
            style={{ minWidth: 200, maxWidth: 300 }}
          >
            <option value="">Todas as obras</option>
            {obras.map(o => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>

          {/* Dropdown cronograma */}
          <select
            value={selectedCronoId}
            onChange={e => setSelectedCronoId(e.target.value)}
            className="input-base text-sm font-medium"
            style={{ minWidth: 220, maxWidth: 400 }}
            disabled={cronosFiltered.length === 0}
          >
            {cronosFiltered.length === 0 ? (
              <option value="">Nenhum cronograma</option>
            ) : (
              cronosFiltered.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))
            )}
          </select>
        </div>

        <Button onClick={() => setShowNovoModal(true)} icon={<Plus size={16} />}>
          Novo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : selectedCronoId ? (
        <ObraCronograma
          key={selectedCronoId}
          cronogramaId={selectedCronoId}
          obraId={selectedCrono?.obra_id || undefined}
        />
      ) : (
        <div className="card p-12 text-center">
          <CalendarDays size={40} className="mx-auto mb-4" style={{ color: 'var(--text-secondary)', opacity: 0.4 }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum cronograma</p>
          <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
            {cronogramas.length === 0
              ? 'Crie um novo cronograma para começar.'
              : 'Nenhum cronograma encontrado para esta obra. Selecione outra ou crie um novo.'}
          </p>
          <Button onClick={() => setShowNovoModal(true)} icon={<Plus size={16} />}>
            Novo Cronograma
          </Button>
        </div>
      )}

      {showNovoModal && (
        <NovoCadastroModal
          onClose={() => setShowNovoModal(false)}
          tipo="cronograma"
          obras={obras}
          projetos={projetos}
          onCreated={() => { setShowNovoModal(false); load() }}
        />
      )}
    </div>
  )
}
