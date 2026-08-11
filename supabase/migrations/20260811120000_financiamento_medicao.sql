-- ============================================================
-- v1.4.0 — Medição de Financiamento (árvore + medições)
-- ============================================================

-- 1. Árvore de serviços do financiamento (independente do orçamento)
CREATE TABLE IF NOT EXISTS financiamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  orcamento_id uuid REFERENCES orcamentos(id) ON DELETE SET NULL,
  parent_id uuid REFERENCES financiamento_itens(id) ON DELETE CASCADE,
  codigo text,
  nome text NOT NULL,
  valor_financiado numeric(14,2) DEFAULT 0,
  peso numeric(8,4) DEFAULT 0,
  ordem integer DEFAULT 0,
  nivel integer DEFAULT 1 CHECK (nivel BETWEEN 1 AND 3),
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('sistema', 'manual')),
  etapa_ref_id uuid REFERENCES etapas(id) ON DELETE SET NULL,
  subetapa_ref_id uuid REFERENCES subetapas_cronograma(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_itens_obra ON financiamento_itens(obra_id);
CREATE INDEX IF NOT EXISTS idx_fin_itens_parent ON financiamento_itens(parent_id);

-- 2. Sessões de medição do financiamento
CREATE TABLE IF NOT EXISTS financiamento_medicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  orcamento_id uuid REFERENCES orcamentos(id) ON DELETE SET NULL,
  numero integer NOT NULL,
  data_medicao date NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  observacao text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_medicoes_obra ON financiamento_medicoes(obra_id);

-- 3. Itens por medição (% executado por item folha)
CREATE TABLE IF NOT EXISTS financiamento_medicao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL REFERENCES financiamento_medicoes(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES financiamento_itens(id) ON DELETE CASCADE,
  pct_executado numeric(6,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(medicao_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_med_itens_medicao ON financiamento_medicao_itens(medicao_id);

-- 4. RLS
ALTER TABLE financiamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiamento_medicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financiamento_medicao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financiamento_itens_all" ON financiamento_itens FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "financiamento_medicoes_all" ON financiamento_medicoes FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "financiamento_medicao_itens_all" ON financiamento_medicao_itens FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
