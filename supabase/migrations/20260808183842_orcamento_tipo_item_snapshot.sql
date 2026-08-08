alter table public.orcamento_itens
  add column if not exists tipo_item_snapshot text;

alter table public.orcamento_itens
  drop constraint if exists orcamento_itens_tipo_item_snapshot_check;

alter table public.orcamento_itens
  add constraint orcamento_itens_tipo_item_snapshot_check
  check (tipo_item_snapshot is null or tipo_item_snapshot in ('COMPOSICAO', 'INSUMO', 'ITEM_LIVRE'));
