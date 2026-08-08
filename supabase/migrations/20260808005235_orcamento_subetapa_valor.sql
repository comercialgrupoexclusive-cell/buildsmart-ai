ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS tipo_linha TEXT NOT NULL DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS subetapa_valor_manual NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS subetapa_valor_manual_ativo BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orcamento_itens_tipo_linha_check'
      AND conrelid = 'orcamento_itens'::regclass
  ) THEN
    ALTER TABLE orcamento_itens
      ADD CONSTRAINT orcamento_itens_tipo_linha_check
      CHECK (tipo_linha IN ('item','subetapa'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_subetapa_meta
  ON orcamento_itens (orcamento_id, etapa_id, subetapa)
  WHERE tipo_linha = 'subetapa';
