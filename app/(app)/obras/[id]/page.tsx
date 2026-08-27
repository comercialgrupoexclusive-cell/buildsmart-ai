'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Obra, SINAPI_UFS } from '@/lib/types'
import { formatDate, STATUS_OBRA_COLOR } from '@/lib/utils'
import { HardHat, MapPin, Calendar, CalendarRange, User, ChevronLeft, MoreVertical, Pencil, Copy, Trash2, Truck, Camera, X, Loader2, FileText, FolderOpen, Banknote, LayoutDashboard, Sparkles, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useProfile } from '@/lib/profile-context'
import { usePermission } from '@/lib/permissions'
import { ObraMedicoes } from '@/components/obra/ObraMedicoes'
import { ObraOrcamento } from '@/components/obra/ObraOrcamento'
import { ObraCurvaABC } from '@/components/obra/ObraCurvaABC'
import { ObraMateriais } from '@/components/obra/ObraMateriais'
import { ObraFinanceiroTab } from '@/components/obra/ObraFinanceiroTab'
import { ObraProjetoTab } from '@/components/obra/ObraProjetoTab'
import { ObraPlanejamento2 } from '@/components/obra/ObraPlanejamento2'
import { ObraAssistenteDock } from '@/components/obra/ObraAssistenteDock'
import { OrcamentoEtapasIniciaisModal } from '@/components/obra/OrcamentoEtapasIniciaisModal'
import { ContextoTarefas } from '@/components/tarefas/ContextoTarefas'
import { useObraOrcamento } from '@/lib/obra-orcamento-context'

// Regra 1: "Cronograma" e "Planejamento 2.0" eram duas árvores concorrentes
// na UI. Só existe "Planejamento" agora — deriva do orçamento (etapa →
// subetapa → item), com Previsões/Curva S como sub-abas. O editor legado de
// cronograma (ObraCronograma.tsx, com etapas soltas por cronograma_id)
// continua no banco por compatibilidade (regra 9), só não tem mais entrada
// própria aqui.
type Tab = 'projeto' | 'orcamento' | 'planejamento' | 'suprimentos' | 'medicoes' | 'financeiro' | 'tarefas'

const TABS: { id: Tab; label: string; icon?: typeof LayoutDashboard }[] = [
  { id: 'projeto', label: 'Projeto', icon: FolderOpen },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'planejamento', label: 'Planejamento', icon: CalendarRange },
  { id: 'suprimentos', label: 'Suprimentos', icon: Truck },
  { id: 'medicoes', label: 'Medições' },
  { id: 'financeiro', label: 'Financeiro', icon: Banknote },
  { id: 'tarefas', label: 'Tarefas', icon: ClipboardList },
]

