-- Eixos independentes de avanço e financiamento da obra.

alter table public.etapas
  add column if not exists percentual_mao_obra numeric(5,2) not null default 0;
alter table public.subetapas_cronograma
  add column if not exists percentual_mao_obra numeric(5,2) not null default 0;
alter table public.servicos_cronograma
  add column if not exists percentual_mao_obra numeric(5,2) not null default 0;

alter table public.etapas drop constraint if exists etapas_percentual_mao_obra_check;
alter table public.etapas add constraint etapas_percentual_mao_obra_check
  check (percentual_mao_obra between 0 and 100);
alter table public.subetapas_cronograma drop constraint if exists subetapas_percentual_mao_obra_check;
alter table public.subetapas_cronograma add constraint subetapas_percentual_mao_obra_check
  check (percentual_mao_obra between 0 and 100);
alter table public.servicos_cronograma drop constraint if exists servicos_percentual_mao_obra_check;
alter table public.servicos_cronograma add constraint servicos_percentual_mao_obra_check
  check (percentual_mao_obra between 0 and 100);

create table if not exists public.obra_fontes_recursos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  tipo text not null check (tipo in ('recursos_proprios', 'financiamento', 'fgts')),
  valor_previsto numeric(14,2) not null default 0,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obra_id, tipo)
);

create table if not exists public.obra_reembolsos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  fonte_id uuid references public.obra_fontes_recursos(id) on delete set null,
  medicao_id uuid references public.medicoes(id) on delete set null,
  etapa_id uuid references public.etapas(id) on delete set null,
  descricao text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'solicitado', 'aprovado', 'recebido', 'recusado')),
  valor_solicitado numeric(14,2) not null default 0,
  valor_aprovado numeric(14,2) not null default 0,
  valor_recebido numeric(14,2) not null default 0,
  data_solicitacao date,
  data_aprovacao date,
  data_recebimento date,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obra_fontes_recursos_obra
  on public.obra_fontes_recursos (obra_id);
create index if not exists idx_obra_reembolsos_obra_status
  on public.obra_reembolsos (obra_id, status);
create index if not exists idx_obra_reembolsos_fonte
  on public.obra_reembolsos (fonte_id);
create index if not exists idx_obra_reembolsos_medicao
  on public.obra_reembolsos (medicao_id);
create index if not exists idx_obra_reembolsos_etapa
  on public.obra_reembolsos (etapa_id);

alter table public.obra_fontes_recursos enable row level security;
alter table public.obra_reembolsos enable row level security;

drop policy if exists obra_fontes_recursos_all on public.obra_fontes_recursos;
create policy obra_fontes_recursos_all on public.obra_fontes_recursos
  for all to authenticated, anon using (true) with check (true);
drop policy if exists obra_reembolsos_all on public.obra_reembolsos;
create policy obra_reembolsos_all on public.obra_reembolsos
  for all to authenticated, anon using (true) with check (true);

grant select, insert, update, delete on public.obra_fontes_recursos to authenticated, anon;
grant select, insert, update, delete on public.obra_reembolsos to authenticated, anon;
