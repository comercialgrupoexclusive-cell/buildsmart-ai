-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 4 — Módulo Compras
-- ─────────────────────────────────────────────────────────────────────────────

-- Adiciona status 'solicitado' ao materiais (drop+add para alterar o check)
ALTER TABLE materiais DROP CONSTRAINT IF EXISTS materiais_status_compra_check;
ALTER TABLE materiais ADD CONSTRAINT materiais_status_compra_check
  CHECK (status_compra IN ('nao_comprado','solicitado','parcial','comprado'));

-- Requisições de compra
CREATE TABLE IF NOT EXISTS requisicoes_compra (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero           TEXT,                        -- RC-001, RC-002...
  data_solicitacao DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','aprovada','comprada','cancelada')),
  observacao       TEXT,
  solicitante      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Itens de requisição
CREATE TABLE IF NOT EXISTS requisicao_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id  UUID NOT NULL REFERENCES requisicoes_compra(id) ON DELETE CASCADE,
  material_id    UUID REFERENCES materiais(id) ON DELETE SET NULL,
  descricao      TEXT NOT NULL,
  quantidade     NUMERIC(14,4),
  unidade        TEXT,
  urgente        BOOLEAN NOT NULL DEFAULT false,
  observacao     TEXT
);

-- Cotações de fornecedor por requisição
CREATE TABLE IF NOT EXISTS cotacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id  UUID NOT NULL REFERENCES requisicoes_compra(id) ON DELETE CASCADE,
  fornecedor_id  UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome TEXT,
  data_cotacao   DATE NOT NULL DEFAULT CURRENT_DATE,
  validade       DATE,
  valor_total    NUMERIC(14,2),
  observacao     TEXT,
  vencedora      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_req_compra_obra    ON requisicoes_compra (obra_id);
CREATE INDEX IF NOT EXISTS idx_req_itens_req      ON requisicao_itens (requisicao_id);
CREATE INDEX IF NOT EXISTS idx_cotacoes_req       ON cotacoes (requisicao_id);

-- RLS aberta (padrão MVP)
ALTER TABLE requisicoes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicao_itens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacoes           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "req_compra_all" ON requisicoes_compra;
DROP POLICY IF EXISTS "req_itens_all"  ON requisicao_itens;
DROP POLICY IF EXISTS "cotacoes_all"   ON cotacoes;

CREATE POLICY "req_compra_all" ON requisicoes_compra FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "req_itens_all"  ON requisicao_itens   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "cotacoes_all"   ON cotacoes           FOR ALL USING (true) WITH CHECK (true);
