'use client'

import { useEffect, useMemo, useState } from 'react'
import { Square, ClipboardList, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Tarefa } from '@/lib/types'
import { useProfile } from '@/lib/profile-context'

const PRIORIDADE_LABEL: Record<Tarefa['prioridade'], string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
}

const PRIORIDADE_COLOR: Record<Tarefa['prioridade'], string> = {
  baixa: 'var(--text-secondary)', normal: 'var(--accent)', alta: 'var(--warning)', urgente: 'var(--danger)',
}

const PRIORIDADE_ORDEM: Record<Tarefa['prioridade'], number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

export function MinhasTarefasWidget() {
  const supabase = createClient()
  const { currentProfile } = useProfile()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentProfile) { setLoading(false); return }
    setLoading(true)
    supabase
      .from('tarefas')
      .select('*, obra:obras(nome)')
      .eq('responsavel_id', currentProfile.id)
      .eq('concluida', false)
      .order('data_prazo', { ascending: true, nullsFirst: false })
      .then(({ data }: { data: Tarefa[] | null }) => {
        setTarefas(data || [])
        setLoading(false)
      })
  }, [currentProfile?.id])

  async function alternarConcluida(t: Tarefa) {
    const payload = { concluida: true, status: 'concluida' as const, concluida_em: new Date().toISOString(), updated_at: new Date().toISOString() }
    await supabase.from('tarefas').update(payload).eq('id', t.id)
    setTarefas(prev => prev.filter(item => item.id !== t.id))
  }

  const ordenadas = useMemo(() => [...tarefas].sort((a, b) => {
    const pri = PRIORIDADE_ORDEM[a.prioridade] - PRIORIDADE_ORDEM[b.prioridade]
    if (pri !== 0) return pri
    if (!a.data_prazo) return 1
    if (!b.data_prazo) return -1
    return a.data_prazo.localeCompare(b.data_prazo)
  }), [tarefas])

  if (!currentProfile) return null

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={18} style={{ color: 'var(--accent)' }} />
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Minhas tarefas</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : ordenadas.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
          Nenhuma tarefa pendente atribuída a você
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {ordenadas.slice(0, 6).map(t => {
            const atrasada = t.data_prazo && new Date(t.data_prazo + 'T23:59:59') < new Date()
            return (
              <div key={t.id} className="flex items-start gap-3 p-2.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]">
                <button onClick={() => alternarConcluida(t)} className="flex-shrink-0 pt-0.5" title="Marcar como concluída">
                  <Square size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <Link href={t.obra_id ? `/obras/${t.obra_id}?tab=tarefas` : '#'} className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.titulo}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t.obra?.nome && <span className="truncate">{t.obra.nome}</span>}
                    {t.data_prazo && (
                      <span className="inline-flex items-center gap-1" style={{ color: atrasada ? 'var(--danger)' : 'var(--text-secondary)' }}>
                        {atrasada && <AlertTriangle size={11} />}
                        {new Date(t.data_prazo + 'T12:00').toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </Link>
                <span
                  className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
                  style={{ color: PRIORIDADE_COLOR[t.prioridade], background: 'var(--bg-card)' }}
                >
                  {PRIORIDADE_LABEL[t.prioridade]}
                </span>
              </div>
            )
          })}
          {ordenadas.length > 6 && (
            <p className="text-xs mt-1 px-2.5" style={{ color: 'var(--text-secondary)' }}>
              + {ordenadas.length - 6} outras tarefas pendentes
            </p>
          )}
        </div>
      )}
    </div>
  )
}
