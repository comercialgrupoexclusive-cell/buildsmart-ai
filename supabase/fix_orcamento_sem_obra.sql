-- Permite orçamentos sem obra vinculada e adiciona campo nome
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE orcamentos ALTER COLUMN obra_id DROP NOT NULL;
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_obra_id_fkey;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_obra_id_fkey
  FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE SET NULL;
