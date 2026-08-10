-- Obras assumidas em andamento podem usar o cronograma/financiamento como
-- baseline fisico sem contaminar o novo orcamento operacional.
alter table public.etapas
  add column if not exists peso_fisico_percentual numeric;

alter table public.subetapas_cronograma
  add column if not exists peso_fisico_percentual numeric;

alter table public.servicos_cronograma
  add column if not exists peso_fisico_percentual numeric;

alter table public.etapas
  drop constraint if exists etapas_peso_fisico_percentual_check;
alter table public.etapas
  add constraint etapas_peso_fisico_percentual_check
  check (peso_fisico_percentual is null or peso_fisico_percentual between 0 and 100);

alter table public.subetapas_cronograma
  drop constraint if exists subetapas_peso_fisico_percentual_check;
alter table public.subetapas_cronograma
  add constraint subetapas_peso_fisico_percentual_check
  check (peso_fisico_percentual is null or peso_fisico_percentual between 0 and 100);

alter table public.servicos_cronograma
  drop constraint if exists servicos_peso_fisico_percentual_check;
alter table public.servicos_cronograma
  add constraint servicos_peso_fisico_percentual_check
  check (peso_fisico_percentual is null or peso_fisico_percentual between 0 and 100);
