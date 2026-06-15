-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 2 — Responsável Técnico + pasta Drive em projetos
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_id UUID REFERENCES responsaveis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS drive_folder_url        TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_id         TEXT;

CREATE INDEX IF NOT EXISTS idx_projetos_resp_tecnico ON projetos (responsavel_tecnico_id);

-- Validação
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'projetos'
  AND column_name IN ('responsavel_tecnico_id', 'drive_folder_url', 'drive_folder_id')
ORDER BY column_name;
