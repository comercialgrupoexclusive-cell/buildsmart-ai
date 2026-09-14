// Experimento visual "Tellus" (branch experimento/tellus-hero) — dados
// placeholder tirados direto da referência visual, sem ligação com o banco
// real do BuildSmart. Ver componentes irmãos neste diretório.

export type ProjetoResumo = {
  id: string
  nome: string
  tipo: string
  cidade: string
  status: 'Em execução' | 'Planejamento' | 'Em análise' | 'Ideação'
  thumbnail: string
}

export const PROJETOS: ProjetoResumo[] = [
  { id: 'allegra', nome: 'Allegra', tipo: 'Residencial', cidade: 'São Paulo, SP', status: 'Em execução', thumbnail: '🏠' },
  { id: 'rios-do-amanha', nome: 'Rios do Amanhã', tipo: 'Infraestrutura', cidade: 'Minas Gerais, MG', status: 'Planejamento', thumbnail: '🌉' },
  { id: 'verde-urbano', nome: 'Verde Urbano', tipo: 'Sustentabilidade', cidade: 'Curitiba, PR', status: 'Em análise', thumbnail: '🌳' },
  { id: 'conexoes', nome: 'Conexões', tipo: 'Mobilidade', cidade: 'Rio de Janeiro, RJ', status: 'Ideação', thumbnail: '🚇' },
  { id: 'horizonte-azul', nome: 'Horizonte Azul', tipo: 'Recursos Hídricos', cidade: 'Fortaleza, CE', status: 'Planejamento', thumbnail: '💧' },
]

export const PROJETO_ALLEGRA = {
  nome: 'Allegra',
  tipo: 'Residencial',
  cidade: 'São Paulo, SP',
  status: 'Em execução' as const,
  descricao: 'Mais que um projeto. Um território de novas possibilidades. Habitação inteligente, integração urbana e qualidade de vida em harmonia com o entorno.',
  progresso: 68.4,
  orcamentoTotal: 124_000_000,
  etapas: 12,
  parceiros: 5,
  entregaPrevista: 'Mar/2026',
}

export type LinhaOrcamento = {
  categoria: string
  previsto: number
  realizado: number
  status: 'ok' | 'atencao' | 'pendente'
}

// Valores em reais cheios (a soma dos previstos bate com o total do
// projeto, R$ 124.000.000, exatamente como na referência).
export const ORCAMENTO_ALLEGRA: LinhaOrcamento[] = [
  { categoria: 'Terraplanagem', previsto: 18_500_000, realizado: 16_200_000, status: 'ok' },
  { categoria: 'Fundações', previsto: 32_000_000, realizado: 28_450_000, status: 'ok' },
  { categoria: 'Estrutura', previsto: 28_000_000, realizado: 21_900_000, status: 'ok' },
  { categoria: 'Instalações', previsto: 25_000_000, realizado: 18_750_000, status: 'atencao' },
  { categoria: 'Acabamentos', previsto: 20_500_000, realizado: 8_300_000, status: 'pendente' },
]

export const OPERACOES_ALLEGRA = {
  obras: 24,
  obrasVariacao: '+9%',
  equipe: 112,
  equipeVariacao: '+3%',
  ocorrencias: 3,
  ocorrenciasVariacao: '-40%',
  conformidade: 98,
  conformidadeVariacao: '+12%',
}

export const NAV_ICONS = ['Mundos', 'Projetos', 'Orçamento', 'Planejamento', 'Execução', 'Compras', 'Financeiro', 'Relatórios'] as const

export const TOP_NAV_LINKS = ['TERRITÓRIOS', 'PESSOAS', 'RECURSOS', 'RESULTADOS', 'UM AMANHÃ', 'MAIS REAL'] as const

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
