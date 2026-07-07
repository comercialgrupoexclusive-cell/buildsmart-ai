'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Obra, SINAPI_UFS, Etapa, Fornecedor, ObraFornecedor } from '@/lib/types'
import { formatDate, STATUS_OBRA_COLOR, STATUS_OBRA_LABEL } from '@/lib/utils'
import { HardHat, MapPin, Calendar, User, ChevronLeft, MoreVertical, Pencil, Copy, Trash2, TrendingUp, Truck, Camera, X, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useProfile } from '@/lib/profile-context'
import { usePermission } from '@/lib/permissions'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { ObraCronograma } from '@/components/obra/ObraCronograma'
import { ObraMateriais } from '@/components/obra/ObraMateriais'
import { ObraMedicoes } from '@/components/obra/ObraMedicoes'
import { ObraArquivos } from '@/components/obra/ObraArquivos'
import { ObraCompras } from '@/components/obra/ObraCompras'
import { ObraTarefas } from '@/components/obra/ObraTarefas'

type Tab = 'visao-geral' | 'arquivos' | 'orcamento' | 'cronograma' | 'materiais' | 'medicoes' | 'compras' | 'tarefas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'medicoes', label: 'Diário / Medições' },
  { id: 'compras', label: 'Materiais' },
  { id: 'tarefas', label: 'Tarefas' },
]

