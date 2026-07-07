-- ─────────────────────────────────────────────────────────────────────────────
-- Controle de Custos de Obras  (port da planilha "Controle de custos de obras")
--
-- 1. compra_itens: CREATE TABLE (auto-consistência do repo) + tipo_custo + data_compra
-- 2. obras.valor_contrato (VALOR DA OBRA fixo do contrato)
-- 3. etapa_caixa: teto de reembolso (caixa) por etapa
--
-- Idempotente e aditivo — seguro re-rodar. Cole no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Tabela compra_itens ─ já existe no banco remoto; o CREATE TABLE aqui garante
--     que o repositório descreva o schema completo (espelho de lib/types.ts CompraItem).
CREATE TABLE IF NOT EXISTS compra_itens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id               UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id              UUID REFERENCES etapas(id) ON DELETE SET NULL,
  lista_id              UUID,
  descricao             TEXT NOT NULL,
  fornecedor_id         UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome       TEXT,
  quantidade            NUMERIC(14,4),
  unidade               TEXT,
  valor_unitario        NUMERIC(14,2),
  valor_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  status_valor          TEXT NOT NULL DEFAULT 'estimado'
                          CHECK (status_valor IN ('confirmado','estimado')),
  forma_pagamento       TEXT
                          CHECK (forma_pagamento IS NULL OR forma_pagamento IN
                            ('pix','cartao','boleto','dinheiro','reembolso','pix_cartao','cartao_reembolso')),
  data_limite_pagamento DATE,
  status_pagamento      TEXT NOT NULL DEFAULT 'pendente'
                          CHECK (status_pagamento IN ('pendente','pago')),
  observacao            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1b. tipo_custo ─ coluna TIPO da planilha (01-MATERIAL … OUTROS)
ALTER TABLE compra_itens ADD COLUMN IF NOT EXISTS tipo_custo TEXT;
ALTER TABLE compra_itens DROP CONSTRAINT IF EXISTS compra_itens_tipo_custo_check;
ALTER TABLE compra_itens ADD CONSTRAINT compra_itens_tipo_custo_check
  CHECK (tipo_custo IS NULL OR tipo_custo IN
    ('material','mao_de_obra','equipamento','custo_indireto','taxa','servico','outros'));

-- 1c. data_compra ─ DATA do lançamento (a coluna existente data_limite_pagamento = VENCIMENTO)
ALTER TABLE compra_itens ADD COLUMN IF NOT EXISTS data_compra DATE;
UPDATE compra_itens SET data_compra = created_at::date WHERE data_compra IS NULL;

-- 2. VALOR DA OBRA (contrato). Quando NULL, a UI usa o total do orçamento c/ BDI como fallback.
ALTER TABLE obras ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(14,2);

-- 3. Caixa por etapa ─ teto de reembolso definido no início da obra (aba "Caixa" da planilha).
--    valor_caixa          = "Total Caixa" da etapa
--    valor_caixa_mao_obra = parcela "Mão de Obra caixa" (opcional; reservado para o split futuro)
CREATE TABLE IF NOT EXISTS etapa_caixa (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id              UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id             UUID NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  valor_caixa          NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_caixa_mao_obra NUMERIC(14,2),
  observacao           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (etapa_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_compra_itens_obra  ON compra_itens (obra_id);
CREATE INDEX IF NOT EXISTS idx_compra_itens_data  ON compra_itens (data_compra);
CREATE INDEX IF NOT EXISTS idx_etapa_caixa_obra   ON etapa_caixa (obra_id);

-- RLS aberta (padrão MVP)
ALTER TABLE compra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapa_caixa  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compra_itens_all" ON compra_itens;
DROP POLICY IF EXISTS "etapa_caixa_all"  ON etapa_caixa;
CREATE POLICY "compra_itens_all" ON compra_itens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "etapa_caixa_all"  ON etapa_caixa  FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON compra_itens, etapa_caixa TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
