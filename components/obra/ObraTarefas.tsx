'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square, Plus, Pencil, Trash2, ClipboardList, AlertTriangle, List, LayoutGrid } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Tarefa } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'

const PRIORIDADE_LABEL: Record<Tarefa['prioridade'], string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
}

const PRIORIDADE_COLOR: Record<Tarefa['prioridade'], string> = {
  baixa: 'var(--text-secondary)', normal: 'var(--accent)', alta: 'var(--warning)', urgente: 'var(--danger)',
}

const PRIORIDADE_ORDEM: Record<Tarefa['prioridade'], number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

const STATUS_COLUNAS: { id: Tarefa['status']; label: string }[] = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'em_andamento', label: 'Em andamento' },
  { id: 'concluida', label: 'Concluída' },
  { id: 'cancelada', label: 'Cancelada' },
]

type Filtro = 'pendentes' | 'concluidas'
type Visualizacao = 'lista' | 'kanban'

export function ObraTarefas({ obraId }: { obraId: string }) {
  const supabase = createClient()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista')

  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Tarefa | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titulo: '', descricao: '', responsavel_id: '', responsavel_nome: '',
    prioridade: 'normal' as Tarefa['prioridade'], data_prazo: '',
  })

  useEffect(() => {
    loadDados()
  }, [obraId])

  async function loadDados() {
    setLoading(true)
    const [tarefasRes, usuariosRes] = await Promise.all([
      supabase.from('tarefas').select('*').eq('obra_id', obraId).order('data_prazo', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, name').order('name'),
    ])
    setTarefas((tarefasRes.data || []) as Tarefa[])
    setUsuarios(usuariosRes.data || [])
    setLoading(false)
  }

  function resetForm() {
    setForm({ titulo: '', descricao: '', responsavel_id: '', responsavel_nome: '', prioridade: 'normal', data_prazo: '' })
  }

  function openNew() {
    setEditando(null)
    resetForm()
    setShowModal(true)
  }

  function openEdit(t: Tarefa) {
    setEditando(t)
    setForm({
      titulo: t.titulo,
      descricao: t.descricao || '',
      responsavel_id: t.responsavel_id || '',
      responsavel_nome: t.responsavel_nome || '',
      prioridade: t.prioridade,
      data_prazo: t.data_prazo || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.titulo.trim()) return
    setSaving(true)
    const responsavelNome = usuarios.find(u => u.id === form.responsavel_id)?.name || form.responsavel_nome || null
    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      obra_id: obraId,
      responsavel_id: form.responsavel_id || null,
      responsavel_nome: responsavelNome,
      prioridade: form.prioridade,
      data_prazo: form.data_prazo || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = editando
      ? await supabase.from('tarefas').update(payload).eq('id', editando.id).select().single()
      : await supabase.from('tarefas').insert({ ...payload, status: 'pendente', concluida: false }).select().single()
    setSaving(false)
    if (error) {
      alert(`Não foi possível salvar a tarefa.\n\nErro: ${error.message}`)
      return
    }
    if (data) setTarefas(prev => editando ? prev.map(t => t.id === data.id ? data as Tarefa : t) : [data as Tarefa, ...prev])
    setShowModal(false)
    setEditando(null)
    resetForm()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta tarefa?')) return
    await supabase.from('tarefas').delete().eq('id', id)
    setTarefas(prev => prev.filter(t => t.id !== id))
  }

  async function atualizarStatus(t: Tarefa, status: Tarefa['status']) {
    const concluida = status === 'concluida'
    const payload = {
      status,
      concluida,
      concluida_em: concluida ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('tarefas').update(payload).eq('id', t.id)
    setTarefas(prev => prev.map(item => item.id === t.id ? { ...item, ...payload } : item))
  }

  function alternarConcluida(t: Tarefa) {
    atualizarStatus(t, t.concluida ? 'pendente' : 'concluida')
  }

  function moverParaStatus(id: string, status: Tarefa['status']) {
    const t = tarefas.find(item => item.id === id)
    if (t && t.status !== status) atualizarStatus(t, status)
  }

  const tarefasFiltradas = useMemo(() => {
    return tarefas
      .filter(t => filtro === 'pendentes' ? !t.concluida : t.concluida)
      .sort((a, b) => {
        const pri = PRIORIDADE_ORDEM[a.prioridade] - PRIORIDADE_ORDEM[b.prioridade]
        if (pri !== 0) return pri
        if (!a.data_prazo) return 1
        if (!b.data_prazo) return -1
        return a.data_prazo.localeCompare(b.data_prazo)
      })
  }, [tarefas, filtro])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          {visualizacao === 'lista' && (
            <div className="flex gap-1 p-1 rounded-lg w-full max-w-full overflow-x-auto sm:w-fit" style={{ background: 'var(--bg-secondary)' }}>
              {([
                { id: 'pendentes' as const, label: 'Pendentes' },
                { id: 'concluidas' as const, label: 'Concluídas' },
              ]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setFiltro(id)}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-md text-sm font-medium transition-all"
                  style={filtro === id
                    ? { background: 'var(--accent)', color: 'white' }
                    : { color: 'var(--text-secondary)' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
            <button
              onClick={() => setVisualizacao('lista')}
              title="Visualização em lista"
              className="px-2.5 py-1.5 rounded-md transition-all"
              style={visualizacao === 'lista' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              <List size={15} />
            </button>
            <button
              onClick={() => setVisualizacao('kanban')}
              title="Visualização em quadro (kanban)"
              className="px-2.5 py-1.5 rounded-md transition-all"
              style={visualizacao === 'kanban' ? { background: 'var(--accent)', color: 'white' } : { color: 'var(--text-secondary)' }}
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>
      </div>

      {visualizacao === 'kanban' ? (
        tarefas.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma tarefa"
            description="Cadastre tarefas para acompanhar pendências desta obra, com responsável, prazo e prioridade."
            action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>}
          />
        ) : (
          <KanbanTarefas tarefas={tarefas} onMover={moverParaStatus} onEdit={openEdit} onDelete={handleDelete} />
        )
      ) : tarefasFiltradas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma tarefa"
          description="Cadastre tarefas para acompanhar pendências desta obra, com responsável, prazo e prioridade."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          {tarefasFiltradas.map(t => (
            <LinhaTarefa key={t.id} tarefa={t} onToggle={alternarConcluida} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null); resetForm() }}
        title={editando ? 'Editar tarefa' : 'Nova tarefa'}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Título *"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ex: Solicitar orçamento de elétrica"
            autoFocus={!editando}
          />
          <Textarea
            label="Descrição"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Detalhes opcionais"
            rows={3}
          />
          <Select
            label="Responsável"
            value={form.responsavel_id}
            onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}
          >
            <option value="">Sem responsável definido</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Prioridade"
              value={form.prioridade}
              onChange={e => setForm(f => ({ ...f, prioridade: e.target.value as Tarefa['prioridade'] }))}
            >
              {(['baixa', 'normal', 'alta', 'urgente'] as const).map(p => (
                <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>
              ))}
            </Select>
            <Input
              label="Prazo"
              type="date"
              value={form.data_prazo}
              onChange={e => setForm(f => ({ ...f, data_prazo: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowModal(false); setEditando(null); resetForm() }}>
              Cancelar
            </Button>
            <Button className="flex-1" loading={saving} disabled={!form.titulo.trim()} onClick={handleSave}>
              {editando ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function KanbanTarefas({
  tarefas, onMover, onEdit, onDelete,
}: {
  tarefas: Tarefa[]
  onMover: (id: string, status: Tarefa['status']) => void
  onEdit: (t: Tarefa) => void
  onDelete: (id: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<Tarefa['status'] | null>(null)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {STATUS_COLUNAS.map(col => {
        const itens = tarefas.filter(t => t.status === col.id)
        return (
          <div
            key={col.id}
            className="rounded-xl flex flex-col gap-2 p-2 min-h-[140px] transition-colors"
            style={{
              background: dragOver === col.id ? 'rgba(59,123,248,0.08)' : 'var(--bg-secondary)',
              border: dragOver === col.id ? '1px dashed var(--accent)' : '1px solid var(--border)',
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => {
              e.preventDefault()
              if (dragId) onMover(dragId, col.id)
              setDragId(null)
              setDragOver(null)
            }}
          >
            <div className="flex items-center justify-between px-1.5 pt-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{col.label}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
                {itens.length}
              </span>
            </div>

            {itens.map(t => {
              const atrasada = !t.concluida && t.data_prazo && new Date(t.data_prazo + 'T23:59:59') < new Date()
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => { setDragId(null); setDragOver(null) }}
                  className="card p-2.5 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>{t.titulo}</p>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); onEdit(t) }} title="Editar" className="p-1 rounded hover:bg-[var(--bg-secondary)] transition-colors">
                        <Pencil size={11} style={{ color: 'var(--text-secondary)' }} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); onDelete(t.id) }} title="Remover" className="p-1 rounded hover:bg-red-500/20 transition-colors">
                        <Trash2 size={11} style={{ color: 'var(--danger)' }} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t.responsavel_nome && <span className="truncate">{t.responsavel_nome}</span>}
                    {t.data_prazo && (
                      <span className="inline-flex items-center gap-1" style={{ color: atrasada ? 'var(--danger)' : 'var(--text-secondary)' }}>
                        {atrasada && <AlertTriangle size={10} />}
                        {new Date(t.data_prazo + 'T12:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                  <span
                    className="inline-block w-fit text-xs font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ color: PRIORIDADE_COLOR[t.prioridade], background: 'var(--bg-card)' }}
                  >
                    {PRIORIDADE_LABEL[t.prioridade]}
                  </span>
                </div>
              )
            })}

            {itens.length === 0 && (
              <p className="text-xs px-1.5 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>Sem tarefas</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LinhaTarefa({
  tarefa: t, onToggle, onEdit, onDelete,
}: {
  tarefa: Tarefa
  onToggle: (t: Tarefa) => void
  onEdit: (t: Tarefa) => void
  onDelete: (id: string) => void
}) {
  const atrasada = !t.concluida && t.data_prazo && new Date(t.data_prazo + 'T23:59:59') < new Date()

  return (
    <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={() => onToggle(t)} className="flex-shrink-0 pt-0.5" title={t.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}>
        {t.concluida
          ? <CheckSquare size={18} style={{ color: 'var(--success)' }} />
          : <Square size={18} style={{ color: 'var(--text-secondary)' }} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium truncate"
          style={{ color: t.concluida ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: t.concluida ? 'line-through' : 'none' }}
        >
          {t.titulo}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t.responsavel_nome && <span>{t.responsavel_nome}</span>}
          {t.data_prazo && (
            <span className="inline-flex items-center gap-1" style={{ color: atrasada ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {atrasada && <AlertTriangle size={11} />}
              {new Date(t.data_prazo + 'T12:00').toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      <span
        className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
        style={{ color: PRIORIDADE_COLOR[t.prioridade], background: 'var(--bg-card)' }}
      >
        {PRIORIDADE_LABEL[t.prioridade]}
      </span>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(t)} title="Editar" className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
          <Pencil size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button onClick={() => onDelete(t.id)} title="Remover" className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
          <Trash2 size={14} style={{ color: 'var(--danger)' }} />
        </button>
      </div>
    </div>
  )
}
