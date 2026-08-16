-- Regra: excluir ou alterar o orçamento atual não pode apagar a baseline.
-- Hoje orcamento_id tinha ON DELETE CASCADE — excluir o orçamento apagava
-- a baseline junto. Agora orcamento_id vira opcional (SET NULL ao excluir
-- o orçamento) e cada tabela ganha obra_id próprio, capturado no momento
-- da baseline, para continuar rastreável mesmo se o orçamento sumir.
-- (Excluir a OBRA continua apagando a baseline em cascata — isso é a
-- limpeza completa e intencional da obra, não o cenário que a regra protege.)

alter table public.orcamento_itens_baseline drop constraint orcamento_itens_baseline_orcamento_id_fkey;
alter table public.orcamento_itens_baseline alter column orcamento_id drop not null;
alter table public.orcamento_itens_baseline add constraint orcamento_itens_baseline_orcamento_id_fkey
  foreign key (orcamento_id) references public.orcamentos(id) on delete set null;
alter table public.orcamento_itens_baseline add column obra_id uuid references public.obras(id) on delete cascade;
create index orcamento_itens_baseline_obra_id_idx on public.orcamento_itens_baseline(obra_id);

alter table public.planejamento_itens_baseline drop constraint planejamento_itens_baseline_orcamento_id_fkey;
alter table public.planejamento_itens_baseline alter column orcamento_id drop not null;
alter table public.planejamento_itens_baseline add constraint planejamento_itens_baseline_orcamento_id_fkey
  foreign key (orcamento_id) references public.orcamentos(id) on delete set null;
alter table public.planejamento_itens_baseline add column obra_id uuid references public.obras(id) on delete cascade;
create index planejamento_itens_baseline_obra_id_idx on public.planejamento_itens_baseline(obra_id);

alter table public.planejamento_dependencias_baseline drop constraint planejamento_dependencias_baseline_orcamento_id_fkey;
alter table public.planejamento_dependencias_baseline alter column orcamento_id drop not null;
alter table public.planejamento_dependencias_baseline add constraint planejamento_dependencias_baseline_orcamento_id_fkey
  foreign key (orcamento_id) references public.orcamentos(id) on delete set null;
alter table public.planejamento_dependencias_baseline add column obra_id uuid references public.obras(id) on delete cascade;
create index planejamento_dependencias_baseline_obra_id_idx on public.planejamento_dependencias_baseline(obra_id);

notify pgrst, 'reload schema';
