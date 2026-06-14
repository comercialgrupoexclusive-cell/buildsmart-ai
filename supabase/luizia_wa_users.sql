-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: luizia_wa_users
-- Vincula número WhatsApp → usuário BuildSmart
-- Ao receber mensagem deste número, a Luizia injeta obras/materiais no contexto
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS luizia_wa_users (
  phone      TEXT PRIMARY KEY,           -- número sem +, ex: 5551995076895
  nome       TEXT,                        -- nome exibido no painel
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- vínculo com conta BuildSmart
  contexto   TEXT,                        -- instrução extra injetada no prompt
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: leitura e escrita livres (ajustar conforme necessidade de segurança)
ALTER TABLE luizia_wa_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "luizia_wa_users_all"
  ON luizia_wa_users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Garante que luizia_wa_messages também tem RLS habilitada
-- (executar apenas se ainda não foi feito)
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE luizia_wa_messages ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "luizia_wa_messages_all" ON luizia_wa_messages FOR ALL USING (true) WITH CHECK (true);
