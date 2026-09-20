// Registry de Templates do Motor de Processo (Tellus R01 — Seção A).
//
// Mesma filosofia do module-registry ao lado: NÃO é engine de plugins, nem
// workflow engine, nem event bus. É a lista única, no código, dos templates
// que existem e de qual configuração inicial cada um determina.
//
// Template é uma RECEITA/CONFIGURAÇÃO do mesmo Motor — não é tela, dashboard,
// portal nem segunda raiz operacional. O banco (`processos.template_key` e
// `processos.template_version`) guarda apenas qual receita um Processo
// declarou; a definição da receita vive aqui.
//
// IMPORTANTE — `processos.tipo` NÃO é template. `tipo` é rótulo descritivo
// livre, digitado pelo usuário e apenas exibido (valores reais hoje:
// "Execução de obra - TESTE", "OBRA_CAIXA"). Os dois conceitos são
// deliberadamente separados e nenhum código deve derivar um do outro.
import type { ProcessoModuleKey } from './module-registry'

export type ProcessoTemplateKey = 'investimento_imobiliario_investidor'

export type ProcessoTemplateDefinition = {
  key: ProcessoTemplateKey
  version: number
  label: string
  /** Módulos que um Processo deste template começa habilitando. */
  modules: ProcessoModuleKey[]
  /**
   * Declarativo apenas. Nomeia capacidades reais já existentes no sistema
   * para uso em seções posteriores; NADA consome este campo na Seção A.
   */
  capabilities?: string[]
}

// Versionado: uma nova versão de um template entra como entrada adicional,
// nunca editando a anterior — Processos já criados continuam resolvendo a
// versão com que nasceram.
export const PROCESSO_TEMPLATES: readonly ProcessoTemplateDefinition[] = [
  {
    key: 'investimento_imobiliario_investidor',
    version: 1,
    label: 'Investimento Imobiliário — Investidor',
    // Escolhidos SOMENTE entre capacidades que já existem no module-registry
    // hoje. Deliberadamente fora: `projeto_tecnico` e `planejamento` (projeto
    // e cronograma de execução de obra não pertencem à análise de aquisição),
    // e qualquer módulo de canteiro (execucao, medicoes, rdo, compras,
    // financiamento, planta_baixa, board) — nenhum deles foi migrado para
    // este contexto e habilitá-los seria fantasia.
    //
    // As capacidades do Investidor (ficha, evidências, mercado, comparáveis,
    // cenários, viabilidade, decisão) NÃO possuem module_key própria hoje —
    // vivem em components/investidor/**. Por isso não há módulo para elas
    // aqui; criá-lo é escopo de seção posterior, não da Seção A.
    modules: ['dados_gerais', 'caixa_entrada', 'orcamento', 'financeiro', 'tarefas', 'relatorios'],
    capabilities: [
      'prospeccao.ficha',
      'prospeccao.evidencias',
      'prospeccao.mercado',
      'prospeccao.cenarios',
      'prospeccao.decisao',
    ],
  },
]

/** Versão corrente (maior) registrada para uma key. */
function versaoCorrente(key: string): number | undefined {
  const versoes = PROCESSO_TEMPLATES.filter(t => t.key === key).map(t => t.version)
  return versoes.length ? Math.max(...versoes) : undefined
}

/**
 * Resolve a definição. Sem `version`, devolve a versão corrente da key.
 * Devolve `undefined` para key ou versão inexistente — quem decide se isso é
 * erro é o Service (domain/service valida antes de qualquer escrita).
 */
export function getProcessoTemplate(key: string, version?: number): ProcessoTemplateDefinition | undefined {
  const alvo = version ?? versaoCorrente(key)
  if (alvo === undefined) return undefined
  return PROCESSO_TEMPLATES.find(t => t.key === key && t.version === alvo)
}

export function isValidProcessoTemplateKey(key: string): key is ProcessoTemplateKey {
  return PROCESSO_TEMPLATES.some(t => t.key === key)
}

/** Módulos iniciais determinados pelo template. Vazio se não resolver. */
export function modulosDoTemplate(key: string, version?: number): ProcessoModuleKey[] {
  return [...(getProcessoTemplate(key, version)?.modules ?? [])]
}

export function listarProcessoTemplates(): readonly ProcessoTemplateDefinition[] {
  return PROCESSO_TEMPLATES
}
