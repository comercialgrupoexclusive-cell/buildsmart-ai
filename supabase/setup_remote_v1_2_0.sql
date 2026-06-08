-- ====================================================================
-- BuildSmart AI v1.2.0 - Setup unico do Supabase remoto
-- Gerado em 2026-06-08
--
-- Objetivo:
-- 1. Garantir tabelas do schema atual.
-- 2. Corrigir schema real de composicoes proprias: composicao_insumos.
-- 3. Aplicar melhorias v1.2.0: admin, clima, fornecedores, grupo de insumos.
-- 4. Liberar politicas para MVP beta local/anon.
-- 5. Importar base do usuario: 241 insumos, 94 composicoes e vinculos.
--
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Ele foi montado para ser idempotente na maior parte das operacoes.
-- ====================================================================



-- ====================================================================
-- Incluido de: supabase\schema.sql
-- ====================================================================

-- =============================================
-- BuildSmart AI â€” Schema Supabase (PostgreSQL)
-- v3 â€” 06/06/2026
-- =============================================
-- AlteraÃ§Ãµes v3:
--   â€¢ sinapi_insumos: preÃ§os em JSONB por UF (em vez de linha por estado)
--   â€¢ sinapi_composicao_itens: tabela analÃ­tica (INSUMO|COMPOSICAO + coeficiente)
--   â€¢ sinapi_composicoes: adicionado situacao, mes_referencia
--   â€¢ composicao_insumos: vÃ­nculo normalizado com insumo SINAPI ou insumo prÃ³prio
--   â€¢ obras: adicionado campo uf CHAR(2)
-- =============================================

-- â”€â”€â”€ Perfis de usuÃ¡rio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ Base SINAPI â€” Insumos (ISE) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Um registro por insumo/mÃªs. PreÃ§os de todos os estados em um Ãºnico JSONB.
-- Exemplo: precos = {"AC": 302.08, "AL": 195.46, "SP": 198.69, ...}
CREATE TABLE IF NOT EXISTS sinapi_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  classificacao TEXT NOT NULL DEFAULT 'MATERIAL', -- SERVIÃ‡OS | MATERIAL | MAO_DE_OBRA | EQUIPAMENTO
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  origem_preco TEXT,                               -- C = Coletado | CR = Coeficiente Representatividade
  precos JSONB NOT NULL DEFAULT '{}',              -- {"AC": 302.08, "AL": 195.46, ...}
  mes_referencia TEXT NOT NULL,                    -- "04/2026"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(codigo, mes_referencia)
);

-- â”€â”€â”€ Base SINAPI â€” ComposiÃ§Ãµes (resumo por UF) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Custo total da composiÃ§Ã£o, por UF (da aba CSD).
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

-- â”€â”€â”€ Base SINAPI â€” Itens das ComposiÃ§Ãµes (AnalÃ­tico) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Cada linha do relatÃ³rio AnalÃ­tico (INSUMO ou sub-COMPOSICAO + coeficiente).
CREATE TABLE IF NOT EXISTS sinapi_composicao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_codigo TEXT NOT NULL,                -- FK lÃ³gica â†’ sinapi_composicoes.codigo
  mes_referencia TEXT NOT NULL,                   -- same as parent
  tipo TEXT NOT NULL CHECK (tipo IN ('INSUMO', 'COMPOSICAO')),
  item_codigo TEXT NOT NULL,                      -- FK lÃ³gica â†’ sinapi_insumos.codigo ou sinapi_composicoes.codigo
  item_descricao TEXT NOT NULL,
  item_unidade TEXT NOT NULL DEFAULT 'UN',
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  situacao TEXT NOT NULL DEFAULT 'COM PREÃ‡O',
  UNIQUE(composicao_codigo, mes_referencia, tipo, item_codigo)
);

-- â”€â”€â”€ ComposiÃ§Ãµes PrÃ³prias da Empresa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS composicoes_proprias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  grupo TEXT NOT NULL DEFAULT 'GERAL',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- â”€â”€â”€ Insumos PrÃ³prios da Empresa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ Itens de ComposiÃ§Ãµes PrÃ³prias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Schema real usado pelo app: cada item referencia OU um insumo SINAPI
-- (insumo_id) OU um insumo prÃ³prio da empresa (insumo_proprio_id).
CREATE TABLE IF NOT EXISTS composicao_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_id UUID NOT NULL REFERENCES composicoes_proprias(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES sinapi_insumos(id) ON DELETE SET NULL,
  insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL,
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (insumo_id IS NOT NULL OR insumo_proprio_id IS NOT NULL)
);

-- â”€â”€â”€ Obras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  area_m2 NUMERIC(10,2),       -- Ã¡rea construÃ­da para custo/mÂ²
  uf CHAR(2) NOT NULL DEFAULT 'SP',  -- UF para consulta de preÃ§os SINAPI
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- â”€â”€â”€ OrÃ§amentos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'executivo' CHECK (tipo IN ('executivo','parametrico')),
  bdi_percentual NUMERIC(5,2) NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','finalizado')),
  versao INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- â”€â”€â”€ Etapas da Obra â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ Itens do OrÃ§amento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€ Snapshot de Insumos por Item do OrÃ§amento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Permite override de quantidade por insumo, sem alterar composiÃ§Ã£o base.
CREATE TABLE IF NOT EXISTS orcamento_item_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_item_id UUID NOT NULL REFERENCES orcamento_itens(id) ON DELETE CASCADE,
  sinapi_codigo TEXT NOT NULL,                         -- referÃªncia lÃ³gica ao insumo SINAPI
  quantidade_calculada NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantidade_adotada NUMERIC(12,4),                    -- NULL = usar calculada
  preco_unitario_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0,
  UNIQUE(orcamento_item_id, sinapi_codigo)
);

-- â”€â”€â”€ Materiais / Suprimentos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id UUID REFERENCES etapas(id),
  subetapa TEXT,
  sinapi_codigo TEXT NOT NULL,    -- referÃªncia lÃ³gica ao insumo SINAPI
  descricao TEXT NOT NULL,        -- snapshot
  unidade TEXT NOT NULL DEFAULT 'UN',
  quantidade_total NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantidade_comprada NUMERIC(12,4) NOT NULL DEFAULT 0,
  status_compra TEXT NOT NULL DEFAULT 'nao_comprado'
    CHECK (status_compra IN ('nao_comprado','parcial','comprado')),
  data_necessidade DATE
);

-- â”€â”€â”€ MediÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- obra_id NULL = fornecedor geral da empresa (disponÃ­vel em todas as obras);
-- preenchido = fornecedor especÃ­fico daquela obra
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
-- Ãndices para performance
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
-- Dados de seed â€” SINAPI de exemplo (04/2026)
-- Apenas 3 insumos como referÃªncia de formato.
-- Importar dados reais via pÃ¡gina /sinapi.
-- =============================================
INSERT INTO sinapi_insumos (codigo, classificacao, descricao, unidade, origem_preco, precos, mes_referencia) VALUES
(
  '45333', 'SERVIÃ‡OS',
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

-- ComposiÃ§Ã£o de exemplo (AnalÃ­tico)
INSERT INTO sinapi_composicoes (codigo, grupo, descricao, unidade, situacao, custos, mes_referencia) VALUES
(
  '104658', 'Acessibilidade',
  'PISO PODOTÃTIL DE ALERTA OU DIRECIONAL, DE CONCRETO, ASSENTADO SOBRE ARGAMASSA. AF_03/2024',
  'M2', 'COM CUSTO',
  '{"AC":280.81,"AL":162.55,"SP":198.69}',
  '04/2026'
)
ON CONFLICT (codigo, mes_referencia) DO NOTHING;

INSERT INTO sinapi_composicao_itens (composicao_codigo, mes_referencia, tipo, item_codigo, item_descricao, item_unidade, coeficiente, situacao) VALUES
('104658','04/2026','COMPOSICAO','88316','SERVENTE COM ENCARGOS COMPLEMENTARES','H',1.279,'COM CUSTO'),
('104658','04/2026','COMPOSICAO','88309','PEDREIRO COM ENCARGOS COMPLEMENTARES','H',0.639,'COM CUSTO'),
('104658','04/2026','INSUMO','36178','PISO TATIL / PODOTATIL, LADRILHO HIDRAULICO/CONCRETO, 40 X 40 CM','UN',6.4375,'COM PREÃ‡O'),
('104658','04/2026','INSUMO','34357','REJUNTE CIMENTICIO, QUALQUER COR','KG',0.24,'COM PREÃ‡O'),
('104658','04/2026','INSUMO','34353','ARGAMASSA COLANTE AC II','KG',8.62,'COM PREÃ‡O')
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
-- Seed de composiÃ§Ãµes prÃ³prias
-- =============================================
INSERT INTO composicoes_proprias (codigo, descricao, unidade, grupo) VALUES
('CP-001', 'FundaÃ§Ã£o em concreto armado FCK 25 MPa', 'M3', 'FUNDACAO'),
('CP-002', 'Alvenaria de bloco cerÃ¢mico 9x19x19 cm', 'M2', 'ALVENARIA'),
('CP-003', 'Reboco interno argamassa industrializada', 'M2', 'REVESTIMENTO'),
('CP-004', 'InstalaÃ§Ã£o elÃ©trica ponto de luz', 'PT', 'INSTALACOES'),
('CP-005', 'InstalaÃ§Ã£o hidrÃ¡ulica ponto de Ã¡gua fria', 'PT', 'INSTALACOES'),
('CP-006', 'Cobertura com telha cerÃ¢mica tipo portuguesa', 'M2', 'COBERTURA'),
('CP-007', 'Contrapiso em concreto magro e = 5 cm', 'M2', 'PISO'),
('CP-008', 'Pintura lÃ¡tex PVA 2 demÃ£os', 'M2', 'ACABAMENTO')
ON CONFLICT (codigo) DO NOTHING;



-- ====================================================================
-- Incluido de: supabase\migration_composicao_insumos_schema_real.sql
-- ====================================================================

-- ====================================================================
-- MigraÃ§Ã£o: schema real de itens de composiÃ§Ã£o prÃ³pria
--
-- O app atual usa `composicao_insumos`, com FK para `sinapi_insumos`
-- ou `insumos_proprios`. Este arquivo garante a tabela real usada em
-- runtime e evita depender da tabela legada/desatualizada
-- `composicao_itens`.
--
-- Aditivo / seguro de rodar mais de uma vez.
-- ====================================================================

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

CREATE TABLE IF NOT EXISTS composicao_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_id UUID NOT NULL REFERENCES composicoes_proprias(id) ON DELETE CASCADE,
  insumo_id UUID REFERENCES sinapi_insumos(id) ON DELETE SET NULL,
  insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL,
  coeficiente NUMERIC(14,6) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (insumo_id IS NOT NULL OR insumo_proprio_id IS NOT NULL)
);

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS insumo_proprio_id UUID REFERENCES insumos_proprios(id) ON DELETE SET NULL;

