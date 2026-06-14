-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2 — Módulo Projetos
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projetos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  cliente       TEXT,
  endereco      TEXT,
  data_inicio   DATE,
  data_previsao DATE,
  status        TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','concluido','suspenso')),
  obra_id       UUID REFERENCES obras(id) ON DELETE SET NULL,
  responsavel   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projeto_itens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES projeto_itens(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  nivel      INTEGER NOT NULL DEFAULT 1,   -- 1=disciplina 2=item 3=subitem
  concluido  BOOLEAN NOT NULL DEFAULT false,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projeto_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  descricao  TEXT,
  itens      JSONB NOT NULL DEFAULT '[]',  -- [{ nome, nivel, children:[] }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_projetos_status    ON projetos (status);
CREATE INDEX IF NOT EXISTS idx_projeto_itens_proj ON projeto_itens (projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_itens_par  ON projeto_itens (parent_id);

-- RLS aberta (padrão MVP)
ALTER TABLE projetos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_itens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projetos_all"          ON projetos;
DROP POLICY IF EXISTS "projeto_itens_all"     ON projeto_itens;
DROP POLICY IF EXISTS "projeto_templates_all" ON projeto_templates;

CREATE POLICY "projetos_all"          ON projetos          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "projeto_itens_all"     ON projeto_itens     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "projeto_templates_all" ON projeto_templates FOR ALL USING (true) WITH CHECK (true);

-- Templates padrão de exemplo
INSERT INTO projeto_templates (nome, descricao, itens) VALUES
(
  'Projeto Residencial Completo',
  'Todas as disciplinas para residência unifamiliar',
  '[
    {"nome":"Arquitetura","nivel":1,"children":[
      {"nome":"Planta de situação","nivel":2,"children":[]},
      {"nome":"Planta baixa","nivel":2,"children":[]},
      {"nome":"Cortes e fachadas","nivel":2,"children":[]},
      {"nome":"Detalhamentos","nivel":2,"children":[]}
    ]},
    {"nome":"Estrutural","nivel":1,"children":[
      {"nome":"Memorial de cálculo","nivel":2,"children":[]},
      {"nome":"Planta de formas","nivel":2,"children":[]},
      {"nome":"Planta de armação","nivel":2,"children":[]}
    ]},
    {"nome":"Elétrico","nivel":1,"children":[
      {"nome":"Projeto de instalações","nivel":2,"children":[]},
      {"nome":"Quadro de cargas","nivel":2,"children":[]}
    ]},
    {"nome":"Hidrossanitário","nivel":1,"children":[
      {"nome":"Água fria","nivel":2,"children":[]},
      {"nome":"Esgoto","nivel":2,"children":[]},
      {"nome":"Águas pluviais","nivel":2,"children":[]}
    ]}
  ]'
),
(
  'Projeto Comercial',
  'Disciplinas para edificação comercial',
  '[
    {"nome":"Arquitetura","nivel":1,"children":[
      {"nome":"Planta baixa","nivel":2,"children":[]},
      {"nome":"Cortes","nivel":2,"children":[]},
      {"nome":"Fachadas","nivel":2,"children":[]}
    ]},
    {"nome":"PPCI","nivel":1,"children":[
      {"nome":"Planta de sprinklers","nivel":2,"children":[]},
      {"nome":"Planta de hidrantes","nivel":2,"children":[]},
      {"nome":"Plano de saída de emergência","nivel":2,"children":[]}
    ]},
    {"nome":"AVAC","nivel":1,"children":[
      {"nome":"Planta de dutos","nivel":2,"children":[]},
      {"nome":"Memorial de cálculo","nivel":2,"children":[]}
    ]}
  ]'
)
ON CONFLICT DO NOTHING;
