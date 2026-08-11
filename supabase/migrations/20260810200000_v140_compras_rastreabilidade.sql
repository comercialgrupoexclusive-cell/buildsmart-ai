-- v1.4.0 Fase 1: Rastreabilidade em compra_itens + fix medicoes.numero
-- Colunas aditivas, sem breaking changes

-- 1A. Novas colunas para rastreabilidade de compras
ALTER TABLE compra_itens
  ADD COLUMN IF NOT EXISTS requisicao_id uuid REFERENCES requisicoes_compra(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cotacao_id uuid REFERENCES cotacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual','requisicao','lista')),
  ADD COLUMN IF NOT EXISTS data_recebimento date,
  ADD COLUMN IF NOT EXISTS status_recebimento text NOT NULL DEFAULT 'pendente'
    CHECK (status_recebimento IN ('pendente','parcial','recebido'));

CREATE INDEX IF NOT EXISTS idx_compra_itens_requisicao ON compra_itens(requisicao_id);
CREATE INDEX IF NOT EXISTS idx_compra_itens_cotacao ON compra_itens(cotacao_id);

-- Backfill: registros existentes sao manuais e ja recebidos
UPDATE compra_itens SET status_recebimento = 'recebido'
WHERE status_recebimento = 'pendente';

-- 1B. Fix numero null nas medicoes existentes
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY obra_id, orcamento_id, eixo ORDER BY created_at
  ) AS seq
  FROM medicoes WHERE numero IS NULL
)
UPDATE medicoes m SET numero = n.seq FROM numerados n WHERE m.id = n.id;

NOTIFY pgrst, 'reload schema';