ALTER TABLE insumos_proprios
  ADD COLUMN IF NOT EXISTS grupo TEXT;

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_codigo
  ON insumos_proprios (codigo);

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_grupo
  ON insumos_proprios (grupo);

CREATE INDEX IF NOT EXISTS idx_composicao_insumos_comp
  ON composicao_insumos (composicao_id);

CREATE INDEX IF NOT EXISTS idx_composicao_insumos_insumo
  ON composicao_insumos (insumo_id);

CREATE INDEX IF NOT EXISTS idx_composicao_insumos_proprio
  ON composicao_insumos (insumo_proprio_id);



-- ====================================================================
-- Incluido de: supabase\fix_2026_06_07_insumos_orcamento.sql
-- ====================================================================

-- =====================================================================
-- Fix 2026-06-07: insumos proprios + orcamento_itens
--
-- Rodar no SQL Editor do Supabase.
--
-- Problemas confirmados pelo app em 07/06/2026:
-- 1) INSERT em insumos_proprios falha com:
--    "new row violates row-level security policy"
-- 2) A tela de orcamento tentava usar colunas que nao existem no banco remoto:
--    orcamento_itens.subetapa e orcamento_itens.created_at
--
-- Observacao:
-- O app tambem foi ajustado para funcionar sem subetapa/created_at, mas este
-- SQL alinha o banco ao schema esperado para evolucoes futuras.
-- =====================================================================

-- Garante que a tabela de insumos proprios exista.
CREATE TABLE IF NOT EXISTS insumos_proprios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',
  preco_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_codigo
  ON insumos_proprios (codigo);

-- Politicas abertas para o MVP atual, que usa chave anon no frontend.
-- Quando houver login/perfis por empresa, estas politicas devem ser restritas.
ALTER TABLE insumos_proprios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON insumos_proprios TO anon, authenticated;

DROP POLICY IF EXISTS insumos_proprios_select_all ON insumos_proprios;
DROP POLICY IF EXISTS insumos_proprios_insert_all ON insumos_proprios;
DROP POLICY IF EXISTS insumos_proprios_update_all ON insumos_proprios;
DROP POLICY IF EXISTS insumos_proprios_delete_all ON insumos_proprios;

CREATE POLICY insumos_proprios_select_all
  ON insumos_proprios FOR SELECT
  USING (true);

CREATE POLICY insumos_proprios_insert_all
  ON insumos_proprios FOR INSERT
  WITH CHECK (true);

CREATE POLICY insumos_proprios_update_all
  ON insumos_proprios FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY insumos_proprios_delete_all
  ON insumos_proprios FOR DELETE
  USING (true);

-- Alinha orcamento_itens ao schema versionado sem apagar dados.
ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS subetapa TEXT;

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE orcamento_itens
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento
  ON orcamento_itens (orcamento_id);

CREATE INDEX IF NOT EXISTS idx_orcamento_itens_etapa
  ON orcamento_itens (etapa_id);

-- Validacao rapida:
SELECT 'insumos_proprios policies ok' AS check_name, COUNT(*) AS policies
FROM pg_policies
WHERE tablename = 'insumos_proprios';

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'orcamento_itens'
  AND column_name IN ('subetapa', 'created_at', 'updated_at')
ORDER BY column_name;



-- ====================================================================
-- Incluido de: supabase\migration_admin_clima_fornecedores.sql
-- ====================================================================

-- ====================================================================
-- MigraÃ§Ã£o: Perfil ADM, personalizaÃ§Ã£o (apelido/descriÃ§Ã£o/localizaÃ§Ã£o),
-- apelido de fornecedor e vÃ­nculo obra â†” fornecedor (mÃ£o de obra / demais)
--
-- Contexto: pacote de melhorias v1.2.0 â€” controle de usuÃ¡rios por um
-- perfil ADM, personalizaÃ§Ã£o da IA por perfil (apelido/descriÃ§Ã£o),
-- localizaÃ§Ã£o do usuÃ¡rio (cidade/estado) para previsÃ£o do tempo, e
-- vÃ­nculo de fornecedores Ã s obras separados por grupo.
--
-- Tudo aditivo / seguro de rodar em produÃ§Ã£o (nÃ£o apaga dados).
-- O primeiro perfil jÃ¡ existente vira 'admin' automaticamente; novos
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

-- Bootstrap: se nenhum perfil Ã© admin ainda, o mais antigo vira admin
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

-- 3) VÃ­nculo Obra â†” Fornecedor (separado por grupo: mÃ£o de obra / demais)
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



-- ====================================================================
-- Incluido de: supabase\migration_grupo_insumos_proprios.sql
-- ====================================================================

-- ====================================================================
-- MigraÃ§Ã£o: campo `grupo` (categoria fina, livre) em insumos_proprios
--
-- Contexto: a base de dados real do usuÃ¡rio (planilha do sistema antigo)
-- traz, alÃ©m do tipo (Material/MÃ£o de obra/Equipamento), uma "Categoria"
-- de granularidade fina por insumo â€” ex.: "Madeira", "ElÃ©trico", "AÃ§o e
-- Ferragem", "ImpermeabilizaÃ§Ã£o" etc. â€” usada para organizaÃ§Ã£o/filtro.
--
-- A coluna `categoria` jÃ¡ existente fica restrita ao enum funcional do
-- sistema (MATERIAL | MAO_DE_OBRA | EQUIPAMENTO | SERVICO, sem CHECK no
-- banco). `grupo` Ã© sÃ³ um campo TEXT livre e opcional para preservar essa
-- informaÃ§Ã£o adicional sem qualquer impacto no restante do sistema.
--
-- Aditivo / seguro de rodar em produÃ§Ã£o (nÃ£o apaga nem altera dados).
-- ====================================================================

ALTER TABLE insumos_proprios
  ADD COLUMN IF NOT EXISTS grupo TEXT;

CREATE INDEX IF NOT EXISTS idx_insumos_proprios_grupo ON insumos_proprios (grupo);



-- ====================================================================
-- Incluido de: supabase\policies_mvp_local_beta.sql
-- ====================================================================

