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

export function fixMojibake(text: string | null | undefined): string {
  if (!text) return ''
  try {
    const bytes = new Uint8Array([...text].map(c => c.charCodeAt(0)))
    const decoded = new TextDecoder('utf-8').decode(bytes)
    if (/Ã|Â/.test(text) && !(/Ã|Â/.test(decoded))) return decoded
  } catch {}
  return text
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
  planejada: 'A executar',
  em_andamento: 'Em execucao',
  concluida: 'Concluída',
  atrasada: 'Ponto de atencao',
}

export const STATUS_ETAPA_COLOR: Record<string, string> = {
  planejada: 'bg-blue-500/20 text-blue-400',
  em_andamento: 'bg-emerald-500/20 text-emerald-400',
  concluida: 'bg-green-500/20 text-green-400',
  atrasada: 'bg-amber-500/20 text-amber-400',
}

export const STATUS_MATERIAL_COLOR: Record<string, string> = {
  nao_comprado: 'text-red-400',
  parcial: 'text-yellow-400',
  comprado: 'text-green-400',
}

export const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  pix: 'PIX',
  cartao: 'Cartão',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  reembolso: 'Reembolso',
  pix_cartao: 'PIX + Cartão',
  cartao_reembolso: 'Cartão + Reembolso',
}

// Tipo de custo (coluna TIPO da planilha de controle de custos).
// Rótulo completo (com código) para selects/badges; curto para gráficos e PDF.
export const TIPO_CUSTO_LABEL: Record<string, string> = {
  material: '01 · Material',
  mao_de_obra: '02 · Mão de obra',
  equipamento: '03 · Equipamento',
  custo_indireto: '04 · Custo indireto',
  taxa: '05 · Taxa',
  servico: '06 · Serviço',
  outros: 'Outros',
}

export const TIPO_CUSTO_LABEL_CURTO: Record<string, string> = {
  material: 'Material',
  mao_de_obra: 'Mão de obra',
  equipamento: 'Equipamento',
  custo_indireto: 'Custo indireto',
  taxa: 'Taxa',
  servico: 'Serviço',
  outros: 'Outros',
}

export const TIPO_CUSTO_COLOR: Record<string, string> = {
  material: '#3B7BF8',
  mao_de_obra: '#10B981',
  equipamento: '#8B5CF6',
  custo_indireto: '#F59E0B',
  taxa: '#EF4444',
  servico: '#06B6D4',
  outros: '#64748B',
}