export default function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { theme } = useProfile()
  const { canDelete } = usePermission()
  const { orcamentoId, orcamentoIds, setObraId } = useObraOrcamento()
  const [obra, setObra] = useState<Obra | null>(null)
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab') as Tab | null
    return (t && TABS.some(x => x.id === t)) ? t : 'projeto'
  })
  const [loading, setLoading] = useState(true)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  // Menu de ações + edição/exclusão/duplicação
  const [menuOpen, setMenuOpen] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [editForm, setEditForm] = useState({
    nome: '', endereco: '', responsavel: '', data_inicio: '', data_previsao: '', foto_url: '', area_m2: '', valor_contrato: '', uf: 'SP',
    responsavel_tecnico: '', art_numero: '', cliente_nome: '', cliente_contato: '',
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
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [tab])

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

  useEffect(() => {
    setObraId(id)
    void Promise.resolve().then(loadObra)
    // loadObra is intentionally scoped to the current route id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, setObraId])

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
      responsavel_tecnico: obra.responsavel_tecnico || '',
      art_numero: obra.art_numero || '',
      cliente_nome: obra.cliente_nome || '',
      cliente_contato: obra.cliente_contato || '',
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
        responsavel_tecnico: editForm.responsavel_tecnico || null,
        art_numero: editForm.art_numero || null,
        cliente_nome: editForm.cliente_nome || null,
        cliente_contato: editForm.cliente_contato || null,
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
        status: 'em_projeto',
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
    try {
      // orcamentos.obra_id is ON DELETE SET NULL (um orçamento pode existir avulso),
      // então excluir a obra sozinha deixaria o orçamento órfão em vez de removê-lo.
      // orcamento_itens/orcamento_item_insumos cascadeiam de orcamentos.
      // Todo o resto vinculado à obra (etapas, materiais, medições, tarefas,
      // compra_itens, financeiro, portal etc.) já cascadeia automaticamente no banco.
      await supabase.from('orcamentos').delete().eq('obra_id', id)
      const { error } = await supabase.from('obras').delete().eq('id', id)
      if (error) {
        alert(`Erro ao excluir obra: ${error.message}`)
        setDeleting(false)
        return
      }
      router.push('/obras')
    } catch (err: unknown) {
      alert(`Erro ao excluir obra: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
      setDeleting(false)
    }
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
                  {/* Estabilização V1: Project e Obra têm telas parecidas — este
                      selo existe só para deixar inequívoco em qual das duas o
                      usuário está, reduzindo gravação no contexto errado (não
                      é um redesenho). */}
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide mb-1"
                    style={{ background: 'rgba(59,123,248,0.15)', color: 'var(--accent)' }}
                  >
                    <HardHat size={10} /> Obra
                  </span>
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
          {TABS.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              ref={tab === tabId ? activeTabRef : undefined}
              onClick={() => setTab(tabId)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
              style={tab === tabId
                ? { background: 'var(--accent)', color: 'white' }
                : { color: 'var(--text-secondary)' }
              }
            >
              {Icon && <Icon size={15} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ConteÃºdo da tab */}
      <div className="animate-enter">
        {tab === 'projeto' && <ObraProjetoTab obraId={id} obra={obra} onEdit={openEdit} />}
        {tab === 'orcamento' && <ObraOrcamentosTab obraId={id} obraNome={obra.nome} obraUf={obra.uf} obraArea={obra.area_m2} selectedId={orcamentoId} />}
        {tab === 'planejamento' && <ObraPlanejamento2 obraId={id} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
        {tab === 'suprimentos' && <ObraMateriais obraId={id} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
        {tab === 'medicoes' && <ObraMedicoes obraId={id} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
        {tab === 'financeiro' && <ObraFinanceiroTab obraId={id} orcamentoId={orcamentoId} orcamentoIds={orcamentoIds} />}
        {tab === 'tarefas' && <ContextoTarefas obraId={id} />}
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
              label="RT (Resp. Técnico)"
              value={editForm.responsavel_tecnico}
              onChange={e => setEditForm(f => ({ ...f, responsavel_tecnico: e.target.value }))}
              placeholder="Nome do engenheiro/arquiteto"
            />
            <Input
              label="N° ART / RRT"
              value={editForm.art_numero}
              onChange={e => setEditForm(f => ({ ...f, art_numero: e.target.value }))}
              placeholder="Ex: 1234567"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cliente"
              value={editForm.cliente_nome}
              onChange={e => setEditForm(f => ({ ...f, cliente_nome: e.target.value }))}
              placeholder="Nome ou empresa"
            />
            <Input
              label="Contato do cliente"
              value={editForm.cliente_contato}
              onChange={e => setEditForm(f => ({ ...f, cliente_contato: e.target.value }))}
              placeholder="Telefone ou e-mail"
            />
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

/* ─── Aba Orçamentos da Obra ─── */

type OrcSelectItem = { id: string; nome: string | null; versao: number; status: 'em_projeto' | 'ativo' | 'finalizado' | 'arquivado' }

function ObraOrcamentosTab({ obraId, obraNome, obraUf, obraArea, selectedId }: { obraId: string; obraNome: string; obraUf?: string; obraArea?: number | null; selectedId: string }) {
  const supabase = createClient()
  const { refreshOrcamentos } = useObraOrcamento()
  const [orcamentos, setOrcamentos] = useState<OrcSelectItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingMode, setCreatingMode] = useState<'manual' | 'ai' | null>(null)
  const [createError, setCreateError] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [etapasIniciaisOrcamentoId, setEtapasIniciaisOrcamentoId] = useState<string | null>(null)
  const creatingRef = useRef(false)
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [subTab, setSubTab] = useState<'itens' | 'curva-abc'>('itens')

  useEffect(() => { load() }, [obraId])

  async function load() {
    setLoading(true)
    const { data: orcs } = await supabase
      .from('orcamentos')
      .select('id, nome, versao, status')
      .eq('obra_id', obraId)
      .order('versao', { ascending: false })
    const list = (orcs || []) as OrcSelectItem[]
    setOrcamentos(list)
    setLoading(false)
  }

  async function handleRenomear() {
    if (!editName.trim() || !selectedId) return
    await supabase.from('orcamentos').update({ nome: editName.trim() }).eq('id', selectedId)
    setEditingName(false)
    await load()
  }

  async function handleCreateBudget(openAssistant: boolean) {
    if (creatingRef.current) return
    creatingRef.current = true
    setCreatingMode(openAssistant ? 'ai' : 'manual')
    setCreateError('')

    try {
      const { data: existing, error: existingError } = await supabase
        .from('orcamentos')
        .select('id, nome, versao, status')
        .eq('obra_id', obraId)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingError) throw existingError

      let budget = existing as OrcSelectItem | null
      if (!budget) {
        const { data: versions, error: versionError } = await supabase
          .from('orcamentos')
          .select('versao')
          .eq('obra_id', obraId)
          .order('versao', { ascending: false })
          .limit(1)

        if (versionError) throw versionError
        const nextVersion = Number(versions?.[0]?.versao || 0) + 1

        const { data: created, error: createBudgetError } = await supabase
          .from('orcamentos')
          .insert({
            obra_id: obraId,
            nome: obraNome.trim(),
            tipo: 'executivo',
            bdi_percentual: 25,
            status: 'em_projeto',
            versao: nextVersion,
          })
          .select('id, nome, versao, status')
          .single()

        if (createBudgetError) {
          // O indice unico da obra resolve cliques concorrentes; nesse caso usamos o registro vencedor.
          if (createBudgetError.code !== '23505') throw createBudgetError
          const { data: concurrent, error: concurrentError } = await supabase
            .from('orcamentos')
            .select('id, nome, versao, status')
            .eq('obra_id', obraId)
            .order('versao', { ascending: false })
            .limit(1)
            .single()
          if (concurrentError) throw concurrentError
          budget = concurrent as OrcSelectItem
        } else {
          budget = created as OrcSelectItem
        }
      }

      await Promise.all([load(), refreshOrcamentos()])
      if (openAssistant && budget) setAssistantOpen(true)
      else if (!existing && budget) setEtapasIniciaisOrcamentoId(budget.id)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Nao foi possivel criar o orcamento da obra.')
    } finally {
      creatingRef.current = false
      setCreatingMode(null)
    }
  }

  const selectedOrc = orcamentos.find(o => o.id === selectedId)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* O orçamento nasce antes da obra e passa a ser sua base operacional única. */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {orcamentos.length > 0 ? (
            <>
              <div className="min-w-0">
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Orçamento em uso</p>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {selectedOrc?.nome || `Orçamento v${selectedOrc?.versao || 1}`}
                </p>
              </div>
              {selectedOrc && <>
                <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  {selectedOrc.status === 'finalizado' ? 'Finalizado' : selectedOrc.status === 'ativo' ? 'Em execução' : selectedOrc.status === 'arquivado' ? 'Arquivado' : 'Em projeto'}
                </span>
                <button
                  onClick={() => { setEditName(selectedOrc.nome || ''); setEditingName(true) }}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                  title="Renomear"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Pencil size={13} />
                </button>
              </>}
            </>
          ) : (
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nenhum orçamento vinculado</span>
          )}
        </div>
      </div>

      {/* Sub-abas: Itens / Curva ABC */}
      {selectedId && (
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
          {([['itens', 'Itens'], ['curva-abc', 'Curva ABC']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: subTab === key ? 'var(--bg-card)' : 'transparent',
                color: subTab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: subTab === key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo do orçamento */}
      {selectedId ? (
        subTab === 'itens'
          ? <ObraOrcamento key={selectedId} orcamentoId={selectedId} obraId={obraId} obraName={obraNome} obraUf={obraUf} areaM2={obraArea} />
          : <ObraCurvaABC orcamentoId={selectedId} />
      ) : (
        <div className="card p-8 text-center">
          <FileText size={32} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum orçamento vinculado</p>
          <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>Crie o orçamento-base para começar a organizar esta obra.</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
            <Button
              type="button"
              onClick={() => handleCreateBudget(false)}
              loading={creatingMode === 'manual'}
              disabled={creatingMode !== null}
              icon={<FileText size={15} />}
            >
              Criar orçamento da obra
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleCreateBudget(true)}
              loading={creatingMode === 'ai'}
              disabled={creatingMode !== null}
              icon={<Sparkles size={15} />}
            >
              Criar com IA
            </Button>
          </div>
          {createError && <p className="text-xs mt-3" style={{ color: 'var(--danger)' }}>{createError}</p>}
        </div>
      )}

      <ObraAssistenteDock
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        obraId={obraId}
        obraNome={obraNome}
        obraUf={obraUf || 'SP'}
      />

      <OrcamentoEtapasIniciaisModal
        open={!!etapasIniciaisOrcamentoId}
        onClose={() => setEtapasIniciaisOrcamentoId(null)}
        obraId={obraId}
        orcamentoId={etapasIniciaisOrcamentoId || ''}
        onDone={() => load()}
      />

      {/* Modal renomear */}
      {editingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditingName(false)}>
          <div className="card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Renomear Orçamento</h3>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRenomear()}
              placeholder="Nome do orçamento"
              className="input-base w-full mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingName(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-secondary)' }}>Cancelar</button>
              <button onClick={handleRenomear} disabled={!editName.trim()} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--accent)' }}>Salvar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

