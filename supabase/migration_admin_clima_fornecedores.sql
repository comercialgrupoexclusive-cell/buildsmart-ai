-- ====================================================================
-- Migração: Perfil ADM, personalização (apelido/descrição/localização),
-- apelido de fornecedor e vínculo obra ↔ fornecedor (mão de obra / demais)
--
-- Contexto: pacote de melhorias v1.2.0 — controle de usuários por um
-- perfil ADM, personalização da IA por perfil (apelido/descrição),
-- localização do usuário (cidade/estado) para previsão do tempo, e
-- vínculo de fornecedores às obras separados por grupo.
--
-- Tudo aditivo / seguro de rodar em produção (não apaga dados).
-- O primeiro perfil já existente vira 'admin' automaticamente; novos
-- perfis nascem como 'usuario' (ver trigger ao final).
-- ====================================================================

-- 1) Novos campos em `profiles`
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'usuario',   -- admin | usuario
  ADD COLUMN IF NOT EXISTS apelido TEXT,
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT;                            -- CHAR(2) UF

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tipo_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_tipo_check CHECK (tipo IN ('admin', 'usuario'));
  END IF;
END $$;

-- Bootstrap: se nenhum perfil é admin ainda, o mais antigo vira admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE tipo = 'admin') THEN
    UPDATE profiles SET tipo = 'admin'
    WHERE id = (SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1);
  END IF;
END $$;

-- 2) Apelido do fornecedor
ALTER TABLE fornecedores
  ADD COLUMN IF NOT EXISTS apelido TEXT;

-- 3) Vínculo Obra ↔ Fornecedor (separado por grupo: mão de obra / demais)
CREATE TABLE IF NOT EXISTS obra_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  grupo TEXT NOT NULL DEFAULT 'demais',   -- mao_de_obra | demais
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT obra_fornecedores_grupo_check CHECK (grupo IN ('mao_de_obra', 'demais')),
  CONSTRAINT obra_fornecedores_unique UNIQUE (obra_id, fornecedor_id, grupo)
);

CREATE INDEX IF NOT EXISTS idx_obra_fornecedores_obra        ON obra_fornecedores(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_fornecedores_fornecedor  ON obra_fornecedores(fornecedor_id);
