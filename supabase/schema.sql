-- =============================================
-- BuildSmart AI — Schema Supabase (PostgreSQL)
-- v3 — 06/06/2026
-- =============================================
-- Alterações v3:
--   • sinapi_insumos: preços em JSONB por UF (em vez de linha por estado)
--   • sinapi_composicao_itens: tabela analítica (INSUMO|COMPOSICAO + coeficiente)
--   • sinapi_composicoes: adicionado situacao, mes_referencia
--   • composicao_insumos: vínculo normalizado com insumo SINAPI ou insumo próprio
--   • obras: adicionado campo uf CHAR(2)
-- =============================================

-- ─── Perfis de usuário ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  photo_url TEXT,
  theme_color TEXT NOT NULL DEFAULT '#3B7BF8',
  dark_mode BOOLEAN NOT NULL DEFAULT true,
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Base SINAPI — Insumos (ISE) ─────────────────────────────────────────────
-- Um registro por insumo/mês. Preços de todos os estados em um único JSONB.
-- Exemplo: precos = {"AC": 302.08, "AL": 195.46, "SP": 198.69, ...}
CREATE TABLE IF NOT EXISTS sinapi_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  classificacao TEXT NOT NULL DEFAULT 'MATERIAL', -- SERVIÇOS | MATERIAL | MAO_DE_OBRA | EQUIPAMENTO
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  origem_preco TEXT,                               -- C = Coletado | CR = Coeficiente Representatividade
  precos JSONB NOT NULL DEFAULT '{}',              -- {"AC": 302.08, "AL": 195.46, ...}
  mes_referencia TEXT NOT NULL,                    -- "04/2026"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(codigo, mes_referencia)
);

-- ─── Base SINAPI — Composições (resumo por UF) ────────────────────────────────
-- Custo total da composição, por UF (da aba CSD).
CREATE TABLE IF NOT EXISTS sinapi_composicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  grupo TEXT NOT NULL DEFAULT 'GERAL',
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'COM CUSTO',      -- COM CUSTO | SEM CUSTO
  custos JSONB NOT NULL DEFAULT '{}',              -- {"AC": 280.81, "SP": 198.69, ...}
  mes_referencia TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(codigo, mes_referencia)
);

-- ─── Base SINAPI — Itens das Composições (Analítico) ─────────────────────────
-- Cada linha do relatório Analítico (INSUMO ou sub-COMPOSICAO + coeficiente).
CREATE TABLE IF NOT EXISTS sinapi_composicao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_codigo TEXT NOT NULL,                -- FK lógica → sinapi_composicoes.codigo
  mes_referencia TEXT NOT NULL,                   -- same as parent
  tipo TEXT NOT NULL CHECK (tipo IN ('INSUMO', 'COMPOSICAO')),
  item_codigo TEXT NOT NULL,                      -- FK lógica → sinapi_insumos.codigo ou sinapi_composicoes.codigo
  item_descricao TEXT NOT NULL,
  item_unidade TEXT NOT NULL DEFAULT 'UN',
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  situacao TEXT NOT NULL DEFAULT 'COM PREÇO',
  UNIQUE(composicao_codigo, mes_referencia, tipo, item_codigo)
);

-- ─── Composições Próprias da Empresa ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS composicoes_proprias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  grupo TEXT NOT NULL DEFAULT 'GERAL',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Insumos Próprios da Empresa ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insumos_proprios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',
  grupo TEXT,
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Itens de Composições Próprias ───────────────────────────────────────────
-- Schema real usado pelo app: cada item referencia OU um insumo SINAPI
-- (insumo_id) OU um insumo próprio da empresa (insumo_proprio_id).
CREATE TABLE IF NOT EXISTS composicao_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_id UUID NOT NULL REFERENCES composicoes_proprias(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES sinapi_insumos(id) ON DELETE SET NULL,
  insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL,
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (insumo_id IS NOT NULL OR insumo_proprio_id IS NOT NULL)
);

-- ─── Obras ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT NOT NULL DEFAULT '',
  foto_url TEXT,
  status TEXT NOT NULL DEFAULT 'orcamento'
    CHECK (status IN ('orcamento','ativa','concluida','paralisada')),
  data_inicio DATE,
  data_previsao DATE,
  responsavel TEXT,
  area_m2 NUMERIC(10,2),       -- área construída para custo/m²
  uf CHAR(2) NOT NULL DEFAULT 'SP',  -- UF para consulta de preços SINAPI
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Orçamentos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'executivo' CHECK (tipo IN ('executivo','parametrico')),
  bdi_percentual NUMERIC(5,2) NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','finalizado')),
  versao INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Etapas da Obra ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  status TEXT NOT NULL DEFAULT 'planejada'
    CHECK (status IN ('planejada','em_andamento','concluida','atrasada')),
  ordem INTEGER NOT NULL DEFAULT 0
);

