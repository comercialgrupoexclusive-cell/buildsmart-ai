-- Seed de dados de exemplo para desenvolvimento
-- Execute após o schema.sql

-- Perfil de exemplo
INSERT INTO profiles (name, theme_color, dark_mode, onboarding_done)
VALUES ('Demo', '#3B7BF8', true, true);

-- Obra de exemplo
INSERT INTO obras (nome, endereco, status, responsavel, data_inicio, data_previsao)
VALUES (
  'Residência Exemplo - Porto Alegre',
  'Rua das Flores, 123 - Bairro Jardim - Porto Alegre/RS',
  'ativa',
  'Eng. João Silva',
  '2024-01-15',
  '2024-12-31'
);
