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
  // P4.6 Bloco B — não habilitado por padrão: é o editor de Planta Baixa
  // 2D (Axonometra vendorizado), só faz sentido em Processos que precisam.
  { key: 'planta_baixa', label: 'Planta Baixa' },
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
