-- Projetos: status "aguardando" e predecessoras entre itens da estrutura.
-- Idempotente e aditivo. Rodar no Supabase SQL Editor antes do deploy final.

ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_status_check;
ALTER TABLE projetos
  ADD CONSTRAINT projetos_status_check
  CHECK (status IN ('aguardando','em_andamento','concluido','suspenso'));

CREATE TABLE IF NOT EXISTS projeto_item_dependencias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES projeto_itens(id) ON DELETE CASCADE,
  predecessor_id  UUID NOT NULL REFERENCES projeto_itens(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, predecessor_id),
  CHECK (item_id <> predecessor_id)
);

CREATE INDEX IF NOT EXISTS idx_projeto_item_dependencias_projeto
  ON projeto_item_dependencias(projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_item_dependencias_item
  ON projeto_item_dependencias(item_id);
CREATE INDEX IF NOT EXISTS idx_projeto_item_dependencias_predecessor
  ON projeto_item_dependencias(predecessor_id);

ALTER TABLE projeto_item_dependencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projeto_item_dependencias_all" ON projeto_item_dependencias;
CREATE POLICY "projeto_item_dependencias_all"
  ON projeto_item_dependencias FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON projeto_item_dependencias TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
