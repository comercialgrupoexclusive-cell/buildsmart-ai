alter table public.projeto_itens
  add column if not exists percentual_executado numeric(5,2);

alter table public.projeto_itens
  drop constraint if exists projeto_itens_percentual_executado_check;

alter table public.projeto_itens
  add constraint projeto_itens_percentual_executado_check
  check (percentual_executado is null or percentual_executado between 0 and 100);

comment on column public.projeto_itens.percentual_executado is
  'Percentual operacional editavel na estrutura de projetos/imoveis. Pais exibem rollup calculado pelos filhos; ao editar pai a UI pode aplicar aos descendentes.';
