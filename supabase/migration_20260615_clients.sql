-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa 1 — Tabela clients (Cadastro de Clientes)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  drive_folder_url TEXT,
  drive_folder_id  TEXT,  -- extraído automaticamente da URL
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);

-- RLS aberta (padrão MVP)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_all" ON clients;
CREATE POLICY "clients_all" ON clients FOR ALL USING (true) WITH CHECK (true);

-- Validação
SELECT 'clients criada' AS status, count(*) AS registros FROM clients;
