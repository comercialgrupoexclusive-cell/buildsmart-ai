-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de Disparos da Luiza — mensagens automáticas WhatsApp
-- 1) Tabelas  2) Correção de encoding  3) Persona  4) pg_cron
-- ATENÇÃO: substitua <DISPATCH_SECRET> pelo valor da env var DISPATCH_SECRET
-- (configurada no Vercel) antes de rodar a seção 4.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) TABELAS DE DISPARO ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS luizia_wa_dispatches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('resumo_obra','personalizada')),
  obra_id       UUID REFERENCES obras(id) ON DELETE SET NULL,
  destino_phone TEXT NOT NULL,
  destino_nome  TEXT,
  mensagem      TEXT,
  dias_semana   TEXT NOT NULL DEFAULT '1,2,3,4,5',  -- 0=domingo .. 6=sábado
  horario       TIME NOT NULL DEFAULT '07:30',
  recorrente    BOOLEAN NOT NULL DEFAULT true,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  last_sent_at  TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS luizia_wa_dispatch_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES luizia_wa_dispatches(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conteudo    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','erro')),
  erro        TEXT
);

CREATE INDEX IF NOT EXISTS idx_dispatches_next_run ON luizia_wa_dispatches (ativo, next_run_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_dispatch ON luizia_wa_dispatch_log (dispatch_id, sent_at DESC);

ALTER TABLE luizia_wa_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE luizia_wa_dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dispatches_all" ON luizia_wa_dispatches;
CREATE POLICY "dispatches_all" ON luizia_wa_dispatches FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "dispatch_log_all" ON luizia_wa_dispatch_log;
CREATE POLICY "dispatch_log_all" ON luizia_wa_dispatch_log FOR ALL USING (true) WITH CHECK (true);

-- 2) CORREÇÃO DE ENCODING (MÃ£o de Obra → Mão de Obra) ─────────────────────────
DO $$
DECLARE
  par RECORD;
BEGIN
  FOR par IN
    SELECT * FROM (VALUES
      ('sinapi_insumos','descricao'),
      ('sinapi_insumos','classificacao'),
      ('sinapi_composicoes','descricao'),
      ('sinapi_composicoes','grupo'),
      ('sinapi_composicao_itens','item_descricao'),
      ('composicoes_proprias','descricao'),
      ('composicoes_proprias','grupo'),
      ('insumos_proprios','descricao'),
      ('insumos_proprios','grupo'),
      ('insumos_proprios','categoria'),
      ('orcamento_itens','descricao_snapshot'),
      ('materiais','descricao'),
      ('etapas','nome'),
      ('obras','nome'),
      ('obras','endereco')
    ) AS t(tabela, coluna)
  LOOP
    IF to_regclass('public.' || par.tabela) IS NOT NULL THEN
      BEGIN
        EXECUTE format(
          'UPDATE public.%I SET %I = convert_from(convert_to(%I, ''LATIN1''), ''UTF8'') WHERE %I LIKE ''%%Ã%%''',
          par.tabela, par.coluna, par.coluna, par.coluna
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Pulado %.%: %', par.tabela, par.coluna, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- 3) RENAME Luizia → Luiza na persona salva ────────────────────────────────────
UPDATE luizia_wa_config
SET value = replace(value, 'Luizia', 'Luiza'), updated_at = NOW()
WHERE key = 'persona_global' AND value LIKE '%Luizia%';

INSERT INTO luizia_wa_config (key, value) VALUES ('bot_name', 'Luiza')
ON CONFLICT (key) DO NOTHING;

-- 4) PG_CRON — chama o disparador a cada 5 minutos ─────────────────────────────
-- Substitua <DISPATCH_SECRET> pelo valor real antes de rodar!
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('luiza-dispatch')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'luiza-dispatch');

SELECT cron.schedule(
  'luiza-dispatch',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://buildsmart-ai-chi.vercel.app/api/whatsapp/dispatch',
    headers := '{"Content-Type":"application/json","x-dispatch-key":"<DISPATCH_SECRET>"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
