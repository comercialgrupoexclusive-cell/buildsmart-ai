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

// ─── Módulo Imóveis ─────────────────────────────────────────────────────────
export const FASE_IMOVEL_LABEL: Record<string, string> = {
  prospeccao: 'Prospecção',
  analise: 'Análise',
  aquisicao: 'Aquisição',
  reforma: 'Reforma',
  venda: 'Venda',
  concluido: 'Concluído',
  descartado: 'Descartado',
}

export const FASE_IMOVEL_COLOR: Record<string, string> = {
  prospeccao: '#8B5CF6',
  analise: '#3B7BF8',
  aquisicao: '#F59E0B',
  reforma: '#06B6D4',
  venda: '#10B981',
  concluido: '#22C55E',
  descartado: '#EF4444',
}

export const ORIGEM_IMOVEL_LABEL: Record<string, string> = {
  anuncio: 'Anúncio',
  leilao: 'Leilão',
  corretor: 'Corretor',
  indicacao: 'Indicação',
  outro: 'Outro',
}

export const TIPO_IMOVEL_LABEL: Record<string, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  terreno: 'Terreno',
  comercial: 'Comercial',
  outro: 'Outro',
}

export const STATUS_POSSE_LABEL: Record<string, string> = {
  ocupado: 'Ocupado',
  desocupacao_andamento: 'Desocupação em andamento',
  desocupado: 'Desocupado',
  nao_se_aplica: 'Não se aplica',
}

export const FINANCIAMENTO_LABEL: Record<string, string> = {
  a_vista: 'À vista',
  mcmv: 'Minha Casa Minha Vida',
  financiamento_bancario: 'Financiamento bancário',
  outro: 'Outro',
}
