'use client'

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Pencil, LayoutList, Info, CalendarDays, LayoutDashboard, Sparkles, ImagePlus, Trash2, User, MapPin, Clock, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import { ProjetoCascata, buildProjetoTree, type ProjetoItemDependencia, type ProjetoItemNode } from '@/components/projeto/ProjetoCascata'
import { ProjetoCronograma } from '@/components/projeto/ProjetoCronograma'
import { ProjetoAssistenteIA } from '@/components/projeto/ProjetoAssistenteIA'
import { TourManager } from '@/components/tour/TourManager'
import dynamic from 'next/dynamic'

const ExcalidrawBoard = dynamic(
  () => import('@/components/board/ExcalidrawBoard').then(m => ({ default: m.ExcalidrawBoard })),
  { ssr: false, loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Carregando board…
    </div>
  )},
)

type Projeto = {
  id: string
  nome: string
  cliente: string | null
  endereco: string | null
  data_inicio: string | null
  data_previsao: string | null
  status: 'aguardando' | 'em_andamento' | 'concluido' | 'suspenso'
  obra_id: string | null
  responsavel: string | null
  foto_url: string | null
  created_at: string
}

const STATUS_OPTIONS = [
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando',    label: 'Aguardando' },
  { value: 'concluido',    label: 'Concluído' },
  { value: 'suspenso',     label: 'Suspenso' },
]

