// Definição do Dock: só a estrutura de navegação. O conteúdo de cada aba vem
// dos módulos reais do BuildSmart (app/experimento-360/modulos/), nunca de uma
// segunda implementação declarada aqui.

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

// Abas de um Processo aberto — o Dock assume este conjunto ao entrar num
// Processo e volta ao global ao sair.
export const DOCK_PROCESSO: ItemDock[] = [
  { id: 'visao-geral', rotulo: 'Visão geral' },
  { id: 'tempo', rotulo: 'Tempo' },
  { id: 'pesquisa', rotulo: 'Pesquisa' },
  { id: 'board', rotulo: 'Board' },
  { id: 'financeiro', rotulo: 'Financeiro' },
  { id: 'config', rotulo: 'Config' },
]
