// Motor de Processo (P3.1) — tipos do Core. Ver PROCESSO_P2_CONTRATO_MOTOR.md
// e PROCESSO_P3_PLANO_ACAO_CLAUDE.md na raiz da branch `processo`.
//
// `Processo` é raiz nova e canônica — nunca um alias de `projetos`/`obras`
// (lib/types.ts). Nenhum tipo aqui deve ganhar `obra_id`/`projeto_id`.

export type ProcessoStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'

export const PROCESSO_STATUSES: readonly ProcessoStatus[] = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']

export type Processo = {
  id: string
  organization_id: string | null
  nome: string
  tipo: string | null
  cliente_nome: string | null
  endereco: string | null
  // Endereço estruturado (seção 3 canônica) — preenchimento via CEP lookup
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  responsavel_id: string | null
  status: ProcessoStatus
  created_at: string
  updated_at: string
  archived_at: string | null
  capa_url: string | null
  grupo_id: string | null
  template_id: string | null
  template_key: string | null
}

// Grupo é só um rótulo que envolve Processos na listagem — sem descrição,
// sem hierarquia, sem regra de negócio própria. Um Processo pertence a no
// máximo um grupo (processos.grupo_id).
export type ProcessoGrupo = {
  id: string
  organization_id: string | null
  nome: string
  created_at: string
}

// Rastro de uso por pessoa: alimenta a ordenação da lista ("último uso") e
// as últimas ações mostradas no card. Uma linha por (processo, pessoa,
// módulo) — o upsert só empurra `used_at` para frente.
export type ProcessoUso = {
  processo_id: string
  module_key: string
  used_at: string
}

export type ProcessoModuloVinculo = {
  id: string
  processo_id: string
  module_key: string
  enabled: boolean
  enabled_at: string
  disabled_at: string | null
}

export type CriarProcessoInput = {
  nome: string
  tipo?: string | null
  cliente_nome?: string | null
  endereco?: string | null
  responsavel_id?: string | null
  organization_id?: string | null
  // Se omitido, usa os módulos com enabledByDefault do registry (ver
  // domain/module-registry.ts) — o chamador nunca precisa conhecer a lista.
  modulos?: string[]
  // Receita que originou o Processo (processo_templates). Fica gravada
  // porque decide o que aparece no cadastro depois, não só na criação.
  template_id?: string | null
}

export type AtualizarProcessoInput = Partial<
  Pick<Processo, 'nome' | 'tipo' | 'cliente_nome' | 'endereco' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'responsavel_id' | 'capa_url' | 'grupo_id'>
>

export type ListarProcessosFiltros = {
  status?: ProcessoStatus
  q?: string
}
