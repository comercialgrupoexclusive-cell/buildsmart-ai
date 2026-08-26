-- ═══════════════════════════════════════════════════════════════════════════
-- Laboratório Investidor — Skill 1: Pesquisa e Análise de Mercado Imobiliário.
--
-- Três tabelas novas, todas filhas de prospeccoes (FK cascade, mesmo padrão de
-- prospeccao_cenarios/prospeccao_evidencias — ver 20260825113807_investidor_
-- marco1_fundacao.sql). RLS permissiva "for all using (true) with check
-- (true)", mesmo padrão de todas as tabelas de domínio desta base (MVP sem
-- sessão/autenticação real por linha).
--
-- Escopo desta Skill: FONTE → EXTRAÇÃO → VALIDAÇÃO HUMANA → PESQUISA DE
-- COMPARÁVEIS → RESULTADOS BRUTOS → SELEÇÃO/FAVORITOS → ANÁLISE IA →
-- RESULTADO → ENCERRAR. Orçamento/reforma NÃO pertence a esta skill (fora de
-- escopo, próxima rodada).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) prospeccao_ficha — fonte + extração + validação humana ─────────────
-- Atributos do imóvel (tipo, área, dormitórios, características etc.) são
-- abertos/variáveis por natureza do anúncio — jsonb em vez de colunas fixas,
-- para não travar em um conjunto de campos que a próxima fonte não tenha.
-- dados_extraidos = o que a IA leu da fonte (nunca editado depois de extraído
-- — é o registro do que a fonte realmente disse); dados_confirmados = o que o
-- usuário validou/corrigiu (pode divergir de dados_extraidos — ex.: anúncio
-- diz "reformado", usuário confirma "necessita reforma"); conflitos = lista
-- dos campos onde extraído e confirmado divergem, para exibir claramente na
-- UI em vez de silenciosamente sobrescrever.
create table public.prospeccao_ficha (
  id uuid primary key default gen_random_uuid(),
  prospeccao_id uuid not null unique references public.prospeccoes(id) on delete cascade,
  fonte_tipo text check (fonte_tipo in ('link', 'pdf', 'imagem')),
  fonte_url text,
  fonte_nome_arquivo text,
  dados_extraidos jsonb not null default '{}'::jsonb,
  dados_confirmados jsonb not null default '{}'::jsonb,
  conflitos jsonb not null default '[]'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'parcial', 'validada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.prospeccao_ficha is 'Ficha da Prospecção (Skill 1 Mercado): fonte do imóvel (link/pdf/imagem), dados extraídos pela IA e dados confirmados pelo usuário. Fonte é evidência, não verdade — extraído e confirmado podem divergir (ver conflitos).';
comment on column public.prospeccao_ficha.dados_extraidos is 'O que a IA leu da fonte, sem interpretação humana. Não é reescrito na validação — histórico do que o anúncio/documento realmente dizia.';
comment on column public.prospeccao_ficha.dados_confirmados is 'O que o usuário validou/corrigiu. Pode divergir de dados_extraidos.';
comment on column public.prospeccao_ficha.conflitos is 'Array de {campo, valor_extraido, valor_confirmado, nota} onde extraído e confirmado divergem.';

alter table public.prospeccao_ficha enable row level security;
create policy prospeccao_ficha_all on public.prospeccao_ficha for all using (true) with check (true);

-- ─── 2) prospeccao_comparaveis — resultados brutos da pesquisa ─────────────
-- Persistidos ANTES da interpretação da IA (requisito explícito da skill).
-- preco_m2 é coluna gerada (nunca fica dessincronizada de preco/area).
-- url_confirmada distingue link individual do anúncio (confiável) de página
-- genérica onde a informação foi encontrada (fallback, nunca inventado).
create table public.prospeccao_comparaveis (
  id uuid primary key default gen_random_uuid(),
  prospeccao_id uuid not null references public.prospeccoes(id) on delete cascade,
  titulo text,
  preco numeric,
  area numeric,
  preco_m2 numeric generated always as (case when area is not null and area > 0 and preco is not null then round(preco / area, 2) else null end) stored,
  dormitorios integer,
  banheiros integer,
  vagas integer,
  caracteristicas jsonb not null default '[]'::jsonb,
  estado_conservacao text,
  fonte text,
  url text,
  url_confirmada boolean not null default false,
  identificador_anuncio text,
  data_evidencia date,
  diferencas text,
  similaridade text check (similaridade in ('mesmo_predio', 'mesma_rua', 'entorno', 'bairro')),
  salvo boolean not null default false,
  favorito boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_prospeccao_comparaveis_prospeccao_id on public.prospeccao_comparaveis(prospeccao_id);

comment on table public.prospeccao_comparaveis is 'Resultados brutos da pesquisa de comparáveis (Skill 1 Mercado), persistidos antes de qualquer interpretação da IA.';
comment on column public.prospeccao_comparaveis.url_confirmada is 'true = link individual do anúncio confirmado; false = página genérica/fallback onde a informação foi encontrada (nunca uma URL inventada).';
comment on column public.prospeccao_comparaveis.favorito is 'Sinal do usuário ("considero especialmente interessante") — não implica que a IA deva tratar como melhor comparável; qualidade técnica continua sendo da análise.';

alter table public.prospeccao_comparaveis enable row level security;
create policy prospeccao_comparaveis_all on public.prospeccao_comparaveis for all using (true) with check (true);

-- ─── 3) prospeccao_analises_mercado — snapshot ao encerrar a análise ───────
-- Conceitualmente imutável: não há update/delete na UI. Não muda
-- retroativamente se anúncios externos mudarem depois (requisito explícito).
create table public.prospeccao_analises_mercado (
  id uuid primary key default gen_random_uuid(),
  prospeccao_id uuid not null references public.prospeccoes(id) on delete cascade,
  ficha_snapshot jsonb not null default '{}'::jsonb,
  evidencias_snapshot jsonb not null default '[]'::jsonb,
  comparaveis_snapshot jsonb not null default '[]'::jsonb,
  favoritos_snapshot jsonb not null default '[]'::jsonb,
  analise_texto text not null,
  faixa_conservadora numeric,
  faixa_base numeric,
  faixa_otimista numeric,
  pendencias text,
  fontes jsonb not null default '[]'::jsonb,
  criado_por text,
  created_at timestamptz not null default now()
);

create index idx_prospeccao_analises_mercado_prospeccao_id on public.prospeccao_analises_mercado(prospeccao_id);

comment on table public.prospeccao_analises_mercado is 'Snapshot imutável (por convenção de app, sem update/delete na UI) ao encerrar uma Análise de Mercado (Skill 1). faixa_conservadora/base/otimista são estimativas da IA, não fatos observados.';

alter table public.prospeccao_analises_mercado enable row level security;
create policy prospeccao_analises_mercado_all on public.prospeccao_analises_mercado for all using (true) with check (true);
