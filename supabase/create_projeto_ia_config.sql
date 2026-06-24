-- BuildSmart AI — Configuração dos prompts da IA usada na aba "Assistente IA" de Projetos
-- Rode no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS projeto_ia_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projeto_ia_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projeto_ia_cfg_all ON projeto_ia_config;

CREATE POLICY projeto_ia_cfg_all ON projeto_ia_config FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON projeto_ia_config TO anon, authenticated;
