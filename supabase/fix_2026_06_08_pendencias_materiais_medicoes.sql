-- ====================================================================
-- Fix consolidado — pendências identificadas em produção (2026-06-08)
--
-- Roda 3 migrações aditivas e seguras de uma vez só (não apaga dados):
--   1) materiais.subetapa            -> agrupamento de materiais por subetapa
--      (causa raiz de "materiais não puxam do orçamento": o código consulta/
--      grava esse campo e o banco recusava com "column does not exist")
--   2) medicoes.nome / fotos / updated_at -> registro completo de medições
--   3) orcamento_itens.data_inicio / data_fim -> prazo próprio por subetapa
--      no Cronograma
--
-- Pode ser executado quantas vezes quiser (IF NOT EXISTS em tudo).
-- ====================================================================

ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS subetapa TEXT;

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE;

COMMENT ON COLUMN materiais.subetapa IS 'Subetapa do material (espelha orcamento_itens.subetapa) — usada para agrupar a lista de compras';
COMMENT ON COLUMN medicoes.nome IS 'Identificação curta da medição (ex.: "Medição 1 — Fundação")';
COMMENT ON COLUMN medicoes.fotos IS 'Array JSON de fotos anexadas (data URLs base64), mesmo padrão do diário de obra';
COMMENT ON COLUMN orcamento_itens.data_inicio IS 'Início planejado da subetapa (opcional — se vazio, é distribuída dentro do período da etapa-mãe)';
COMMENT ON COLUMN orcamento_itens.data_fim IS 'Término planejado da subetapa (opcional — se vazio, é distribuída dentro do período da etapa-mãe)';

-- Recarrega o cache de schema do PostgREST — sem isso, a API pode continuar
-- "vendo" o schema antigo por alguns minutos e devolver "column does not exist"
-- mesmo após a coluna já existir.
NOTIFY pgrst, 'reload schema';
