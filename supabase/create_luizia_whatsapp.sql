-- BuildSmart AI — Luizia WhatsApp via Z-API
-- Rode no SQL Editor do Supabase

-- Historico de mensagens por numero
CREATE TABLE IF NOT EXISTS luizia_wa_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT        NOT NULL,
  sender_name TEXT,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_luizia_wa_phone
  ON luizia_wa_messages (phone, created_at DESC);

-- Config global (persona, modo pausado, etc.)
CREATE TABLE IF NOT EXISTS luizia_wa_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO luizia_wa_config (key, value) VALUES
  ('modo_pausado',   'false'),
  ('persona_global', 'Voce e a Luizia, assistente inteligente do BuildSmart AI, sistema de gestao de obras para construcao civil. Responda via WhatsApp de forma breve, clara e em portugues brasileiro. NAO use markdown. Maximo 3 paragrafos curtos.')
ON CONFLICT (key) DO NOTHING;

-- Regras por numero (persona especifica, bloqueio)
CREATE TABLE IF NOT EXISTS luizia_wa_phone_rules (
  phone      TEXT PRIMARY KEY,
  nome       TEXT,
  persona    TEXT,
  bloqueado  BOOLEAN     DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE luizia_wa_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE luizia_wa_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE luizia_wa_phone_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_msg_all   ON luizia_wa_messages;
DROP POLICY IF EXISTS wa_cfg_all   ON luizia_wa_config;
DROP POLICY IF EXISTS wa_rule_all  ON luizia_wa_phone_rules;

CREATE POLICY wa_msg_all  ON luizia_wa_messages    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wa_cfg_all  ON luizia_wa_config      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wa_rule_all ON luizia_wa_phone_rules FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON luizia_wa_messages    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON luizia_wa_config      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON luizia_wa_phone_rules TO anon, authenticated;
