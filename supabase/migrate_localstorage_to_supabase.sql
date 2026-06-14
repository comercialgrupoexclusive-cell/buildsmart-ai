-- Migra dados do localStorage para o Supabase
-- Progresso de medição por etapa/subetapa
CREATE TABLE IF NOT EXISTS medicao_progresso (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id    UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  chave      TEXT NOT NULL,
  percentual NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(obra_id, chave)
);
ALTER TABLE medicao_progresso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medicao_progresso_all" ON medicao_progresso FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_medicao_progresso_obra ON medicao_progresso(obra_id);

-- Diário de Obra (RDO)
CREATE TABLE IF NOT EXISTS diario_obra (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id     UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  clima       TEXT CHECK (clima IN ('sol', 'nublado', 'chuva')),
  etapa_id    UUID REFERENCES etapas(id) ON DELETE SET NULL,
  atividades  TEXT,
  observacoes TEXT,
  fotos       JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE diario_obra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diario_obra_all" ON diario_obra FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_diario_obra_obra ON diario_obra(obra_id);

-- Listas de compra com itens em JSONB
CREATE TABLE IF NOT EXISTS listas_compra (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id      UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  itens        JSONB DEFAULT '[]',
  status       TEXT DEFAULT 'aberta' CHECK (status IN ('aberta', 'enviada', 'concluida')),
  criado_em    TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE listas_compra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listas_compra_all" ON listas_compra FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_listas_compra_obra ON listas_compra(obra_id);
