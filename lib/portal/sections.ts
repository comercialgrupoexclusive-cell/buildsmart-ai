export const PORTAL_SECTIONS = [
  { id: 'feed', label: 'Feed', description: 'Publicacoes, fotos, destaques e conversas da obra.' },
  { id: 'overview', label: 'Visão Geral', description: 'Resumo executivo, avanço e destaques da obra.' },
  { id: 'evolucao', label: 'Evolução', description: 'Indicadores e evolução física da execução.' },
  { id: 'cronograma', label: 'Cronograma', description: 'Etapas, datas e andamento planejado.' },
  { id: 'financeiro', label: 'Financeiro', description: 'Valores realizados e pagos.' },
  { id: 'previsoes', label: 'Previsões', description: 'Próximos compromissos e desembolsos.' },
  { id: 'financiamento', label: 'Financiamento', description: 'Fontes de recursos e valores recebidos.' },
  { id: 'tour', label: 'Tour Virtual', description: 'Ambientes e panoramas 360° publicados.' },
  { id: 'board', label: 'Board', description: 'Decisões, dúvidas e pendências compartilhadas.' },
  { id: 'fotos', label: 'Fotos', description: 'Galeria de registros publicados da obra.' },
  { id: 'relatorios', label: 'Relatórios', description: 'Relatórios e documentos liberados ao cliente.' },
  { id: 'ia', label: 'Pergunte à IA', description: 'Assistente restrita aos dados publicados.' },
] as const

export type PortalSectionId = typeof PORTAL_SECTIONS[number]['id']
export type PortalVisibility = Record<PortalSectionId, boolean>

export const DEFAULT_PORTAL_VISIBILITY = Object.fromEntries(
  PORTAL_SECTIONS.map(section => [section.id, true]),
) as PortalVisibility

export function normalizePortalVisibility(value?: Partial<PortalVisibility> | null): PortalVisibility {
  return { ...DEFAULT_PORTAL_VISIBILITY, ...(value || {}) }
}
