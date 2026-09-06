// Ponto único de import do Motor de Processo para o resto do app:
// `import { criarProcesso, PROCESSO_MODULES } from '@/lib/processo'`.
// Nunca importar repository/service diretamente fora desta pasta — só as
// Actions são contrato público (ver actions/processo-actions.ts).
export * from './actions/processo-actions'
export * from './domain/types'
export * from './domain/module-registry'
