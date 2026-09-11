// Tipos/helpers da UI canônica do Orçamento no Processo. Movidos para
// lib/orcamento/arvore.ts (P4.4) para que lib/financeiro.ts e
// lib/planejamento-progresso.ts leiam a mesma fonte de valor canônico em vez
// de reimplementar quantidade × preço em paralelo — este arquivo só
// re-exporta para não quebrar os imports existentes dos componentes daqui.
export type {
  LinhaArvore,
  InsumoDetalhe,
  EtapaResumo,
} from '@/lib/orcamento/arvore'
export {
  calcularTotal,
  agruparPorEtapa,
  SEM_ETAPA_ID,
} from '@/lib/orcamento/arvore'
