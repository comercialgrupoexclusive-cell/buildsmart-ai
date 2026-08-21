'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, Inbox, User, CalendarClock, CalendarDays, Clock3, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import { Tarefa } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinhaTarefa } from '@/components/tarefas/LinhaTarefa'
import { TarefaModal } from '@/components/tarefas/TarefaModal'
import { TAREFAS_ABERTAS, hojeISO, ordenarTarefas } from '@/lib/tarefas'

type TabId = 'inbox' | 'minhas' | 'hoje' | 'proximas' | 'aguardando' | 'todas'

const TABS: { id: TabId; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'minhas', label: 'Minhas tarefas', icon: User },
  { id: 'hoje', label: 'Hoje', icon: CalendarClock },
  { id: 'proximas', label: 'Próximas', icon: CalendarDays },
  { id: 'aguardando', label: 'Aguardando', icon: Clock3 },
  { id: 'todas', label: 'Todas', icon: ClipboardList },
]

const EMBED = '*, obra:obras(nome), projeto:projetos(nome)'

// Motor global de tarefas: mesma tabela `tarefas` do resto do app, só com
// consultas diferentes por aba. Nenhum dado é duplicado — uma tarefa criada
// dentro de uma Obra/Projeto aparece aqui automaticamente, e vice-versa.
export default function TarefasPage() {
  const supabase = createClient()
  const { currentProfile } = useProfile()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get('tab') as TabId | null
    return t && TABS.some(x => x.id === t) ? t : 'minhas'
  })
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Tarefa | null>(null)

  useEffect(() => {
    if (!currentProfile) return
    let query = supabase.from('tarefas').select(EMBED).order('data_prazo', { ascending: true, nullsFirst: false })

    if (tab === 'inbox') {
      query = query.is('responsavel_id', null).in('status', TAREFAS_ABERTAS)
    } else if (tab === 'minhas') {
      query = query.eq('responsavel_id', currentProfile.id).in('status', TAREFAS_ABERTAS)
    } else if (tab === 'hoje') {
      query = query.eq('responsavel_id', currentProfile.id).in('status', TAREFAS_ABERTAS).lte('data_prazo', hojeISO())
    } else if (tab === 'proximas') {
      query = query.eq('responsavel_id', currentProfile.id).in('status', TAREFAS_ABERTAS).gt('data_prazo', hojeISO())
    } else if (tab === 'aguardando') {
      query = query.eq('responsavel_id', currentProfile.id).eq('status', 'aguardando')
    }
    // 'todas': sem filtro — visão discreta de tudo, para conferência.

    query.then(({ data }: { data: unknown[] | null }) => {
      setTarefas((data || []) as unknown as Tarefa[])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentProfile?.id])

  function selecionar(t: TabId) {
    setTab(t)
    setLoading(true)
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set('tab', t)
    router.replace(`/tarefas?${params.toString()}`)
  }

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

  async function alternarConcluida(t: Tarefa) {
    const proximoStatus: Tarefa['status'] = t.concluida ? 'pendente' : 'concluida'
    const payload = {
      status: proximoStatus,
      concluida: !t.concluida,
      concluida_em: !t.concluida ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('tarefas').update(payload).eq('id', t.id)
    setTarefas(prev => prev.map(item => item.id === t.id ? { ...item, ...payload } : item))
  }

  function contextoDe(t: Tarefa) {
    if (t.obra_id) return { label: t.obra?.nome || 'Obra', href: `/obras/${t.obra_id}?tab=tarefas` }
    if (t.projeto_id) return { label: t.projeto?.nome || 'Projeto', href: `/projetos/${t.projeto_id}?tab=tarefas` }
    return null
  }

  const ordenadas = ordenarTarefas(tarefas)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} style={{ color: 'var(--accent)' }} />
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tarefas</h1>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const ativo = tab === id
          const discreto = id === 'todas'
          return (
            <button
              key={id}
              onClick={() => selecionar(id)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px flex-shrink-0"
              style={ativo
                ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                : { color: discreto ? 'var(--text-secondary)' : 'var(--text-primary)', borderColor: 'transparent', opacity: discreto ? 0.7 : 1 }}
            >
              <Icon size={15} /> {label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      ) : ordenadas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma tarefa aqui"
          description={
            tab === 'inbox' ? 'Tarefas sem responsável definido aparecem aqui até serem triadas.'
              : tab === 'hoje' ? 'Nada vencendo hoje nem atrasado. Bom trabalho.'
              : tab === 'aguardando' ? 'Nenhuma tarefa aguardando terceiros no momento.'
              : 'Cadastre tarefas para acompanhar pendências, com responsável, prazo e prioridade.'
          }
          action={<Button size="sm" icon={<Plus size={14} />} onClick={openNew}>Nova tarefa</Button>}
        />
      ) : (
        <div className="card overflow-hidden">
          {ordenadas.map(t => (
            <LinhaTarefa key={t.id} tarefa={t} onToggle={alternarConcluida} onEdit={openEdit} contexto={contextoDe(t)} />
          ))}
        </div>
      )}

      <TarefaModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditando(null) }}
        editando={editando}
        onSaved={onSaved}
      />
    </div>
  )
}
