-- ====================================================================
-- Migração: registro completo de medições (nome, fotos, descrição)
--
-- Contexto: a aba "Medições" só tinha a cascata de % ao vivo (persistida em
-- localStorage). O usuário pediu um registro formal de medição — com nome,
-- fotos e descrição/observação — igual ao que já existe no Diário de obra.
-- A tabela `medicoes` já existia (periodo_inicio/fim, percentual_executado,
-- observacao); aqui só adicionamos os campos que faltavam.
--
-- Aditivo / seguro de rodar em produção (não apaga dados).
-- ====================================================================

ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS nome TEXT,
  ADD COLUMN IF NOT EXISTS fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN medicoes.nome IS 'Identificação curta da medição (ex.: "Medição 1 — Fundação")';
COMMENT ON COLUMN medicoes.fotos IS 'Array JSON de fotos anexadas (data URLs base64), mesmo padrão do diário de obra';
