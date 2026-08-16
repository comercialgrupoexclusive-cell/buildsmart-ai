-- Templates de orçamento — estrutura reutilizável (etapas + subetapas + composições)
-- para aplicar em qualquer obra nova, no mesmo espírito dos templates de Projetos.
CREATE TABLE IF NOT EXISTS orcamento_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  itens JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orcamento_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orcamento_templates_all" ON orcamento_templates;
CREATE POLICY "orcamento_templates_all" ON orcamento_templates FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON orcamento_templates TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
