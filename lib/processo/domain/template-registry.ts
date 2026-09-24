// Template de Processo — versão leve. Mesma filosofia do module-registry:
// a lista vive no código, e `processos.template_key` (coluna que já existia)
// só guarda qual foi escolhido.
//
// Um template responde duas coisas: quais módulos já nascem ligados, e quais
// campos do cadastro não fazem sentido naquele contexto. Nada além disso —
// não é workflow, não é motor novo.
import type { ProcessoModuleKey } from './module-registry'

// Campos do cadastro que um template pode esconder. Restrito de propósito:
// nome e status nunca somem, então nem entram aqui.
export type CampoOcultavel = 'cliente_nome' | 'endereco' | 'tipo'

export type ProcessoTemplate = {
  key: string
  label: string
  descricao: string
  modulos: ProcessoModuleKey[]
  camposOcultos: CampoOcultavel[]
}

export const PROCESSO_TEMPLATES: readonly ProcessoTemplate[] = [
  {
    key: 'leilao',
    label: 'Leilão',
    descricao: 'Aquisição de imóvel em leilão — ainda não há cliente, o comprador é você.',
    // Análise de aquisição, não canteiro: orçamento e financeiro entram,
    // planejamento e execução não.
    modulos: ['dados_gerais', 'caixa_entrada', 'orcamento', 'financeiro', 'tarefas'],
    // Num leilão não existe cliente contratante — o arremate é próprio.
    // Pedir "Cliente" só produz campo vazio em toda ficha.
    camposOcultos: ['cliente_nome'],
  },
]

export function getProcessoTemplate(key: string | null | undefined): ProcessoTemplate | undefined {
  if (!key) return undefined
  return PROCESSO_TEMPLATES.find(t => t.key === key)
}

export function campoOculto(templateKey: string | null | undefined, campo: CampoOcultavel): boolean {
  return getProcessoTemplate(templateKey)?.camposOcultos.includes(campo) ?? false
}

export function listarTemplates(): readonly ProcessoTemplate[] {
  return PROCESSO_TEMPLATES
}
