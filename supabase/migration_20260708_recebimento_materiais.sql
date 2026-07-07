-- ─────────────────────────────────────────────────────────────────────────────
-- Recebimento de materiais (estoque leve — "isso já chegou na obra?")
--
-- Não é uma ficha de estoque completa: apenas fecha a lacuna entre "comprado"
-- (status_compra) e "chegou fisicamente no canteiro". Um campo de data por
-- item de materiais — NULL = ainda não recebido, preenchido = data de chegada.
--
-- Idempotente e aditivo — seguro re-rodar. Cole no Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE materiais ADD COLUMN IF NOT EXISTS data_recebimento DATE;

CREATE INDEX IF NOT EXISTS idx_materiais_data_recebimento ON materiais (data_recebimento);

NOTIFY pgrst, 'reload schema';
