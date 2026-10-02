// Registry dos widgets da Visão Geral. Cada organização/módulo nasce com uma
// composição padrão; o usuário pode reordenar e ocultar (preferências por
// usuário+organização, lib/dashboard/preferencias.ts). Assim a mesma superfície
// serve o investidor (compra/reforma/venda), a obra, etc. — cada uma mostra o
// que faz sentido, sem telas separadas.

export type DashboardModulo = 'investidor' | 'obra'

export type WidgetKey =
  | 'investidor_kpis'
  | 'investidor_etapas'
  | 'investidor_alertas'
  | 'investidor_mapa'
  | 'investidor_carteira'
  | 'investidor_prospeccao'
  | 'clima'

export type WidgetDef = {
  key: WidgetKey
  titulo: string
  // Alguns widgets ocupam a largura toda; outros podem dividir em 2 colunas no desktop.
  largura: 'full' | 'metade'
  // Em quais módulos o widget faz sentido (entra na composição automática).
  modulos: DashboardModulo[]
  // Se false, não pode ser ocultado (ex.: KPIs — espinha do painel).
  ocultavel?: boolean
}

export const WIDGETS: WidgetDef[] = [
  { key: 'investidor_kpis', titulo: 'Indicadores da carteira', largura: 'full', modulos: ['investidor'], ocultavel: false },
  { key: 'investidor_etapas', titulo: 'Operações por etapa', largura: 'metade', modulos: ['investidor'] },
  { key: 'investidor_alertas', titulo: 'Alertas e pendências', largura: 'metade', modulos: ['investidor'] },
  { key: 'clima', titulo: 'Previsão do tempo', largura: 'metade', modulos: ['investidor', 'obra'] },
  { key: 'investidor_mapa', titulo: 'Mapa de operações', largura: 'full', modulos: ['investidor'] },
  { key: 'investidor_carteira', titulo: 'Carteira atual', largura: 'full', modulos: ['investidor'] },
  { key: 'investidor_prospeccao', titulo: 'Prospecção pública', largura: 'full', modulos: ['investidor'] },
]

export const WIDGET_POR_KEY: Record<WidgetKey, WidgetDef> = Object.fromEntries(
  WIDGETS.map(w => [w.key, w]),
) as Record<WidgetKey, WidgetDef>

// Composição automática por módulo: a ordem em que os widgets nascem.
export const COMPOSICAO_PADRAO: Record<DashboardModulo, WidgetKey[]> = {
  investidor: [
    'investidor_kpis',
    'investidor_etapas',
    'investidor_alertas',
    'investidor_mapa',
    'investidor_carteira',
    'investidor_prospeccao',
    'clima',
  ],
  obra: ['clima'],
}

export function composicaoPadrao(modulo: DashboardModulo): WidgetKey[] {
  return COMPOSICAO_PADRAO[modulo] ?? []
}
