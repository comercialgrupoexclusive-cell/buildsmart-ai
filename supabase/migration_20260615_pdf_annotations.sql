-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 1 — Anotações em PDF
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pdf_annotations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url     TEXT        NOT NULL,
  context_type TEXT        NOT NULL CHECK (context_type IN ('obra', 'projeto')),
  context_id   UUID        NOT NULL,
  item_id      UUID,
  page_number  INTEGER     NOT NULL DEFAULT 1 CHECK (page_number >= 1),
  annotations_json JSONB   NOT NULL DEFAULT '{"objects":[],"background":""}'::jsonb,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_annotations_context
  ON pdf_annotations (context_type, context_id);

ALTER TABLE pdf_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pdf_annotations_all" ON pdf_annotations FOR ALL USING (true) WITH CHECK (true);

-- Validação
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'pdf_annotations'
ORDER BY ordinal_position;