-- ====================================================================
-- PolÃ­ticas abertas para MVP local beta
--
-- O app ainda nÃ£o usa autenticaÃ§Ã£o Supabase real; os perfis sÃ£o perfis
-- locais/lÃ³gicos do prÃ³prio sistema. Para testar online com a anon key,
-- estas polÃ­ticas liberam leitura e escrita nas tabelas do MVP.
--
-- Antes de produÃ§Ã£o real/multiempresa, substituir por polÃ­ticas por
-- usuÃ¡rio/empresa/obra.
-- ====================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'obras',
    'orcamentos',
    'orcamento_itens',
    'orcamento_item_insumos',
    'etapas',
    'materiais',
    'medicoes',
    'fornecedores',
    'obra_fornecedores',
    'sinapi_insumos',
    'sinapi_composicoes',
    'sinapi_composicao_itens',
    'composicoes_proprias',
    'composicao_insumos',
    'insumos_proprios'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);

      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_select_all ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_insert_all ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_update_all ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_mvp_delete_all ON public.%I', t);

      EXECUTE format('CREATE POLICY bs_mvp_select_all ON public.%I FOR SELECT USING (true)', t);
      EXECUTE format('CREATE POLICY bs_mvp_insert_all ON public.%I FOR INSERT WITH CHECK (true)', t);
      EXECUTE format('CREATE POLICY bs_mvp_update_all ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t);
      EXECUTE format('CREATE POLICY bs_mvp_delete_all ON public.%I FOR DELETE USING (true)', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';



-- ====================================================================
-- Incluido de: supabase\import_base_usuario.sql
-- ====================================================================

-- ====================================================================
-- ImportaÃ§Ã£o da base de dados do usuÃ¡rio (sistema antigo â†’ BuildSmart AI)
-- Gerado automaticamente por scripts/gerar-sql-import-base-usuario.mjs
-- a partir de modelo_para_buildsmartR01.xlsx
--
-- ConteÃºdo: 241 insumos prÃ³prios, 94 composiÃ§Ãµes
-- prÃ³prias e 431 vÃ­nculos composiÃ§Ã£oâ†”insumo.
--
-- IMPORTANTE: rode antes a migraÃ§Ã£o supabase/migration_grupo_insumos_proprios.sql
-- (adiciona a coluna `grupo` em insumos_proprios usada abaixo).
--
-- Os "ID"/"ID ComposiÃ§Ã£o"/"ID Insumo" da planilha do sistema antigo NÃƒO sÃ£o
-- gravados â€” a correlaÃ§Ã£o aqui usa o `codigo`, que Ã© UNIQUE em ambas as
-- tabelas (insumos_proprios.codigo e composicoes_proprias.codigo).
--
-- Idempotente: pode rodar mais de uma vez (ON CONFLICT (codigo) DO UPDATE).
-- ====================================================================

-- â”€â”€â”€ 1) Insumos prÃ³prios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO insumos_proprios (codigo, descricao, unidade, categoria, grupo, preco_unitario, ativo) VALUES
  ('L7', 'Retroescavadeira Incluindo Operador', 'Hr', 'EQUIPAMENTO', 'Equipamentos', 350, true),
  ('P18', 'CaminhÃ£o Basculante 8mÂ³ Incluindo Operador', 'un', 'MATERIAL', 'Material Geral', 378, true),
  ('P654', 'Placa de Obra em PS', 'mÂ²', 'MATERIAL', 'ServiÃ§os Gerais', 210, true),
  ('P549', 'Placas de SinalizaÃ§Ã£o ImpressÃ£o Plastificada', 'un', 'MATERIAL', 'Material Geral', 10.5, true),
  ('P652', 'ImpressÃ£o projeto A1', 'un', 'MATERIAL', 'Material Geral', 10.5, true),
  ('P627', 'Escora Eucalipto 3m', 'un', 'MATERIAL', 'Madeira', 12.6, true),
  ('P3', 'Prego AÃ§o Polido com CabeÃ§a 17 x 27 1kg', 'un', 'MATERIAL', 'Material Geral', 31.4, true),
  ('P4', 'Prego AÃ§o Polido com CabeÃ§a 19 x 39 1kg', 'un', 'MATERIAL', 'Material Geral', 31.4, true),
  ('P5', 'Prego Telheiro Multilit 18x27 Galvanizado 500g', 'un', 'MATERIAL', 'Material Geral', 20.9, true),
  ('P7', 'Madeira eucalipto 2,5X7X5,40', 'un', 'MATERIAL', 'Madeira', 9.6, true),
  ('P653', 'Tapume de Obra EcolÃ³gico 0,50x2,00', 'un', 'MATERIAL', 'ServiÃ§os Gerais', 26.3, true),
  ('MO-A001', 'MÃ£o de Obra - Fechamento de Obra - Madeiramento e Tapume', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('P-A001', 'Prego AÃ§o Polido com CabeÃ§a 19 x 27 1kg', 'un', 'MATERIAL', 'Material Geral', 8.5, true),
  ('P8', 'Madeira Eucalipto 2,5X10X5,40', 'un', 'MATERIAL', 'Madeira', 15.8, true),
  ('P33', 'Areia Grossa', 'mÂ³', 'MATERIAL', 'Areia e Brita', 157.5, true),
  ('P34', 'Brita 01', 'mÂ³', 'MATERIAL', 'Areia e Brita', 157.5, true),
  ('P32', 'Cimento Cp-Iv 50Kg', 'un', 'MATERIAL', 'Argamassa e Cimento', 54, true),
  ('MO-A002', 'MÃ£o de Obra - DepÃ³sito de Obra - Madeiramento, Fechamento, ElÃ©trica e Hidro', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('P175', 'Vaso SanitÃ¡rio Convencional SaÃ­da Vertical', 'un', 'MATERIAL', 'Material Geral', 178.5, true),
  ('P212', 'Tubo Pvc Tigre Esgoto 100Mm 6M Branco', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 115.5, true),
  ('P217', 'Joelho 45Â° Pvc Para Esgoto 100Mm Ou 4" Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 8.4, true),
  ('P216', 'Joelho 90Â° Pvc Para Esgoto 100Mm Ou 4" Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 7.4, true),
  ('P378', 'Cano PVC Marrom SoldÃ¡vel 3m 3/4" 25mm Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 17.9, true),
  ('P318', 'Registro Esfera VS SoldÃ¡vel 25mm - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 44.1, true),
  ('P327', 'Joelho 90Âº SoldÃ¡vel 25mm, PVC Marrom, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 1.1, true),
  ('P597', 'TÃª SoldÃ¡vel 25mm, PVC Marrom, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 5.3, true),
  ('P176', 'Caixa De Descarga Branca 9L (Cordinha)', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 63, true),
  ('P604', 'Caixa Sobrepor 2 Disjuntores', 'un', 'MATERIAL', 'ElÃ©trico', 26.3, true),
  ('P192', 'Disjuntor Monopolar 20A Curva C Steck', 'un', 'MATERIAL', 'ElÃ©trico', 15.8, true),
  ('P559', 'Cabo PP 2,5mm', 'un', 'MATERIAL', 'ElÃ©trico', 5.3, true),
  ('P360', 'Conjunto Interruptor Simples e Tomada 2P+T 10A 4x2 Branco Stella Steck', 'un', 'MATERIAL', 'Material Geral', 13.7, true),
  ('P632', 'Poste Concreto 7,5m 1 Medidor TrifÃ¡sico Caixa + Disjuntor - Fornecimento e InstalaÃ§Ã£o', 'un', 'MATERIAL', 'Argamassa e Cimento', 1942.5, true),
  ('P633', 'PadrÃ£o de Entrada de Energia em Alvenaria + Disjuntor - Fornecimento e InstalaÃ§Ã£o', 'un', 'MATERIAL', 'Argamassa e Cimento', 4095, true),
  ('P634', 'Tela Laranja ReforÃ§ada Rolo 50m', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 261.5, true),
  ('MO-A003', 'MÃ£o de Obra - Fechamento com Tela Laranja', 'm', 'MAO_DE_OBRA', 'MÃ£o de Obra', 9.06, true),
  ('P655', 'Poste Concreto 7,5m 1 Medidor BifÃ¡sico Caixa + Disjuntor - Fornecimento e InstalaÃ§Ã£o', 'un', 'MATERIAL', 'Argamassa e Cimento', 1344, true),
  ('P656', 'Pedestal HidrÃ´metro PadrÃ£o concessionÃ¡ria', 'un', 'MATERIAL', 'Material Geral', 630, true),
  ('P6', 'Madeira eucalipto 2,5X5X5,40', 'un', 'MATERIAL', 'Madeira', 6.3, true),
  ('P66', 'Madeira Eucalipto 5X5X5,40', 'un', 'MATERIAL', 'Madeira', 15.8, true),
  ('P20', 'Linha De Pedreiro 80m', 'un', 'MATERIAL', 'Material Geral', 17.9, true),
  ('MO-A004', 'MÃ£o de Obra - LocaÃ§Ã£o de Obra - Gabarito', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 15.2, true),
  ('P27', 'PerfuraÃ§Ã£o Rotativa Diam=30Cm AtÃ© 5M', 'un', 'MATERIAL', 'Material Geral', 63, true),
  ('P51', 'VergalhÃ£o Ca-50 8mm (5/16") d12 metros', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 52.5, true),
  ('P52', 'VergalhÃ£o Ca-60 5mm d12 metros', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 26.3, true),
  ('P610', 'Arame Requeimado 18 1kg', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 26.1, true),
  ('P31', 'Protetor Para VergalhÃ£o De 1/2" A 1" 30 PeÃ§as', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 31.5, true),
  ('MO-A005', 'MÃ£o de Obra - PerfuraÃ§Ã£o, Armadura e Concretagem de Estaca', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 51.34, true),
  ('P50', 'VergalhÃ£o Ca-50 10mm (3/8") d12 metros', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 63, true),
  ('P152', 'Arame N16 AÃ§o Recozido Gerdau 1Kg 56M', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 26.3, true),
  ('MO-A006', 'MÃ£o de Obra - Bloco Sobre 1 Estaca', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 101.36, true),
  ('P605', 'Carga de Saibro 12m', 'un', 'MATERIAL', 'Areia e Brita', 787.5, true),
  ('MO-A007', 'MÃ£o de Obra - Reaterro e Apiloamento (CompactaÃ§Ã£o)', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('P41', 'Manta LÃ­quida Vedapren Preta 18L Vedacit', 'un', 'MATERIAL', 'ImpermeabilizaÃ§Ã£o', 493.5, true),
  ('P42', 'Fita Multiuso AsfÃ¡ltica Autoadesiva 20Cmx10M', 'un', 'MATERIAL', 'Material Geral', 68.3, true),
  ('P43', 'Escova Broxa Para Pintura Retangular 3''''', 'un', 'MATERIAL', 'Material Geral', 17.9, true),
  ('MO-A008', 'MÃ£o de Obra - ImpermeabilizaÃ§Ã£o de Vigas de FundaÃ§Ã£o', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 10.13, true),
  ('P248', 'Tela Para Concreto Gerdau Q92, 3,4mm, 20X20cm, 2,00X3,00 Metros', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 52.5, true),
  ('P48', 'Arame N16 AÃ§o Recozido 1Kg 56m', 'rolo', 'MATERIAL', 'AÃ§o e Ferragem', 26.3, true),
  ('P39', 'Aditivo Impermeabilizante Concreto E Argamassa 18L Vedacit', 'un', 'MATERIAL', 'Argamassa e Cimento', 178.5, true),
  ('P69', 'Lona PlÃ¡stica Preta 4 Mx100 M 15 Kg - Vonder', 'mÂ²', 'MATERIAL', 'ServiÃ§os Gerais', 273, true),
  ('P30', 'EspaÃ§ador Cadeira 15mm a 25mm 100 PeÃ§as', 'un', 'MATERIAL', 'Material Geral', 26.3, true),
  ('MO-A009', 'MÃ£o de Obra - Contrapiso Concreto Armado - Forma, Lona, Armadura e Concretagem', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('P45', 'Laje PrÃ©-Moldada LP 13 (8+5)', 'mÂ³', 'MATERIAL', 'Material Geral', 78.8, true),
  ('P456', 'Tela AÃ§o MÃ©dia 3,4mm Malha 15x15cm Painel de 2x3m ArcelorMittal', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 63, true),
  ('M9', 'MÃ£o de Obra - Posicionamento de Laje Entrepiso', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('P543', 'TÃ¡bua 2,5X15cm em Pinus ou Equivalente - Bruta 2,70m', 'un', 'MATERIAL', 'Madeira', 19.1, true),
  ('MO-A010', 'MÃ£o de Obra - Formas - Fechamento de Laje H=15cm', 'm', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('P49', 'Concreto Usinado FCK 25', 'mÂ³', 'MATERIAL', 'Material Geral', 514.5, true),
  ('MO-A011', 'MÃ£o de Obra - Concretagem (Concreto Usinado)', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 76.02, true),
  ('P37', 'TÃ¡bua 2,5X20cm em Pinus ou Equivalente - Bruta 2,70m', 'un', 'MATERIAL', 'Madeira', 17, true),
  ('P56', 'Prego Com CabeÃ§a Gerdau 16X24 Polido 1Kg', 'un', 'MATERIAL', 'Material Geral', 26.3, true),
  ('MO-A012', 'MÃ£o de Obra - Escada: Formas e Armaduras', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 1469.65, true),
  ('P609', 'Tijolo 14x19x29 VedaÃ§Ã£o', 'un', 'MATERIAL', 'Alvenaria e Bloco', 1.4, true),
  ('P63', 'Cal Hidratada Ch-I Para Argamassas 20Kg', 'un', 'MATERIAL', 'Argamassa e Cimento', 21, true),
  ('P62', 'Areia MÃ©dia', 'mÂ³', 'MATERIAL', 'Areia e Brita', 157.5, true),
  ('P637', 'Aditivo Plastificante para Argamassa (Alvenarite) 5L', 'un', 'MATERIAL', 'Argamassa e Cimento', 62.9, true),
  ('MO-A013', 'MÃ£o de Obra - Assentamento de Blocos CerÃ¢micos de VedaÃ§Ã£o', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('P57', 'Canaleta Estrutural CerÃ¢mica 14X19X29cm', 'un', 'MATERIAL', 'Alvenaria e Bloco', 5.3, true),
  ('P64', 'TreliÃ§a De Ferro TG8L 6X4,2X4,2mm - 6m', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 73.5, true),
  ('M63', 'MÃ£o de Obra - Verga/Contraverga', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 27.18, true),
  ('P173', 'Bloco CerÃ¢mico Estrutural 14X19X14cm', 'un', 'MATERIAL', 'Alvenaria e Bloco', 1.4, true),
  ('P648', 'Esquadria de AlumÃ­nio com Vidros Sob Medida', 'mÂ²', 'MATERIAL', 'Esquadria', 1312.5, true),
  ('P649', 'Esquadria de AlumÃ­nio com Vidros e Persiana Embutida Sob Medida', 'mÂ²', 'MATERIAL', 'Esquadria', 1575, true),
  ('P615', 'Vidro Temperado 8mm', 'mÂ²', 'MATERIAL', 'Esquadria', 525, true),
  ('MO-A014', 'MÃ£o de Obra - Madeiramento para Telhado', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('P616', 'Telha Aluzinco Trapezoidal', 'm', 'MATERIAL', 'Cobertura e Telha', 36.8, true),
  ('P78', 'Parafuso Autobrocante 1 X 5,5 (12) R$0,59', 'un', 'MATERIAL', 'Material Geral', 1.1, true),
  ('P617', 'Cumeeira Trapezoidal I=10%', 'm', 'MATERIAL', 'Cobertura e Telha', 52.5, true),
  ('M26', 'MÃ£o de Obra - ColocaÃ§Ã£o das Telhas', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('P76', 'Funilaria - Capa', 'un', 'MATERIAL', 'Material Geral', 65, true),
  ('P77', 'Funilaria - Rufo', 'm', 'MATERIAL', 'Material Geral', 65, true),
  ('P79', 'Funilaria - Calha', 'm', 'MATERIAL', 'Material Geral', 65, true),
  ('P67', 'Madeira Eucalipto 5X10X5,40', 'un', 'MATERIAL', 'Madeira', 26.3, true),
  ('P9', 'Madeira eucalipto 2,5X15X5,40', 'un', 'MATERIAL', 'Madeira', 21, true),
  ('MO-A015', 'MÃ£o de Obra - Madeiramento para Telhado Colonial', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('P-A002', 'Telha CerÃ¢mica Portuguesa Natural', 'un', 'MATERIAL', 'Cobertura e Telha', 3.2, true),
  ('P657', 'Cumeeira CerÃ¢mica Barro Portuguesa Natural', 'un', 'MATERIAL', 'Cobertura e Telha', 2.1, true),
  ('P660', 'Telha CerÃ¢mica Barro Portuguesa Esmaltada', 'un', 'MATERIAL', 'Cobertura e Telha', 5.3, true),
  ('P658', 'Cumeeira CerÃ¢mica Barro Portuguesa Esmaltada', 'un', 'MATERIAL', 'Cobertura e Telha', 5.3, true),
  ('P97', 'Impermeabilizante Quartzolit Tecplus Top 18Kg Cinza - Ãreas Molhadas', 'un', 'MATERIAL', 'ImpermeabilizaÃ§Ã£o', 63, true),
  ('M52', 'MÃ£o de Obra - ImpermeabilizaÃ§Ã£o de Pisos e Paredes', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('M25', 'MÃ£o de Obra - Chapisco', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 2.54, true),
  ('M36', 'MÃ£o de Obra - EmboÃ§o/Reboco', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 20.27, true),
  ('P643', 'Revestimento CerÃ¢mico Porcelanato Interno para Paredes', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 62.9, true),
  ('P160', 'Cimento Cola ACIII', 'un', 'MATERIAL', 'Argamassa e Cimento', 26.3, true),
  ('P161', 'Rejunte AcrÃ­lico 1Kg', 'un', 'MATERIAL', 'Material Geral', 31.5, true),
  ('P115', 'EspaÃ§ador Juntapiso Cortag 2Mm 100 PeÃ§as', 'un', 'MATERIAL', 'Material Geral', 10.5, true),
  ('M2', 'MÃ£o de Obra - Assentamento de Revestimento CerÃ¢mico em Paredes', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 40.54, true),
  ('P278', 'Desempenadeira PlÃ¡stica Com Espuma 20x33cm Preta - Parabon', 'un', 'MATERIAL', 'Material Geral', 25.2, true),
  ('P277', 'Desempenadeira PlÃ¡stica Estriada 20x33cm Preta - Paraboni', 'un', 'MATERIAL', 'Material Geral', 16.8, true),
  ('P662', 'Revestimento CerÃ¢mico Classe A em Paredes', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 26.3, true),
  ('P663', 'Argamassa Colante AC II 20kg - Cimento Cola', 'un', 'MATERIAL', 'Argamassa e Cimento', 18.9, true),
  ('P157', 'Perfil F530 Placo', 'un', 'MATERIAL', 'Forros', 26.3, true),
  ('P158', 'Chapa De Drywall Standard 1,80X1,20M Branca Placo', 'un', 'MATERIAL', 'Forros', 42, true),
  ('P155', 'Pendural AnÃ£o Drywall', 'un', 'MATERIAL', 'Forros', 1.2, true),
  ('P156', 'Tabica Lisa Pintada 3M Perfil LÃ­der', 'un', 'MATERIAL', 'Forros', 31.5, true),
  ('P279', 'Fita Mesh Tape SG 90m Placo', 'un', 'MATERIAL', 'Material Geral', 33.6, true),
  ('P280', 'Massa Para DRYWALL Placomix E 6kg Placo', 'un', 'MATERIAL', 'Pintura e Verniz', 23.1, true),
  ('P281', 'Parafuso Drywall Cpa # 6x25 Gn Walsywa C/1000', 'un', 'MATERIAL', 'Forros', 83.9, true),
  ('P282', 'Parafuso para Drywall TRPF 13 13mmx4,2cm 1.000 peÃ§as Placo Lentilha', 'un', 'MATERIAL', 'Forros', 141.8, true),
  ('M34', 'MÃ£o de Obra - Drywall/Gesso', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 35.47, true),
  ('P666', 'Forro PVC Frisado 10cm 6mt Branco', 'mÂ²', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 21, true),
  ('MO-A016', 'MÃ£o de Obra - Forro de PVC', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 10.13, true),
  ('P607', 'Tinta AcrÃ­lica Interna Branco Fosco', 'un', 'MATERIAL', 'Pintura e Verniz', 525, true),
  ('P178', 'Selador AcrÃ­lico Suvinil 18L - Interno E Externo', 'un', 'MATERIAL', 'Pintura e Verniz', 210, true),
  ('M61', 'MÃ£o de Obra - Selador e Tinta Base Ãgua sobre Paredes', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 7.6, true),
  ('P98', 'Tinta Impermeabilizante Quartzolit Parede Premium 18L Branco - Fachada', 'un', 'MATERIAL', 'Pintura e Verniz', 892.5, true),
  ('P638', 'Massa para Acabamento em PÃ³ - SC 15KG - Interna (Finaliza)', 'un', 'MATERIAL', 'Pintura e Verniz', 49.4, true),
  ('P122', 'Lixa De Parede GrÃ£o 120', 'un', 'MATERIAL', 'Pintura e Verniz', 2.1, true),
  ('P284', 'Lixa De Parede GrÃ£o 180', 'un', 'MATERIAL', 'Pintura e Verniz', 2.1, true),
  ('MO-A017', 'MÃ£o de Obra - AplicaÃ§Ã£o de Massa Finaliza', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 4.06, true),
  ('P639', 'Massa para Acabamento em PÃ³ - SC 15KG - Externa (Finaliza)', 'un', 'MATERIAL', 'Pintura e Verniz', 71.4, true),
  ('P640', 'Tinta AcrÃ­lica para Piso - Alto Fluxo - 18L', 'un', 'MATERIAL', 'Pintura e Verniz', 514.5, true),
  ('M6', 'MÃ£o de Obra - Pintura em Pisos', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 7.6, true),
  ('P118', 'Pincel 4" Atlas 319/9', 'un', 'MATERIAL', 'Pintura e Verniz', 10.5, true),
  ('P120', 'Conjunto Para Pintura Condor 98732 5 PeÃ§as', 'un', 'MATERIAL', 'Material Geral', 42, true),
  ('P124', 'EspÃ¡tula De AÃ§o Carbono 175/06 Atlas', 'un', 'MATERIAL', 'Material Geral', 31.5, true),
  ('M32', 'MÃ£o de Obra - Contrapiso de RegularizaÃ§Ã£o', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 17.74, true),
  ('P642', 'Revestimento CerÃ¢mico Porcelanato Interno para Pisos', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 39.9, true),
  ('P665', 'Argamassa Colante AC III 20kg - Cimento Cola', 'un', 'MATERIAL', 'Argamassa e Cimento', 21, true),
  ('M14', 'MÃ£o de Obra - AplicaÃ§Ã£o de Revestimento CerÃ¢mico em Pisos - Porcelanato', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 40.54, true),
  ('P641', 'Revestimento Piso Laminado Click', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 62.9, true),
  ('P644', 'Manta Polietileno para Piso Laminado', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 12.6, true),
  ('P661', 'Revestimento CerÃ¢mico Classe A em Pisos', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 39.9, true),
  ('P286', 'Granito Cinza Ocre', 'mÂ²', 'MATERIAL', 'Revestimento e Piso', 378, true),
  ('M53', 'MÃ£o de Obra - InstalaÃ§Ã£o de Soleiras/Pingadeiras', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 40.54, true),
  ('P619', 'Revestimento Granito Escada 17 Degraus 18x28 + Patamar', 'un', 'MATERIAL', 'Revestimento e Piso', 2625, true),
  ('MO-A018', 'MÃ£o de Obra - InstalaÃ§Ã£o de Granito em Escada: Piso, Espelho e Patamares', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 1266.95, true),
  ('P253', 'RodapÃ© De Poliestireno EspaÃ§ofloor 7Cm Slim Frisado Branco 70Mm X 10Mm X 2200Mm', 'un', 'MATERIAL', 'Revestimento e Piso', 41, true),
  ('P646', 'PU FixaÃ§Ã£o - Cola Santa Luzia Super Adesivo para RodapÃ© e Molduras - 400g', 'un', 'MATERIAL', 'Revestimento e Piso', 52.4, true),
  ('P647', 'Bucha de FixaÃ§Ã£o "T" de PlÃ¡stico Santa Luzia', 'un', 'MATERIAL', 'Material Geral', 31.4, true),
  ('MO-A019', 'MÃ£o de Obra - RodapÃ©', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('P-A003', 'Conjunto 4x2 montado com 1 Interruptor Simples, 10A 250V~, 4''''x2''''', 'un', 'MATERIAL', 'Material Geral', 20, true),
  ('P560', 'Caixa de Luz 4''''x2'''', de embutir, em PVC na cor amarelo para eletroduto corrugado', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 25, true),
  ('P667', 'ConduÃ­te Eletroduto mangueira Corrugado 25mm 3/4" por metro Amarelo', 'm', 'MATERIAL', 'ElÃ©trico', 13.9, true),
  ('P670', 'Cabo flexÃ­vel 2,5 mmÂ² 750V PVC antichama por metro', 'm', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 2.5, true),
  ('M7', 'MÃ£o de Obra - Ponto ElÃ©trico', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 33.22, true),
  ('P207', 'LuminÃ¡ria De Teto Led 18W Luz Branca Llum Bronzearte', 'un', 'MATERIAL', 'Material Geral', 57.8, true),
  ('P509', 'Caixa de DistribuiÃ§Ã£o para 24 Disjuntores DIN com Barramento Neutro/Terra para Embutir Lexman', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 120.6, true),
  ('P501', 'Disjuntor Din Bipolar EASY9 2P 16A Curva C 3000A Schneider', 'un', 'MATERIAL', 'ElÃ©trico', 47.1, true),
  ('P502', 'Disjuntor Din Bipolar EASY9 2P 20A Curva C 3000A Schneider', 'un', 'MATERIAL', 'ElÃ©trico', 47.1, true),
  ('P186', 'Disjuntor Tripolar 32A Curva C Steck', 'un', 'MATERIAL', 'ElÃ©trico', 63, true),
  ('P504', 'Disjuntor Din Bipolar EASY9 2P 40A Curva C 3000A Schneider', 'un', 'MATERIAL', 'ElÃ©trico', 38.7, true),
  ('P209', 'Haste De Aterramento 5/8" X 2 40 Metros Alta Camada', 'un', 'MATERIAL', 'Material Geral', 138.6, true),
  ('P-A004', 'Eletroduto flexÃ­vel corrugado PEAD, conforme NBR15715 - (50M)', 'un', 'MATERIAL', 'ElÃ©trico', 2.8, true),
  ('M4', 'MÃ£o de Obra - Esperas ElÃ©tricas - Eletrodutos', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 7.25, true),
  ('P-A005', 'Conjunto 4x2  montado de 1 Tomada 2P+T, 10A, posto horizontal', 'un', 'MATERIAL', 'Material Geral', 20, true),
  ('P-A006', 'Conjunto 4x2 montado de 2 Tomadas 2P+T, 10A, postos horizontais', 'un', 'MATERIAL', 'Material Geral', 20, true),
  ('P671', 'Cabo flexÃ­vel 4 mmÂ² 750V PVC antichama por metro', 'm', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 4, true),
  ('P593', 'Tampa Cega', 'un', 'MATERIAL', 'Material Geral', 20, true),
  ('P672', 'Cabo flexÃ­vel 6 mmÂ² 750V PVC antichama por metro', 'm', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10, true),
  ('P556', 'Bucha de ReduÃ§Ã£o SoldÃ¡vel Curta 32x25mm, PVC Marrom, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 9.5, true),
  ('P371', 'Curva 90Â° PVC Marrom SoldÃ¡vel 3/4" 25mm Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 4.2, true),
  ('P524', 'Joelho 90Â° com Bucha PVC Azul RoscÃ¡vel e SoldÃ¡vel 1/2" 25mm Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 6.4, true),
  ('P326', 'Joelho 90Âº SoldÃ¡vel 32mm, PVC Marrom, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 5.3, true),
  ('P598', 'TÃª SoldÃ¡vel 32mm, PVC Marrom, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 5.3, true),
  ('P600', 'TÃª SoldÃ¡vel com Bucha de LatÃ£o na Bolsa Central 25 x 3/4'''', PVC Marrom, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 15.8, true),
  ('P527', 'TÃª de ReduÃ§Ã£o PVC Marrom SoldÃ¡vel 1x3/4" 32x25mm Plastilit', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 8.6, true),
  ('M58', 'MÃ£o de Obra - Ponto HidrÃ¡ulico - Ãgua Fria', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 39.26, true),
  ('P81', 'Caixa D''Ãgua 1000L', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 525, true),
  ('P324', 'Torneira BÃ³ia para Caixa D''Ãgua 1/2'''', Ãgua Fria', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 42, true),
  ('P316', 'Adaptador SoldÃ¡vel com Anel para Caixa d''Ãgua, PVC Branco, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 28.4, true),
  ('MO-A020', 'MÃ£o de Obra - InstalaÃ§Ã£o de Caixa D''Ãgua', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 72.48, true),
  ('P651', 'Tubo Agua Fria Soldavel 25mm barra 3 metros', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 18.9, true),
  ('P650', 'Tubo Agua Fria Soldavel 32mm barra 3 metros', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 60.9, true),
  ('P623', 'Tubo Agua Fria Soldavel 40mm barra 3 metros', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 57.8, true),
  ('P376', 'Registro Esfera Vs Soldavel 32mm Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 50.4, true),
  ('P377', 'Registro De Esfera Vs SoldÃ¡vel Tigre 40mm', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 63, true),
  ('P493', 'Tubo Cpvc Aquatherm 22mm 3 Metros - Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 62.9, true),
  ('P315', 'Adaptador SoldÃ¡vel com Anel para Caixa d''Ãgua com Registro, PVC Branco, Ãgua Fria - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 31.5, true),
  ('P554', 'Base Registro Gaveta 25', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 62, true),
  ('MO-A021', 'MÃ£o de Obra - Ponto HidrÃ¡ulico', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 39.26, true),
  ('P555', 'Base Registro PressÃ£o 25', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 62, true),
  ('P417', 'Base Registro Chuveiro Cpvc P/ Acab Deca 22mm-tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 47.3, true),
  ('P323', 'Caixa D''Ãgua Polietileno 500L Azul Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 315, true),
  ('P576', 'Joelho 45Âº 40mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10.5, true),
  ('P577', 'Joelho 45Âº 50mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10.5, true),
  ('P575', 'Joelho 45Âº 100mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10.5, true),
  ('P580', 'Joelho 90Âº 40mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10.5, true),
  ('P581', 'Joelho 90Âº 50mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10.5, true),
  ('P578', 'Joelho 90Âº 100mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 10.5, true),
  ('P586', 'JunÃ§Ã£o Simples 100 x 50mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'Material Geral', 21, true),
  ('P590', 'Luva Simples 50mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'Material Geral', 7.4, true),
  ('P588', 'Luva Simples 100mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'Material Geral', 7.4, true),
  ('P596', 'TÃª 50 x 50mm, Esgoto SÃ©rie Normal - TIGRE', 'un', 'MATERIAL', 'Material Geral', 15.8, true),
  ('P319', 'Caixa de Gordura com Tampa DN 100 - TIGRE', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 315, true),
  ('P320', 'Prolongamento para Caixa Sifonada 150x200mm PVC Tigre', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 17.9, true),
  ('MO-A022', 'MÃ£o de Obra - Ponto HidrossanitÃ¡rio', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 48.32, true),
  ('P234', 'Caixa Sifonada Pvc Tigre 7 Entradas 150X150X50Mm Quadrada Com Grelha Branca', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 47.3, true),
  ('P675', 'Caixa Sifonada 150X170X75mm Lavanderia - Ãrea de ServiÃ§o', 'un', 'MATERIAL', 'Material Geral', 136.5, true),
  ('P519', 'Caixa de inspeÃ§Ã£o em alvenaria com tampa - 50x50x50', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 236.3, true),
  ('P132', 'Kit Bacia Convencional Avant Conjunto De FixaÃ§Ã£o FlexÃ­vel E Anel De VedaÃ§Ã£o - Incepa', 'un', 'MATERIAL', 'Material Geral', 315, true),
  ('P291', 'Engate FlexÃ­vel Branco 1/2â€™â€™ X 50 Cm Para Ãgua Fria', 'un', 'MATERIAL', 'Material Geral', 10.4, true),
  ('P128', 'Fita Veda Rosca Firlon Plastifluor - 18 Mm X 50 M', 'un', 'MATERIAL', 'Material Geral', 8.4, true),
  ('P676', 'LavatÃ³rio de Coluna com Pedestal', 'un', 'MATERIAL', 'Material Geral', 262.5, true),
  ('P-A007', 'Pia de Cozinha Simples em Inox com MÃ£o Francesa', 'un', 'MATERIAL', 'Material Geral', 380, true),
  ('P551', 'Acabamento Cromado para Base Registro', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 26.3, true),
  ('P587', 'Kit Banheiro - 4 PeÃ§as - Toalheiro/Papeleiro/Saboneteira', 'un', 'MATERIAL', 'Material Geral', 105, true),
  ('P130', 'Torneira Banheiro Lorenzetti Pratti Bica Alta 1/2" Cromado 1195 F56', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 105, true),
  ('P126', 'Torneira Cozinha Gourmet Dupla De Mesa - Com Monocomando Cromada Nell Am-2679', 'un', 'MATERIAL', 'TubulaÃ§Ã£o e HidrÃ¡ulica', 315, true),
  ('M55', 'MÃ£o de Obra - Limpeza Final e Calafetagem', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 1.81, true),
  ('P591', 'Produtos de Limpeza Final', 'un', 'MATERIAL', 'Material Geral', 525, true),
  ('MO-A023', 'MÃ£o de Obra - Estaca C25 3m - PerfuraÃ§Ã£o e Armaduras', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 38.01, true),
  ('P54', 'VergalhÃ£o Ca-50 6,3Mm (1/4") d12 metros', 'un', 'MATERIAL', 'AÃ§o e Ferragem', 36.8, true),
  ('MO-A024', 'MÃ£o de Obra - Bloco Sobre 2 Estacas', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 126.7, true),
  ('MO-A025', 'MÃ£o de Obra - Bloco Sobre 3 Estacas', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 169.12, true),
  ('M31', 'MÃ£o de Obra - Concreto Manual em Obra - Preparo em Betoneira', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 15.1, true),
  ('MO-A026', 'MÃ£o de Obra - Armaduras Viga Baldrame 15x40', 'm', 'MAO_DE_OBRA', 'MÃ£o de Obra', 12.67, true),
  ('P36', 'TÃ¡bua 2,5X30cm em Pinus ou Equivalente - Bruta 2,70m', 'un', 'MATERIAL', 'Madeira', 36.8, true),
  ('MO-A027', 'MÃ£o de Obra - Forma Viga Baldrame 1 TÃ¡bua de 30', 'm', 'MAO_DE_OBRA', 'MÃ£o de Obra', 25.34, true),
  ('MO-A028', 'MÃ£o de Obra - Travamento e Gravatas de Forma de FundaÃ§Ã£o', 'm', 'MAO_DE_OBRA', 'MÃ£o de Obra', 21.14, true),
  ('P800', 'Caixilho de AlumÃ­nio Linha Popular - Material', 'mÂ²', 'MATERIAL', 'Esquadria', 200, true),
  ('P801', 'Vidro Comum 4mm Transparente', 'mÂ²', 'MATERIAL', 'Esquadria', 45, true),
  ('P802', 'Espuma Expansiva Poliuretano VedaÃ§Ã£o 500ml', 'un', 'MATERIAL', 'Esquadria', 28, true),
  ('P803', 'Porta de Madeira Compensado Popular 0.80x2.10m', 'un', 'MATERIAL', 'Esquadria', 195, true),
  ('P804', 'Batente e Alizares de Madeira - Jogo Completo', 'un', 'MATERIAL', 'Esquadria', 75, true),
  ('P805', 'Fechadura com MaÃ§aneta Popular - Interna', 'un', 'MATERIAL', 'Esquadria', 45, true),
  ('P806', 'DobradiÃ§as 3x3" Zincada - Pacote 3 PeÃ§as', 'un', 'MATERIAL', 'Esquadria', 24, true),
  ('P807', 'Borracha de VedaÃ§Ã£o para Porta - Tira 2m', 'un', 'MATERIAL', 'Esquadria', 15, true),
  ('MO-A029', 'MÃ£o de Obra - InstalaÃ§Ã£o de Esquadria/Janela de AlumÃ­nio', 'mÂ²', 'MAO_DE_OBRA', 'MÃ£o de Obra', 27.88, true),
  ('MO-A030', 'MÃ£o de Obra - InstalaÃ§Ã£o de Porta (folha + batente + alizares)', 'un', 'MAO_DE_OBRA', 'MÃ£o de Obra', 32.95, true)
ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  categoria = EXCLUDED.categoria,
  grupo = EXCLUDED.grupo,
  preco_unitario = EXCLUDED.preco_unitario,
  ativo = EXCLUDED.ativo;

-- â”€â”€â”€ 2) ComposiÃ§Ãµes prÃ³prias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- grupo inferido pela faixa do cÃ³digo (a planilha de origem nÃ£o tem esse campo
-- para composiÃ§Ãµes â€” sÃ³ para insumos). Pode ser ajustado depois pela tela.
INSERT INTO composicoes_proprias (codigo, descricao, unidade, grupo, ativo) VALUES
  ('1000', 'Limpeza Terreno - Raspagem Superficial com Retroescavadeira', 'hr', 'SERVICOS_GERAIS', true),
  ('1001', 'Limpeza Terreno - RemoÃ§Ã£o CaminhÃ£o CaÃ§amba 12mÂ²', 'un', 'SERVICOS_GERAIS', true),
  ('1002', 'Placa de Obra e Placas de SinalizaÃ§Ã£o', 'un', 'SERVICOS_GERAIS', true),
  ('1003', 'Fechamento/Isolamento de Obra Tapume EcolÃ³gico 50x200', 'm', 'SERVICOS_GERAIS', true),
  ('1004', 'DepÃ³sito de Obra - Paredes/Telhado com Tapume EcolÃ³gico 50x200', 'mÂ²', 'SERVICOS_GERAIS', true),
  ('1005', 'InstalaÃ§Ã£o ProvisÃ³ria HidrossanitÃ¡rio', 'un', 'SERVICOS_GERAIS', true),
  ('1006', 'InstalaÃ§Ã£o ProvisÃ³ria Energia', 'un', 'SERVICOS_GERAIS', true),
  ('1007', 'Poste PadrÃ£o Entrada de Energia - 1 Medidor - Concreto - TrifÃ¡sico', 'un', 'SERVICOS_GERAIS', true),
  ('1008', 'Poste PadrÃ£o Entrada de Energia SubterrÃ¢neo - 1 Medidor - Concreto - TrifÃ¡sico', 'un', 'SERVICOS_GERAIS', true),
  ('1009', 'Fechamento/Isolamento de Obra com ProteÃ§Ã£o Tela Laranja', 'm', 'SERVICOS_GERAIS', true),
  ('1010', 'Poste PadrÃ£o Entrada de Energia - 1 Medidor - Concreto - BifÃ¡sico', 'un', 'SERVICOS_GERAIS', true),
  ('1011', 'Pedestal HidrÃ´metro PadrÃ£o ConcessionÃ¡ria', 'un', 'SERVICOS_GERAIS', true),
  ('2000', 'LocaÃ§Ã£o de Obra - Gabarito', 'm', 'FUNDACAO', true),
  ('2001', 'Estaca C25 3 metros - PerfuraÃ§Ã£o, Armaduras e Concretagem', 'un', 'FUNDACAO', true),
  ('2002', 'Blocos Sobre 1 Estaca 55x55x40', 'un', 'FUNDACAO', true),
  ('2004', 'Reaterro e Apiloamento', 'mÂ²', 'FUNDACAO', true),
  ('2005', 'ImpermeabilizaÃ§Ã£o de FundaÃ§Ãµes', 'mÂ²', 'FUNDACAO', true),
  ('2006', 'Contrapiso Concreto Armado 5cm', 'mÂ²', 'FUNDACAO', true),
  ('3007', 'Laje PrÃ© Moldada - Tela + Escoramento', 'mÂ²', 'ESTRUTURA', true),
  ('3008', 'Formas - Fechamento de Laje H=15cm', 'm', 'ESTRUTURA', true),
  ('3009', 'Concreto Usinado FCK 25', 'mÂ²', 'ESTRUTURA', true),
  ('3016', 'Escada "L" 1 NÃ­vel - Forma e Armadura', 'un', 'ESTRUTURA', true),
  ('4000', 'Alvenaria de VedaÃ§Ã£o em Blocos CerÃ¢micos com Furos Verticais', 'mÂ²', 'ALVENARIA', true),
  ('4001', 'Verga e Contraverga em Canaleta CerÃ¢mica', 'm', 'ALVENARIA', true),
  ('4002', 'Alvenaria Estrutural em Blocos CerÃ¢micos com Furos Horizontais', 'mÂ²', 'ALVENARIA', true),
  ('5002', 'Esquadrias de AlumÃ­nio com Vidros Sob Medida', 'mÂ²', 'ACABAMENTO', true),
  ('5003', 'Esquadrias de AlumÃ­nio com Vidros e Persiana Embutida', 'mÂ²', 'ACABAMENTO', true),
  ('6000', 'Vidro Temperado 8mm Sob Medida', 'mÂ²', 'ACABAMENTO', true),
  ('7000', 'Telhado Aluzinco - Trama de Madeira (Madeiramento)', 'mÂ²', 'COBERTURA', true),
  ('7001', 'Telhado Aluzinco - Telhamento com Telha de Aluzinco', 'm', 'COBERTURA', true),
  ('7002', 'Funilaria - Rufos e Algerosas', 'm', 'COBERTURA', true),
  ('7003', 'Funilaria - Calhas', 'm', 'COBERTURA', true),
  ('7004', 'Telhado Colonial - Trama de Madeira (Madeiramento) para Telha de Barro CerÃ¢mica', 'mÂ²', 'COBERTURA', true),
  ('7005', 'Telhado Colonial Natural - Telhamento com Telha de Barro CerÃ¢mica', 'mÂ²', 'COBERTURA', true),
  ('7006', 'Telhado Colonial Esmaltado - Telhamento com Telha de Barro CerÃ¢mica', 'mÂ²', 'COBERTURA', true),
  ('8000', 'ImpermeabilizaÃ§Ã£o de Paredes com Argamassa PolimÃ©rica H=1,00m', 'mÂ²', 'REVESTIMENTO', true),
  ('8001', 'ImpermeabilizaÃ§Ã£o de Piso e Paredes - Ãreas Molhadas H=1,80m', 'mÂ²', 'REVESTIMENTO', true),
  ('8002', 'ImpermeabilizaÃ§Ã£o de Piso (TerraÃ§os)', 'mÂ²', 'REVESTIMENTO', true),
  ('9000', 'Chapisco', 'mÂ²', 'REVESTIMENTO', true),
  ('9001', 'EmboÃ§o/Reboco', 'mÂ²', 'REVESTIMENTO', true),
  ('9002', 'Revestimento CerÃ¢mico em Paredes - Porcelanato', 'mÂ²', 'REVESTIMENTO', true),
  ('9003', 'Kit Material DescartÃ¡vel para Revestimento Argamassado em Paredes/Teto', 'un', 'REVESTIMENTO', true),
  ('9004', 'Revestimento CerÃ¢mico em Paredes - CerÃ¢mica Classe A', 'mÂ²', 'REVESTIMENTO', true),
  ('10000', 'Forro Drywall', 'mÂ²', 'GERAL', true),
  ('10002', 'Forro de PVC e Trama de Madeira', 'mÂ²', 'GERAL', true),
  ('12000', 'Pintura AcrÃ­lica Sobre Paredes - Interno', 'mÂ²', 'GERAL', true),
  ('12001', 'Pintura Emborrachada AcrÃ­lica Sobre Paredes - Externo', 'mÂ²', 'GERAL', true),
  ('12002', 'Massa Fina de Acabamento Interna', 'mÂ²', 'GERAL', true),
  ('12003', 'Massa Fina de Acabamento Externa', 'mÂ²', 'GERAL', true),
  ('12004', 'Pintura AcrÃ­lica em Pisos - Alto Fluxo', 'mÂ²', 'GERAL', true),
  ('12005', 'Pintura AcrÃ­lica em Teto - Forro', 'mÂ²', 'GERAL', true),
  ('12006', 'Materiais DescartÃ¡veis de Pintura', 'un', 'GERAL', true),
  ('13000', 'Contrapiso de RegularizaÃ§Ã£o (Cimento e Areia)', 'mÂ²', 'GERAL', true),
  ('13002', 'Revestimento CerÃ¢mico em Pisos - Porcelanato', 'mÂ²', 'GERAL', true),
  ('13005', 'Revestimento em Pisos - Laminado', 'mÂ²', 'GERAL', true),
  ('13012', 'Revestimento CerÃ¢mico em Pisos - CerÃ¢mica Classe A', 'mÂ²', 'GERAL', true),
  ('14000', 'Pingadeiras e Soleiras', 'mÂ²', 'GERAL', true),
  ('14001', 'Revestimento em Granito para Escada', 'un', 'GERAL', true),
  ('14002', 'RodapÃ© - Poliestireno 7cm', 'm', 'GERAL', true),
  ('15002', 'Interruptor Simples - CJt Montado e EnfiaÃ§Ã£o', 'un', 'GERAL', true),
  ('15004', 'LuminÃ¡ria LED 18W - Cjt e EnfiaÃ§Ã£o', 'un', 'GERAL', true),
  ('15005', 'QD - Quadro de DistribuiÃ§Ã£o', 'un', 'GERAL', true),
  ('15006', 'Balde e Haste Aterramento', 'un', 'GERAL', true),
  ('15007', 'Eletroduto PEAD', 'm', 'GERAL', true),
  ('15009', 'Tomada Simples - CJt Montado e EnfiaÃ§Ã£o', 'un', 'GERAL', true),
  ('15010', 'Tomada Dupla - CJt Montado e EnfiaÃ§Ã£o', 'un', 'GERAL', true),
  ('15011', 'Tomada Dupla - CJt Montado e EnfiaÃ§Ã£o Cabo 4mm', 'un', 'GERAL', true),
  ('15012', 'Tomada Simples - CJt Montado e EnfiaÃ§Ã£o Cabo 4mm', 'un', 'GERAL', true),
  ('15013', 'Ponto Chuveiro - CJt Tampa Cega e EnfiaÃ§Ã£o Cabo 6mm', 'un', 'GERAL', true),
  ('16000', 'ConexÃµes para Ãgua Fria - Ponto HidrÃ¡ulico', 'un', 'GERAL', true),
  ('16005', 'ReservatÃ³rio Ãgua 1000L', 'un', 'GERAL', true),
  ('16006', 'Rede HidrÃ¡ulica - Tubos PVC Ãgua Fria 25mm por metro', 'm', 'GERAL', true),
  ('16007', 'Tubos Rigidos - HidrÃ¡ulica 25mm por metro', 'm', 'GERAL', true),
  ('16011', 'ReservatÃ³rio Ãgua 500L', 'un', 'GERAL', true),
  ('17001', 'ConexÃµes para Esgoto/Pluvial', 'un', 'GERAL', true),
  ('17003', 'Caixa de Gordura', 'un', 'GERAL', true),
  ('17004', 'Caixa Sifonada Pvc 150X150X50Mm Com Grelha Branca', 'un', 'GERAL', true),
  ('17005', 'Caixa Sifonada 150X170X75mm Lavanderia - Ãrea de ServiÃ§o', 'un', 'GERAL', true),
  ('17006', 'Caixa de inspeÃ§Ã£o com tampa - 50x50x50', 'un', 'GERAL', true),
  ('18000', 'LouÃ§as - Bacia SanitÃ¡ria Caixa Acoplada, LavatÃ³rio e AcessÃ³rios', 'un', 'GERAL', true),
  ('18001', 'Metais', 'un', 'GERAL', true),
  ('19000', 'Limpeza Final', 'un', 'GERAL', true),
  ('19001', 'Produtos de Limpeza Final', 'un', 'GERAL', true),
  ('2001.1', 'Estaca C25 3 metros - PerfuraÃ§Ã£o e Armaduras', 'un', 'GERAL', true),
  ('2002.1', 'Blocos Sobre 2 Estacas 135x55x40', 'un', 'GERAL', true),
  ('2002.2', 'Blocos Sobre 3 Estacas 135x55x40', 'un', 'GERAL', true),
  ('2002.3', 'Concreto Manual em Obra Preparo em Betoneira', 'mÂ²', 'GERAL', true),
  ('2003.1', 'Armadura Viga Baldrame 15x30 4 Barras 8mm', 'm', 'GERAL', true),
  ('2003.2', 'Forma Viga Baldrame 30cm Altura 1 TÃ¡bua 30cm', 'm', 'GERAL', true),
  ('2003.3', 'Travamento e Escoramento de Formas de Baldrame', 'm', 'GERAL', true),
  ('5004', 'Esquadria de AlumÃ­nio Linha Popular c/ Vidro 4mm - Janela', 'mÂ²', 'ACABAMENTO', true),
  ('5005', 'Porta-Janela de AlumÃ­nio Linha Popular (Sem Vidro)', 'mÂ²', 'ACABAMENTO', true),
  ('5006', 'Porta de Madeira Popular - Kit Completo (0.80x2.10m)', 'un', 'ACABAMENTO', true),
  ('4003', 'Cinta de Coroamento em Canaleta CerÃ¢mica', 'm', 'ALVENARIA', true)
ON CONFLICT (codigo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  grupo = EXCLUDED.grupo,
  ativo = EXCLUDED.ativo;

-- â”€â”€â”€ 3) VÃ­nculos composiÃ§Ã£o Ã— insumo (composicao_insumos) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Resolve pelo `codigo` (UNIQUE) de cada lado â€” nÃ£o depende dos IDs do
-- sistema antigo. Remove vÃ­nculos anteriores destas composiÃ§Ãµes antes de
-- reinserir, para a importaÃ§Ã£o ser idempotente.
DELETE FROM composicao_insumos
WHERE composicao_id IN (
  SELECT id FROM composicoes_proprias WHERE codigo IN (
    '1000',
    '1001',
    '1002',
    '1003',
    '1004',
    '1005',
    '1006',
    '1007',
    '1008',
    '1009',
    '1010',
    '1011',
    '2000',
    '2001',
    '2002',
    '2004',
    '2005',
    '2006',
    '3007',
    '3008',
    '3009',
    '3016',
    '4000',
    '4001',
    '4002',
    '5002',
    '5003',
    '6000',
    '7000',
    '7001',
    '7002',
    '7003',
    '7004',
    '7005',
    '7006',
    '8000',
    '8001',
    '8002',
    '9000',
    '9001',
    '9002',
    '9003',
    '9004',
    '10000',
    '10002',
    '12000',
    '12001',
    '12002',
    '12003',
    '12004',
    '12005',
    '12006',
    '13000',
    '13002',
    '13005',
    '13012',
    '14000',
    '14001',
    '14002',
    '15002',
    '15004',
    '15005',
    '15006',
    '15007',
    '15009',
    '15010',
    '15011',
    '15012',
    '15013',
    '16000',
    '16005',
    '16006',
    '16007',
    '16011',
    '17001',
    '17003',
    '17004',
    '17005',
    '17006',
    '18000',
    '18001',
    '19000',
    '19001',
    '2001.1',
    '2002.1',
    '2002.2',
    '2002.3',
    '2003.1',
    '2003.2',
    '2003.3',
    '5004',
    '5005',
    '5006',
    '4003'
  )
);

INSERT INTO composicao_insumos (composicao_id, insumo_proprio_id, coeficiente)
SELECT cp.id, ip.id, v.coeficiente
FROM (VALUES
  ('1000', 'L7', 1),
  ('1001', 'P18', 1),
  ('1002', 'P654', 2),
  ('1002', 'P549', 4),
  ('1002', 'P652', 20),
  ('1003', 'P627', 1.05),
  ('1003', 'P3', 0.05),
  ('1003', 'P4', 0.025),
  ('1003', 'P5', 0.2),
  ('1003', 'P7', 0.625),
  ('1003', 'P653', 2.1),
  ('1003', 'MO-A001', 1),
  ('1004', 'P653', 3.5),
  ('1004', 'P627', 0.5),
  ('1004', 'P3', 0.05),
  ('1004', 'P-A001', 0.05),
  ('1004', 'P5', 0.2),
  ('1004', 'P8', 1.5),
  ('1004', 'P33', 0.05),
  ('1004', 'P34', 0.1),
  ('1004', 'P32', 0.1),
  ('1004', 'MO-A002', 1),
  ('1005', 'P175', 1),
  ('1005', 'P212', 1),
  ('1005', 'P217', 2),
  ('1005', 'P216', 4),
  ('1005', 'P378', 1),
  ('1005', 'P318', 1),
  ('1005', 'P327', 5),
  ('1005', 'P597', 2),
  ('1005', 'P176', 1),
  ('1006', 'P604', 15),
  ('1006', 'P192', 2),
  ('1006', 'P559', 5),
  ('1006', 'P360', 2),
  ('1007', 'P632', 1),
  ('1008', 'P633', 1),
  ('1009', 'P627', 1.04),
  ('1009', 'P3', 0.04),
  ('1009', 'P-A001', 0.02),
  ('1009', 'P7', 0.16),
  ('1009', 'P634', 0.02),
  ('1009', 'MO-A003', 1),
  ('1010', 'P655', 1),
  ('1011', 'P656', 1),
  ('2000', 'P6', 0.4),
  ('2000', 'P66', 0.04),
  ('2000', 'P20', 0.02),
  ('2000', 'P3', 0.04),
  ('2000', 'P4', 0.02),
  ('2000', 'MO-A004', 1),
  ('2001', 'P27', 1),
  ('2001', 'P33', 0.166667),
  ('2001', 'P34', 0.166667),
  ('2001', 'P32', 1.6),
  ('2001', 'P51', 1),
  ('2001', 'P52', 1),
  ('2001', 'P610', 0.1),
  ('2001', 'P31', 0.1),
  ('2001', 'MO-A005', 1),
  ('2002', 'P52', 0.7),
  ('2002', 'P50', 0.8),
  ('2002', 'P152', 0.2),
  ('2002', 'P33', 0.1),
  ('2002', 'P34', 0.1),
  ('2002', 'P32', 0.4),
  ('2002', 'MO-A006', 1),
  ('2004', 'P605', 0.083333),
  ('2004', 'MO-A007', 1),
  ('2005', 'P41', 0.033333),
  ('2005', 'P42', 0.111111),
  ('2005', 'P43', 0.022222),
  ('2005', 'MO-A008', 1),
  ('2006', 'P32', 0.181818),
  ('2006', 'P33', 0.045455),
  ('2006', 'P34', 0.045455),
  ('2006', 'P248', 0.170455),
  ('2006', 'P48', 0.011364),
  ('2006', 'P39', 0.011364),
  ('2006', 'P69', 0.011364),
  ('2006', 'P30', 0.011364),
  ('2006', 'MO-A009', 1),
  ('3007', 'P45', 1),
  ('3007', 'P456', 0.186667),
  ('3007', 'P30', 0.013333),
  ('3007', 'P627', 0.666667),
  ('3007', 'M9', 1),
  ('3008', 'P6', 0.2),
  ('3008', 'P543', 0.4),
  ('3008', 'P3', 0.015385),
  ('3008', 'P-A001', 0.007692),
  ('3008', 'P48', 0.015385),
  ('3008', 'MO-A010', 1),
  ('3009', 'P49', 1),
  ('3009', 'MO-A011', 1),
  ('3016', 'P50', 6),
  ('3016', 'P51', 12),
  ('3016', 'P37', 15),
  ('3016', 'P627', 5),
  ('3016', 'P56', 2),
  ('3016', 'P30', 1),
  ('3016', 'P32', 15),
  ('3016', 'MO-A012', 1),
  ('4000', 'P609', 16.455696),
  ('4000', 'P63', 1),
  ('4000', 'P62', 0.022785),
  ('4000', 'P32', 0.096203),
  ('4000', 'P637', 0.002532),
  ('4000', 'MO-A013', 1),
  ('4001', 'P57', 3.384615),
  ('4001', 'P32', 0.092308),
  ('4001', 'P33', 0.015385),
  ('4001', 'P34', 0.015385),
  ('4001', 'P51', 1),
  ('4001', 'P64', 0.169231),
  ('4001', 'M63', 1),
  ('4002', 'P173', 17),
  ('4002', 'P63', 1),
  ('4002', 'P62', 0.022785),
  ('4002', 'P32', 0.096203),
  ('4002', 'P637', 0.005063),
  ('4002', 'MO-A013', 1),
  ('5002', 'P648', 1),
  ('5003', 'P649', 1),
  ('6000', 'P615', 1),
  ('7000', 'P8', 1),
  ('7000', 'P7', 0.384615),
  ('7000', 'P3', 0.061538),
  ('7000', 'P4', 0.030769),
  ('7000', 'MO-A014', 1),
  ('7001', 'P616', 1),
  ('7001', 'P78', 1.538462),
  ('7001', 'P617', 0.089744),
  ('7001', 'M26', 1),
  ('7002', 'P76', 1.181818),
  ('7002', 'P77', 1.181818),
  ('7003', 'P79', 1.181818),
  ('7004', 'P67', 0.348837),
  ('7004', 'P9', 0.232558),
  ('7004', 'P3', 0.093023),
  ('7004', 'P4', 0.046512),
  ('7004', 'P6', 1),
  ('7004', 'MO-A015', 1),
  ('7005', 'P-A002', 18.604651),
  ('7005', 'P657', 0.139535),
  ('7005', 'M26', 1),
  ('7006', 'P660', 18.604651),
  ('7006', 'P658', 0.139535),
  ('7006', 'M26', 1),
  ('8000', 'P97', 0.230769),
  ('8000', 'P43', 0.015385),
  ('8000', 'M52', 1),
  ('8001', 'P97', 0.222222),
  ('8001', 'P43', 0.022222),
  ('8001', 'M52', 1),
  ('8002', 'P97', 0.266667),
  ('8002', 'P43', 0.033333),
  ('8002', 'M52', 1),
  ('9000', 'P33', 0.011429),
  ('9000', 'P32', 0.045714),
  ('9000', 'M25', 1),
  ('9001', 'P62', 0.030476),
  ('9001', 'P32', 0.114286),
  ('9001', 'P63', 0.057143),
  ('9001', 'P39', 0.001905),
  ('9001', 'M36', 1),
  ('9002', 'P643', 1.1),
  ('9002', 'P160', 0.333333),
  ('9002', 'P161', 0.083333),
  ('9002', 'P115', 0.025),
  ('9002', 'M2', 1),
  ('9003', 'P278', 2),
  ('9003', 'P277', 4),
  ('9004', 'P662', 1.190476),
  ('9004', 'P663', 0.357143),
  ('9004', 'P161', 0.190476),
  ('9004', 'P115', 0.02381),
  ('9004', 'M2', 1),
  ('10000', 'P157', 0.704698),
  ('10000', 'P158', 0.637584),
  ('10000', 'P155', 2.013423),
  ('10000', 'P156', 0.369128),
  ('10000', 'P279', 0.053691),
  ('10000', 'P280', 0.134228),
  ('10000', 'P281', 0.013423),
  ('10000', 'P282', 0.013423),
  ('10000', 'M34', 1),
  ('10002', 'P666', 1.142857),
  ('10002', 'P6', 1),
  ('10002', 'P3', 0.071429),
  ('10002', 'MO-A016', 1),
  ('12000', 'P607', 0.01),
  ('12000', 'P178', 0.01),
  ('12000', 'M61', 1),
  ('12001', 'P98', 0.01),
  ('12001', 'P178', 0.01),
  ('12001', 'M61', 1),
  ('12002', 'P638', 0.098765),
  ('12002', 'P122', 0.493827),
  ('12002', 'P284', 0.246914),
  ('12002', 'MO-A017', 1),
  ('12003', 'P639', 0.074627),
  ('12003', 'P122', 0.447761),
  ('12003', 'P284', 0.223881),
  ('12003', 'MO-A017', 1),
  ('12004', 'P640', 0.033333),
  ('12004', 'M6', 1),
  ('12005', 'P607', 0.005405),
  ('12005', 'P178', 0.002703),
  ('12005', 'M61', 1),
  ('12006', 'P118', 1),
  ('12006', 'P120', 3),
  ('12006', 'P124', 1),
  ('13000', 'P33', 0.068182),
  ('13000', 'P32', 0.284091),
  ('13000', 'M32', 1),
  ('13002', 'P642', 1.098684),
  ('13002', 'P665', 0.342105),
  ('13002', 'P161', 0.131579),
  ('13002', 'P115', 0.026316),
  ('13002', 'M14', 1),
  ('13005', 'P641', 1.1),
  ('13005', 'P644', 1.1),
  ('13005', 'M14', 1),
  ('13012', 'P661', 1.098684),
  ('13012', 'P665', 0.342105),
  ('13012', 'P161', 0.131579),
  ('13012', 'P115', 0.026316),
  ('13012', 'M14', 1),
  ('14000', 'P286', 1),
  ('14000', 'P665', 0.5),
  ('14000', 'M53', 1),
  ('14001', 'P619', 1),
  ('14001', 'P160', 4),
  ('14001', 'MO-A018', 1),
  ('14002', 'P253', 1.102041),
  ('14002', 'P646', 0.061224),
  ('14002', 'P647', 0.061224),
  ('14002', 'MO-A019', 1),
  ('15002', 'P-A003', 1),
  ('15002', 'P560', 1),
  ('15002', 'P667', 15),
  ('15002', 'P670', 20),
  ('15002', 'M7', 1),
  ('15004', 'P207', 1),
  ('15004', 'P667', 5),
  ('15004', 'P670', 5),
  ('15004', 'M7', 1),
  ('15005', 'P509', 1),
  ('15005', 'P501', 1),
  ('15005', 'P502', 7),
  ('15005', 'P186', 2.5),
  ('15005', 'P504', 2),
  ('15006', 'P209', 1),
  ('15006', 'M7', 1),
  ('15007', 'P-A004', 0.02),
  ('15007', 'M4', 1),
  ('15009', 'P-A005', 1),
  ('15009', 'P560', 1),
  ('15009', 'P667', 5),
  ('15009', 'P670', 15),
  ('15009', 'M7', 1),
  ('15010', 'P-A006', 1),
  ('15010', 'P560', 1),
  ('15010', 'P667', 5),
  ('15010', 'P670', 15),
  ('15010', 'M7', 1),
  ('15011', 'P-A005', 1),
  ('15011', 'P560', 1),
  ('15011', 'P667', 5),
  ('15011', 'P671', 15),
  ('15011', 'M7', 1),
  ('15012', 'P-A005', 1),
  ('15012', 'P560', 1),
  ('15012', 'P667', 5),
  ('15012', 'P671', 15),
  ('15012', 'M7', 1),
  ('15013', 'P593', 1),
  ('15013', 'P560', 1),
  ('15013', 'P667', 5),
  ('15013', 'P672', 50),
  ('15013', 'M7', 1),
  ('16000', 'P556', 1),
  ('16000', 'P371', 1),
  ('16000', 'P524', 1),
  ('16000', 'P327', 1),
  ('16000', 'P326', 1),
  ('16000', 'P597', 1),
  ('16000', 'P598', 1),
  ('16000', 'P600', 1),
  ('16000', 'P527', 1),
  ('16000', 'M58', 1),
  ('16005', 'P81', 1),
  ('16005', 'P324', 1),
  ('16005', 'P316', 6),
  ('16005', 'MO-A020', 1),
  ('16005', 'P651', 2),
  ('16005', 'P650', 2),
  ('16005', 'P623', 2),
  ('16005', 'P376', 1),
  ('16005', 'P318', 2),
  ('16005', 'P377', 1),
  ('16006', 'P651', 1.1),
  ('16006', 'M58', 1),
  ('16007', 'P651', 1),
  ('16007', 'P650', 1),
  ('16007', 'P623', 1),
  ('16007', 'P493', 1),
  ('16007', 'M58', 1),
  ('16007', 'P315', 2),
  ('16007', 'P316', 2),
  ('16007', 'P554', 1),
  ('16007', 'MO-A021', 1),
  ('16007', 'P315', 1),
  ('16007', 'P316', 1),
  ('16007', 'P555', 1),
  ('16007', 'P376', 1),
  ('16007', 'P417', 1),
  ('16007', 'P554', 1),
  ('16007', 'P555', 1),
  ('16011', 'P323', 1),
  ('16011', 'P324', 1),
  ('16011', 'P316', 6),
  ('16011', 'MO-A020', 1),
  ('16011', 'P651', 2),
  ('16011', 'P650', 2),
  ('16011', 'P623', 2),
  ('16011', 'P376', 1),
  ('16011', 'P318', 2),
  ('16011', 'P377', 1),
  ('17001', 'P576', 0.175439),
  ('17001', 'P577', 0.122807),
  ('17001', 'P575', 0.052632),
  ('17001', 'P580', 0.315789),
  ('17001', 'P581', 0.368421),
  ('17001', 'P578', 0.315789),
  ('17001', 'P586', 0.035088),
  ('17001', 'P590', 0.087719),
  ('17001', 'P588', 0.087719),
  ('17001', 'P596', 0.070175),
  ('17003', 'P319', 1),
  ('17003', 'P320', 1),
  ('17003', 'MO-A022', 1),
  ('17004', 'P234', 1),
  ('17004', 'P320', 1),
  ('17004', 'MO-A022', 1),
  ('17005', 'P675', 1),
  ('17005', 'P320', 1),
  ('17005', 'MO-A022', 1),
  ('17006', 'P519', 1),
  ('17006', 'MO-A022', 1),
  ('18000', 'P132', 1),
  ('18000', 'P291', 2),
  ('18000', 'P128', 1),
  ('18000', 'P676', 1),
  ('18000', 'MO-A022', 3),
  ('18000', 'P-A007', 1),
  ('18001', 'P551', 6),
  ('18001', 'P587', 1),
  ('18001', 'P130', 1),
  ('18001', 'P126', 1),
  ('19000', 'M55', 1),
  ('19001', 'P591', 1),
  ('19001', 'P315', 2),
  ('19001', 'P316', 2),
  ('19001', 'P555', 1),
  ('19001', 'MO-A021', 1),
  ('2001.1', 'P51', 1),
  ('2001.1', 'P52', 1),
  ('2001.1', 'P31', 0.1),
  ('2001.1', 'P152', 0.066667),
  ('2001.1', 'MO-A023', 1),
  ('2002.1', 'P52', 1),
  ('2002.1', 'P54', 1.6),
  ('2002.1', 'P50', 0.6),
  ('2002.1', 'P152', 0.15),
  ('2002.1', 'P33', 0.15),
  ('2002.1', 'P34', 0.15),
  ('2002.1', 'P32', 0.6),
  ('2002.1', 'MO-A024', 1),
  ('2002.2', 'P52', 2),
  ('2002.2', 'P54', 3),
  ('2002.2', 'P50', 0.6),
  ('2002.2', 'P152', 0.15),
  ('2002.2', 'P33', 0.2),
  ('2002.2', 'P34', 0.2),
  ('2002.2', 'P32', 0.8),
  ('2002.2', 'MO-A025', 1),
  ('2002.3', 'P33', 0.75),
  ('2002.3', 'P34', 0.75),
  ('2002.3', 'P32', 6),
  ('2002.3', 'M31', 1),
  ('2003.1', 'P52', 0.434783),
  ('2003.1', 'P54', 1),
  ('2003.1', 'P51', 0.413043),
  ('2003.1', 'P50', 1),
  ('2003.1', 'P610', 0.032609),
  ('2003.1', 'P48', 0.01087),
  ('2003.1', 'MO-A026', 1),
  ('2003.2', 'P6', 0.271739),
  ('2003.2', 'P36', 0.413043),
  ('2003.2', 'P3', 0.021739),
  ('2003.2', 'P4', 0.01087),
  ('2003.2', 'MO-A027', 1),
  ('2003.3', 'P6', 0.380435),
  ('2003.3', 'P66', 0.097826),
  ('2003.3', 'P3', 0.065217),
  ('2003.3', 'P4', 0.021739),
  ('2003.3', 'MO-A028', 1),
  ('5004', 'P800', 1),
  ('5004', 'P801', 1),
  ('5004', 'P802', 0.1),
  ('5004', 'MO-A029', 1),
  ('5005', 'P800', 1),
  ('5005', 'P802', 0.2),
  ('5005', 'MO-A029', 1),
  ('5006', 'P803', 1),
  ('5006', 'P804', 1),
  ('5006', 'P805', 1),
  ('5006', 'P806', 1),
  ('5006', 'P807', 1),
  ('5006', 'MO-A030', 1),
  ('4003', 'P57', 3.384615),
  ('4003', 'P32', 0.092308),
  ('4003', 'P33', 0.015385),
  ('4003', 'P34', 0.015385),
  ('4003', 'P51', 1),
  ('4003', 'P64', 0.169231),
  ('4003', 'M63', 1),
  ('18001', 'P554', 1),
  ('18001', 'P555', 1)
) AS v(codigo_composicao, codigo_insumo, coeficiente)
JOIN composicoes_proprias cp ON cp.codigo = v.codigo_composicao
JOIN insumos_proprios ip ON ip.codigo = v.codigo_insumo;

-- â”€â”€â”€ ValidaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SELECT
  (SELECT COUNT(*) FROM insumos_proprios)   AS total_insumos_proprios,
  (SELECT COUNT(*) FROM composicoes_proprias) AS total_composicoes_proprias,
  (SELECT COUNT(*) FROM composicao_insumos) AS total_vinculos;