-- ─── Itens do Orçamento ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  etapa_id UUID REFERENCES etapas(id),
  composicao_id UUID REFERENCES composicoes_proprias(id),
  sinapi_composicao_id UUID REFERENCES sinapi_composicoes(id),
  subetapa TEXT,
  quantidade NUMERIC(12,4) NOT NULL DEFAULT 1,
  preco_unitario_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0,
  descricao_snapshot TEXT,
  codigo_snapshot TEXT,
  unidade_snapshot TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Snapshot de Insumos por Item do Orçamento ───────────────────────────────
-- Permite override de quantidade por insumo, sem alterar composição base.
CREATE TABLE IF NOT EXISTS orcamento_item_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_item_id UUID NOT NULL REFERENCES orcamento_itens(id) ON DELETE CASCADE,
  sinapi_codigo TEXT NOT NULL,                         -- referência lógica ao insumo SINAPI
  quantidade_calculada NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantidade_adotada NUMERIC(12,4),                    -- NULL = usar calculada
  preco_unitario_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0,
  UNIQUE(orcamento_item_id, sinapi_codigo)
);

-- ─── Materiais / Suprimentos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id UUID REFERENCES etapas(id),
  subetapa TEXT,
  sinapi_codigo TEXT NOT NULL,    -- referência lógica ao insumo SINAPI
  descricao TEXT NOT NULL,        -- snapshot
  unidade TEXT NOT NULL DEFAULT 'UN',
  quantidade_total NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantidade_comprada NUMERIC(12,4) NOT NULL DEFAULT 0,
  status_compra TEXT NOT NULL DEFAULT 'nao_comprado'
    CHECK (status_compra IN ('nao_comprado','parcial','comprado')),
  data_necessidade DATE
);

