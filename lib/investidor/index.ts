// Ponto único de import do domínio Investidor para a UI/API/futura IA:
//   import { salvarValidacaoFicha, INVESTIDOR_ACTIONS } from '@/lib/investidor'
//
// Contrato público = as Actions (Seção D). Repository/Service não devem ser
// importados fora desta pasta (mesma disciplina de lib/processo).
export * from './actions'
export type {
  ValidacaoFichaEntrada,
  ValidacaoFichaResultado,
  CampoManualEntrada,
  CampoManualPlano,
} from './service'
// O vínculo canônico Processo ↔ oportunidade (Seção B) vive em
// lib/investidor-oportunidade.ts. Reexportado aqui para o domínio ter um
// contrato único, sem duplicar a lógica de vínculo.
export {
  obterOportunidadeDoProcesso,
  listarOportunidadesVinculaveis,
  vincularOportunidadeAoProcesso,
  criarOportunidadeDoProcesso,
  desvincularOportunidade,
} from '@/lib/investidor-oportunidade'
