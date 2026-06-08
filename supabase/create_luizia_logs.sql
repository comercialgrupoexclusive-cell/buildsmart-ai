-- BuildSmart AI - historico central da Luizia
-- Rode este arquivo no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS luizia_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  origem TEXT NOT NULL DEFAULT 'buildassist'
    CHECK (origem IN ('buildassist', 'floating')),
  usuario TEXT,
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  mode TEXT,
  model TEXT
);

CREATE INDEX IF NOT EXISTS idx_luizia_logs_at
  ON luizia_logs (at DESC);

ALTER TABLE luizia_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON luizia_logs TO anon, authenticated;

DROP POLICY IF EXISTS luizia_logs_select_all ON luizia_logs;
DROP POLICY IF EXISTS luizia_logs_insert_all ON luizia_logs;
DROP POLICY IF EXISTS luizia_logs_delete_all ON luizia_logs;

CREATE POLICY luizia_logs_select_all
  ON luizia_logs FOR SELECT
  USING (true);

CREATE POLICY luizia_logs_insert_all
  ON luizia_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY luizia_logs_delete_all
  ON luizia_logs FOR DELETE
  USING (true);
