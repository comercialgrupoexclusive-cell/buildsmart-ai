-- =============================================
-- BuildSmart AI — Schema Supabase (PostgreSQL)
-- =============================================

-- Perfis de usuário (multi-perfil local, sem auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  photo_url TEXT,
  theme_color TEXT NOT NULL DEFAULT '#3B7BF8',
  dark_mode BOOLEAN NOT NULL DEFAULT true,
  onboarding_done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Base SINAPI — insumos (somente leitura, importado)
CREATE TABLE IF NOT EXISTS sinapi_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  preco_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'RS',
  mes_referencia TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'MATERIAL',
  UNIQUE(codigo, estado, mes_referencia)
);

-- Base SINAPI — composições analíticas
CREATE TABLE IF NOT EXISTS sinapi_composicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  custo_unitario NUMERIC(12,4) NOT NULL DEFAULT 0,
  grupo TEXT NOT NULL DEFAULT 'GERAL',
  UNIQUE(codigo)
);

-- Composições próprias da empresa
CREATE TABLE IF NOT EXISTS composicoes_proprias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  grupo TEXT NOT NULL DEFAULT 'GERAL',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insumos de cada composição própria
CREATE TABLE IF NOT EXISTS composicao_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composicao_id UUID NOT NULL REFERENCES composicoes_proprias(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL REFERENCES sinapi_insumos(id) ON DELETE CASCADE,
  coeficiente NUMERIC(10,4) NOT NULL DEFAULT 1
);

-- Obras
CREATE TABLE IF NOT EXISTS obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT NOT NULL DEFAULT '',
  foto_url TEXT,
  status TEXT NOT NULL DEFAULT 'orcamento' CHECK (status IN ('orcamento','ativa','concluida','paralisada')),
  data_inicio DATE,
  data_previsao DATE,
  responsavel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orçamentos (executivo ou paramétrico)
CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'executivo' CHECK (tipo IN ('executivo','parametrico')),
  bdi_percentual NUMERIC(5,2) NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativo','finalizado')),
  versao INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Itens do orçamento
CREATE TABLE IF NOT EXISTS orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  composicao_id UUID REFERENCES composicoes_proprias(id),
  quantidade NUMERIC(12,4) NOT NULL DEFAULT 1,
  preco_unitario_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Etapas da obra (cronograma)
CREATE TABLE IF NOT EXISTS etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','em_andamento','concluida','atrasada')),
  ordem INTEGER NOT NULL DEFAULT 0
);

-- Composições vinculadas a cada etapa
CREATE TABLE IF NOT EXISTS etapa_composicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id UUID NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  composicao_id UUID NOT NULL REFERENCES composicoes_proprias(id),
  quantidade NUMERIC(12,4) NOT NULL DEFAULT 1
);

-- Materiais / suprimentos
CREATE TABLE IF NOT EXISTS materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id UUID REFERENCES etapas(id),
  insumo_id UUID NOT NULL REFERENCES sinapi_insumos(id),
  quantidade_total NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantidade_comprada NUMERIC(12,4) NOT NULL DEFAULT 0,
  status_compra TEXT NOT NULL DEFAULT 'nao_comprado' CHECK (status_compra IN ('nao_comprado','parcial','comprado')),
  data_necessidade DATE
);

-- Medições
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

-- =============================================
-- Índices para performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_codigo ON sinapi_insumos(codigo);
CREATE INDEX IF NOT EXISTS idx_sinapi_insumos_descricao ON sinapi_insumos USING gin(to_tsvector('portuguese', descricao));
CREATE INDEX IF NOT EXISTS idx_obras_status ON obras(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_obra ON orcamentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_itens_orcamento ON orcamento_itens(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_etapas_obra ON etapas(obra_id);
CREATE INDEX IF NOT EXISTS idx_materiais_obra ON materiais(obra_id);
CREATE INDEX IF NOT EXISTS idx_materiais_status ON materiais(status_compra);

-- =============================================
-- Dados de exemplo (SINAPI fictício para demo)
-- =============================================
INSERT INTO sinapi_insumos (codigo, descricao, unidade, preco_unitario, estado, mes_referencia, categoria) VALUES
('00001521', 'AREIA MEDIA - POSTO PEDREIRA/FORNECEDOR, SEM FRETE', 'M3', 98.45, 'RS', '2024-11', 'MATERIAL'),
('00004719', 'ACO CA-50, 10.0 MM', 'KG', 9.87, 'RS', '2024-11', 'MATERIAL'),
('00004720', 'ACO CA-50, 12.5 MM', 'KG', 9.72, 'RS', '2024-11', 'MATERIAL'),
('00000364', 'CIMENTO PORTLAND CP II-E-32', 'KG', 0.82, 'RS', '2024-11', 'MATERIAL'),
('00007019', 'BLOCO CERAMICO (TIJOLO FURADO) 9X19X19CM', 'MIL', 1250.00, 'RS', '2024-11', 'MATERIAL'),
('00006117', 'CAL HIDRATADA CH-III', 'KG', 0.72, 'RS', '2024-11', 'MATERIAL'),
('00010642', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 'H', 25.84, 'RS', '2024-11', 'MAO_DE_OBRA'),
('00006163', 'SERVENTE COM ENCARGOS COMPLEMENTARES', 'H', 18.96, 'RS', '2024-11', 'MAO_DE_OBRA'),
('00000376', 'BRITA 1', 'M3', 125.30, 'RS', '2024-11', 'MATERIAL'),
('00005516', 'TUBO PVC RIGIDO SOLDAVEL, DN 25MM', 'M', 8.45, 'RS', '2024-11', 'MATERIAL'),
('00037094', 'TELHA CERAMICA TIPO PORTUGUESA', 'MIL', 1680.00, 'RS', '2024-11', 'MATERIAL'),
('00041167', 'PORTA DE MADEIRA MACICA 80X210CM', 'UN', 485.00, 'RS', '2024-11', 'MATERIAL'),
('00000974', 'TINTA LATEX PVA PREMIUM', 'L', 18.90, 'RS', '2024-11', 'MATERIAL'),
('00002716', 'VERGALHAO CA-60, 5.0 MM', 'KG', 11.25, 'RS', '2024-11', 'MATERIAL'),
('00004392', 'COMPENSADO RESINADO 18MM', 'M2', 85.00, 'RS', '2024-11', 'MATERIAL')
ON CONFLICT (codigo, estado, mes_referencia) DO NOTHING;