export default function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { theme } = useProfile()
  const { canDelete } = usePermission()
  const [obra, setObra] = useState<Obra | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return (t && (t === 'arquivos' || TABS.some(x => x.id === t))) ? t : 'visao-geral'
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
    nome: '', endereco: '', responsavel: '', data_inicio: '', data_previsao: '', foto_url: '', area_m2: '', valor_contrato: '', uf: 'SP',
  })
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([])

  // Upload de foto da obra — converte a imagem em data URL (base64) e salva
  // direto no campo foto_url, sem depender de bucket externo configurado.
  // Antes só existia um campo de texto pra colar link, e o usuário relatou
  // que "inserir foto não está funcionando" (provavelmente porque esperava
  // anexar um arquivo, não colar uma URL).
  function handleFotoObra(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Selecione um arquivo de imagem.'); return }
    setUploadingFoto(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') { setUploadingFoto(false); return }
      // Reduz a imagem (máx. 1280px no maior lado, JPEG ~80%) antes de salvar como
      // data URL — evita gravar fotos de câmera (vários MB) direto na coluna TEXT.
      const img = new Image()
      img.onload = () => {
        const max = 1280
        const escala = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * escala)
        const h = Math.round(img.height * escala)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { setEditForm(f => ({ ...f, foto_url: dataUrl })); setUploadingFoto(false); return }
        ctx.drawImage(img, 0, 0, w, h)
        setEditForm(f => ({ ...f, foto_url: canvas.toDataURL('image/jpeg', 0.8) }))
        setUploadingFoto(false)
      }
      img.onerror = () => { setEditForm(f => ({ ...f, foto_url: dataUrl })); setUploadingFoto(false) }
      img.src = dataUrl
    }
    reader.onerror = () => setUploadingFoto(false)
    reader.readAsDataURL(file)
  }

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
    const [{ data }, { data: profs }] = await Promise.all([
      supabase.from('obras').select('*').eq('id', id).single(),
      // Lista dinâmica de usuários do sistema para o campo "Responsável pela obra"
      supabase.from('profiles').select('id,name').order('name'),
    ])
    setObra(data)
    setUsuarios((profs || []) as { id: string; name: string }[])
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
      valor_contrato: obra.valor_contrato != null ? String(obra.valor_contrato) : '',
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
        valor_contrato: editForm.valor_contrato ? parseFloat(String(editForm.valor_contrato).replace(',', '.')) : null,
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
        <Link href="/obras" className="text-sm mt-2 inline-block" style={{ color: 'var(--accent)' }}>â† Voltar para Obras</Link>
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
                  <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
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
                        {canDelete && (
                          <>
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
                          </>
                        )}
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
      <div className="overflow-x-auto pb-1 -mx-3 sm:mx-0 px-3 sm:px-0">
        <div className="flex gap-1 p-1 rounded-xl w-max" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {TABS.map(({ id: tabId, label }) => (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={tab === tabId
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }
              }
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setTab('arquivos')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={tab === 'arquivos'
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }
            }
          >
            Arquivos
          </button>
        </div>
      </div>

      {/* ConteÃºdo da tab */}
      <div className="animate-enter">
        {tab === 'visao-geral' && <ObraVisaoGeral obra={obra} onEdit={openEdit} />}
        {tab === 'arquivos' && <ObraArquivos obraId={id} />}
        {tab === 'orcamento' && <ObraOrcamento obraId={id} areaM2={obra.area_m2} obraName={obra.nome} obraUf={obra.uf || 'SP'} />}
        {tab === 'cronograma' && <ObraCronograma obraId={id} />}
        {tab === 'materiais' && <ObraMateriais obraId={id} />}
        {tab === 'medicoes' && <ObraMedicoes obraId={id} />}
        {tab === 'compras' && <ObraCompras obraId={id} />}
        {tab === 'tarefas' && <ObraTarefas obraId={id} />}
      </div>

      {/* Modal editar obra */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Obra" size="md">
        <div className="flex flex-col gap-4">
          <Input
            label="Nome da obra *"
            value={editForm.nome}
            onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: ResidÃªncia Silva - Caxias do Sul"
          />
          <Input
            label="Endereço"
            value={editForm.endereco}
            onChange={e => setEditForm(f => ({ ...f, endereco: e.target.value }))}
            placeholder="Rua, número, bairro, cidade"
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
                Responsável pela obra
              </label>
              <select
                value={editForm.responsavel}
                onChange={e => setEditForm(f => ({ ...f, responsavel: e.target.value }))}
                className="input-base"
              >
                <option value="">Selecione um usuário...</option>
                {/* Valor antigo (texto livre) que não está na lista de usuários */}
                {editForm.responsavel && !usuarios.some(u => u.name === editForm.responsavel) && (
                  <option value={editForm.responsavel}>{editForm.responsavel}</option>
                )}
                {usuarios.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>
            <Input
              label="Área construída (m²)"
              type="number"
              value={editForm.area_m2}
              onChange={e => setEditForm(f => ({ ...f, area_m2: e.target.value }))}
              placeholder="Ex: 120"
            />
          </div>

          <Input
            label="Valor da obra (contrato) — R$"
            type="number"
            step="0.01"
            value={editForm.valor_contrato}
            onChange={e => setEditForm(f => ({ ...f, valor_contrato: e.target.value }))}
            placeholder="Ex: 635000"
            hint="Usado no Controle Financeiro. Se vazio, usa o total do orçamento."
          />

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
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
              Foto da obra <span className="font-normal opacity-70">(opcional)</span>
            </label>
            <div className="flex items-center gap-3">
              {editForm.foto_url ? (
                <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid var(--border)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={editForm.foto_url} alt="Foto da obra" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, foto_url: '' }))}
                    className="absolute top-0.5 right-0.5 rounded-full p-0.5"
                    style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
                    title="Remover foto"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)', border: '1px dashed var(--border)' }}>
                  <HardHat size={24} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
                </div>
              )}
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <label
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors w-fit"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {uploadingFoto ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                  {uploadingFoto ? 'Carregando...' : 'Anexar imagem do dispositivo'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleFotoObra(e.target.files)} disabled={uploadingFoto} />
                </label>
                <Input
                  value={editForm.foto_url.startsWith('data:') ? '' : editForm.foto_url}
                  onChange={e => setEditForm(f => ({ ...f, foto_url: e.target.value }))}
                  placeholder="ou cole o link direto de uma imagem (https://...)"
                />
              </div>
            </div>
          </div>

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

const GRUPO_LABEL: Record<ObraFornecedor['grupo'], string> = {
  mao_de_obra: 'Mão de obra',
  demais: 'Demais (materiais, equipamentos e serviços)',
}

