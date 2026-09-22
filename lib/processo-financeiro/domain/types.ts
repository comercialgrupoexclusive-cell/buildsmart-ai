// Financeiro REAL do Processo (Compatibilização Funcional 01/parte B).
//
// FINANCEIRO REAL ≠ VIABILIDADE/CENÁRIOS. Este domínio nunca lê nem escreve
// em `prospeccao_cenarios` (previsão/simulação) nem em `compra_itens`/
// Orçamento (Financeiro de obra) — é uma fonte própria, canônica, de
// movimentação financeira já ocorrida ou pendente de um Processo.
//
// `categoria` é texto livre digitado pelo usuário — NUNCA um enum de
// código. Exemplos (Aquisição/Arrematação, Leiloeiro, ITBI, Registro/
// Escritura, Condomínio, IPTU, Reforma, Jurídico, Corretagem, Impostos,
// Venda, Outros…) são só configuração de uso, nada aqui deriva
// comportamento do texto da categoria.

export type NaturezaLancamento = 'ENTRADA' | 'SAIDA'
export const NATUREZAS_LANCAMENTO: readonly NaturezaLancamento[] = ['ENTRADA', 'SAIDA']

export type StatusLancamento = 'PENDENTE' | 'REALIZADO' | 'CANCELADO'
export const STATUS_LANCAMENTO: readonly StatusLancamento[] = ['PENDENTE', 'REALIZADO', 'CANCELADO']

export type LancamentoFinanceiro = {
  id: string
  processo_id: string
  natureza: NaturezaLancamento
  categoria: string
  descricao: string | null
  valor: number
  status: StatusLancamento
  data_lancamento: string | null
  data_realizacao: string | null
  comprovante_url: string | null
  observacao: string | null
  created_at: string
  updated_at: string
}

export type CriarLancamentoInput = {
  processo_id: string
  natureza: NaturezaLancamento
  categoria: string
  descricao?: string | null
  valor: number
  status?: StatusLancamento
  data_lancamento?: string | null
  data_realizacao?: string | null
  comprovante_url?: string | null
  observacao?: string | null
}

export type AtualizarLancamentoInput = Partial<
  Pick<
    LancamentoFinanceiro,
    'natureza' | 'categoria' | 'descricao' | 'valor' | 'status' | 'data_lancamento' | 'data_realizacao' | 'comprovante_url' | 'observacao'
  >
>

// Derivado da fonte única (lançamentos) — nunca persistido. Recalculado a
// cada leitura para nunca divergir dos lançamentos reais.
export type ResumoFinanceiroProcesso = {
  entradas_realizadas: number
  saidas_realizadas: number
  saldo_realizado: number
  entradas_pendentes: number
  saidas_pendentes: number
}
