'use client'

import { useState, useEffect } from 'react'
import {
  Plus, Search, Pencil, Trash2, FolderOpen, Mail, Phone, FileText,
  UserCog, Building2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'
import type { Responsavel, Proprietario } from '@/lib/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractDriveFolderId(url: string): string | null {
  if (!url) return null
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

function ModalField({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ClientesPage() {
  const { isCliente } = usePermission()
  const [tab, setTab] = useState<'responsaveis' | 'proprietarios'>('responsaveis')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Contatos</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Responsáveis técnicos e proprietários vinculados a obras e projetos
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--bg-secondary)' }}>
        {([
          { key: 'responsaveis',  label: 'Responsáveis Técnicos', icon: UserCog },
          { key: 'proprietarios', label: 'Proprietários',          icon: Building2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap"
            style={tab === key
              ? { background: 'var(--accent)', color: 'white' }
              : { color: 'var(--text-secondary)' }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'responsaveis' && <ResponsaveisTab canEdit={!isCliente} />}
      {tab === 'proprietarios' && <ProprietariosTab canEdit={!isCliente} />}
    </div>
  )
}

// ─── Aba: Responsáveis Técnicos ───────────────────────────────────────────────

const EMPTY_RESP = { name: '', email: '', phone: '', drive_folder_url: '', notes: '' }

function ResponsaveisTab({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Responsavel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Responsavel | null>(null)
  const [form, setForm] = useState(EMPTY_RESP)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await createClient().from('responsaveis').select('*').order('name')
    setItems((data ?? []) as Responsavel[])
    setLoading(false)
  }

  function openNew() { setEditing(null); setForm(EMPTY_RESP); setShowModal(true) }
  function openEdit(r: Responsavel) {
    setEditing(r)
    setForm({ name: r.name, email: r.email ?? '', phone: r.phone ?? '', drive_folder_url: r.drive_folder_url ?? '', notes: r.notes ?? '' })
    setShowModal(true)
  }
  function closeModal() { setShowModal(false); setEditing(null); setForm(EMPTY_RESP) }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      drive_folder_url: form.drive_folder_url.trim() || null,
      drive_folder_id: extractDriveFolderId(form.drive_folder_url.trim()),
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { data } = await supabase.from('responsaveis').update(payload).eq('id', editing.id).select().single()
      if (data) setItems(prev => prev.map(r => r.id === editing.id ? data as Responsavel : r))
    } else {
      const { data } = await supabase.from('responsaveis').insert(payload).select().single()
      if (data) setItems(prev => [...prev, data as Responsavel].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setSaving(false)
    closeModal()
  }

  async function remove(r: Responsavel) {
    if (!confirm(`Excluir "${r.name}"?`)) return
    await createClient().from('responsaveis').delete().eq('id', r.id)
    setItems(prev => prev.filter(x => x.id !== r.id))
  }

  const filtered = items.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    (r.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={15} /> Novo Responsável
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <UserCog size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {search ? 'Nenhum responsável encontrado' : 'Nenhum responsável cadastrado'}
          </p>
          {!search && canEdit && (
            <button onClick={openNew} className="mt-3 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ background: 'var(--accent)' }}>
              + Cadastrar
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(r => (
            <div key={r.id} className="rounded-xl border p-4 flex flex-col gap-3 hover:shadow-md transition-shadow" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{r.name}</p>
                    {r.email && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{r.email}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}><Pencil size={13} /></button>
                    <button onClick={() => remove(r)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: '#f87171' }}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              {r.phone && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <Phone size={11} /><span>{r.phone}</span>
                </div>
              )}
              {r.notes && (
                <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <FileText size={11} className="mt-0.5 flex-shrink-0" /><span className="line-clamp-2">{r.notes}</span>
                </div>
              )}
              <div className="pt-1 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                {r.drive_folder_id ? (
                  <a href={r.drive_folder_url ?? '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80" style={{ color: '#10b981' }}>
                    <FolderOpen size={12} /> Pasta no Drive
                  </a>
                ) : (
                  <span className="text-xs opacity-40" style={{ color: 'var(--text-secondary)' }}>Sem pasta Drive</span>
                )}
                {r.email && (
                  <a href={`mailto:${r.email}`} className="ml-auto flex items-center gap-1 text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                    <Mail size={11} /> Contato
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editing ? 'Editar Responsável Técnico' : 'Novo Responsável Técnico'}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <ModalField label="Nome *" required>
                <input autoFocus type="text" className="input-base w-full" placeholder="Nome completo"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </ModalField>
              <div className="grid grid-cols-2 gap-3">
                <ModalField label="E-mail">
                  <input type="email" className="input-base w-full" placeholder="email@empresa.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </ModalField>
                <ModalField label="Telefone">
                  <input type="tel" className="input-base w-full" placeholder="(11) 99999-9999"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </ModalField>
              </div>
              <ModalField label="Pasta no Google Drive (URL)">
                <input type="url" className="input-base w-full" placeholder="https://drive.google.com/drive/folders/..."
                  value={form.drive_folder_url} onChange={e => setForm(f => ({ ...f, drive_folder_url: e.target.value }))} />
                {form.drive_folder_url && (
                  <p className="text-xs mt-1" style={{ color: extractDriveFolderId(form.drive_folder_url) ? '#10b981' : '#f59e0b' }}>
                    {extractDriveFolderId(form.drive_folder_url)
                      ? `✓ ID: ${extractDriveFolderId(form.drive_folder_url)}`
                      : '⚠ URL não reconhecida — verifique o formato'}
                  </p>
                )}
              </ModalField>
              <ModalField label="Observações">
                <textarea className="input-base w-full resize-none" rows={2} placeholder="Notas internas…"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </ModalField>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Aba: Proprietários ───────────────────────────────────────────────────────

const EMPTY_PROP = { name: '', phone: '', email: '', notes: '' }

function ProprietariosTab({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Proprietario[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Proprietario | null>(null)
  const [form, setForm] = useState(EMPTY_PROP)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await createClient().from('proprietarios').select('*').order('name')
    setItems((data ?? []) as Proprietario[])
    setLoading(false)
  }

  function openNew() { setEditing(null); setForm(EMPTY_PROP); setShowModal(true) }
  function openEdit(p: Proprietario) {
    setEditing(p)
    setForm({ name: p.name, phone: p.phone ?? '', email: p.email ?? '', notes: p.notes ?? '' })
    setShowModal(true)
  }
  function closeModal() { setShowModal(false); setEditing(null); setForm(EMPTY_PROP) }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { data } = await supabase.from('proprietarios').update(payload).eq('id', editing.id).select().single()
      if (data) setItems(prev => prev.map(p => p.id === editing.id ? data as Proprietario : p))
    } else {
      const { data } = await supabase.from('proprietarios').insert(payload).select().single()
      if (data) setItems(prev => [...prev, data as Proprietario].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setSaving(false)
    closeModal()
  }

  async function remove(p: Proprietario) {
    if (!confirm(`Excluir "${p.name}"?`)) return
    await createClient().from('proprietarios').delete().eq('id', p.id)
    setItems(prev => prev.filter(x => x.id !== p.id))
  }

  const filtered = items.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.phone ?? '').includes(search) ||
    (p.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={15} /> Novo Proprietário
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Building2 size={36} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {search ? 'Nenhum proprietário encontrado' : 'Nenhum proprietário cadastrado'}
          </p>
          {!search && canEdit && (
            <button onClick={openNew} className="mt-3 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ background: 'var(--accent)' }}>
              + Cadastrar
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(p => (
            <div key={p.id} className="rounded-xl border p-4 flex flex-col gap-3 hover:shadow-md transition-shadow" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                    {p.email && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{p.email}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]" style={{ color: 'var(--text-secondary)' }}><Pencil size={13} /></button>
                    <button onClick={() => remove(p)} className="p-1.5 rounded-lg hover:bg-red-500/10" style={{ color: '#f87171' }}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {p.phone && (
                  <a href={`tel:${p.phone}`} className="flex items-center gap-2 text-xs hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                    <Phone size={11} /><span>{p.phone}</span>
                  </a>
                )}
                {p.notes && (
                  <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <FileText size={11} className="mt-0.5 flex-shrink-0" /><span className="line-clamp-2">{p.notes}</span>
                  </div>
                )}
              </div>
              {(p.phone || p.email) && (
                <div className="pt-1 border-t flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="flex items-center gap-1 text-xs hover:opacity-80" style={{ color: '#10b981' }}>
                      <Phone size={11} /> Ligar
                    </a>
                  )}
                  {p.email && (
                    <a href={`mailto:${p.email}`} className="flex items-center gap-1 text-xs hover:opacity-80" style={{ color: 'var(--accent)' }}>
                      <Mail size={11} /> E-mail
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editing ? 'Editar Proprietário' : 'Novo Proprietário'}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <ModalField label="Nome *" required>
                <input autoFocus type="text" className="input-base w-full" placeholder="Nome do proprietário"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </ModalField>
              <div className="grid grid-cols-2 gap-3">
                <ModalField label="Telefone">
                  <input type="tel" className="input-base w-full" placeholder="(11) 99999-9999"
                    value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </ModalField>
                <ModalField label="E-mail">
                  <input type="email" className="input-base w-full" placeholder="email@exemplo.com"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </ModalField>
              </div>
              <ModalField label="Observações">
                <textarea className="input-base w-full resize-none" rows={2} placeholder="Notas internas…"
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </ModalField>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
              <button onClick={closeModal} className="px-4 py-2 text-sm rounded-lg border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
