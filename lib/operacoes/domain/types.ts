// Motor de Operação (Compatibilização Funcional 01) — tipos do Core.
//
// OPERAÇÃO ↓ PROCESSOS ↓ ETAPA OPERACIONAL CONFIGURÁVEL
//
// Operação é só agrupador/contexto acima de Processos — NÃO é um segundo
// Motor. Processo (lib/processo) continua sendo a única unidade operacional;
// nada aqui duplica ou substitui o que já existe lá.

export type Operacao = {
  id: string
  organization_id: string
  nome: string
  descricao: string | null
  created_at: string
  updated_at: string
}

// Etapa operacional é DADO DO USUÁRIO, nunca enum de código. O `id` é
// estável mesmo quando `nome` muda — é o que processos.etapa_operacional_id
// referencia. `ordem` decide a posição da coluna no Kanban.
export type OperacaoEtapa = {
  id: string
  operacao_id: string
  nome: string
  ordem: number
  cor: string | null
  created_at: string
  updated_at: string
}

export type CriarOperacaoInput = {
  nome: string
  descricao?: string | null
  organization_id?: string | null
  // Quando true, semeia as etapas provisórias do template Investidor
  // (ver domain/etapas-seed.ts). Só configuração inicial — nenhuma lógica de
  // negócio depende desses nomes, e o usuário pode alterá-los livremente
  // depois.
  etapasIniciais?: readonly string[]
}

export type AtualizarOperacaoInput = Partial<Pick<Operacao, 'nome' | 'descricao'>>

export type CriarEtapaInput = {
  operacao_id: string
  nome: string
  cor?: string | null
}

export type AtualizarEtapaInput = Partial<Pick<OperacaoEtapa, 'nome' | 'cor'>>
