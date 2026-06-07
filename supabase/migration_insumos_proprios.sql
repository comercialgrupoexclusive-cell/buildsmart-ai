-- ====================================================================
-- Migração 3 (revisada): Insumos Próprios da empresa
-- + suporte a "INSUMO_PROPRIO" nos itens de composição própria
--
-- Contexto: o usuário pediu uma aba "Insumos" dentro de "Composições"
-- para cadastrar insumos PRÓPRIOS da empresa (que não vêm da base SINAPI
-- — ex: material de fornecedor local, mão de obra com preço próprio etc.),
-- com código automático (IP-001, IP-002...) e edição inline nas células.
--
-- IMPORTANTE: a tabela usada de fato pela tela de Composições é
-- `composicao_itens` (schema.sql linha 85), NÃO `composicao_insumos`
-- (essa era uma referência de embed legada/quebrada usada só em
-- ObraOrcamento.tsx). Esta versão da migração corrige o alvo:
-- ela estende `composicao_itens` (que já é "denormalizada" — guarda
-- snapshot de descrição/unidade/coeficiente e tem um campo `tipo` livre)
-- em vez de mexer em `composicao_insumos`.
--
-- Tudo aditivo / seguro de rodar em produção (não apaga dados).
-- ====================================================================

-- 1) Tabela de insumos próprios da empresa
CREATE TABLE IF NOT EXISTS insumos_proprios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,                      -- gerado automaticamente (ex: IP-001, IP-002...)
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',       -- MATERIAL | MAO_DE_OBRA | EQUIPAMENTO | SERVICO
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_codigo ON insumos_proprios (codigo);

-- 2) composicao_itens passa a aceitar o tipo 'INSUMO_PROPRIO'
--    (remove o CHECK antigo do campo `tipo`, qualquer que seja seu nome real,
--     e recria incluindo o novo valor)
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'composicao_itens'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE composicao_itens DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE composicao_itens
  ADD CONSTRAINT composicao_itens_tipo_check
  CHECK (tipo IN ('SINAPI_INSUMO', 'SINAPI_COMPOSICAO', 'MANUAL', 'INSUMO_PROPRIO'));

-- 3) referência opcional (FK real) ao insumo próprio selecionado,
--    permitindo embed via PostgREST (insumos_proprios(*)) e leitura
--    sempre atualizada do preço unitário cadastrado
ALTER TABLE composicao_itens
  ADD COLUMN IF NOT EXISTS insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_composicao_itens_insumo_proprio ON composicao_itens (insumo_proprio_id);
