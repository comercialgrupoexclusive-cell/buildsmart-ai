-- Separa medicoes e financiamento por orcamento, mantendo registros legados
-- consolidados no nivel da obra quando orcamento_id for nulo.

alter table public.medicoes
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null,
  add column if not exists eixo text not null default 'fisico';

alter table public.medicoes drop constraint if exists medicoes_eixo_check;
alter table public.medicoes add constraint medicoes_eixo_check
  check (eixo in ('fisico', 'mao_obra'));

alter table public.obra_fontes_recursos
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete cascade;

alter table public.obra_reembolsos
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null;

alter table public.obra_fontes_recursos
  drop constraint if exists obra_fontes_recursos_obra_id_tipo_key;

create unique index if not exists uq_fontes_obra_geral_tipo
  on public.obra_fontes_recursos (obra_id, tipo)
  where orcamento_id is null;
create unique index if not exists uq_fontes_obra_orcamento_tipo
  on public.obra_fontes_recursos (obra_id, orcamento_id, tipo)
  where orcamento_id is not null;

create index if not exists idx_medicoes_orcamento_eixo
  on public.medicoes (orcamento_id, eixo);
create index if not exists idx_fontes_orcamento
  on public.obra_fontes_recursos (orcamento_id);
create index if not exists idx_reembolsos_orcamento
  on public.obra_reembolsos (orcamento_id);
