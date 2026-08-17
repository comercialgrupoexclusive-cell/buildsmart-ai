-- financiamento_itens.subetapa_ref_id apontava para subetapas_cronograma
-- (cronograma legado) e nunca chegou a ser usado (0 linhas preenchidas,
-- sem UI para defini-lo). Remove a dependência do cronograma legado.
alter table public.financiamento_itens
  drop column if exists subetapa_ref_id;
