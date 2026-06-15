-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 3 — Tabela drive_events para registro de arquivos do Drive
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drive_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id      TEXT        NOT NULL,
  file_name    TEXT        NOT NULL,
  action       TEXT        NOT NULL DEFAULT 'sync',   -- 'sync' | 'create' | 'modify'
  mime_type    TEXT,
  folder_path  TEXT,
  project_id   UUID        REFERENCES projetos(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique por arquivo + projeto (evita duplicatas no upsert)
CREATE UNIQUE INDEX IF NOT EXISTS idx_drive_events_file_project
  ON drive_events (file_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drive_events_project_id ON drive_events (project_id);
CREATE INDEX IF NOT EXISTS idx_drive_events_created_at ON drive_events (created_at DESC);

ALTER TABLE drive_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drive_events_all" ON drive_events FOR ALL USING (true) WITH CHECK (true);

-- Validação
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'drive_events'
ORDER BY ordinal_position;
