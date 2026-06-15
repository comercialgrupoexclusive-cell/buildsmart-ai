-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 2 — Arquivos vinculados a itens de projeto + buckets de Storage
-- ─────────────────────────────────────────────────────────────────────────────

-- Buckets de armazenamento
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('obra-arquivos',  'obra-arquivos',  true, 52428800, '{application/pdf,image/png,image/jpeg,image/webp}'),
  ('project-files',  'project-files',  true, 52428800, '{application/pdf}')
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso público aos buckets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow all obra-arquivos'
  ) THEN
    CREATE POLICY "Allow all obra-arquivos" ON storage.objects
    FOR ALL TO public
    USING (bucket_id = 'obra-arquivos')
    WITH CHECK (bucket_id = 'obra-arquivos');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Allow all project-files'
  ) THEN
    CREATE POLICY "Allow all project-files" ON storage.objects
    FOR ALL TO public
    USING (bucket_id = 'project-files')
    WITH CHECK (bucket_id = 'project-files');
  END IF;
END $$;

-- Tabela de arquivos vinculados a itens de projeto
CREATE TABLE IF NOT EXISTS project_item_files (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  item_id     UUID        NOT NULL REFERENCES projeto_itens(id) ON DELETE CASCADE,
  file_name   TEXT        NOT NULL,
  file_url    TEXT        NOT NULL,
  file_size   BIGINT,
  uploaded_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_item_files_item   ON project_item_files (item_id);
CREATE INDEX IF NOT EXISTS idx_project_item_files_project ON project_item_files (project_id);

ALTER TABLE project_item_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_item_files_all" ON project_item_files FOR ALL USING (true) WITH CHECK (true);

-- Validação
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'project_item_files'
ORDER BY ordinal_position;
