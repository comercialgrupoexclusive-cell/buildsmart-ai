// Definição do Dock. Esta etapa é só de interface/navegação: nenhum conteúdo
// real de módulo é implementado, só a estrutura que permite o Dock trocar de
// contexto (global ↔ dentro de um Processo) e voltar.

export type ItemDock = {
  id: string
  rotulo: string
}

// Menu principal do sistema (nível global).
export const DOCK_GLOBAL: ItemDock[] = [
  { id: 'visao-geral', rotulo: 'Visão geral' },
  { id: 'tempo', rotulo: 'Tempo' },
  { id: 'processos', rotulo: 'Processos' },
  { id: 'config', rotulo: 'Config' },
]

// Abas de um Processo aberto (o Dock assume este conjunto ao entrar num
// Processo). Conteúdo real de cada aba fica para as próximas etapas.
export const DOCK_PROCESSO: ItemDock[] = [
  { id: 'visao-geral', rotulo: 'Visão geral' },
  { id: 'tempo', rotulo: 'Tempo' },
  { id: 'pesquisa', rotulo: 'Pesquisa' },
  { id: 'board', rotulo: 'Board' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'config', rotulo: 'Config' },
]

// Processo de teste — nesta etapa não há dados nem Motor de Processo por trás.
export const PROCESSO_TESTE = { id: 'proc-teste', nome: 'Processo de teste' }
