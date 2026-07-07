-- ─────────────────────────────────────────────────────────────────────────────
-- Cronograma — Marcos de projeto, predecessoras (Fim→Início) e financeiro
-- por subetapa/serviço.
--
-- Idempotente e aditivo — seguro re-rodar. Cole no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Marcos: flag em cada nível do cronograma.
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS is_marco BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subetapas_cronograma ADD COLUMN IF NOT EXISTS is_marco BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE servicos_cronograma ADD COLUMN IF NOT EXISTS is_marco BOOLEAN NOT NULL DEFAULT false;

-- Dependências (Fim→Início). Referência "polimórfica" (item_tipo+item_id) porque
-- os 3 níveis do cronograma são tabelas separadas — sem FK real cruzando as três,
-- integridade garantida em nível de aplicação (mesmo padrão de outras tabelas
-- MVP deste projeto).
CREATE TABLE IF NOT EXISTS cronograma_dependencias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  item_tipo         TEXT NOT NULL CHECK (item_tipo IN ('etapa','subetapa','servico')),
  item_id           UUID NOT NULL,
  predecessor_tipo  TEXT NOT NULL CHECK (predecessor_tipo IN ('etapa','subetapa','servico')),
  predecessor_id    UUID NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_tipo, item_id, predecessor_tipo, predecessor_id)
);
CREATE INDEX IF NOT EXISTS idx_cronograma_dep_obra ON cronograma_dependencias(obra_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_dep_item ON cronograma_dependencias(item_tipo, item_id);

-- Financeiro até Subetapa/Serviço: refinamento opcional do lançamento de compra.
-- etapa_id continua obrigatório (comportamento atual preservado); os dois novos
-- campos são só um detalhamento fino, opcional.
ALTER TABLE compra_itens ADD COLUMN IF NOT EXISTS subetapa_id UUID REFERENCES subetapas_cronograma(id) ON DELETE SET NULL;
ALTER TABLE compra_itens ADD COLUMN IF NOT EXISTS servico_id UUID REFERENCES servicos_cronograma(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compra_itens_subetapa ON compra_itens(subetapa_id);
CREATE INDEX IF NOT EXISTS idx_compra_itens_servico ON compra_itens(servico_id);

-- RLS aberta (padrão MVP)
ALTER TABLE cronograma_dependencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cronograma_dependencias_all" ON cronograma_dependencias;
CREATE POLICY "cronograma_dependencias_all" ON cronograma_dependencias FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON cronograma_dependencias TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
