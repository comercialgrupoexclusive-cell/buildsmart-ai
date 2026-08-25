-- ═══════════════════════════════════════════════════════════════════════════
-- LABORATÓRIO INVESTIDOR — MARCO 1: fundação de banco/domínio
--
-- Escopo autorizado desta rodada (RELATORIO_INVESTIDOR_RODADA_01.md tem o
-- detalhamento completo): prospeccoes, prospeccao_cenarios,
-- prospeccao_evidencias, discriminador projetos.contexto, e a possibilidade
-- estrutural (FK nullable) de uma prospecção apontar para um projeto.
-- Nenhum frontend, Luiza, motor de cálculo, comparador ou conversão
-- automática são criados aqui — só a fundação.
--
-- Padrões seguidos, confirmados no schema real antes de escrever isto:
--   - PK uuid default gen_random_uuid() (padrão de toda a base).
--   - created_at/updated_at timestamptz not null default now() (padrão de
--     projetos/obras/orcamentos etc. — não existe trigger de auto-touch de
--     updated_at em nenhuma tabela de domínio da aplicação, só em
--     storage.objects; não inventamos um aqui).
--   - RLS habilitado com uma única policy permissiva "for all using (true)
--     with check (true)", igual ao padrão mais recente já usado em tabelas
--     análogas (projeto_itens, luizia_wa_phone_rules) — não é uma escolha
--     nova desta rodada, é o padrão real de segurança do MVP atual (ver
--     RLS/SEGURANÇA no relatório: BuildSmart V1 não tem sessão/autenticação
--     real por linha, e não é papel desta rodada mudar isso).
--   - Textos livres em português (nome, descricao, responsavel) em vez de
--     enums/FKs novos, espelhando obras.responsavel/projetos.responsavel
--     (ambos text livre, sem FK para profiles).
--   - FK "filho pertence ao pai" (cenário/evidência → prospecção) em CASCADE,
--     igual a orcamento_itens→orcamentos, composicao_insumos→composicoes_proprias.
--   - FK "vínculo opcional entre agregados independentes" (prospecção→projeto)
--     em SET NULL, igual a obras.projeto_id→projetos — nunca apaga a
--     prospecção (nem o histórico de cenários/evidências, que dependem da
--     prospecção, não do projeto) se o projeto vinculado for excluído.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) prospeccoes ──────────────────────────────────────────────────────────
create table public.prospeccoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  foto_url text,
  link_leilao text,
  data_leilao date,
  fase text not null default 'nova' check (fase in (
    'nova', 'em_analise', 'aprovada', 'em_disputa', 'adquirida', 'descartada', 'nao_adquirida'
  )),
  responsavel text,
  proxima_acao text,
  observacao text,
  -- Vínculo futuro com o Ativo (Project com contexto='investimento'). Só a
  -- possibilidade estrutural existe nesta rodada — nenhuma ação de conversão
  -- é criada. SET NULL: excluir o projeto nunca apaga a prospecção nem seu
  -- histórico (cenários/evidências ficam intactos, só perdem o vínculo).
  project_id uuid references public.projetos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_prospeccoes_fase on public.prospeccoes(fase);
create index idx_prospeccoes_project_id on public.prospeccoes(project_id) where project_id is not null;

comment on table public.prospeccoes is 'Laboratório Investidor (Marco 1) — oportunidade de leilão/aquisição, anterior a virar um Project. Ver RELATORIO_INVESTIDOR_RODADA_01.md.';
comment on column public.prospeccoes.project_id is 'Vínculo futuro com o Ativo (Project contexto=investimento) quando a prospecção for adquirida. Nesta rodada é só estrutural — a ação de conversão não existe ainda.';

alter table public.prospeccoes enable row level security;
create policy prospeccoes_all on public.prospeccoes for all using (true) with check (true);

