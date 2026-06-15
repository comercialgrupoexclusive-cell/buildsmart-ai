'use client'

import { useState, useEffect } from 'react'
import { Plus, Users, Search, Pencil, Trash2, FolderOpen, Mail, Phone, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermission } from '@/lib/permissions'

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  drive_folder_url: string | null
  drive_folder_id: string | null
  notes: string | null
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  drive_folder_url: '',
  notes: '',
}

function extractDriveFolderId(url: string): string | null {
  if (!url) return null
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

export default function ClientesPage() {
  const { isCliente } = usePermission()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients((data ?? []) as Client[])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(c: Client) {
    setEditing(c)
    setForm({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      drive_folder_url: c.drive_folder_url ?? '',
      notes: c.notes ?? '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

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
      const { data } = await supabase.from('clients').update(payload).eq('id', editing.id).select().single()
      if (data) setClients(prev => prev.map(c => c.id === editing.id ? data as Client : c))
    } else {
      const { data } = await supabase.from('clients').insert(payload).select().single()
      if (data) setClients(prev => [...prev, data as Client].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setSaving(false)
    closeModal()
  }

  async function remove(c: Client) {
    if (!confirm(`Excluir cliente "${c.name}"?`)) return
    const supabase = createClient()
    await supabase.from('clients').delete().eq('id', c.id)
    setClients(prev => prev.filter(x => x.id !== c.id))
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {clients.length} cliente{clients.length !== 1 ? 's' : ''} cadastrado{clients.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!isCliente && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={16} /> Novo Cliente
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
        <input
          type="text"
          placeholder="Buscar por nome ou e-mail…"
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border outline-none"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Users size={40} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--text-secondary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </p>
          {!search && !isCliente && (
            <button
              onClick={openNew}
              className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
              style={{ background: 'var(--accent)' }}
            >
              + Cadastrar primeiro cliente
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <ClientCard key={c.id} client={c} canEdit={!isCliente} onEdit={openEdit} onDelete={remove} />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editing ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              <ModalField label="Nome *" required>
                <input
                  autoFocus
                  type="text"
                  className="input-base w-full"
                  placeholder="Nome do cliente"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </ModalField>

              <div className="grid grid-cols-2 gap-3">
                <ModalField label="E-mail">
                  <input
                    type="email"
                    className="input-base w-full"
                    placeholder="email@empresa.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </ModalField>
                <ModalField label="Telefone">
                  <input
                    type="tel"
                    className="input-base w-full"
                    placeholder="(11) 99999-9999"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  />
                </ModalField>
              </div>

              <ModalField label="Pasta no Google Drive (URL)">
                <input
                  type="url"
                  className="input-base w-full"
                  placeholder="https://drive.google.com/drive/folders/..."
                  value={form.drive_folder_url}
                  onChange={e => setForm(f => ({ ...f, drive_folder_url: e.target.value }))}
                />
                {form.drive_folder_url && (
                  <p className="text-xs mt-1" style={{ color: extractDriveFolderId(form.drive_folder_url) ? '#10b981' : '#f59e0b' }}>
                    {extractDriveFolderId(form.drive_folder_url)
                      ? `✓ ID: ${extractDriveFolderId(form.drive_folder_url)}`
                      : '⚠ URL não reconhecida — verifique o formato'}
                  </p>
                )}
              </ModalField>

              <ModalField label="Observações">
                <textarea
                  className="input-base w-full resize-none"
                  rows={3}
                  placeholder="Notas internas sobre o cliente…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </ModalField>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm rounded-lg border"
                style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {saving ? 'Salvando…' : editing ? 'Salvar' : 'Criar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientCard({ client: c, canEdit, onEdit, onDelete }: {
  client: Client
  canEdit: boolean
  onEdit: (c: Client) => void
  onDelete: (c: Client) => void
}) {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
            style={{ background: 'rgba(59,123,248,0.12)', color: 'var(--accent)' }}
          >
            {c.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
            {c.email && (
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{c.email}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(c)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(c)}
              className="p-1.5 rounded-lg hover:bg-red-500/10"
              style={{ color: '#f87171' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {c.phone && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Phone size={11} />
            <span>{c.phone}</span>
          </div>
        )}
        {c.notes && (
          <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <FileText size={11} className="mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{c.notes}</span>
          </div>
        )}
      </div>

      <div className="pt-1 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
        {c.drive_folder_id ? (
          <a
            href={c.drive_folder_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
            style={{ color: '#10b981' }}
          >
            <FolderOpen size={12} /> Pasta no Drive
          </a>
        ) : (
          <span className="text-xs opacity-40" style={{ color: 'var(--text-secondary)' }}>
            Sem pasta Drive vinculada
          </span>
        )}
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            className="ml-auto flex items-center gap-1 text-xs hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            <Mail size={11} /> Contato
          </a>
        )}
      </div>
    </div>
  )
}

function ModalField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
