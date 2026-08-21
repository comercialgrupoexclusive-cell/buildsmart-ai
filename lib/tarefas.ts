import { Tarefa } from '@/lib/types'

export const PRIORIDADE_LABEL: Record<Tarefa['prioridade'], string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
}

export const PRIORIDADE_COLOR: Record<Tarefa['prioridade'], string> = {
  baixa: 'var(--text-secondary)', normal: 'var(--accent)', alta: 'var(--warning)', urgente: 'var(--danger)',
}

export const PRIORIDADE_ORDEM: Record<Tarefa['prioridade'], number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

export const STATUS_LABEL: Record<Tarefa['status'], string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída', cancelada: 'Cancelada',
}

export const STATUS_COLOR: Record<Tarefa['status'], string> = {
  pendente: 'var(--text-secondary)', em_andamento: 'var(--accent)', aguardando: 'var(--warning)', concluida: 'var(--success)', cancelada: 'var(--text-secondary)',
}

export function isAtrasada(t: Pick<Tarefa, 'concluida' | 'data_prazo' | 'status'>): boolean {
  if (t.concluida || t.status === 'concluida' || t.status === 'cancelada') return false
  if (!t.data_prazo) return false
  return new Date(t.data_prazo + 'T23:59:59') < new Date()
}

export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isPrazoHoje(t: Pick<Tarefa, 'data_prazo'>): boolean {
  return t.data_prazo === hojeISO()
}

// Ordenação padrão das listas de tarefas em todo o BuildSmart:
// 1) atrasadas primeiro, 2) prioridade urgente/alta antes, 3) prazo mais
// próximo, 4) sem prazo por último.
export function ordenarTarefas<T extends Tarefa>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => {
    const atrasoA = isAtrasada(a)
    const atrasoB = isAtrasada(b)
    if (atrasoA !== atrasoB) return atrasoA ? -1 : 1

    const priA = PRIORIDADE_ORDEM[a.prioridade]
    const priB = PRIORIDADE_ORDEM[b.prioridade]
    if (priA !== priB) return priA - priB

    if (!a.data_prazo && !b.data_prazo) return 0
    if (!a.data_prazo) return 1
    if (!b.data_prazo) return -1
    return a.data_prazo.localeCompare(b.data_prazo)
  })
}

export const TAREFAS_ABERTAS = ['pendente', 'em_andamento', 'aguardando'] as const
