// Registry simples e tipado dos módulos do Motor de Processo (seção 3.3 do
// plano P3). Deliberadamente não é um framework de plugins — é a lista
// única, no código, de quais módulos existem e quais ligam por padrão a um
// Processo novo. `processo_modulos` (banco) só guarda o estado
// habilitado/desabilitado por Processo; a definição do módulo vive aqui.
export type ProcessoModuleKey =
  | 'dados_gerais'
  | 'projeto_tecnico'
  | 'orcamento'
  | 'planejamento'
  | 'tarefas'
  | 'execucao'
  | 'medicoes'
  | 'compras'
  | 'financeiro'
  | 'financiamento'
  | 'rdo'
  | 'relatorios'
  | 'planta_baixa'
  | 'board'
  | 'caixa_entrada'
  | 'portal_cliente'

export type ProcessoModuleDefinition = {
  key: ProcessoModuleKey
  label: string
  enabledByDefault?: boolean
  routes?: string[]
  capabilities?: string[]
}

// Ordem = ordem de prioridade de migração da seção 4 do plano P3.
export const PROCESSO_MODULES: readonly ProcessoModuleDefinition[] = [
  { key: 'dados_gerais', label: 'Dados Gerais', enabledByDefault: true },
  { key: 'projeto_tecnico', label: 'Projeto técnico', enabledByDefault: true },
  { key: 'orcamento', label: 'Orçamento', enabledByDefault: true },
  { key: 'planejamento', label: 'Planejamento', enabledByDefault: true },
  { key: 'tarefas', label: 'Tarefas', enabledByDefault: true },
  { key: 'execucao', label: 'Execução' },
  { key: 'medicoes', label: 'Medições' },
  { key: 'compras', label: 'Compras' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'financiamento', label: 'Financiamento' },
  { key: 'rdo', label: 'RDO' },
  { key: 'relatorios', label: 'Relatórios' },
  // P4.6 Bloco B — não habilitado por padrão: é o editor de planta
  // paramétrico 2D/3D (OpenPlan3D vendorizado, motor oficial desde a
  // substituição do Axonometra), só faz sentido em Processos que precisam.
  // Key interna mantida (`planta_baixa`) para não quebrar `processo_modulos`
  // já gravado no banco — só o texto visível mudou.
  { key: 'planta_baixa', label: 'Planta 2D/3D' },
  // Rodada "núcleo operacional" — reaproveita o Board Excalidraw já
  // existente (components/board/ExcalidrawBoard.tsx: desenho, PDF,
  // arquivos, realtime, presence, NC), agora também vinculável por
  // processo_id. Não habilitado por padrão: nem todo Processo precisa de
  // quadro colaborativo.
  { key: 'board', label: 'Board' },
  // Núcleo do novo sistema — a Caixa de Entrada é onde a realidade bruta do
  // Processo entra (texto, imagem, documento, áudio), sem organização
  // prévia. Habilitada por padrão porque é o ponto de partida do fluxo
  // "usuário despeja realidade → sistema trabalha por baixo" para qualquer
  // Processo novo (processo_caixa_entrada, 20260919120000).
  { key: 'caixa_entrada', label: 'Caixa de Entrada', enabledByDefault: true },
  // Portal do Cliente — superfície de acompanhamento que o cliente do
  // Processo enxerga. Não habilitado por padrão: só Processos com cliente
  // externo acompanhando precisam expor o portal.
  { key: 'portal_cliente', label: 'Portal do Cliente' },
]

export function getProcessoModuleDefinition(key: string): ProcessoModuleDefinition | undefined {
  return PROCESSO_MODULES.find(m => m.key === key)
}

export function isValidProcessoModuleKey(key: string): key is ProcessoModuleKey {
  return PROCESSO_MODULES.some(m => m.key === key)
}

export function modulosHabilitadosPorPadrao(): ProcessoModuleKey[] {
  return PROCESSO_MODULES.filter(m => m.enabledByDefault).map(m => m.key)
}
