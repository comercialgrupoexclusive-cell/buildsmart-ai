'use client'

import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2, ClipboardList, AlertTriangle, List, LayoutGrid, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Tarefa } from '@/lib/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PRIORIDADE_COLOR, PRIORIDADE_LABEL, isAtrasada, ordenarTarefas } from '@/lib/tarefas'
import { LinhaTarefa } from '@/components/tarefas/LinhaTarefa'
import { TarefaModal } from '@/components/tarefas/TarefaModal'

const STATUS_COLUNAS: { id: Tarefa['status']; label: string }[] = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'em_andamento', label: 'Em andamento' },
  { id: 'aguardando', label: 'Aguardando' },
  { id: 'concluida', label: 'Concluída' },
  { id: 'cancelada', label: 'Cancelada' },
]

type Filtro = 'pendentes' | 'concluidas'
type Visualizacao = 'lista' | 'kanban'

// Painel de tarefas de um contexto (Obra ou Projeto — exatamente um dos dois
// ids é passado). Tarefas criadas aqui herdam automaticamente esse contexto;
// as mesmas linhas também aparecem em Tarefas > Minhas/Hoje/Próximas/etc,
// sem nenhuma duplicação — é a mesma tabela `tarefas`, só outra consulta.
export function ContextoTarefas({ obraId, projetoId }: { obraId?: string; projetoId?: string }) {
  const supabase = createClient()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Tarefa | null>(null)

  useEffect(() => {
    let query = supabase.from('tarefas').select('*').order('data_prazo', { ascending: true, nullsFirst: false })
    query = obraId ? query.eq('obra_id', obraId) : query.eq('projeto_id', projetoId as string)
    query.then(({ data }: { data: Tarefa[] | null }) => {
      setTarefas(data || [])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraId, projetoId])

  function openNew() {
    setEditando(null)
    setShowModal(true)
  }

  function openEdit(t: Tarefa) {
    setEditando(t)
    setShowModal(true)
  }

  function onSaved(t: Tarefa) {
    setTarefas(prev => prev.some(x => x.id === t.id) ? prev.map(x => x.id === t.id ? t : x) : [t, ...prev])
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
    return ordenarTarefas(tarefas.filter(t => filtro === 'pendentes' ? !t.concluida : t.concluida))
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
            description="Cadastre tarefas para acompanhar pendências, com responsável, prazo e prioridade."
            action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>}
          />
        ) : (
          <KanbanTarefas tarefas={tarefas} onMover={moverParaStatus} onEdit={openEdit} onDelete={handleDelete} />
        )
      ) : tarefasFiltradas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma tarefa"
          description="Cadastre tarefas para acompanhar pendências, com responsável, prazo e prioridade."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          {tarefasFiltradas.map(t => (
            <LinhaTarefa key={t.id} tarefa={t} onToggle={alternarConcluida} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <TarefaModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null) }}
        editando={editando}
        obraId={obraId}
        projetoId={projetoId}
        onSaved={onSaved}
      />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
              const atrasada = isAtrasada(t)
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
