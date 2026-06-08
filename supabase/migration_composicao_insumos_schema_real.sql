-- ====================================================================
-- Migração: schema real de itens de composição própria
--
-- O app atual usa `composicao_insumos`, com FK para `sinapi_insumos`
-- ou `insumos_proprios`. Este arquivo garante a tabela real usada em
-- runtime e evita depender da tabela legada/desatualizada
-- `composicao_itens`.
--
-- Aditivo / seguro de rodar mais de uma vez.
-- ====================================================================

CREATE TABLE IF NOT EXISTS insumos_proprios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',
  grupo TEXT,
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS composicao_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_id UUID NOT NULL REFERENCES composicoes_proprias(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES sinapi_insumos(id) ON DELETE SET NULL,
  insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL,
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (insumo_id IS NOT NULL OR insumo_proprio_id IS NOT NULL)
);

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL;

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE insumos_proprios
  ADD COLUMN IF NOT EXISTS grupo TEXT;

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_codigo
  ON insumos_proprios (codigo);

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_grupo
  ON insumos_proprios (grupo);

CREATE INDEX IF NOT EXISTS idx_composicao_insumos_comp
  ON composicao_insumos (composicao_id);

CREATE INDEX IF NOT EXISTS idx_composicao_insumos_insumo
  ON composicao_insumos (insumo_id);

CREATE INDEX IF NOT EXISTS idx_composicao_insumos_proprio
  ON composicao_insumos (insumo_proprio_id);
