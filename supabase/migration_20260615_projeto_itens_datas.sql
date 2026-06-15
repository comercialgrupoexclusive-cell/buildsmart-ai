-- ─────────────────────────────────────────────────────────────────────────────
-- Patch: adiciona colunas de datas e responsável em projeto_itens
--
-- A tabela foi criada na sprint 2 sem essas colunas.
-- Sem elas, os campos de data/responsável na aba Estrutura de Projetos
-- não persistem no banco — causando o bug de "datas não salvam".
--
-- RODAR NO SQL EDITOR DO SUPABASE (pode colar e clicar "Run")
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projeto_itens
  ADD COLUMN IF NOT EXISTS responsavel TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_prazo  DATE;

-- Validação: as 3 colunas devem aparecer
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'projeto_itens'
  AND column_name IN ('responsavel', 'data_inicio', 'data_prazo')
ORDER BY column_name;