-- ─── 2) prospeccao_cenarios ──────────────────────────────────────────────────
-- Fundação para o motor de cálculo do Marco 3 — nenhuma fórmula é implementada
-- aqui. Premissas com campos semânticos explícitos (não JSON opaco, conforme
-- pedido) espelhando a "Calculadora do Leilão.xlsx" citada na especificação.
create table public.prospeccao_cenarios (
  id uuid primary key default gen_random_uuid(),
  prospeccao_id uuid not null references public.prospeccoes(id) on delete cascade,
  nome text not null,
  modalidade text not null check (modalidade in ('vista', 'sac', 'price')),
  principal boolean not null default false,

  -- Premissas — aquisição e venda
  valor_arrematacao numeric,
  valor_venda_estimado numeric,
  comissao_leiloeiro numeric,
  itbi numeric,
  registro numeric,
  advogado_desocupacao numeric,
  reforma numeric,
  outros_custos numeric,
  prazo_venda_meses integer,

  -- Premissas — custos de manutenção durante a posse
  iptu numeric,
  condominio numeric,

  -- Premissas — saída/venda
  corretagem numeric,
  imposto_ganho_capital numeric,

  -- Premissas — financiamento (só relevantes quando modalidade in ('sac','price');
  -- não impomos essa regra em CHECK nesta rodada, é decisão de validação do
  -- Marco 3, não de schema)
  entrada numeric,
  percentual_financiado numeric,
  valor_financiado numeric,
  taxa_juros numeric,
  prazo_financiamento_meses integer,

  -- Resultados — colunas de destino para o motor de cálculo do Marco 3.
  -- Nulas até lá: NENHUM valor é calculado por esta migração.
  investimento_total numeric,
  valor_liquido_venda numeric,
  lucro numeric,
  rentabilidade numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_prospeccao_cenarios_prospeccao_id on public.prospeccao_cenarios(prospeccao_id);

-- No máximo um cenário principal por prospecção (índice único parcial —
-- constraint real, não convenção de aplicação).
create unique index prospeccao_cenarios_unico_principal
  on public.prospeccao_cenarios(prospeccao_id)
  where principal;

comment on table public.prospeccao_cenarios is 'Cenários financeiros de uma prospecção (Marco 1: só a fundação — premissas persistidas, resultados nulos até o motor de cálculo do Marco 3).';
comment on column public.prospeccao_cenarios.principal is 'No máximo um cenário principal por prospecção — garantido por índice único parcial (prospeccao_cenarios_unico_principal), não por lógica de aplicação.';

alter table public.prospeccao_cenarios enable row level security;
create policy prospeccao_cenarios_all on public.prospeccao_cenarios for all using (true) with check (true);

-- ─── 3) prospeccao_evidencias ────────────────────────────────────────────────
create table public.prospeccao_evidencias (
  id uuid primary key default gen_random_uuid(),
  prospeccao_id uuid not null references public.prospeccoes(id) on delete cascade,
  informacao text not null,
  tipo text,
  fonte text,
  url text,
  data_evidencia date,
  natureza text not null default 'observado' check (natureza in ('observado', 'inferido', 'estimado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_prospeccao_evidencias_prospeccao_id on public.prospeccao_evidencias(prospeccao_id);

comment on table public.prospeccao_evidencias is 'Evidências (usuário, documento ou pesquisa externa) de uma prospecção, com distinção epistemológica observado/inferido/estimado.';
comment on column public.prospeccao_evidencias.natureza is 'observado = fato verificado; inferido = deduzido a partir de outros dados; estimado = aproximação sem confirmação (ex.: preço anunciado de comparável não é preço efetivo de venda).';

alter table public.prospeccao_evidencias enable row level security;
create policy prospeccao_evidencias_all on public.prospeccao_evidencias for all using (true) with check (true);

-- ─── 4) discriminador projetos.contexto ──────────────────────────────────────
-- Não substitui status/fase_ciclo (ambos preservados intactos). Default
-- 'projeto' garante que os Projects existentes continuam válidos sem
-- migração manual de dados.
alter table public.projetos
  add column contexto text not null default 'projeto' check (contexto in ('projeto', 'investimento'));

comment on column public.projetos.contexto is 'Discriminador mínimo do Laboratório Investidor (Marco 1): projeto = Project normal da V1; investimento = Ativo originado de uma Prospecção adquirida. Não substitui status nem fase_ciclo.';
