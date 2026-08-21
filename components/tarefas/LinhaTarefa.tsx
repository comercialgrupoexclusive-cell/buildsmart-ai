'use client'

import { CheckSquare, Square, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Tarefa } from '@/lib/types'
import { PRIORIDADE_COLOR, PRIORIDADE_LABEL, isAtrasada } from '@/lib/tarefas'

export function LinhaTarefa({
  tarefa: t, onToggle, onEdit, onDelete, contexto,
}: {
  tarefa: Tarefa
  onToggle: (t: Tarefa) => void
  onEdit: (t: Tarefa) => void
  onDelete?: (id: string) => void
  contexto?: { label: string; href: string } | null
}) {
  const atrasada = isAtrasada(t)

  return (
    <div className="flex items-start gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => onToggle(t)}
        className="flex-shrink-0 -m-2 p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
        title={t.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
        aria-label={t.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
      >
        {t.concluida
          ? <CheckSquare size={18} style={{ color: 'var(--success)' }} />
          : <Square size={18} style={{ color: 'var(--text-secondary)' }} />}
      </button>

      <button onClick={() => onEdit(t)} className="min-w-0 flex-1 text-left">
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
          {contexto && (
            <Link
              href={contexto.href}
              onClick={e => e.stopPropagation()}
              className="truncate rounded-full px-1.5 py-0.5 hover:underline"
              style={{ background: 'var(--bg-secondary)' }}
            >
              {contexto.label}
            </Link>
          )}
          <span className="sm:hidden font-semibold" style={{ color: PRIORIDADE_COLOR[t.prioridade] }}>
            {PRIORIDADE_LABEL[t.prioridade]}
          </span>
        </div>
      </button>

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
        {onDelete && (
          <button onClick={() => onDelete(t.id)} title="Remover" className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors">
            <Trash2 size={14} style={{ color: 'var(--danger)' }} />
          </button>
        )}
      </div>
    </div>
  )
}
