-- Fix: etapas FK sem ON DELETE nas tabelas orcamento_itens, materiais, medicoes.
-- Sem SET NULL, deletar uma etapa (no cronograma) falhava silenciosamente
-- quando havia itens de orçamento/material/medição referenciando-a.

-- orcamento_itens.etapa_id → ON DELETE SET NULL
ALTER TABLE orcamento_itens DROP CONSTRAINT IF EXISTS orcamento_itens_etapa_id_fkey;
ALTER TABLE orcamento_itens
  ADD CONSTRAINT orcamento_itens_etapa_id_fkey
  FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE SET NULL;

-- materiais.etapa_id → ON DELETE SET NULL
ALTER TABLE materiais DROP CONSTRAINT IF EXISTS materiais_etapa_id_fkey;
ALTER TABLE materiais
  ADD CONSTRAINT materiais_etapa_id_fkey
  FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE SET NULL;

-- medicoes.etapa_id → ON DELETE SET NULL
ALTER TABLE medicoes DROP CONSTRAINT IF EXISTS medicoes_etapa_id_fkey;
ALTER TABLE medicoes
  ADD CONSTRAINT medicoes_etapa_id_fkey
  FOREIGN KEY (etapa_id) REFERENCES etapas(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
