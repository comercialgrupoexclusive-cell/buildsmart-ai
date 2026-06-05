'use client'

import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ComposicaoPropria } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'

const GRUPOS = ['GERAL', 'FUNDACAO', 'ESTRUTURA', 'ALVENARIA', 'COBERTURA', 'REVESTIMENTO', 'PISO', 'INSTALACOES', 'ACABAMENTO', 'SERVICOS_GERAIS']

export default function ServicosPage() {
  const supabase = createClient()
  const [composicoes, setComposicoes] = useState<ComposicaoPropria[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<ComposicaoPropria | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: 'M2', grupo: 'GERAL' })

  useEffect(() => { loadComposicoes() }, [])

  async function loadComposicoes() {
    setLoading(true)
    const { data } = await supabase.from('composicoes_proprias').select('*').order('grupo').order('codigo')
    setComposicoes(data || [])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.codigo.trim() || !form.descricao.trim()) return
    setSaving(true)
    if (editando) {
      await supabase.from('composicoes_proprias').update({
        codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, grupo: form.grupo,
      }).eq('id', editando.id)
    } else {
      await supabase.from('composicoes_proprias').insert({
        codigo: form.codigo, descricao: form.descricao, unidade: form.unidade, grupo: form.grupo, ativo: true,
      })
    }
    setSaving(false)
    setShowModal(false)
    resetForm()
    loadComposicoes()
  }

  async function handleToggleAtivo(comp: ComposicaoPropria) {
    await supabase.from('composicoes_proprias').update({ ativo: !comp.ativo }).eq('id', comp.id)
    setComposicoes(prev => prev.map(c => c.id === comp.id ? { ...c, ativo: !c.ativo } : c))
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover composição? Itens de orçamento vinculados serão desvinculados.')) return
    await supabase.from('composicoes_proprias').delete().eq('id', id)
    setComposicoes(prev => prev.filter(c => c.id !== id))
  }

  function openEdit(comp: ComposicaoPropria) {
    setEditando(comp)
    setForm({ codigo: comp.codigo, descricao: comp.descricao, unidade: comp.unidade, grupo: comp.grupo })
    setShowModal(true)
  }

  function resetForm() {
    setForm({ codigo: '', descricao: '', unidade: 'M2', grupo: 'GERAL' })
    setEditando(null)
  }

  const grupos = ['TODOS', ...Array.from(new Set(composicoes.map(c => c.grupo)))]

  const filtradas = composicoes.filter(c => {
    const matchBusca = !busca || c.descricao.toLowerCase().includes(busca.toLowerCase()) || c.codigo.toLowerCase().includes(busca.toLowerCase())
    const matchGrupo = filtroGrupo === 'TODOS' || c.grupo === filtroGrupo
    return matchBusca && matchGrupo
  })

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {grupos.map(g => (
            <button key={g}
              onClick={() => setFiltroGrupo(g)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={filtroGrupo === g
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {g === 'TODOS' ? 'Todos' : g.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço..." className="input-base input-search" />
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true) }} icon={<Plus size={16} />}>
            Novo Serviço
          </Button>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : filtradas.length === 0 ? (
        <EmptyState icon={Plus} title="Nenhum serviço cadastrado"
          description="Cadastre as composições de serviços que você usa nos seus orçamentos."
          action={<Button onClick={() => { resetForm(); setShowModal(true) }} icon={<Plus size={16} />}>Novo Serviço</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full table-zebra">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Código', 'Descrição', 'Unid.', 'Grupo', 'Ativo', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(comp => (
                <tr key={comp.id} style={{ borderBottom: '1px solid var(--border)', opacity: comp.ativo ? 1 : 0.5 }}>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {comp.codigo}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)', maxWidth: 320 }}>
                    <span className="truncate block">{comp.descricao}</span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{comp.unidade}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                      {comp.grupo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleAtivo(comp)} className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]">
                      {comp.ativo
                        ? <Check size={14} style={{ color: 'var(--success)' }} />
                        : <X size={14} style={{ color: 'var(--danger)' }} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(comp)} className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                        <Pencil size={13} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <button onClick={() => handleDelete(comp.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                        <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm() }} title={editando ? 'Editar serviço' : 'Novo serviço'} size="md">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Código *" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ex: CP-009" autoFocus />
            <Input label="Unidade *" value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} placeholder="M2, M3, UN, H..." />
          </div>
          <Input label="Descrição *" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Nome do serviço/composição" />
          <div>
            <label className="text-sm font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Grupo</label>
            <select value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))} className="input-base">
              {GRUPOS.map(g => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); resetForm() }}>Cancelar</Button>
            <Button className="flex-1" loading={saving} disabled={!form.codigo.trim() || !form.descricao.trim()} onClick={handleSave}>
              {editando ? 'Salvar alterações' : 'Criar serviço'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
