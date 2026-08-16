-- Baseline (linha de base) do orçamento e do planejamento no momento em que
-- a obra é iniciada. Tabelas imutáveis, só-inserção: nada no app faz UPDATE
-- nelas depois de criadas — é isso que garante que a baseline nunca é
-- apagada por edições posteriores (orçamento e planejamento continuam
-- editáveis normalmente nas tabelas "ao vivo").
create table public.orcamento_itens_baseline (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  orcamento_item_id uuid not null,
  etapa_id uuid,
  subetapa text,
  composicao_id uuid,
  sinapi_composicao_id uuid,
  tipo_linha text not null default 'item',
  quantidade numeric not null default 0,
  preco_unitario_snapshot numeric not null default 0,
  descricao_snapshot text,
  codigo_snapshot text,
  unidade_snapshot text,
  data_inicio date,
  data_fim date,
  ordem integer,
  criado_em timestamptz not null default now()
);
create index orcamento_itens_baseline_orcamento_id_idx on public.orcamento_itens_baseline(orcamento_id);

create table public.planejamento_itens_baseline (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  planejamento_item_id uuid not null,
  ref_tipo text not null,
  etapa_id uuid,
  subetapa_key text,
  orcamento_item_id uuid,
  data_inicio date,
  data_fim date,
  progresso_planejado numeric not null default 0,
  criado_em timestamptz not null default now(),
  unique (orcamento_id, planejamento_item_id)
);
create index planejamento_itens_baseline_orcamento_id_idx on public.planejamento_itens_baseline(orcamento_id);

create table public.planejamento_dependencias_baseline (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  item_baseline_id uuid not null references public.planejamento_itens_baseline(id) on delete cascade,
  predecessor_baseline_id uuid not null references public.planejamento_itens_baseline(id) on delete cascade,
  tipo text not null default 'FS',
  lag_dias integer not null default 0,
  criado_em timestamptz not null default now()
);
create index planejamento_dependencias_baseline_orcamento_id_idx on public.planejamento_dependencias_baseline(orcamento_id);

alter table public.orcamento_itens_baseline enable row level security;
alter table public.planejamento_itens_baseline enable row level security;
alter table public.planejamento_dependencias_baseline enable row level security;

create policy "orcamento_itens_baseline_all" on public.orcamento_itens_baseline for all using (true) with check (true);
create policy "planejamento_itens_baseline_all" on public.planejamento_itens_baseline for all using (true) with check (true);
create policy "planejamento_dependencias_baseline_all" on public.planejamento_dependencias_baseline for all using (true) with check (true);

grant all on public.orcamento_itens_baseline to anon, authenticated;
grant all on public.planejamento_itens_baseline to anon, authenticated;
grant all on public.planejamento_dependencias_baseline to anon, authenticated;

notify pgrst, 'reload schema';
