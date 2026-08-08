alter table public.orcamento_item_insumos
  add column if not exists descricao_snapshot text,
  add column if not exists unidade_snapshot text,
  add column if not exists classificacao_snapshot text,
  add column if not exists grupo_snapshot text,
  add column if not exists coeficiente_snapshot numeric(14,6),
  add column if not exists valor_total_informado_snapshot numeric(14,4),
  add column if not exists valor_total_divergente boolean not null default false,
  add column if not exists ordem integer not null default 0;

alter table public.orcamento_item_insumos
  drop constraint if exists orcamento_item_insumos_classificacao_snapshot_check;

alter table public.orcamento_item_insumos
  add constraint orcamento_item_insumos_classificacao_snapshot_check
  check (classificacao_snapshot is null or classificacao_snapshot in ('EQUIPAMENTO', 'MAO_DE_OBRA', 'MATERIAL_SERVICOS'));

alter table public.orcamento_itens
  add column if not exists valor_total_informado_snapshot numeric(14,4),
  add column if not exists valor_total_manual_ativo boolean not null default false,
  add column if not exists importacao_alertas jsonb not null default '[]'::jsonb;

create index if not exists idx_orcamento_item_insumos_item_ordem
  on public.orcamento_item_insumos (orcamento_item_id, ordem);
