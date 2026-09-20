// Ponto único de import do domínio Investidor para a UI/API/futura IA:
//   import { salvarValidacaoFicha, INVESTIDOR_ACTIONS } from '@/lib/investidor'
//
// Contrato público = as Actions. Repository/Service não devem ser importados
// fora desta pasta (mesma disciplina de lib/processo).
export * from './actions'
export type {
  ValidacaoFichaEntrada,
  ValidacaoFichaResultado,
  CampoManualEntrada,
  CampoManualPlano,
} from './service'
// A resolução da oportunidade 1:1 do Processo já existe e faz parte do mesmo
// domínio — reexportada aqui para o contrato ficar num lugar só.
export { obterOuCriarProspeccaoDoProcesso } from '@/lib/investidor-processo'
