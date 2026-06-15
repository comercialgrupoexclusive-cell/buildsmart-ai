-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 1 — Responsáveis Técnicos + Proprietários
-- ─────────────────────────────────────────────────────────────────────────────

-- Responsáveis Técnicos (monitoram pasta no Drive)
CREATE TABLE IF NOT EXISTS responsaveis (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  drive_folder_url TEXT,
  drive_folder_id  TEXT,  -- extraído automaticamente da URL ao salvar
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Proprietários (dono da obra/projeto — sem Drive)
CREATE TABLE IF NOT EXISTS proprietarios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK em obras (proprietário da obra)
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS proprietario_id UUID REFERENCES proprietarios(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_responsaveis_name  ON responsaveis  (name);
CREATE INDEX IF NOT EXISTS idx_proprietarios_name ON proprietarios (name);
CREATE INDEX IF NOT EXISTS idx_obras_proprietario ON obras          (proprietario_id);

-- RLS aberta (padrão MVP)
ALTER TABLE responsaveis  ENABLE ROW LEVEL SECURITY;
ALTER TABLE proprietarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "responsaveis_all"  ON responsaveis;
DROP POLICY IF EXISTS "proprietarios_all" ON proprietarios;

CREATE POLICY "responsaveis_all"  ON responsaveis  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "proprietarios_all" ON proprietarios FOR ALL USING (true) WITH CHECK (true);

-- Validação
SELECT 'responsaveis'  AS tabela, count(*) AS registros FROM responsaveis
UNION ALL
SELECT 'proprietarios' AS tabela, count(*) AS registros FROM proprietarios;
