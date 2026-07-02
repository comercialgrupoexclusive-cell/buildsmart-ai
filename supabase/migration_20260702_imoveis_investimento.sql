-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 1 — Sistema interno de investimento imobiliário (compra, reforma, venda)
-- Módulo separado de `obras` (obras de clientes). Aqui o "cliente" é a própria
-- operação: cada linha de `imoveis` é um imóvel prospectado/comprado/reformado/
-- vendido pela operação do Rodrigo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Imóvel (entidade central — 1 linha por oportunidade/operação) ───────────
CREATE TABLE IF NOT EXISTS imoveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,               -- IM-0001, IM-0002...

  -- 1. Prospecção
  titulo TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'anuncio' CHECK (origem IN ('anuncio', 'leilao', 'corretor', 'indicacao', 'outro')),
  link_anuncio TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  uf CHAR(2),
  tipo_imovel TEXT NOT NULL DEFAULT 'casa' CHECK (tipo_imovel IN ('casa', 'apartamento', 'terreno', 'comercial', 'outro')),
  area_m2 NUMERIC(10,2),
  quartos INTEGER,
  banheiros INTEGER,
  vagas INTEGER,
  caracteristicas TEXT,
  foto_url TEXT,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Fase corrente do funil (também guarda desfecho: concluido/descartado)
  fase TEXT NOT NULL DEFAULT 'prospeccao' CHECK (fase IN ('prospeccao', 'analise', 'aquisicao', 'reforma', 'venda', 'concluido', 'descartado')),
  motivo_descarte TEXT,

  -- 2. Análise da oportunidade (estimativas)
  valor_compra_estimado NUMERIC(14,2),
  custo_documentacao_estimado NUMERIC(14,2),
  custo_reforma_estimado NUMERIC(14,2),
  preco_venda_estimado NUMERIC(14,2),
  prazo_estimado_meses NUMERIC(5,1),
  decisao_analise TEXT CHECK (decisao_analise IN ('descartar', 'acompanhar', 'comprar')),
  observacoes_analise TEXT,

  -- 3. Aquisição (dados reais da compra)
  valor_proposta NUMERIC(14,2),
  valor_lance NUMERIC(14,2),
  valor_compra_final NUMERIC(14,2),
  data_proposta DATE,
  data_aquisicao DATE,
  status_documentacao TEXT DEFAULT 'pendente' CHECK (status_documentacao IN ('pendente', 'em_andamento', 'concluida')),
  status_posse TEXT DEFAULT 'ocupado' CHECK (status_posse IN ('ocupado', 'desocupacao_andamento', 'desocupado', 'nao_se_aplica')),
  custo_documentacao_real NUMERIC(14,2),
  custos_aquisicao_extra NUMERIC(14,2),          -- ITBI, cartório, leiloeiro, etc.
  observacoes_aquisicao TEXT,

  -- 4. Reforma (datas + resumo; itens/etapas/fotos em tabelas próprias)
  orcamento_reforma NUMERIC(14,2),
  data_inicio_reforma DATE,
  data_fim_reforma_prevista DATE,
  data_fim_reforma_real DATE,
  observacoes_reforma TEXT,

  -- 5. Venda
  preco_anuncio NUMERIC(14,2),
  data_anuncio DATE,
  financiamento_mcmv BOOLEAN NOT NULL DEFAULT FALSE,
  comissao_percentual NUMERIC(5,2),
  comissao_valor NUMERIC(14,2),
  comprador_nome TEXT,
  status_documentacao_venda TEXT DEFAULT 'pendente' CHECK (status_documentacao_venda IN ('pendente', 'em_andamento', 'concluida')),
  preco_venda_final NUMERIC(14,2),
  data_venda DATE,
  observacoes_venda TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imoveis_fase ON imoveis(fase);
CREATE INDEX IF NOT EXISTS idx_imoveis_responsavel ON imoveis(responsavel_id);

-- ─── Reforma — itens (orçamento previsto x realizado, por serviço/material) ──
CREATE TABLE IF NOT EXISTS imovel_reforma_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'servico' CHECK (categoria IN ('servico', 'material', 'mao_de_obra', 'outro')),
  descricao TEXT NOT NULL,
  fornecedor TEXT,
  valor_previsto NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_realizado NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido')),
  data_prevista DATE,
  data_conclusao DATE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imovel_reforma_itens_imovel ON imovel_reforma_itens(imovel_id);

-- ─── Reforma — etapas (cronograma simples) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS imovel_reforma_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  percentual_executado NUMERIC(5,1) NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imovel_reforma_etapas_imovel ON imovel_reforma_etapas(imovel_id);

-- ─── Reforma — fotos / acompanhamento visual ─────────────────────────────────
CREATE TABLE IF NOT EXISTS imovel_fotos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'durante' CHECK (categoria IN ('antes', 'durante', 'depois', 'documento')),
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imovel_fotos_imovel ON imovel_fotos(imovel_id);

-- ─── Venda — propostas / interessados ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imovel_propostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imovel_id UUID NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  nome_interessado TEXT NOT NULL,
  contato TEXT,
  valor_proposta NUMERIC(14,2),
  financiamento TEXT DEFAULT 'a_vista' CHECK (financiamento IN ('a_vista', 'mcmv', 'financiamento_bancario', 'outro')),
  status TEXT NOT NULL DEFAULT 'em_analise' CHECK (status IN ('em_analise', 'aceita', 'recusada')),
  data DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imovel_propostas_imovel ON imovel_propostas(imovel_id);

-- ─── RLS — mesmo padrão "MVP local beta" já usado no resto do sistema ────────
-- (login não usa Supabase Auth; controle de acesso é feito na aplicação — ver
-- supabase/policies_mvp_local_beta.sql para o padrão original)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'imoveis',
    'imovel_reforma_itens',
    'imovel_reforma_etapas',
    'imovel_fotos',
    'imovel_propostas'
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
