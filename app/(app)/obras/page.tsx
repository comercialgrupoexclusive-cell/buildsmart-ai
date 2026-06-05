'use client'

import { useEffect, useState } from 'react'
import { Plus, HardHat, MapPin, Calendar, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Obra } from '@/lib/types'
import { formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const STATUS_FILTROS = ['todas', 'ativa', 'orcamento', 'concluida', 'paralisada']

export default function ObrasPage() {
  const router = useRouter()
  const supabase = createClient()
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todas')
  const [busca, setBusca] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    endereco: '',
    responsavel: '',
    data_inicio: '',
    data_previsao: '',
    foto_url: '',
  })

  useEffect(() => {
    loadObras()
  }, [])

  async function loadObras() {
    setLoading(true)
    const { data } = await supabase.from('obras').select('*').order('created_at', { ascending: false })
    setObras(data || [])
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.nome.trim()) return
    setSaving(true)

    const { data: obra } = await supabase
      .from('obras')
      .insert({
        nome: form.nome,
        endereco: form.endereco,
        responsavel: form.responsavel || null,
        data_inicio: form.data_inicio || null,
        data_previsao: form.data_previsao || null,
        foto_url: form.foto_url || null,
        status: 'orcamento',
      })
      .select()
      .single()

    if (obra) {
      await supabase.from('orcamentos').insert({
        obra_id: obra.id,
        tipo: 'executivo',
        bdi_percentual: 25,
        status: 'rascunho',
        versao: 1,
      })
    }

    setSaving(false)
    setShowModal(false)
    resetForm()
    loadObras()
    if (obra) router.push(`/obras/${obra.id}`)
  }

  function resetForm() {
    setForm({ nome: '', endereco: '', responsavel: '', data_inicio: '', data_previsao: '', foto_url: '' })
  }

  const obrasFiltradas = obras.filter(o => {
    const matchStatus = filtro === 'todas' || o.status === filtro
    const matchBusca = !busca || o.nome.toLowerCase().includes(busca.toLowerCase()) || o.endereco.toLowerCase().includes(busca.toLowerCase())
    return matchStatus && matchBusca
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTROS.map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtro === s
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              }
            >
              {s === 'todas' ? 'Todas' : STATUS_OBRA_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar obra..."
              className="input-base pl-9"
            />
          </div>
          <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>
            Nova Obra
          </Button>
        </div>
      </div>

      {/* Grid de obras */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : obrasFiltradas.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Nenhuma obra encontrada"
          description={obras.length === 0 ? "Comece criando sua primeira obra." : "Tente ajustar os filtros."}
          action={obras.length === 0 ? (
            <Button onClick={() => setShowModal(true)} icon={<Plus size={16} />}>
              Nova Obra
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {obrasFiltradas.map((obra, i) => (
            <Link
              key={obra.id}
              href={`/obras/${obra.id}`}
              className="card p-0 overflow-hidden hover:scale-[1.01] transition-transform block animate-enter"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Foto */}
              <div className="h-36 relative" style={{ background: 'var(--bg-secondary)' }}>
                {obra.foto_url ? (
                  <img src={obra.foto_url} alt={obra.nome} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <HardHat size={40} style={{ color: 'var(--border)' }} />
                  </div>
                )}
                <div className="absolute top-3 right-3">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_OBRA_COLOR[obra.status]}`}>
                    {STATUS_OBRA_LABEL[obra.status]}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold mb-1 truncate" style={{ color: 'var(--text-primary)' }}>
                  {obra.nome}
                </h3>
                {obra.endereco && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <MapPin size={12} style={{ color: 'var(--text-secondary)' }} />
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{obra.endereco}</p>
                  </div>
                )}
                {obra.data_previsao && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} style={{ color: 'var(--text-secondary)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Previsão: {formatDate(obra.data_previsao)}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal nova obra */}
      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title="Nova Obra" size="md">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da obra *"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Residência Silva - Caxias do Sul"
          />
          <Input
            label="Endereço"
            value={form.endereco}
            onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
            placeholder="Rua, número, bairro, cidade"
          />
          <Input
            label="Responsável técnico"
            value={form.responsavel}
            onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
            placeholder="Nome do engenheiro/responsável"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de início"
              type="date"
              value={form.data_inicio}
              onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
            />
            <Input
              label="Previsão de conclusão"
              type="date"
              value={form.data_previsao}
              onChange={e => setForm(f => ({ ...f, data_previsao: e.target.value }))}
            />
          </div>
          <Input
            label="URL da foto (opcional)"
            value={form.foto_url}
            onChange={e => setForm(f => ({ ...f, foto_url: e.target.value }))}
            placeholder="https://..."
            hint="Link direto para imagem da obra"
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={!form.nome.trim()}
              onClick={handleCreate}
            >
              Criar Obra
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
