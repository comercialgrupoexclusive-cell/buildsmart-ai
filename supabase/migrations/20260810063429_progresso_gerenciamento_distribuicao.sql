-- Mantem o avanço de gerenciamento independente do físico e da mão de obra.
alter table public.etapas
  add column if not exists percentual_gerenciamento numeric(7,4) not null default 0;

alter table public.subetapas_cronograma
  add column if not exists percentual_gerenciamento numeric(7,4) not null default 0;

alter table public.servicos_cronograma
  add column if not exists percentual_gerenciamento numeric(7,4) not null default 0;

alter table public.etapas
  drop constraint if exists etapas_percentual_gerenciamento_check;
alter table public.etapas
  add constraint etapas_percentual_gerenciamento_check
  check (percentual_gerenciamento between 0 and 100);

alter table public.subetapas_cronograma
  drop constraint if exists subetapas_percentual_gerenciamento_check;
alter table public.subetapas_cronograma
  add constraint subetapas_percentual_gerenciamento_check
  check (percentual_gerenciamento between 0 and 100);

alter table public.servicos_cronograma
  drop constraint if exists servicos_percentual_gerenciamento_check;
alter table public.servicos_cronograma
  add constraint servicos_percentual_gerenciamento_check
  check (percentual_gerenciamento between 0 and 100);

-- Percentuais globais por subetapa; as etapas são a soma de suas subetapas.
-- JSON evita uma tabela paralela para uma configuração pequena e versionada no orçamento.
alter table public.orcamentos
  add column if not exists gerenciamento_distribuicao jsonb not null default '{}'::jsonb;
