-- Adiciona coluna board_data à tabela projetos para persistir o canvas Excalidraw
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS board_data JSONB;