export default function ProjetoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { isCliente } = usePermission()
  const searchParams = useSearchParams()
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [itens, setItens] = useState<ProjetoItemNode[]>([])
  const [tree, setTree] = useState<ProjetoItemNode[]>([])
  const [dependencias, setDependencias] = useState<ProjetoItemDependencia[]>([])
  const [tab, setTab] = useState<'estrutura' | 'dados' | 'cronograma' | 'board' | 'tour' | 'ia'>(
    (searchParams.get('tab') as 'estrutura' | 'dados' | 'cronograma' | 'board' | 'tour' | 'ia') ?? 'estrutura'
  )
  const [profiles, setProfiles] = useState<{ id: string; name: string; apelido: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDados, setEditingDados] = useState(false)
  const [dadosForm, setDadosForm] = useState<Partial<Projeto>>({})
  const [saving, setSaving] = useState(false)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)

  const allFlat = itens
  const totalItens = allFlat.length
  const concluidosCount = allFlat.filter(i => i.concluido).length
  const progresso = totalItens > 0 ? Math.round((concluidosCount / totalItens) * 100) : 0

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: p }, { data: its }, { data: profs }, depsRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', id).single(),
      supabase.from('projeto_itens').select('*').eq('projeto_id', id).order('ordem'),
      supabase.from('profiles').select('id, name, apelido').order('name'),
      supabase.from('projeto_item_dependencias').select('*').eq('projeto_id', id),
    ])
    if (!depsRes.error) setDependencias((depsRes.data ?? []) as ProjetoItemDependencia[])
    setProfiles((profs ?? []) as { id: string; name: string; apelido: string | null }[])
    if (p) {
      setProjeto(p)
      setDadosForm(p)
    }
    const flat = (its ?? []) as ProjetoItemNode[]
    setItens(flat)
    setTree(buildProjetoTree(flat))
    setLoading(false)
  }

  // ── Cascata handlers ──

  async function handleToggle(itemId: string, concluido: boolean) {
    const supabase = createClient()
    const descendants = collectDescendants(itens, itemId)
    const allIds = [itemId, ...descendants]
    await supabase.from('projeto_itens').update({ concluido }).in('id', allIds)
    const updated = itens.map(i => allIds.includes(i.id) ? { ...i, concluido } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
  }

  async function handleAdd(parentId: string | null, nivel: number, nome: string) {
    const supabase = createClient()
    const ordem = itens.filter(i => i.parent_id === parentId).length
    const { data } = await supabase.from('projeto_itens').insert({
      projeto_id: id,
      parent_id: parentId,
      nome,
      nivel,
      ordem,
    }).select().single()
    if (data) {
      const updated = [...itens, data as ProjetoItemNode]
      setItens(updated)
      setTree(buildProjetoTree(updated))
    }
  }

  async function handleDelete(itemId: string) {
    if (!confirm('Excluir item e todos os subitens?')) return
    const supabase = createClient()
    // Coletar todos IDs filhos recursivamente
    const toDelete = collectDescendants(itens, itemId)
    toDelete.push(itemId)
    await supabase.from('projeto_itens').delete().in('id', toDelete)
    const updated = itens.filter(i => !toDelete.includes(i.id))
    setItens(updated)
    setTree(buildProjetoTree(updated))
  }

  // Reagenda datas a partir das predecessoras e persiste os itens alterados
  async function reschedule(baseItens: ProjetoItemNode[], deps: ProjetoItemDependencia[]): Promise<ProjetoItemNode[]> {
    const changes = scheduleFromDependencies(baseItens, deps)
    if (changes.size === 0) return baseItens
    const updated = baseItens.map(i => changes.has(i.id) ? { ...i, ...changes.get(i.id)! } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
    const supabase = createClient()
    await Promise.all(
      [...changes.entries()].map(([cid, d]) =>
        supabase.from('projeto_itens').update({ data_inicio: d.data_inicio, data_prazo: d.data_prazo }).eq('id', cid)
      )
    )
    return updated
  }

  async function handleUpdateItem(itemId: string, fields: Partial<Pick<ProjetoItemNode, 'responsavel' | 'data_inicio' | 'data_prazo' | 'is_marco' | 'status'>> & { concluido?: boolean }) {
    const updated = itens.map(i => i.id === itemId ? { ...i, ...fields } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
    const supabase = createClient()
    const { error } = await supabase.from('projeto_itens').update(fields).eq('id', itemId)
    if (error) {
      alert('Erro ao salvar: ' + error.message)
      return
    }
    // Mexeu em data → propaga para as tarefas dependentes
    if ('data_inicio' in fields || 'data_prazo' in fields) {
      await reschedule(updated, dependencias)
    }
  }

  async function handleSavePredecessoras(itemId: string, predecessorIds: string[]) {
    const supabase = createClient()
    const atuais = dependencias.filter(d => d.item_id === itemId)
    const nextSet = new Set(predecessorIds)
    const remover = atuais.filter(d => !nextSet.has(d.predecessor_id))
    const existentes = new Set(atuais.map(d => d.predecessor_id))
    const inserir = predecessorIds.filter(predecessorId => !existentes.has(predecessorId))

    // Reagenda as datas conforme as novas predecessoras (Fim→Início)
    const depsAtualizadas: ProjetoItemDependencia[] = [
      ...dependencias.filter(d => d.item_id !== itemId),
      ...predecessorIds.map(predecessor_id => ({ id: `sched-${itemId}-${predecessor_id}`, projeto_id: id, item_id: itemId, predecessor_id })),
    ]
    void reschedule(itens, depsAtualizadas)

    setDependencias(prev => [
      ...prev.filter(d => d.item_id !== itemId || nextSet.has(d.predecessor_id)),
      ...inserir.map(predecessorId => ({
        id: `local-${itemId}-${predecessorId}`,
        projeto_id: id,
        item_id: itemId,
        predecessor_id: predecessorId,
      })),
    ])

    try {
      if (remover.length) {
        await Promise.all(remover.map(dep => supabase.from('projeto_item_dependencias').delete().eq('id', dep.id)))
      }
      if (inserir.length) {
        const { data, error } = await supabase
          .from('projeto_item_dependencias')
          .insert(inserir.map(predecessor_id => ({ projeto_id: id, item_id: itemId, predecessor_id })))
          .select('*')
        if (error) throw error
        if (data) {
          setDependencias(prev => [
            ...prev.filter(d => d.item_id !== itemId || nextSet.has(d.predecessor_id) && !String(d.id).startsWith('local-')),
            ...(data as ProjetoItemDependencia[]),
          ])
        }
      }
    } catch (error) {
      console.warn('[Projetos] Dependencias ainda sem tabela aplicada:', error)
    }
  }

  async function handleRename(itemId: string, nome: string) {
    const supabase = createClient()
    await supabase.from('projeto_itens').update({ nome }).eq('id', itemId)
    const updated = itens.map(i => i.id === itemId ? { ...i, nome } : i)
    setItens(updated)
    setTree(buildProjetoTree(updated))
  }

  // ── Dados gerais ──

  async function saveDados() {
    if (!projeto) return
    setSaving(true)
    const supabase = createClient()

    let foto_url = dadosForm.foto_url ?? projeto.foto_url
    if (fotoFile) {
      try {
        const ext = fotoFile.name.split('.').pop() || 'jpg'
        const path = `projetos/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('project-files').upload(path, fotoFile)
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(path)
          foto_url = urlData.publicUrl
        } else {
          foto_url = await fileToDataUrl(fotoFile)
        }
      } catch {
        foto_url = await fileToDataUrl(fotoFile)
      }
    }

    const payload = {
      nome: dadosForm.nome ?? projeto.nome,
      cliente: dadosForm.cliente ?? null,
      endereco: dadosForm.endereco ?? null,
      data_inicio: dadosForm.data_inicio ?? null,
      data_previsao: dadosForm.data_previsao ?? null,
      status: dadosForm.status ?? projeto.status,
      responsavel: dadosForm.responsavel ?? null,
      foto_url,
      updated_at: new Date().toISOString(),
    }
    const { data } = await supabase.from('projetos').update(payload).eq('id', id).select().single()
    if (data) {
      setProjeto(data)
      setEditingDados(false)
      setFotoFile(null)
      setFotoPreview(null)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  if (!projeto) {
    return (
      <div className="text-center py-32" style={{ color: 'var(--text-secondary)' }}>
        Projeto não encontrado.
        <Link href="/projetos" className="block mt-3 text-sm" style={{ color: 'var(--accent)' }}>← Voltar</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Link href="/projetos" className="p-2 rounded-lg hover:bg-[var(--bg-card)]" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>{projeto.nome}</h1>
          {projeto.cliente && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{projeto.cliente}</p>}
        </div>
        {/* Barra de progresso */}
        {totalItens > 0 && (
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progresso}%`, background: 'var(--accent)' }} />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{progresso}%</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="max-w-full overflow-x-auto pb-1">
        <div className="flex items-center gap-1 p-1 rounded-lg w-max" style={{ background: 'var(--bg-secondary)' }}>
        {([
          { key: 'estrutura',  label: 'Estrutura',    icon: LayoutList },
          { key: 'cronograma', label: 'Cronograma',   icon: CalendarDays },
          { key: 'board',      label: 'Board',        icon: LayoutDashboard },
          { key: 'tour',       label: 'Tour 360°',    icon: ImagePlus },
          { key: 'dados',      label: 'Dados Gerais', icon: Info },
          { key: 'ia',         label: 'Assistente IA', icon: Sparkles },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex-shrink-0"
            style={tab === key
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        </div>
      </div>

      {/* Conteúdo */}
      {tab === 'estrutura' && (
        <div className="rounded-xl border p-3 sm:p-4 min-w-0 overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {itens.length === 0 ? (
            <p className="text-sm mb-4 opacity-60" style={{ color: 'var(--text-secondary)' }}>
              Estrutura vazia — adicione uma disciplina para começar.
            </p>
          ) : (
            <p className="hidden sm:block text-xs mb-3 opacity-50" style={{ color: 'var(--text-secondary)' }}>
              Passe o mouse sobre um item para ver as ações · clique no ✏ para renomear · checkbox marca concluído e todos os filhos
            </p>
          )}
          <ProjetoCascata
            itens={tree}
            projetoId={projeto.id}
            canEdit={!isCliente}
            profiles={profiles}
            dependencias={dependencias}
            onToggle={handleToggle}
            onAdd={handleAdd}
            onDelete={handleDelete}
            onRename={handleRename}
            onUpdateItem={(id, fields) => handleUpdateItem(id, fields)}
            onSavePredecessoras={handleSavePredecessoras}
          />
        </div>
      )}

      {tab === 'cronograma' && (
        <ProjetoCronograma
            projetoId={projeto.id}
            itens={itens}
            tree={tree}
            deps={dependencias}
            profiles={profiles}
            canEdit={!isCliente}
            onAdd={handleAdd}
            onDelete={handleDelete}
            onRename={handleRename}
            onToggle={handleToggle}
            onUpdateItem={(id, fields) => handleUpdateItem(id, fields)}
            onSavePredecessoras={handleSavePredecessoras}
          />
      )}

      {tab === 'board' && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', height: 'calc(100vh - 200px)', minHeight: 520 }}>
          <ExcalidrawBoard projectId={projeto.id} />
        </div>
      )}
      {tab === 'tour' && <TourManager projectId={projeto.id} obraId={projeto.obra_id} />}

      {tab === 'ia' && (
        <ProjetoAssistenteIA projeto={projeto} itens={itens} onReload={loadData} />
      )}

      {tab === 'dados' && (
        <div className="space-y-4">
          {/* Header card */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            {/* Foto banner */}
            {(fotoPreview || projeto.foto_url) && (
              <div className="relative w-full h-48 sm:h-56">
                <img src={fotoPreview || projeto.foto_url!} alt="Foto do projeto" className="w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)' }} />
                {editingDados && (
                  <button
                    onClick={() => { setFotoFile(null); setFotoPreview(null); setDadosForm(f => ({ ...f, foto_url: null })) }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                  >
                    <Trash2 size={14} className="text-white" />
                  </button>
                )}
              </div>
            )}

            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Informações do Projeto</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Criado em {projeto.created_at ? new Date(projeto.created_at).toLocaleDateString('pt-BR') : '—'}
                  </p>
                </div>
                {!isCliente && !editingDados && (
                  <button onClick={() => setEditingDados(true)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-[var(--bg-secondary)] transition-colors flex-shrink-0"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <DadosField label="Nome do Projeto" icon={<Info size={14} />} editing={editingDados} value={dadosForm.nome ?? ''} onChange={v => setDadosForm(f => ({ ...f, nome: v }))} />
                <DadosField label="Cliente" icon={<User size={14} />} editing={editingDados} value={dadosForm.cliente ?? ''} onChange={v => setDadosForm(f => ({ ...f, cliente: v }))} />
                <DadosField label="Endereço" icon={<MapPin size={14} />} editing={editingDados} value={dadosForm.endereco ?? ''} onChange={v => setDadosForm(f => ({ ...f, endereco: v }))} className="sm:col-span-2" />

                <DadosField label="Data de Início" icon={<CalendarDays size={14} />} editing={editingDados} type="date" value={dadosForm.data_inicio ?? ''} onChange={v => setDadosForm(f => ({ ...f, data_inicio: v }))} />
                <DadosField label="Previsão de Término" icon={<Clock size={14} />} editing={editingDados} type="date" value={dadosForm.data_previsao ?? ''} onChange={v => setDadosForm(f => ({ ...f, data_previsao: v }))} />
                <DadosField label="Responsável" icon={<User size={14} />} editing={editingDados} value={dadosForm.responsavel ?? ''} onChange={v => setDadosForm(f => ({ ...f, responsavel: v }))} />

                {editingDados ? (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={14} /> Status
                    </label>
                    <select
                      className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors focus:border-[var(--accent)]"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      value={dadosForm.status ?? 'em_andamento'}
                      onChange={e => setDadosForm(f => ({ ...f, status: e.target.value as Projeto['status'] }))}
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={14} /> Status
                    </label>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: projeto.status === 'em_andamento' ? 'rgba(59,123,248,0.12)' :
                          projeto.status === 'concluido' ? 'rgba(16,185,129,0.12)' :
                          projeto.status === 'suspenso' ? 'rgba(239,68,68,0.12)' : 'rgba(107,114,128,0.12)',
                        color: projeto.status === 'em_andamento' ? '#3B7BF8' :
                          projeto.status === 'concluido' ? '#10B981' :
                          projeto.status === 'suspenso' ? '#EF4444' : '#6B7280',
                      }}>
                      {STATUS_OPTIONS.find(o => o.value === projeto.status)?.label ?? '—'}
                    </span>
                  </div>
                )}
              </div>

              {/* Foto upload */}
              {editingDados && (
                <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <ImagePlus size={16} />
                    <span className="text-sm">{projeto.foto_url || fotoPreview ? 'Trocar foto de capa' : 'Adicionar foto de capa'}</span>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const file = e.target.files?.[0]; if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)) } }} />
                  </label>
                </div>
              )}

              {/* Resumo rápido */}
              {!editingDados && totalItens > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-center p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                    <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{totalItens}</p>
                    <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Itens</p>
                  </div>
                  <div className="text-center p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                    <p className="text-lg font-bold" style={{ color: '#10B981' }}>{concluidosCount}</p>
                    <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Concluídos</p>
                  </div>
                  <div className="text-center p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
                    <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{progresso}%</p>
                    <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>Progresso</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {editingDados && (
                <div className="flex justify-end gap-2 mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button onClick={() => { setEditingDados(false); setDadosForm(projeto); setFotoFile(null); setFotoPreview(null) }}
                    className="px-4 py-2 text-sm border rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                    Cancelar
                  </button>
                  <button onClick={saveDados} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                    style={{ background: 'var(--accent)' }}>
                    <Save size={14} />
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function DadosField({ label, value, editing, onChange, type = 'text', className = '', icon }: {
  label: string
  value: string
  editing: boolean
  onChange: (v: string) => void
  type?: string
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {icon} {label}
      </label>
      {editing ? (
        <input
          type={type}
          className="w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors focus:border-[var(--accent)]"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <p className="text-sm" style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {type === 'date' && value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : (value || '—')}
        </p>
      )}
    </div>
  )
}

function collectDescendants(itens: ProjetoItemNode[], parentId: string): string[] {
  const children = itens.filter(i => i.parent_id === parentId).map(i => i.id)
  return children.flatMap(cid => [cid, ...collectDescendants(itens, cid)])
}

// ── Agendamento por predecessoras (Fim→Início, como no MS Project) ──────────
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
}
function shiftDate(d: string, n: number): string {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}

/**
 * Recalcula as datas a partir das predecessoras: uma tarefa começa no dia
 * seguinte ao término da(s) predecessora(s). Empurra apenas para frente (não
 * antecipa), preservando a duração; um item pai arrasta toda a subárvore.
 * Retorna só os itens cujas datas mudaram.
 */
function scheduleFromDependencies(
  itens: ProjetoItemNode[],
  deps: ProjetoItemDependencia[],
): Map<string, { data_inicio: string | null; data_prazo: string | null }> {
  const work = new Map(itens.map(i => [i.id, { ...i }]))
  const childrenOf = new Map<string, string[]>()
  itens.forEach(i => {
    if (i.parent_id) {
      const arr = childrenOf.get(i.parent_id) ?? []
      arr.push(i.id)
      childrenOf.set(i.parent_id, arr)
    }
  })

  const effFim = (idv: string): string | null => {
    const node = work.get(idv); if (!node) return null
    const kids = childrenOf.get(idv)
    if (kids?.length) {
      const fims = kids.map(effFim).filter(Boolean) as string[]
      return fims.length ? fims.reduce((a, b) => (a > b ? a : b)) : node.data_prazo
    }
    return node.data_prazo
  }
  const effInicio = (idv: string): string | null => {
    const node = work.get(idv); if (!node) return null
    const kids = childrenOf.get(idv)
    if (kids?.length) {
      const ins = kids.map(effInicio).filter(Boolean) as string[]
      return ins.length ? ins.reduce((a, b) => (a < b ? a : b)) : node.data_inicio
    }
    return node.data_inicio
  }
  const descendants = (idv: string): string[] => {
    const kids = childrenOf.get(idv) ?? []
    return kids.flatMap(k => [k, ...descendants(k)])
  }
  const shiftSubtree = (idv: string, delta: number) => {
    for (const cid of [idv, ...descendants(idv)]) {
      const n = work.get(cid); if (!n) continue
      if (n.data_inicio) n.data_inicio = shiftDate(n.data_inicio, delta)
      if (n.data_prazo) n.data_prazo = shiftDate(n.data_prazo, delta)
    }
  }

  // Ignora predecessoras que sejam ancestrais/descendentes do próprio item
  // (evita ciclo pai↔filho que empurraria as datas indefinidamente)
  const parentOf = new Map(itens.map(i => [i.id, i.parent_id]))
  const isAncestor = (a: string, b: string): boolean => {
    let cur = parentOf.get(b) ?? null
    while (cur) { if (cur === a) return true; cur = parentOf.get(cur) ?? null }
    return false
  }

  const predsOf = new Map<string, string[]>()
  deps.forEach(d => {
    if (d.predecessor_id === d.item_id || isAncestor(d.predecessor_id, d.item_id) || isAncestor(d.item_id, d.predecessor_id)) return
    const arr = predsOf.get(d.item_id) ?? []
    arr.push(d.predecessor_id)
    predsOf.set(d.item_id, arr)
  })

  // Ponto fixo: repete até estabilizar (resolve cadeias A→B→C)
  for (let iter = 0; iter < itens.length + 5; iter++) {
    let changed = false
    for (const [itemId, preds] of predsOf) {
      const node = work.get(itemId); if (!node) continue
      let maxFim: string | null = null
      for (const p of preds) {
        const f = effFim(p)
        if (f && (!maxFim || f > maxFim)) maxFim = f
      }
      if (!maxFim) continue
      const target = shiftDate(maxFim, 1) // começa no dia seguinte ao término da predecessora
      const curStart = effInicio(itemId)
      if (!curStart) {
        // Sem início efetivo (folha sem data OU pai cujos filhos não têm data):
        // ancora o próprio início no dia seguinte ao término da predecessora.
        node.data_inicio = target
        if (!node.data_prazo || node.data_prazo < target) node.data_prazo = target
        changed = true
      } else if (target !== curStart) {
        // ASAP: alinha o início logo após o término da predecessora
        // (empurra para frente ou puxa para trás, mantendo a duração)
        const delta = daysBetween(curStart, target)
        if (delta !== 0) { shiftSubtree(itemId, delta); changed = true }
      }
    }
    if (!changed) break
  }

  const result = new Map<string, { data_inicio: string | null; data_prazo: string | null }>()
  itens.forEach(orig => {
    const w = work.get(orig.id)!
    if (w.data_inicio !== orig.data_inicio || w.data_prazo !== orig.data_prazo) {
      result.set(orig.id, { data_inicio: w.data_inicio, data_prazo: w.data_prazo })
    }
  })
  return result
}
