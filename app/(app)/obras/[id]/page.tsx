'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Obra, SINAPI_UFS } from '@/lib/types'
import { formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { HardHat, MapPin, Calendar, User, ChevronLeft, MoreVertical, Pencil, Copy, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useProfile } from '@/lib/profile-context'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { ObraCronograma } from '@/components/obra/ObraCronograma'
import { ObraMateriais } from '@/components/obra/ObraMateriais'
import { ObraMedicoes } from '@/components/obra/ObraMedicoes'

type Tab = 'visao-geral' | 'orcamento' | 'cronograma' | 'materiais' | 'medicoes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'medicoes', label: 'Medições' },
]

export default function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { theme } = useProfile()
  const [obra, setObra] = useState<Obra | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return (t && TABS.some(x => x.id === t)) ? t : 'visao-geral'
  })
  const [loading, setLoading] = useState(true)

  // Menu de ações + edição/exclusão/duplicação
  const [menuOpen, setMenuOpen] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [editForm, setEditForm] = useState({
    nome: '', endereco: '', responsavel: '', data_inicio: '', data_previsao: '', foto_url: '', area_m2: '', uf: 'SP',
  })

  useEffect(() => {
    loadObra()
  }, [id])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadObra() {
    const { data } = await supabase.from('obras').select('*').eq('id', id).single()
    setObra(data)
    setLoading(false)
  }

  async function updateStatus(status: Obra['status']) {
    await supabase.from('obras').update({ status }).eq('id', id)
    setObra(o => o ? { ...o, status } : o)
  }

  function openEdit() {
    if (!obra) return
    setEditForm({
      nome: obra.nome,
      endereco: obra.endereco || '',
      responsavel: obra.responsavel || '',
      data_inicio: obra.data_inicio || '',
      data_previsao: obra.data_previsao || '',
      foto_url: obra.foto_url || '',
      area_m2: obra.area_m2 != null ? String(obra.area_m2) : '',
      uf: obra.uf || 'SP',
    })
    setMenuOpen(false)
    setShowEditModal(true)
  }

  async function handleUpdate() {
    if (!editForm.nome.trim()) return
    setSaving(true)
    const { data } = await supabase
      .from('obras')
      .update({
        nome: editForm.nome,
        endereco: editForm.endereco,
        responsavel: editForm.responsavel || null,
        data_inicio: editForm.data_inicio || null,
        data_previsao: editForm.data_previsao || null,
        foto_url: editForm.foto_url || null,
        area_m2: editForm.area_m2 ? parseFloat(editForm.area_m2) : null,
        uf: editForm.uf,
      })
      .eq('id', id)
      .select()
      .single()
    setSaving(false)
    setShowEditModal(false)
    if (data) setObra(data)
  }

  async function handleDuplicate() {
    if (!obra) return
    setDuplicating(true)
    setMenuOpen(false)

    const { data: nova } = await supabase
      .from('obras')
      .insert({
        nome: `${obra.nome} (cópia)`,
        endereco: obra.endereco,
        responsavel: obra.responsavel,
        data_inicio: null,
        data_previsao: null,
        foto_url: obra.foto_url,
        area_m2: obra.area_m2,
        uf: obra.uf,
        status: 'orcamento',
      })
      .select()
      .single()

    if (nova) {
      // Copia o orçamento (cabeçalho) mais recente, se existir
      const { data: orcs } = await supabase
        .from('orcamentos')
        .select('tipo, bdi_percentual, status, versao')
        .eq('obra_id', obra.id)
        .order('versao', { ascending: false })
        .limit(1)

      const orcOriginal = orcs?.[0]
      await supabase.from('orcamentos').insert({
        obra_id: nova.id,
        tipo: orcOriginal?.tipo || 'executivo',
        bdi_percentual: orcOriginal?.bdi_percentual ?? 25,
        status: 'rascunho',
        versao: 1,
      })
    }

    setDuplicating(false)
    if (nova) router.push(`/obras/${nova.id}`)
  }

  async function handleDelete() {
    if (!obra) return
    if (!confirm(`Excluir definitivamente "${obra.nome}"? Todos os dados vinculados (orçamento, cronograma, materiais, medições) serão removidos. Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    setMenuOpen(false)
    await supabase.from('obras').delete().eq('id', id)
    setDeleting(false)
    router.push('/obras')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!obra) {
    return (
      <div className="text-center py-16">
        <p style={{ color: 'var(--text-secondary)' }}>Obra não encontrada.</p>
        <Link href="/obras" className="text-sm mt-2 inline-block" style={{ color: 'var(--accent)' }}>← Voltar para Obras</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header da obra */}
      <div>
        <Link href="/obras" className="flex items-center gap-1.5 text-sm mb-4 hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          <ChevronLeft size={16} /> Obras
        </Link>

        <div className="card p-6">
          <div className="flex flex-col md:flex-row gap-6">
            {obra.foto_url ? (
              <img src={obra.foto_url} alt={obra.nome} className="w-32 h-24 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-32 h-24 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                <HardHat size={32} style={{ color: 'var(--text-secondary)' }} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--text-primary)' }}>
                    {obra.nome}
                  </h1>
                  <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {obra.endereco && (
                      <span className="flex items-center gap-1.5">
                        <MapPin size={14} /> {obra.endereco}
                      </span>
                    )}
                    {obra.responsavel && (
                      <span className="flex items-center gap-1.5">
                        <User size={14} /> {obra.responsavel}
                      </span>
                    )}
                    {obra.data_previsao && (
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} /> Previsão: {formatDate(obra.data_previsao)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={obra.status}
                    onChange={e => updateStatus(e.target.value as Obra['status'])}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium cursor-pointer ${STATUS_OBRA_COLOR[obra.status]}`}
                    style={{ background: 'transparent', colorScheme: theme }}
                  >
                    <option value="orcamento" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Orçamento</option>
                    <option value="ativa" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Ativa</option>
                    <option value="paralisada" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Paralisada</option>
                    <option value="concluida" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Concluída</option>
                  </select>

                  {/* Menu de ações: editar / duplicar / excluir */}
                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setMenuOpen(v => !v)}
                      className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                      style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      title="Mais ações"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen && (
                      <div
                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl py-1.5 shadow-lg z-50 animate-enter"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                      >
                        <button
                          onClick={openEdit}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
                          Editar obra
                        </button>
                        <button
                          onClick={handleDuplicate}
                          disabled={duplicating}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <Copy size={14} style={{ color: 'var(--text-secondary)' }} />
                          {duplicating ? 'Duplicando...' : 'Duplicar obra'}
                        </button>
                        <div className="my-1 mx-3" style={{ height: '1px', background: 'var(--border)' }} />
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={14} />
                          {deleting ? 'Excluindo...' : 'Excluir obra'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === tabId
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab */}
      <div className="animate-enter">
        {tab === 'visao-geral' && <ObraVisaoGeral obra={obra} />}
        {tab === 'orcamento' && <ObraOrcamento obraId={id} areaM2={obra.area_m2} obraName={obra.nome} obraUf={obra.uf || 'SP'} />}
        {tab === 'cronograma' && <ObraCronograma obraId={id} />}
        {tab === 'materiais' && <ObraMateriais obraId={id} />}
        {tab === 'medicoes' && <ObraMedicoes obraId={id} />}
      </div>

      {/* Modal editar obra */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Obra" size="md">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da obra *"
            value={editForm.nome}
            onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Residência Silva - Caxias do Sul"
          />
          <Input
            label="Endereço"
            value={editForm.endereco}
            onChange={e => setEditForm(f => ({ ...f, endereco: e.target.value }))}
            placeholder="Rua, número, bairro, cidade"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Responsável técnico"
              value={editForm.responsavel}
              onChange={e => setEditForm(f => ({ ...f, responsavel: e.target.value }))}
              placeholder="Engenheiro responsável"
            />
            <Input
              label="Área construída (m²)"
              type="number"
              value={editForm.area_m2}
              onChange={e => setEditForm(f => ({ ...f, area_m2: e.target.value }))}
              placeholder="Ex: 120"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              UF da obra <span className="font-normal opacity-70">(preços SINAPI)</span>
            </label>
            <select
              value={editForm.uf}
              onChange={e => setEditForm(f => ({ ...f, uf: e.target.value }))}
              className="input-base"
              style={{ colorScheme: theme }}
            >
              {SINAPI_UFS.map(uf => (
                <option key={uf} value={uf} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{uf}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data de início"
              type="date"
              value={editForm.data_inicio}
              onChange={e => setEditForm(f => ({ ...f, data_inicio: e.target.value }))}
            />
            <Input
              label="Previsão de conclusão"
              type="date"
              value={editForm.data_previsao}
              onChange={e => setEditForm(f => ({ ...f, data_previsao: e.target.value }))}
            />
          </div>
          <Input
            label="URL da foto (opcional)"
            value={editForm.foto_url}
            onChange={e => setEditForm(f => ({ ...f, foto_url: e.target.value }))}
            placeholder="https://..."
            hint="Link direto para imagem da obra"
          />

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!editForm.nome.trim()} onClick={handleUpdate}>
              Salvar alterações
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ObraVisaoGeral({ obra }: { obra: Obra }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card p-6">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Informações da Obra</h2>
        <dl className="flex flex-col gap-3">
          {[
            { label: 'Nome', value: obra.nome },
            { label: 'Endereço', value: obra.endereco || '—' },
            { label: 'Responsável', value: obra.responsavel || '—' },
            { label: 'Status', value: STATUS_OBRA_LABEL[obra.status] },
            { label: 'Data de início', value: formatDate(obra.data_inicio) },
            { label: 'Previsão de conclusão', value: formatDate(obra.data_previsao) },
            { label: 'Área construída', value: obra.area_m2 ? `${obra.area_m2} m²` : '—' },
            { label: 'UF (preços SINAPI)', value: obra.uf || '—' },
            { label: 'Criado em', value: formatDate(obra.created_at) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <dt style={{ color: 'var(--text-secondary)' }}>{label}</dt>
              <dd className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(59,123,248,0.15)' }}>
          <HardHat size={32} style={{ color: 'var(--accent)' }} />
        </div>
        <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Obra em andamento</p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Use as abas acima para gerenciar orçamento, cronograma, materiais e medições.
        </p>
      </div>
    </div>
  )
}
