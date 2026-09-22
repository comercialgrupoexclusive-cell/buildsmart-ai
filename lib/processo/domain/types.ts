// Motor de Processo (P3.1) — tipos do Core. Ver PROCESSO_P2_CONTRATO_MOTOR.md
// e PROCESSO_P3_PLANO_ACAO_CLAUDE.md na raiz da branch `processo`.
//
// `Processo` é raiz nova e canônica — nunca um alias de `projetos`/`obras`
// (lib/types.ts). Nenhum tipo aqui deve ganhar `obra_id`/`projeto_id`.

import type { ProcessoTemplateKey } from './template-registry'

export type ProcessoStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'

export const PROCESSO_STATUSES: readonly ProcessoStatus[] = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']

export type Processo = {
  id: string
  organization_id: string | null
  nome: string
  // Rótulo descritivo livre, digitado pelo usuário e apenas exibido. NÃO é
  // template e nenhum comportamento deve ser derivado dele (Tellus R01/A).
  tipo: string | null
  cliente_nome: string | null
  endereco: string | null
  responsavel_id: string | null
  status: ProcessoStatus
  // Receita de composição que este Processo declarou (domain/template-registry).
  // Nullable: Processos anteriores ao Tellus R01 não têm template e seguem válidos.
  template_key: ProcessoTemplateKey | null
  template_version: number | null
  // Compatibilização Funcional 01 — vínculo opcional com o Motor de Operação
  // (lib/operacoes). Operação é só agrupador acima do Processo; nenhum dos
  // três campos abaixo substitui `status` (estado técnico) nem cria uma
  // segunda unidade operacional. Todos nullable/0: Processos sem Operação
  // continuam válidos exatamente como antes.
  operacao_id: string | null
  etapa_operacional_id: string | null
  ordem_etapa: number
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
  // Precedência de módulos iniciais (travada em Tellus R01/A):
  //   1. `modulos` explícito vence — contrato que já existia;
  //   2. senão, módulos do template quando `template_key` for informado;
  //   3. senão, módulos com enabledByDefault do registry (comportamento antigo).
  modulos?: string[]
  // Receita de composição. Validada no Service antes de qualquer escrita.
  // `template_version` omitido resolve a versão corrente do registry.
  template_key?: ProcessoTemplateKey | null
  template_version?: number | null
}

export type AtualizarProcessoInput = Partial<
  Pick<Processo, 'nome' | 'tipo' | 'cliente_nome' | 'endereco' | 'responsavel_id'>
>

export type ListarProcessosFiltros = {
  status?: ProcessoStatus
  q?: string
}