function ObraVisaoGeral({ obra, onEdit }: { obra: Obra; onEdit: () => void }) {
  const supabase = createClient()
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [vinculos, setVinculos] = useState<ObraFornecedor[]>([])
  const [loadingExtra, setLoadingExtra] = useState(true)
  const [pendente, setPendente] = useState<string | null>(null)
  const [agora, setAgora] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoadingExtra(true)
      const [etapasRes, fornecedoresRes, vinculosRes] = await Promise.all([
        supabase.from('etapas').select('*').eq('obra_id', obra.id),
        supabase.from('fornecedores').select('*').or(`obra_id.is.null,obra_id.eq.${obra.id}`).order('nome'),
        supabase.from('obra_fornecedores').select('*, fornecedor:fornecedores(*)').eq('obra_id', obra.id),
      ])
      if (!active) return
      setEtapas((etapasRes.data || []) as Etapa[])
      setFornecedores((fornecedoresRes.data || []) as Fornecedor[])
      setVinculos((vinculosRes.data || []) as ObraFornecedor[])
      setAgora(Date.now())
      setLoadingExtra(false)
    }
    load()
    return () => { active = false }
  }, [obra.id])

  async function toggleVinculo(fornecedorId: string, grupo: ObraFornecedor['grupo']) {
    const chave = `${fornecedorId}-${grupo}`
    const existente = vinculos.find(v => v.fornecedor_id === fornecedorId && v.grupo === grupo)
    setPendente(chave)
    if (existente) {
      await supabase.from('obra_fornecedores').delete().eq('id', existente.id)
      setVinculos(prev => prev.filter(v => v.id !== existente.id))
    } else {
      const { data } = await supabase
        .from('obra_fornecedores')
        .insert({ obra_id: obra.id, fornecedor_id: fornecedorId, grupo })
        .select('*, fornecedor:fornecedores(*)')
        .single()
      if (data) setVinculos(prev => [...prev, data as ObraFornecedor])
    }
    setPendente(null)
  }

  const totalEtapas = etapas.length
  const concluidas = etapas.filter(e => e.status === 'concluida').length
  const percentualConcluido = totalEtapas > 0 ? Math.round((concluidas / totalEtapas) * 100) : 0

  let tendencia: { texto: string; cor: string } | null = null
  if (agora != null && obra.data_inicio && obra.data_previsao) {
    const inicio = new Date(`${obra.data_inicio}T00:00:00`).getTime()
    const fim = new Date(`${obra.data_previsao}T00:00:00`).getTime()
    const totalMs = fim - inicio
    if (totalMs > 0) {
      const percentualTempo = Math.min(100, Math.max(0, Math.round(((agora - inicio) / totalMs) * 100)))
      const diferenca = percentualConcluido - percentualTempo
      if (diferenca >= 8) {
        tendencia = { texto: 'Adiantada em relação ao prazo previsto', cor: 'var(--success)' }
      } else if (diferenca <= -10) {
        tendencia = { texto: 'Atenção: ritmo abaixo do esperado para o prazo', cor: 'var(--danger)' }
      } else {
        tendencia = { texto: 'Dentro do ritmo esperado para o prazo', cor: 'var(--accent)' }
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Informações da Obra</h2>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              <Pencil size={13} /> Editar
            </button>
          </div>
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

        <div className="card p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,123,248,0.15)' }}>
              <HardHat size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Obra em andamento</h2>
          </div>

          {totalEtapas === 0 ? (
            <p className="text-sm flex-1 flex items-center" style={{ color: 'var(--text-secondary)' }}>
              Cadastre etapas no Cronograma para acompanhar o andamento previsto desta obra.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Etapas concluídas</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{concluidas} de {totalEtapas} ({percentualConcluido}%)</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${percentualConcluido}%`, background: 'var(--accent)' }} />
                </div>
              </div>

              {tendencia && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                  <TrendingUp size={16} className="mt-0.5 flex-shrink-0" style={{ color: tendencia.cor }} />
                  <p className="text-sm" style={{ color: tendencia.cor }}>{tendencia.texto}</p>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Use as abas acima para gerenciar orçamento, cronograma, compras e medições.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Truck size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Fornecedores vinculados a esta obra</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Selecione, em cada grupo, os fornecedores que atuam nesta obra. O vínculo ajuda a IA a sugerir contatos certos por contexto.
        </p>

        {loadingExtra ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : fornecedores.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            Cadastre fornecedores na aba Fornecedores para poder vinculá-los a esta obra.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['mao_de_obra', 'demais'] as ObraFornecedor['grupo'][]).map(grupo => (
              <div key={grupo} className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{GRUPO_LABEL[grupo]}</p>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                  {fornecedores.map(fornecedor => {
                    const chave = `${fornecedor.id}-${grupo}`
                    const marcado = vinculos.some(v => v.fornecedor_id === fornecedor.id && v.grupo === grupo)
                    return (
                      <label
                        key={fornecedor.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm cursor-pointer select-none transition-colors hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={pendente === chave}
                          onChange={() => toggleVinculo(fornecedor.id, grupo)}
                          className="w-4 h-4 rounded flex-shrink-0"
                        />
                        <span className="truncate">
                          {fornecedor.nome}
                          {fornecedor.apelido && <span style={{ color: 'var(--text-secondary)' }}> · {fornecedor.apelido}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
