-- =====================================================================
-- Fix 2026-06-07: insumos proprios + orcamento_itens
--
-- Rodar no SQL Editor do Supabase.
--
-- Problemas confirmados pelo app em 07/06/2026:
-- 1) INSERT em insumos_proprios falha com:
--    "new row violates row-level security policy"
-- 2) A tela de orcamento tentava usar colunas que nao existem no banco remoto:
--    orcamento_itens.subetapa e orcamento_itens.created_at
--
-- Observacao:
-- O app tambem foi ajustado para funcionar sem subetapa/created_at, mas este
-- SQL alinha o banco ao schema esperado para evolucoes futuras.
-- =====================================================================

-- Garante que a tabela de insumos proprios exista.
CREATE TABLE IF NOT EXISTS insumos_proprios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_codigo
  ON insumos_proprios (codigo);

-- Politicas abertas para o MVP atual, que usa chave anon no frontend.
-- Quando houver login/perfis por empresa, estas politicas devem ser restritas.
ALTER TABLE insumos_proprios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON insumos_proprios TO anon, authenticated;

DROP POLICY IF EXISTS insumos_proprios_select_all ON insumos_proprios;
DROP POLICY IF EXISTS insumos_proprios_insert_all ON insumos_proprios;
DROP POLICY IF EXISTS insumos_proprios_update_all ON insumos_proprios;
DROP POLICY IF EXISTS insumos_proprios_delete_all ON insumos_proprios;

CREATE POLICY insumos_proprios_select_all
  ON insumos_proprios FOR SELECT
  USING (true);

CREATE POLICY insumos_proprios_insert_all
  ON insumos_proprios FOR INSERT
  WITH CHECK (true);

CREATE POLICY insumos_proprios_update_all
  ON insumos_proprios FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY insumos_proprios_delete_all
  ON insumos_proprios FOR DELETE
  USING (true);

-- Alinha orcamento_itens ao schema versionado sem apagar dados.
ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS subetapa TEXT;

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento
  ON orcamento_itens (orcamento_id);

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_etapa
  ON orcamento_itens (etapa_id);

-- Validacao rapida:
SELECT 'insumos_proprios policies ok' AS check_name, COUNT(*) AS policies
FROM pg_policies
WHERE tablename = 'insumos_proprios';

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'orcamento_itens'
  AND column_name IN ('subetapa', 'created_at', 'updated_at')
ORDER BY column_name;
