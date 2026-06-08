-- ====================================================================
-- Migração: prazos próprios para subetapas (itens de orçamento)
--
-- Contexto: na aba Cronograma da obra, as "subetapas" exibidas na cascata
-- (Gantt) e na planilha vêm dos itens do orçamento vinculados a uma etapa.
-- Hoje elas só herdam o período da etapa-mãe — o usuário pediu para poder
-- editar o prazo de cada subetapa diretamente na cascata. Para isso,
-- cada item de orçamento ganha seu próprio intervalo opcional de datas
-- (quando vazio, a subetapa continua sendo distribuída dentro do período
-- da etapa, como já acontece hoje).
--
-- Aditivo / seguro de rodar em produção (não apaga dados).
-- ====================================================================

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE;

COMMENT ON COLUMN orcamento_itens.data_inicio IS 'Início planejado da subetapa (opcional — se vazio, é distribuída dentro do período da etapa-mãe)';
COMMENT ON COLUMN orcamento_itens.data_fim IS 'Término planejado da subetapa (opcional — se vazio, é distribuída dentro do período da etapa-mãe)';
