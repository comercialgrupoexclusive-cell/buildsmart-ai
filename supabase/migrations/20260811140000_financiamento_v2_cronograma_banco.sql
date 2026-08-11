-- ============================================================
-- v1.4.0 — Financiamento v2: cronograma do banco + datas
-- ============================================================

-- 1. Adicionar datas nas etapas do financiamento (para aba Cronograma)
ALTER TABLE financiamento_itens
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date;

-- 2. Cronograma do banco (metas mensais de evolução)
CREATE TABLE IF NOT EXISTS financiamento_cronograma_banco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  orcamento_id uuid REFERENCES orcamentos(id) ON DELETE SET NULL,
  mes integer NOT NULL,
  pct_acumulado_previsto numeric(6,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(obra_id, orcamento_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_fin_crono_banco_obra ON financiamento_cronograma_banco(obra_id);

ALTER TABLE financiamento_cronograma_banco ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financiamento_cronograma_banco_all" ON financiamento_cronograma_banco FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
