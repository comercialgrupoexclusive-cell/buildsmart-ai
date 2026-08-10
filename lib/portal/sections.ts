export const PORTAL_SECTIONS = [
  { id: 'feed', label: 'Feed', description: 'Publicações, fotos, destaques e conversas da obra.' },
  { id: 'overview', label: 'Visão Geral', description: 'Resumo executivo, avanço e destaques da obra.' },
  { id: 'evolucao', label: 'Evolução', description: 'Indicadores e evolução física da execução.' },
  { id: 'cronograma', label: 'Cronograma', description: 'Etapas, datas e andamento planejado.' },
  { id: 'financeiro', label: 'Financeiro', description: 'Valores realizados e pagos.' },
  { id: 'previsoes', label: 'Previsões', description: 'Próximos lançamentos e compras.' },
  { id: 'financiamento', label: 'Financiamento', description: 'Fontes de recursos e valores recebidos.' },
  { id: 'tour', label: 'Tour Virtual', description: 'Ambientes e panoramas 360° publicados.' },
  { id: 'board', label: 'Board', description: 'Decisões, dúvidas e pendências compartilhadas.' },
  { id: 'fotos', label: 'Fotos', description: 'Galeria de registros publicados da obra.' },
  { id: 'relatorios', label: 'Relatórios', description: 'Relatórios e documentos liberados ao cliente.' },
  { id: 'ia', label: 'Pergunte à IA', description: 'Assistente restrita aos dados publicados.' },
] as const

export type PortalSectionId = typeof PORTAL_SECTIONS[number]['id']
export type PortalVisibility = Record<PortalSectionId, boolean>

export const PORTAL_CONTENT_ITEMS = {
  feed: [
    { id: 'stories', label: 'Stories' },
    { id: 'posts', label: 'Publicações' },
    { id: 'messages', label: 'Mensagens' },
  ],
  overview: [
    { id: 'hero', label: 'Capa da obra' },
    { id: 'indicators', label: 'Indicadores' },
    { id: 'charts', label: 'Gráficos' },
    { id: 'forecasts', label: 'Próximos lançamentos' },
    { id: 'quickLinks', label: 'Atalhos' },
  ],
  evolucao: [
    { id: 'indicators', label: 'Indicadores' },
    { id: 'activeStages', label: 'Em execução agora' },
    { id: 'stageProgress', label: 'Avanço por etapa' },
  ],
  financeiro: [
    { id: 'indicators', label: 'Indicadores' },
    { id: 'chart', label: 'Gráfico mensal' },
    { id: 'recent', label: 'Lançamentos recentes' },
    { id: 'allEntries', label: 'Todos os lançamentos' },
  ],
  previsoes: [
    { id: 'indicators', label: 'Indicadores' },
    { id: 'launches', label: 'Próximos lançamentos' },
    { id: 'purchases', label: 'Próximas compras' },
    { id: 'charts', label: 'Gráficos' },
  ],
} as const

export type PortalContentSection = keyof typeof PORTAL_CONTENT_ITEMS
export type PortalContentVisibility = Record<PortalContentSection, Record<string, boolean>>

export const DEFAULT_PORTAL_CONTENT_VISIBILITY = Object.fromEntries(
  Object.entries(PORTAL_CONTENT_ITEMS).map(([section, items]) => [section, Object.fromEntries(items.map(item => [item.id, true]))]),
) as PortalContentVisibility

export const DEFAULT_PORTAL_VISIBILITY = Object.fromEntries(
  PORTAL_SECTIONS.map(section => [section.id, true]),
) as PortalVisibility

export function normalizePortalVisibility(value?: Partial<PortalVisibility> | null): PortalVisibility {
  return { ...DEFAULT_PORTAL_VISIBILITY, ...(value || {}) }
}

export function normalizePortalContentVisibility(value?: Partial<PortalContentVisibility> | null): PortalContentVisibility {
  return Object.fromEntries(Object.entries(DEFAULT_PORTAL_CONTENT_VISIBILITY).map(([section, defaults]) => [
    section,
    { ...defaults, ...((value || {})[section as PortalContentSection] || {}) },
  ])) as PortalContentVisibility
}
