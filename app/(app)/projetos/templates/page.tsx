'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Save, ArrowLeft, BookTemplate, Sparkles, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'

type TemplateItem = {
  nome: string
  nivel: number
  children: TemplateItem[]
}

type Template = {
  id: string
  nome: string
  descricao: string | null
  itens: TemplateItem[]
  created_at: string
}

const EMPTY_FORM = { nome: '', descricao: '' }

export default function ProjetoTemplatesPage() {
  const { isAdmin, isCliente } = usePermission()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [itens, setItens] = useState<TemplateItem[]>([])
  const [saving, setSaving] = useState(false)
  const [iaDescricao, setIaDescricao] = useState('')
  const [iaNome, setIaNome] = useState('')
  const [gerandoIA, setGerandoIA] = useState(false)
  const [erroIA, setErroIA] = useState<string | null>(null)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('projeto_templates').select('*').order('nome')
    setTemplates((data ?? []) as Template[])
    setLoading(false)
  }

  function openNew() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setItens([])
    setShowForm(true)
  }

  function openEdit(t: Template) {
    setEditId(t.id)
    setForm({ nome: t.nome, descricao: t.descricao ?? '' })
    setItens(JSON.parse(JSON.stringify(t.itens))) // deep clone
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = { nome: form.nome.trim(), descricao: form.descricao || null, itens }
    if (editId) {
      await supabase.from('projeto_templates').update(payload).eq('id', editId)
    } else {
      await supabase.from('projeto_templates').insert(payload)
    }
    await loadTemplates()
    setShowForm(false)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este template?')) return
    const supabase = createClient()
    await supabase.from('projeto_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  async function handleGerarComIA() {
    if (!iaNome.trim()) return
    setGerandoIA(true)
    setErroIA(null)
    try {
      const res = await fetch('/api/projetos/estrutura-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeProjeto: iaNome.trim(), descricao: iaDescricao.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar estrutura')
      setEditId(null)
      setForm({ nome: iaNome.trim(), descricao: iaDescricao.trim() || '' })
      setItens(data.itens.map((i: any) => ({ ...i, children: i.children || [] })))
      setShowForm(true)
      setIaNome('')
      setIaDescricao('')
    } catch (err) {
      setErroIA(err instanceof Error ? err.message : 'Erro ao gerar')
    } finally {
      setGerandoIA(false)
    }
  }

  // ── Edição de itens do template ──

  function addItem(path: number[], nivel: number) {
    const clone = JSON.parse(JSON.stringify(itens)) as TemplateItem[]
    const parent = getNode(clone, path.slice(0, -1))
    const target = parent ? parent.children : clone
    target.push({ nome: 'Novo item', nivel, children: [] })
    setItens(clone)
  }

  function removeItem(path: number[]) {
    const clone = JSON.parse(JSON.stringify(itens)) as TemplateItem[]
    const parent = getNode(clone, path.slice(0, -1))
    const target = parent ? parent.children : clone
    target.splice(path[path.length - 1], 1)
    setItens(clone)
  }

  function renameItem(path: number[], nome: string) {
    const clone = JSON.parse(JSON.stringify(itens)) as TemplateItem[]
    const node = getNode(clone, path)!
    node.nome = nome
    setItens(clone)
  }

  function getNode(arr: TemplateItem[], path: number[]): TemplateItem | null {
    if (path.length === 0) return null
    let cur: TemplateItem = arr[path[0]]
    for (let i = 1; i < path.length; i++) cur = cur.children[path[i]]
    return cur
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/projetos" className="p-2 rounded-lg hover:bg-[var(--bg-card)]" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={18} />
          </a>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Templates de Projeto</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Estruturas reutilizáveis para novos projetos</p>
          </div>
        </div>
        {!isCliente && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={16} />
            Novo Template
          </button>
        )}
      </div>

      {/* IA para gerar template */}
      {!isCliente && !showForm && (
        <div className="rounded-xl border p-5 space-y-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Criar template com IA</h2>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Descreva o tipo de projeto e a IA gera a estrutura de disciplinas, itens e subitens automaticamente.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Nome do template (ex: Residencial 2 pavimentos)"
              value={iaNome}
              onChange={e => setIaNome(e.target.value)}
              disabled={gerandoIA}
            />
            <input
              className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Descrição (ex: reforma apartamento 80m², 2 banheiros...)"
              value={iaDescricao}
              onChange={e => setIaDescricao(e.target.value)}
              disabled={gerandoIA}
            />
          </div>
          <button
            onClick={handleGerarComIA}
            disabled={gerandoIA || !iaNome.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {gerandoIA ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {gerandoIA ? 'Gerando...' : 'Gerar com IA'}
          </button>
          {erroIA && <p className="text-sm text-red-400">{erroIA}</p>}
        </div>
      )}

      {showForm ? (
        /* ── Editor de template ── */
        <div className="rounded-xl border p-6 space-y-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {editId ? 'Editar Template' : 'Novo Template'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Nome *</label>
              <input
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="Ex: Projeto Residencial"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Descrição</label>
              <input
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                placeholder="Breve descrição"
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
          </div>

          {/* Árvore editável */}
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Estrutura (Disciplina → Item → Subitem)</p>
            <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
              {itens.map((item, i) => (
                <TemplateNodeEditor
                  key={i}
                  item={item}
                  path={[i]}
                  onRename={renameItem}
                  onAdd={addItem}
                  onRemove={removeItem}
                />
              ))}
              <button
                onClick={() => addItem([itens.length], 1)}
                className="text-sm px-3 py-1.5 rounded-lg border border-dashed w-full text-left"
                style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
              >
                + Adicionar disciplina
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border rounded-lg"
              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.nome.trim()}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <Save size={14} />
              {saving ? 'Salvando...' : 'Salvar Template'}
            </button>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <BookTemplate size={48} className="mx-auto opacity-20" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Nenhum template cadastrado</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Templates agilizam a criação de projetos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div
              key={t.id}
              className="rounded-xl border p-4 space-y-3"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.nome}</p>
                  {t.descricao && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.descricao}</p>}
                </div>
                {!isCliente && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1.5 rounded hover:bg-[var(--bg-secondary)] text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t.itens.length} disciplina{t.itens.length !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateNodeEditor({ item, path, onRename, onAdd, onRemove }: {
  item: TemplateItem
  path: number[]
  onRename: (path: number[], nome: string) => void
  onAdd: (path: number[], nivel: number) => void
  onRemove: (path: number[]) => void
}) {
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(item.nome)
  const indent = (item.nivel - 1) * 16
  const canHaveChildren = item.nivel < 3
  const NIVEL_LABELS = ['', 'Disciplina', 'Item', 'Subitem']

  function commit() {
    const trimmed = val.trim()
    if (trimmed) onRename(path, trimmed)
    else setVal(item.nome)
    setEditing(false)
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 group hover:bg-[var(--bg-card)] transition-colors"
        style={{ marginLeft: `${indent}px` }}
      >
        <button
          className="w-4 flex-shrink-0"
          style={{ visibility: item.children.length > 0 ? 'visible' : 'hidden', color: 'var(--text-secondary)' }}
          onClick={() => setOpen(o => !o)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {editing ? (
          <input
            autoFocus
            className="flex-1 bg-transparent border-b border-[var(--accent)] outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(item.nome); setEditing(false) } }}
          />
        ) : (
          <span
            className="flex-1 text-sm cursor-pointer"
            style={{ color: 'var(--text-primary)', fontWeight: item.nivel === 1 ? 600 : 400 }}
            onDoubleClick={() => setEditing(true)}
          >
            {item.nome}
          </span>
        )}

        <span className="text-[10px] opacity-40" style={{ color: 'var(--text-secondary)' }}>{NIVEL_LABELS[item.nivel]}</span>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          {canHaveChildren && (
            <button
              onClick={() => { setOpen(true); onAdd([...path, item.children.length], item.nivel + 1) }}
              className="p-1 rounded text-[var(--accent)] hover:bg-[var(--bg-secondary)]"
            >
              <Plus size={12} />
            </button>
          )}
          <button onClick={() => onRemove(path)} className="p-1 rounded text-red-400 hover:bg-red-500/10">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {open && item.children.map((child, ci) => (
        <TemplateNodeEditor
          key={ci}
          item={child}
          path={[...path, ci]}
          onRename={onRename}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}
