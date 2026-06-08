-- ====================================================================
-- Fix 2026-06-08: colunas faltantes em banco Supabase antigo
--
-- Confirmado apos rodar setup v1.2.0 em um projeto que ja tinha tabelas:
-- CREATE TABLE IF NOT EXISTS nao altera tabelas existentes, entao algumas
-- colunas usadas pelo app precisavam de ALTER TABLE explicito.
-- ====================================================================

ALTER TABLE materiais
  ADD COLUMN IF NOT EXISTS subetapa TEXT;

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

NOTIFY pgrst, 'reload schema';
