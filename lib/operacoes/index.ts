// Ponto único de import do Motor de Operação para o resto do app:
// `import { criarOperacao, ETAPAS_SEED_INVESTIDOR } from '@/lib/operacoes'`.
// Nunca importar repository/service diretamente fora desta pasta — só as
// Actions são contrato público (mesma disciplina de lib/processo).
export * from './actions/operacoes-actions'
export * from './domain/types'
export { ETAPAS_SEED_INVESTIDOR } from './domain/etapas-seed'
