-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 3 — Cronograma 3 níveis
-- ─────────────────────────────────────────────────────────────────────────────

-- Adiciona percentual_executado na tabela etapas (se não existir)
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS percentual_executado NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Subetapas de cronograma (nível 2 — independente de orcamento_itens)
CREATE TABLE IF NOT EXISTS subetapas_cronograma (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id             UUID NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  nome                 TEXT NOT NULL,
  data_inicio          DATE,
  data_fim             DATE,
  percentual_executado NUMERIC(5,2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada','em_andamento','concluida','atrasada')),
  responsavel          TEXT,
  ordem                INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Serviços do cronograma (nível 3 — dentro de subetapa)
CREATE TABLE IF NOT EXISTS servicos_cronograma (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subetapa_id          UUID NOT NULL REFERENCES subetapas_cronograma(id) ON DELETE CASCADE,
  nome                 TEXT NOT NULL,
  data_inicio          DATE,
  data_fim             DATE,
  percentual_executado NUMERIC(5,2) NOT NULL DEFAULT 0,
  responsavel          TEXT,
  ordem                INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_subetapas_cron_etapa ON subetapas_cronograma (etapa_id);
CREATE INDEX IF NOT EXISTS idx_servicos_cron_sub    ON servicos_cronograma (subetapa_id);

-- RLS aberta (padrão MVP)
ALTER TABLE subetapas_cronograma ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos_cronograma  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subetapas_cron_all" ON subetapas_cronograma;
DROP POLICY IF EXISTS "servicos_cron_all"  ON servicos_cronograma;

CREATE POLICY "subetapas_cron_all" ON subetapas_cronograma FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "servicos_cron_all"  ON servicos_cronograma  FOR ALL USING (true) WITH CHECK (true);
