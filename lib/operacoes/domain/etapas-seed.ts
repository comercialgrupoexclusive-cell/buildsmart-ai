// Conjunto padrão PROVISÓRIO de etapas para uma Operação de investimento
// imobiliário (Compatibilização Funcional 01, item 3).
//
// Isto é só configuração inicial — uma lista de nomes para semear
// operacao_etapas na criação da Operação. NÃO é enum, NÃO é regra de
// negócio: nenhum código deve comparar `etapa.nome === 'Reforma'` ou
// similar. Depois de criadas, o usuário renomeia/reordena/exclui livremente,
// exatamente como qualquer outra etapa.
export const ETAPAS_SEED_INVESTIDOR: readonly string[] = [
  'Aquisição',
  'Regularização / Posse',
  'Reforma',
  'Pronto para venda',
  'À venda',
  'Negociação',
  'Vendido',
  'Encerrado',
]
