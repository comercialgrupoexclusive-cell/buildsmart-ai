import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(' ')
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(date: string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function diasAteData(data: string): number {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(data)
  alvo.setHours(0, 0, 0, 0)
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

export const STATUS_OBRA_LABEL: Record<string, string> = {
  orcamento: 'Orçamento',
  ativa: 'Ativa',
  concluida: 'Concluída',
  paralisada: 'Paralisada',
}

export const STATUS_OBRA_COLOR: Record<string, string> = {
  orcamento: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ativa: 'bg-green-500/20 text-green-400 border-green-500/30',
  concluida: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  paralisada: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export const STATUS_ETAPA_LABEL: Record<string, string> = {
  planejada: 'Planejada',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
}

export const STATUS_ETAPA_COLOR: Record<string, string> = {
  planejada: 'bg-blue-500/20 text-blue-400',
  em_andamento: 'bg-yellow-500/20 text-yellow-400',
  concluida: 'bg-green-500/20 text-green-400',
  atrasada: 'bg-red-500/20 text-red-400',
}

export const STATUS_MATERIAL_COLOR: Record<string, string> = {
  nao_comprado: 'text-red-400',
  parcial: 'text-yellow-400',
  comprado: 'text-green-400',
}
