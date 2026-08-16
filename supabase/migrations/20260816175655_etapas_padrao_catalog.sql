-- Catálogo compartilhado de etapas padrão do orçamento (antes só existia em
-- localStorage por navegador). Substitui ETAPAS_PADRAO_SINAPI hardcoded.
CREATE TABLE IF NOT EXISTS etapas_padrao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE etapas_padrao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "etapas_padrao_all" ON etapas_padrao;
CREATE POLICY "etapas_padrao_all" ON etapas_padrao FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON etapas_padrao TO anon, authenticated;

INSERT INTO etapas_padrao (nome, ordem) VALUES
  ('Serviços Preliminares e Gerais', 1),
  ('Infraestrutura', 2),
  ('Supraestrutura', 3),
  ('Paredes e Painéis', 4),
  ('Esquadrias', 5),
  ('Vidros e Plásticos', 6),
  ('Coberturas', 7),
  ('Impermeabilizações', 8),
  ('Revestimentos Internos', 9),
  ('Forros', 10),
  ('Revestimentos Externos', 11),
  ('Pinturas', 12),
  ('Pisos', 13),
  ('Acabamentos', 14),
  ('Instalações Elétricas e Telefônicas', 15),
  ('Instalações Hidráulicas', 16),
  ('Instalações: Esgoto e Águas Pluviais', 17),
  ('Louças e Metais', 18),
  ('Complementos', 19),
  ('Outros', 20);

NOTIFY pgrst, 'reload schema';
