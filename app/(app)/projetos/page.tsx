'use client'

import { useState, useEffect } from 'react'
import { Plus, FolderOpen, Search, MoreVertical, Calendar, Link2, AlertTriangle, Copy, BookTemplate, ImagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import type { Profile, Proprietario, Responsavel } from '@/lib/types'
import { insertItensArvore } from '@/lib/projeto-itens'

type Projeto = {
  id: string
  nome: string
  cliente: string | null
  endereco: string | null
  data_inicio: string | null
  data_previsao: string | null
  status: 'em_andamento' | 'concluido' | 'suspenso'
  obra_id: string | null
  responsavel: string | null
  foto_url: string | null
  created_at: string
}

type Template = {
  id: string
  nome: string
  descricao: string | null
  itens: TemplateItem[]
}

type TemplateItem = {
  nome: string
  nivel: number
  children: TemplateItem[]
}

const STATUS_META = {
  em_andamento: { label: 'Em andamento', color: 'var(--accent)', bg: 'rgba(59,123,248,0.1)' },
  concluido:    { label: 'Concluído',    color: '#10b981',       bg: 'rgba(16,185,129,0.1)' },
  suspenso:     { label: 'Suspenso',     color: '#f59e0b',       bg: 'rgba(245,158,11,0.1)' },
}

const EMPTY_FORM = {
  nome: '',
  cliente: '',
  endereco: '',
  data_inicio: '',
  data_previsao: '',
  status: 'em_andamento' as Projeto['status'],
  responsavel: '',
  template_id: '',
  responsavel_tecnico_id: '',
  drive_folder_url: '',
}

function extractDriveFolderId(url: string): string | null {
  if (!url) return null
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export default function ProjetosPage() {
  const { isCliente } = usePermission()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [proprietarios, setProprietarios] = useState<Proprietario[]>([])
  const [responsaveisTecnicos, setResponsaveisTecnicos] = useState<Responsavel[]>([])
  const [projetoStats, setProjetoStats] = useState<Record<string, { total: number; done: number }>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | Projeto['status']>('em_andamento')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: p }, { data: t }, { data: profs }, { data: statsData }, { data: props }, { data: resps }] = await Promise.all([
      supabase.from('projetos').select('*').order('created_at', { ascending: false }),
      supabase.from('projeto_templates').select('*').order('nome'),
      supabase.from('profiles').select('id, name, apelido').order('name'),
      supabase.from('projeto_itens').select('projeto_id, concluido'),
      supabase.from('proprietarios').select('id, name, phone').order('name'),
      supabase.from('responsaveis').select('id, name, drive_folder_url').order('name'),
    ])
    setProjetos(p ?? [])
    setTemplates((t ?? []) as Template[])
    setProfiles((profs ?? []) as Profile[])
    setProprietarios((props ?? []) as Proprietario[])
    setResponsaveisTecnicos((resps ?? []) as Responsavel[])

    const statsMap: Record<string, { total: number; done: number }> = {}
    for (const item of statsData ?? []) {
      const pid = (item as { projeto_id: string; concluido: boolean }).projeto_id
      if (!statsMap[pid]) statsMap[pid] = { total: 0, done: 0 }
      statsMap[pid].total++
      if ((item as { projeto_id: string; concluido: boolean }).concluido) statsMap[pid].done++
    }
    setProjetoStats(statsMap)
    setLoading(false)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const supabase = createClient()
    const driveUrl = form.drive_folder_url.trim()

    let foto_url: string | null = null
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
      nome: form.nome.trim(),
      cliente: form.cliente || null,
      endereco: form.endereco || null,
      data_inicio: form.data_inicio || null,
      data_previsao: form.data_previsao || null,
      status: form.status,
      responsavel: form.responsavel || null,
      responsavel_tecnico_id: form.responsavel_tecnico_id || null,
      drive_folder_url: driveUrl || null,
      drive_folder_id: extractDriveFolderId(driveUrl),
      foto_url,
    }
    const { data, error } = await supabase.from('projetos').insert(payload).select().single()
    if (!error && data) {
      if (form.template_id) {
        const tmpl = templates.find(t => t.id === form.template_id)
        if (tmpl) await insertItensArvore(supabase, data.id, tmpl.itens, null)
      }
      await loadData()
      setShowModal(false)
      setForm(EMPTY_FORM)
      setFotoFile(null)
      setFotoPreview(null)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir projeto e todos os itens?')) return
    const supabase = createClient()
    await supabase.from('projetos').delete().eq('id', id)
    setProjetos(prev => prev.filter(p => p.id !== id))
    setMenuId(null)
  }

  async function handleDuplicate(proj: Projeto) {
    setMenuId(null)
    const supabase = createClient()
    const payload = {
      nome: proj.nome + ' (cópia)',
      cliente: proj.cliente,
      endereco: proj.endereco,
      data_inicio: proj.data_inicio,
      data_previsao: proj.data_previsao,
      status: 'em_andamento' as const,
      responsavel: proj.responsavel,
    }
    const { data: novoProjeto } = await supabase.from('projetos').insert(payload).select().single()
    if (!novoProjeto) return
    const { data: itensOrigem } = await supabase.from('projeto_itens').select('*').eq('projeto_id', proj.id).order('ordem')
    if (itensOrigem && itensOrigem.length > 0) {
      const idMap = new Map<string, string>()
      for (const item of itensOrigem) {
        const { data: novo } = await supabase.from('projeto_itens').insert({
          projeto_id: novoProjeto.id,
          parent_id: item.parent_id ? idMap.get(item.parent_id) || null : null,
          nome: item.nome,
          nivel: item.nivel,
          ordem: item.ordem,
        }).select('id').single()
        if (novo) idMap.set(item.id, novo.id)
      }
    }
    await loadData()
  }

  async function handleSaveAsTemplate(proj: Projeto) {
    setMenuId(null)
    const supabase = createClient()
    const { data: itensFlat } = await supabase.from('projeto_itens').select('*').eq('projeto_id', proj.id).order('ordem')
    if (!itensFlat || itensFlat.length === 0) {
      alert('Este projeto não tem itens para salvar como template.')
      return
    }
    function buildTree(parentId: string | null): TemplateItem[] {
      return itensFlat!
        .filter((i: any) => i.parent_id === parentId)
        .map((i: any) => ({ nome: i.nome, nivel: i.nivel, children: buildTree(i.id) }))
    }
    const arvore = buildTree(null)
    await supabase.from('projeto_templates').insert({
      nome: proj.nome,
      descricao: `Gerado a partir do projeto "${proj.nome}"`,
      itens: arvore,
    })
    alert('Template salvo com sucesso!')
  }

  const STATUS_ORDER: Record<Projeto['status'], number> = { em_andamento: 0, concluido: 1, suspenso: 2 }
  const filtered = projetos
    .filter(p => {
      const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) ||
        (p.cliente ?? '').toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'todos' || p.status === statusFilter
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  // verifica se nome digitado no campo responsável existe nos profiles
  function responsavelWarning(nome: string): boolean {
    if (!nome.trim()) return false
    return !profiles.some(
      pr => (pr.apelido || pr.name).toLowerCase() === nome.trim().toLowerCase()
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Projetos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Gestão de projetos técnicos — Disciplina → Item → Subitem
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/projetos/templates"
            className="px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            Templates
          </a>
          {!isCliente && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={16} />
              Novo Projeto
            </button>
          )}
        </div>
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            placeholder="Buscar projetos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(['todos', 'em_andamento', 'concluido', 'suspenso'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap"
              style={statusFilter === s
                ? { background: s === 'todos' ? 'var(--accent)' : STATUS_META[s as Projeto['status']]?.color, color: 'white' }
                : { color: 'var(--text-secondary)' }}
            >
              {s === 'todos' ? 'Todos' : STATUS_META[s as Projeto['status']]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de projetos */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <FolderOpen size={48} className="mx-auto opacity-20" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum projeto encontrado</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {search ? 'Tente outro termo de busca.' : 'Crie o primeiro projeto para começar.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const meta = STATUS_META[p.status]
            const stats = projetoStats[p.id]
            const pct = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : null

            return (
              <div key={p.id} className="relative">
                {/* Card inteiramente clicável */}
                <a
                  href={`/projetos/${p.id}`}
                  className="block rounded-xl border overflow-hidden hover:shadow-md transition-shadow"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                  {/* Foto ou faixa de status */}
                  {p.foto_url ? (
                    <div className="h-28 overflow-hidden">
                      <img src={p.foto_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-1" style={{ background: meta.color }} />
                  )}

                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>
                          {p.nome}
                        </p>
                        {p.cliente && (
                          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{p.cliente}</p>
                        )}
                      </div>
                      {/* Espaço reservado para o menu (absolute) */}
                      <div className="w-7 h-7 flex-shrink-0" />
                    </div>

                    {/* Badge status */}
                    <span
                      className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ color: meta.color, background: meta.bg }}
                    >
                      {meta.label}
                    </span>

                    {/* Barra de progresso */}
                    {pct !== null && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {stats!.done}/{stats!.total} itens
                          </span>
                          <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--accent)' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Datas */}
                    {(p.data_inicio || p.data_previsao) && (
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Calendar size={12} />
                        {p.data_inicio && <span>{new Date(p.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                        {p.data_inicio && p.data_previsao && <span>→</span>}
                        {p.data_previsao && <span>{new Date(p.data_previsao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                      </div>
                    )}

                    {/* Vínculo obra */}
                    {p.obra_id && (
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
                        <Link2 size={12} />
                        <span>Vinculado a obra</span>
                      </div>
                    )}
                  </div>
                </a>

                {/* Menu flutuante (fora do <a> para evitar navegação) */}
                <div className="absolute top-5 right-3">
                  <button
                    className="p-1 rounded hover:bg-[var(--bg-secondary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuId(menuId === p.id ? null : p.id) }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuId === p.id && (
                    <div
                      className="absolute right-0 top-8 z-50 rounded-lg shadow-xl border min-w-[160px] py-1"
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                      <a
                        href={`/projetos/${p.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--bg-secondary)]"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        Editar
                      </a>
                      {!isCliente && (
                        <>
                          <button
                            onClick={() => handleDuplicate(p)}
                            className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-[var(--bg-secondary)]"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Copy size={14} />
                            Duplicar
                          </button>
                          <button
                            onClick={() => handleSaveAsTemplate(p)}
                            className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left hover:bg-[var(--bg-secondary)]"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <BookTemplate size={14} />
                            Salvar como template
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-red-400 hover:bg-red-500/10"
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal novo projeto */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Novo Projeto</h2>
              <button onClick={() => setShowModal(false)} style={{ color: 'var(--text-secondary)' }}>✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Template no topo */}
              {templates.length > 0 && (
                <Field label="Template">
                  <select className="input-base" value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}>
                    <option value="">Nenhum (começar em branco)</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Nome *">
                <input
                  className="input-base"
                  placeholder="Ex: Residencial Vila Nova"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                />
              </Field>
              <Field label="Proprietário">
                <select
                  className="input-base"
                  value={form.cliente}
                  onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))}
                >
                  <option value="">— Selecionar ou deixar em branco —</option>
                  {proprietarios.map(p => (
                    <option key={p.id} value={p.name}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</option>
                  ))}
                </select>
                {proprietarios.length === 0 && (
                  <p className="text-xs mt-1 opacity-60" style={{ color: 'var(--text-secondary)' }}>
                    Cadastre proprietários em Contatos para usar esta lista.
                  </p>
                )}
              </Field>
              <Field label="Endereço">
                <input className="input-base" placeholder="Rua, cidade..." value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início">
                  <input type="date" className="input-base" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </Field>
                <Field label="Previsão">
                  <input type="date" className="input-base" value={form.data_previsao} onChange={e => setForm(f => ({ ...f, data_previsao: e.target.value }))} />
                </Field>
              </div>

              {/* Responsável com autocomplete de usuários */}
              <Field label="Responsável">
                <div className="relative">
                  <input
                    className="input-base"
                    placeholder="Digite ou selecione um usuário"
                    list="responsavel-list"
                    value={form.responsavel}
                    onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
                  />
                  <datalist id="responsavel-list">
                    {profiles.map(pr => (
                      <option key={pr.id} value={pr.apelido || pr.name} />
                    ))}
                  </datalist>
                  {responsavelWarning(form.responsavel) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />
                      <span className="text-xs" style={{ color: 'var(--warning)' }}>
                        Usuário não cadastrado no sistema
                      </span>
                    </div>
                  )}
                </div>
              </Field>

              {/* Responsável Técnico */}
              <Field label="Responsável Técnico (Drive)">
                <select
                  className="input-base"
                  value={form.responsavel_tecnico_id}
                  onChange={e => {
                    const id = e.target.value
                    const resp = responsaveisTecnicos.find(r => r.id === id)
                    setForm(f => ({
                      ...f,
                      responsavel_tecnico_id: id,
                      drive_folder_url: resp?.drive_folder_url ?? f.drive_folder_url,
                    }))
                  }}
                >
                  <option value="">— Selecionar responsável técnico —</option>
                  {responsaveisTecnicos.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                {responsaveisTecnicos.length === 0 && (
                  <p className="text-xs mt-1 opacity-60" style={{ color: 'var(--text-secondary)' }}>
                    Cadastre responsáveis técnicos em Contatos para usar esta lista.
                  </p>
                )}
              </Field>

              {/* Pasta Drive do projeto */}
              <Field label="Pasta do Drive (projeto)">
                <input
                  type="url"
                  className="input-base"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={form.drive_folder_url}
                  onChange={e => setForm(f => ({ ...f, drive_folder_url: e.target.value }))}
                />
                {form.drive_folder_url && (
                  <p className="text-xs mt-1" style={{ color: extractDriveFolderId(form.drive_folder_url) ? '#10b981' : '#f59e0b' }}>
                    {extractDriveFolderId(form.drive_folder_url)
                      ? `✓ ID: ${extractDriveFolderId(form.drive_folder_url)}`
                      : '⚠ URL não reconhecida — use o formato drive.google.com/drive/folders/...'}
                  </p>
                )}
              </Field>

              {/* Foto do projeto */}
              <Field label="Foto do projeto">
                <div className="flex items-center gap-3">
                  {fotoPreview ? (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--border)' }}>
                      <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => { setFotoFile(null); setFotoPreview(null) }}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white"
                        style={{ background: 'rgba(0,0,0,0.6)' }}
                      >✕</button>
                    </div>
                  ) : (
                    <label
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <ImagePlus size={16} />
                      <span className="text-sm">Selecionar imagem</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setFotoFile(file)
                            setFotoPreview(URL.createObjectURL(file))
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </Field>
            </div>

            <div className="flex justify-end gap-2 px-6 pb-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nome.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {saving ? 'Salvando...' : 'Criar Projeto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fechar menu ao clicar fora */}
      {menuId && <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />}

      <style jsx global>{`
        .input-base {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-primary);
          outline: none;
        }
        .input-base:focus { border-color: var(--accent); }
      `}</style>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}
