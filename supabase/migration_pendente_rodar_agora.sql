-- ====================================================================
-- ATENCAO — NAO RODAR ESTE ARQUIVO (mantido so para historico)
--
-- Foi escrito assumindo que a tabela de itens de composicao se chamava
-- `composicao_itens`. Investigacao confirmou que a tabela real no banco
-- e `composicao_insumos` (FK normalizada: insumo_id / insumo_proprio_id),
-- e ela JA TEM tudo que este arquivo tentava criar (inclusive a coluna
-- insumo_proprio_id e a tabela insumos_proprios).
--
-- Foi essa divergencia que causou o erro:
--   "ERROR: 42P01: relation composicao_itens does not exist"
--
-- A correcao foi feita no CODIGO da aplicacao (nao no banco).
-- ====================================================================
-- ====================================================================
-- RODAR NO SQL EDITOR DO SUPABASE — tudo que ainda está pendente
-- (pode colar o arquivo inteiro de uma vez e clicar em "Run")
-- ====================================================================

-- ────────────────────────────────────────────────────────────────────
-- PARTE 1 — Constraints UNIQUE para a importação SINAPI funcionar
-- (sem isso, o upsert da tela "Base SINAPI" dá erro 42P10:
--  "no unique or exclusion constraint matching ON CONFLICT")
-- Verificado antes: não existem duplicatas, é seguro aplicar.
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE sinapi_insumos
  ADD CONSTRAINT sinapi_insumos_codigo_mes_key UNIQUE (codigo, mes_referencia);

ALTER TABLE sinapi_composicoes
  ADD CONSTRAINT sinapi_composicoes_codigo_mes_key UNIQUE (codigo, mes_referencia);

ALTER TABLE sinapi_composicao_itens
  ADD CONSTRAINT sinapi_composicao_itens_unique_key
  UNIQUE (composicao_codigo, mes_referencia, tipo, item_codigo);


-- ────────────────────────────────────────────────────────────────────
-- PARTE 2 — Tabela de Insumos Próprios + suporte na composição
-- (necessário para a aba "Insumos" e o tipo "Insumo Próprio"
--  no formulário de itens de composição)
-- ────────────────────────────────────────────────────────────────────

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

-- 3) referência opcional (FK real) ao insumo próprio selecionado
ALTER TABLE composicao_itens
  ADD COLUMN IF NOT EXISTS insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_composicao_itens_insumo_proprio ON composicao_itens (insumo_proprio_id);


-- ────────────────────────────────────────────────────────────────────
-- VALIDAÇÃO — rode estas 3 consultas depois para conferir que deu certo
-- ────────────────────────────────────────────────────────────────────

-- 1) constraints novas devem aparecer:
SELECT conname FROM pg_constraint
WHERE conname IN (
  'sinapi_insumos_codigo_mes_key',
  'sinapi_composicoes_codigo_mes_key',
  'sinapi_composicao_itens_unique_key',
  'composicao_itens_tipo_check'
);

-- 2) tabela insumos_proprios deve existir e estar vazia:
SELECT * FROM insumos_proprios LIMIT 5;

-- 3) coluna nova em composicao_itens deve existir:
SELECT id, tipo, sinapi_codigo, insumo_proprio_id FROM composicao_itens LIMIT 5;