-- ─── Medições ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id UUID REFERENCES etapas(id),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  percentual_executado NUMERIC(5,2) NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- obra_id NULL = fornecedor geral da empresa (disponível em todas as obras);
-- preenchido = fornecedor específico daquela obra
CREATE TABLE IF NOT EXISTS fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID REFERENCES obras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',  -- MATERIAL | MAO_DE_OBRA | EQUIPAMENTO | SERVICO | MISTO
  contato TEXT,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Índices para performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_codigo        ON sinapi_insumos(codigo);
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_mes           ON sinapi_insumos(mes_referencia);
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_descricao     ON sinapi_insumos USING gin(to_tsvector('portuguese', descricao));
CREATE INDEX IF NOT EXISTS idx_sinapi_comp_codigo           ON sinapi_composicoes(codigo);
CREATE INDEX IF NOT EXISTS idx_sinapi_comp_itens_comp       ON sinapi_composicao_itens(composicao_codigo, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_obras_status                 ON obras(status);
CREATE INDEX IF NOT EXISTS idx_obras_uf                     ON obras(uf);
CREATE INDEX IF NOT EXISTS idx_orcamentos_obra              ON orcamentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento    ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_etapa        ON orcamento_itens(etapa_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_item_insumos_item  ON orcamento_item_insumos(orcamento_item_id);
CREATE INDEX IF NOT EXISTS idx_etapas_obra                  ON etapas(obra_id);
CREATE INDEX IF NOT EXISTS idx_materiais_obra               ON materiais(obra_id);
CREATE INDEX IF NOT EXISTS idx_materiais_status             ON materiais(status_compra);
CREATE INDEX IF NOT EXISTS idx_fornecedores_obra            ON fornecedores(obra_id);
CREATE INDEX IF NOT EXISTS idx_insumos_proprios_codigo      ON insumos_proprios(codigo);
CREATE INDEX IF NOT EXISTS idx_insumos_proprios_grupo       ON insumos_proprios(grupo);
CREATE INDEX IF NOT EXISTS idx_composicao_insumos_comp      ON composicao_insumos(composicao_id);
CREATE INDEX IF NOT EXISTS idx_composicao_insumos_insumo    ON composicao_insumos(insumo_id);
CREATE INDEX IF NOT EXISTS idx_composicao_insumos_proprio   ON composicao_insumos(insumo_proprio_id);

-- =============================================
-- Dados de seed — SINAPI de exemplo (04/2026)
-- Apenas 3 insumos como referência de formato.
-- Importar dados reais via página /sinapi.
-- =============================================
INSERT INTO sinapi_insumos (codigo, classificacao, descricao, unidade, origem_preco, precos, mes_referencia) VALUES
(
  '45333', 'SERVIÇOS',
  'ABERTURA PARA ENCAIXE DE CUBA OU LAVATORIO EM BANCADA DE MARMORE/GRANITO OU OUTRO TIPO DE PEDRA NATURAL',
  'UN', 'CR',
  '{"AC":302.08,"AL":195.46,"AM":209.68,"AP":190.49,"BA":122.61,"CE":142.15,"DF":72.85,"ES":173.84,"GO":258.65,"MA":116.56,"MG":190.13,"MS":156.37,"MT":177.69,"PA":152.03,"PB":199.02,"PE":189.99,"PI":151.04,"PR":159.75,"RJ":231.00,"RN":159.92,"RO":217.50,"RR":231.00,"RS":126.36,"SC":201.57}',
  '04/2026'
),
(
  '11270', 'MATERIAL',
  'ABRACADEIRA DE LATAO PARA FIXACAO DE CABO PARA-RAIO, DIMENSOES 32 X 24 X 24 MM',
  'UN', 'CR',
  '{"AC":2.52,"AL":2.49,"AM":2.40,"AP":3.48,"BA":2.60,"CE":3.60,"DF":2.40,"ES":2.52,"GO":3.00,"MA":2.91,"MG":2.58,"MS":3.48,"MT":4.05,"PA":2.40,"PB":3.02,"PE":2.80,"PI":2.82,"PR":3.15,"RJ":2.40,"RN":2.52}',
  '04/2026'
),
(
  '412', 'MATERIAL',
  'ABRACADEIRA DE NYLON PARA AMARRACAO DE CABOS, COMPRIMENTO DE 230 X 7,6 MM',
  'UN', 'CR',
  '{"AC":1.18,"AL":0.77,"AM":1.18,"AP":1.02,"BA":0.92,"CE":0.87,"DF":1.13,"ES":1.38,"GO":0.82,"MA":1.02,"MG":0.92,"MS":1.54,"MT":1.13,"PA":1.38,"PB":0.92,"PE":1.28,"PI":1.28,"PR":1.08,"RJ":0.92,"RN":0.97,"RO":1.02,"RR":1.13,"RS":1.02,"SC":0.82,"SE":1.13,"SP":0.97}',
  '04/2026'
)
ON CONFLICT (codigo, mes_referencia) DO NOTHING;

-- Composição de exemplo (Analítico)
INSERT INTO sinapi_composicoes (codigo, grupo, descricao, unidade, situacao, custos, mes_referencia) VALUES
(
  '104658', 'Acessibilidade',
  'PISO PODOTÁTIL DE ALERTA OU DIRECIONAL, DE CONCRETO, ASSENTADO SOBRE ARGAMASSA. AF_03/2024',
  'M2', 'COM CUSTO',
  '{"AC":280.81,"AL":162.55,"SP":198.69}',
  '04/2026'
)
ON CONFLICT (codigo, mes_referencia) DO NOTHING;

INSERT INTO sinapi_composicao_itens (composicao_codigo, mes_referencia, tipo, item_codigo, item_descricao, item_unidade, coeficiente, situacao) VALUES
('104658','04/2026','COMPOSICAO','88316','SERVENTE COM ENCARGOS COMPLEMENTARES','H',1.279,'COM CUSTO'),
('104658','04/2026','COMPOSICAO','88309','PEDREIRO COM ENCARGOS COMPLEMENTARES','H',0.639,'COM CUSTO'),
('104658','04/2026','INSUMO','36178','PISO TATIL / PODOTATIL, LADRILHO HIDRAULICO/CONCRETO, 40 X 40 CM','UN',6.4375,'COM PREÇO'),
('104658','04/2026','INSUMO','34357','REJUNTE CIMENTICIO, QUALQUER COR','KG',0.24,'COM PREÇO'),
('104658','04/2026','INSUMO','34353','ARGAMASSA COLANTE AC II','KG',8.62,'COM PREÇO')
ON CONFLICT (composicao_codigo, mes_referencia, tipo, item_codigo) DO NOTHING;

-- =============================================
-- Seed de perfis
-- =============================================
INSERT INTO profiles (name, photo_url, theme_color, dark_mode, onboarding_done)
VALUES
  ('Admin', NULL, '#3B7BF8', true, true),
  ('Engenheiro', NULL, '#10B981', true, true)
ON CONFLICT DO NOTHING;

-- =============================================
-- Seed de composições próprias
-- =============================================
INSERT INTO composicoes_proprias (codigo, descricao, unidade, grupo) VALUES
('CP-001', 'Fundação em concreto armado FCK 25 MPa', 'M3', 'FUNDACAO'),
('CP-002', 'Alvenaria de bloco cerâmico 9x19x19 cm', 'M2', 'ALVENARIA'),
('CP-003', 'Reboco interno argamassa industrializada', 'M2', 'REVESTIMENTO'),
('CP-004', 'Instalação elétrica ponto de luz', 'PT', 'INSTALACOES'),
('CP-005', 'Instalação hidráulica ponto de água fria', 'PT', 'INSTALACOES'),
('CP-006', 'Cobertura com telha cerâmica tipo portuguesa', 'M2', 'COBERTURA'),
('CP-007', 'Contrapiso em concreto magro e = 5 cm', 'M2', 'PISO'),
('CP-008', 'Pintura látex PVA 2 demãos', 'M2', 'ACABAMENTO')
ON CONFLICT (codigo) DO NOTHING;
