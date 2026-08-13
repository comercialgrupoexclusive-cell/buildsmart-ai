-- ─────────────────────────────────────────────────────────────────────────────
-- Planejamento 2.0 — Dados de planejamento referenciando itens do orçamento
--
-- Princípio: o orçamento é a fonte única de verdade para estrutura (etapas,
-- subetapas, serviços). Esta tabela adiciona apenas dados de planejamento
-- (datas, status, progresso, predecessoras) aos itens referenciados.
--
-- Regra de duração: duração = data_fim - data_inicio + 1 (dias corridos).
-- Se o usuário alterar duração, o sistema ajusta data_fim = data_inicio + duração - 1.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planejamento_itens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id               UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  orcamento_id          UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  ref_tipo              TEXT NOT NULL CHECK (ref_tipo IN ('etapa', 'subetapa', 'item')),
  etapa_id              UUID REFERENCES etapas(id) ON DELETE CASCADE,
  subetapa_key          TEXT,
  orcamento_item_id     UUID REFERENCES orcamento_itens(id) ON DELETE CASCADE,
  data_inicio           DATE,
  data_fim              DATE,
  status                TEXT NOT NULL DEFAULT 'nao_iniciado'
                          CHECK (status IN ('nao_iniciado', 'em_andamento', 'concluido', 'atrasado', 'suspenso')),
  progresso_planejado   NUMERIC(5,2) NOT NULL DEFAULT 0
                          CHECK (progresso_planejado BETWEEN 0 AND 100),
  progresso_executado   NUMERIC(5,2) NOT NULL DEFAULT 0
                          CHECK (progresso_executado BETWEEN 0 AND 100),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_etapa
  ON planejamento_itens(orcamento_id, etapa_id) WHERE ref_tipo = 'etapa';
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_subetapa
  ON planejamento_itens(orcamento_id, etapa_id, subetapa_key) WHERE ref_tipo = 'subetapa';
CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item
  ON planejamento_itens(orcamento_id, orcamento_item_id) WHERE ref_tipo = 'item';

CREATE INDEX IF NOT EXISTS idx_plan_itens_obra ON planejamento_itens(obra_id);
CREATE INDEX IF NOT EXISTS idx_plan_itens_orc  ON planejamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_plan_itens_etapa ON planejamento_itens(etapa_id);

CREATE TABLE IF NOT EXISTS planejamento_dependencias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES planejamento_itens(id) ON DELETE CASCADE,
  predecessor_id    UUID NOT NULL REFERENCES planejamento_itens(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL DEFAULT 'FS' CHECK (tipo IN ('FS', 'FF', 'SS', 'SF')),
  lag_dias          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, predecessor_id),
  CHECK(item_id != predecessor_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_dep_obra ON planejamento_dependencias(obra_id);
CREATE INDEX IF NOT EXISTS idx_plan_dep_item ON planejamento_dependencias(item_id);
CREATE INDEX IF NOT EXISTS idx_plan_dep_pred ON planejamento_dependencias(predecessor_id);

ALTER TABLE planejamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE planejamento_dependencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planejamento_itens_all" ON planejamento_itens;
CREATE POLICY "planejamento_itens_all" ON planejamento_itens FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "planejamento_dependencias_all" ON planejamento_dependencias;
CREATE POLICY "planejamento_dependencias_all" ON planejamento_dependencias FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON planejamento_itens TO anon, authenticated;
GRANT ALL ON planejamento_dependencias TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
