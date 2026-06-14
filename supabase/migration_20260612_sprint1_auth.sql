-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 1 — Auth & Controle de Acesso
-- 1) Estende tipo de usuário (4 valores)
-- 2) Adiciona campo pode_excluir
-- 3) Cria tabela obra_usuarios (multi-responsável)
-- Rode no Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Estende o campo tipo para aceitar cliente e prestador
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_tipo_check;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pode_excluir BOOLEAN NOT NULL DEFAULT true;

-- Garantia: valores existentes não quebram
UPDATE profiles SET tipo = 'usuario' WHERE tipo IS NULL;
ALTER TABLE profiles ALTER COLUMN tipo SET DEFAULT 'usuario';

-- 2) Tabela de vínculo obra ↔ múltiplos responsáveis
CREATE TABLE IF NOT EXISTS obra_usuarios (
  obra_id    UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  papel      TEXT NOT NULL DEFAULT 'responsavel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (obra_id, profile_id)
);

ALTER TABLE obra_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obra_usuarios_all" ON obra_usuarios;
CREATE POLICY "obra_usuarios_all" ON obra_usuarios FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_obra_usuarios_obra    ON obra_usuarios (obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_usuarios_profile ON obra_usuarios (profile_id);

-- 3) Migra responsável atual de obras para obra_usuarios (melhor esforço)
INSERT INTO obra_usuarios (obra_id, profile_id, papel)
SELECT o.id, p.id, 'responsavel'
FROM obras o
JOIN profiles p ON p.name = o.responsavel
WHERE o.responsavel IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM obra_usuarios ou WHERE ou.obra_id = o.id AND ou.profile_id = p.id
  );
