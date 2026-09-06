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
  responsavel_id: string | null
  status: ProcessoStatus
  created_at: string
  updated_at: string
  archived_at: string | null
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
}

export type AtualizarProcessoInput = Partial<
  Pick<Processo, 'nome' | 'tipo' | 'cliente_nome' | 'endereco' | 'responsavel_id'>
>

export type ListarProcessosFiltros = {
  status?: ProcessoStatus
  q?: string
}
