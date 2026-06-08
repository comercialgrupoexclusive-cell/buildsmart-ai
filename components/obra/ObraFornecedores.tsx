'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Phone, Mail, User, Building2, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Fornecedor } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'

const CATEGORIA_LABEL: Record<Fornecedor['categoria'], string> = {
  MATERIAL: 'Material',
  MAO_DE_OBRA: 'Mão de obra',
  EQUIPAMENTO: 'Equipamento',
  SERVICO: 'Serviço',
  MISTO: 'Misto',
}

const CATEGORIA_COLOR: Record<Fornecedor['categoria'], string> = {
  MATERIAL: 'var(--accent)',
  MAO_DE_OBRA: 'var(--warning)',
  EQUIPAMENTO: 'var(--success)',
  SERVICO: '#8B5CF6',
  MISTO: 'var(--text-secondary)',
}

const formInicial = {
  nome: '',
  categoria: 'MATERIAL' as Fornecedor['categoria'],
  contato: '',
  telefone: '',
  email: '',
  observacoes: '',
  vinculadoObra: false,
}

export function ObraFornecedores({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(formInicial)

  async function loadFornecedores() {
    setLoading(true)
    // Mostra fornecedores gerais da empresa (obra_id nulo) + os vinculados especificamente a esta obra
    const { data } = await supabase
      .from('fornecedores')
      .select('*')
      .or(`obra_id.is.null,obra_id.eq.${obraId}`)
      .order('nome')
    setFornecedores((data || []) as Fornecedor[])
    setLoading(false)
  }

  useEffect(() => {
    Promise.resolve().then(() => loadFornecedores())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId])

  function resetForm() {
    setForm(formInicial)
  }

  function openNew() {
    setEditando(null)
    resetForm()
    setShowModal(true)
  }

  function openEdit(fornecedor: Fornecedor) {
    setEditando(fornecedor)
    setForm({
      nome: fornecedor.nome,
      categoria: fornecedor.categoria,
      contato: fornecedor.contato || '',
      telefone: fornecedor.telefone || '',
      email: fornecedor.email || '',
      observacoes: fornecedor.observacoes || '',
      vinculadoObra: fornecedor.obra_id === obraId,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria,
      contato: form.contato.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      observacoes: form.observacoes.trim() || null,
      obra_id: form.vinculadoObra ? obraId : null,
    }
    if (editando) {
      const { data } = await supabase.from('fornecedores').update(payload).eq('id', editando.id).select().single()
      if (data) setFornecedores(prev => prev.map(f => f.id === editando.id ? (data as Fornecedor) : f).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    } else {
      const { data } = await supabase.from('fornecedores').insert({ ...payload, ativo: true }).select().single()
      if (data) setFornecedores(prev => [...prev, data as Fornecedor].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    }
    setSaving(false)
    setShowModal(false)
    setEditando(null)
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este fornecedor da lista?')) return
    await supabase.from('fornecedores').delete().eq('id', id)
    setFornecedores(prev => prev.filter(f => f.id !== id))
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Fornecedores</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Cadastre fornecedores de materiais, mão de obra, equipamentos e serviços para usar nas listas de compras desta obra.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openNew}>Novo fornecedor</Button>
      </div>

      {fornecedores.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor cadastrado"
          description="Cadastre fornecedores para vincular às listas de compras de materiais e organizar contatos por categoria."
          action={<Button icon={<Plus size={16} />} onClick={openNew}>Novo fornecedor</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fornecedores.map(fornecedor => (
            <div key={fornecedor.id} className="card p-4 flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                    <Building2 size={16} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{fornecedor.nome}</p>
                    <span
                      className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5"
                      style={{ background: `${CATEGORIA_COLOR[fornecedor.categoria]}20`, color: CATEGORIA_COLOR[fornecedor.categoria] }}
                    >
                      {CATEGORIA_LABEL[fornecedor.categoria]}
                    </span>
                    {fornecedor.obra_id === obraId && (
                      <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5 ml-1.5" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        Específico desta obra
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(fornecedor)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--text-secondary)' }} title="Editar">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(fornecedor.id)} className="p-1.5 rounded-md hover:opacity-70" style={{ color: 'var(--danger)' }} title="Remover">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {fornecedor.contato && <span className="flex items-center gap-1.5"><User size={12} /> {fornecedor.contato}</span>}
                {fornecedor.telefone && <span className="flex items-center gap-1.5"><Phone size={12} /> {fornecedor.telefone}</span>}
                {fornecedor.email && <span className="flex items-center gap-1.5"><Mail size={12} /> {fornecedor.email}</span>}
              </div>

              {fornecedor.observacoes && (
                <p className="text-xs pt-1" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
                  <span className="block pt-2 whitespace-pre-wrap">{fornecedor.observacoes}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de cadastro/edição */}
      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null); resetForm() }}
        title={editando ? 'Editar fornecedor' : 'Novo fornecedor'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome / Razão social *"
            value={form.nome}
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
            placeholder="Ex: Cimentos SP Materiais de Construção"
            autoFocus
          />
          <Select label="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Fornecedor['categoria'] }))}>
            <option value="MATERIAL">Material</option>
            <option value="MAO_DE_OBRA">Mão de obra</option>
            <option value="EQUIPAMENTO">Equipamento</option>
            <option value="SERVICO">Serviço</option>
            <option value="MISTO">Misto</option>
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contato" value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} placeholder="Nome do contato" />
            <Input label="Telefone" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(11) 99999-0000" />
          </div>
          <Input label="E-mail" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contato@fornecedor.com.br" />
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Observações</label>
            <textarea
              value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              rows={2}
              placeholder="Prazo de entrega, condições de pagamento, especialidades..."
              className="input-base w-full resize-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={form.vinculadoObra}
              onChange={e => setForm(f => ({ ...f, vinculadoObra: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            Vincular este fornecedor apenas a esta obra (caso contrário, fica disponível para todas)
          </label>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.nome.trim()} onClick={handleSave}>
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
