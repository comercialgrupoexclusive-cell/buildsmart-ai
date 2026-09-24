// Template de Processo — agora é dado (processo_templates), não registry no
// código. O usuário cria e edita os próprios: quais módulos nascem ligados e
// quais campos do cadastro não se aplicam.

// Campos do cadastro que um template pode esconder. Lista fechada de
// propósito: nome e status nunca somem, então nem entram aqui.
export type CampoOcultavel = 'cliente_nome' | 'endereco' | 'tipo' | 'responsavel_id'

export const CAMPOS_OCULTAVEIS: { campo: CampoOcultavel; label: string }[] = [
  { campo: 'cliente_nome', label: 'Cliente' },
  { campo: 'endereco', label: 'Endereço' },
  { campo: 'tipo', label: 'Tipo' },
  { campo: 'responsavel_id', label: 'Responsável' },
]

export type ProcessoTemplate = {
  id: string
  organization_id: string
  nome: string
  descricao: string | null
  modulos: string[]
  campos_ocultos: CampoOcultavel[]
  created_at: string
  updated_at: string
}

export type SalvarTemplateInput = {
  nome: string
  descricao?: string | null
  modulos: string[]
  campos_ocultos: CampoOcultavel[]
}

// Sem template, nada é escondido — um Processo em branco mostra tudo.
export function campoOcultoPor(template: ProcessoTemplate | null | undefined, campo: CampoOcultavel): boolean {
  return template?.campos_ocultos?.includes(campo) ?? false
}
