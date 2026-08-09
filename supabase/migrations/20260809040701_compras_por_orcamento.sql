-- Relaciona todo o fluxo de suprimentos ao orçamento sem apagar nem adivinhar
-- vínculos antigos. O NULL continua representando um registro legado/geral.
alter table public.compra_itens
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null;
alter table public.materiais
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null;
alter table public.listas_compra
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null;
alter table public.requisicoes_compra
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null;

create index if not exists idx_compra_itens_orcamento_id on public.compra_itens (orcamento_id);
create index if not exists idx_materiais_orcamento_id on public.materiais (orcamento_id);
create index if not exists idx_listas_compra_orcamento_id on public.listas_compra (orcamento_id);
create index if not exists idx_requisicoes_compra_orcamento_id on public.requisicoes_compra (orcamento_id);

-- Backfill apenas para obras que possuem exatamente um orçamento vinculado.
-- Obras com múltiplos orçamentos permanecem NULL para evitar associação falsa.
with orcamento_unico as (
  select obra_id, min(id::text)::uuid as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.compra_itens registro set orcamento_id = unico.orcamento_id
from orcamento_unico unico where registro.orcamento_id is null and registro.obra_id = unico.obra_id;

with orcamento_unico as (
  select obra_id, min(id::text)::uuid as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.materiais registro set orcamento_id = unico.orcamento_id
from orcamento_unico unico where registro.orcamento_id is null and registro.obra_id = unico.obra_id;

with orcamento_unico as (
  select obra_id, min(id::text)::uuid as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.listas_compra registro set orcamento_id = unico.orcamento_id
from orcamento_unico unico where registro.orcamento_id is null and registro.obra_id = unico.obra_id;

with orcamento_unico as (
  select obra_id, min(id::text)::uuid as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.requisicoes_compra registro set orcamento_id = unico.orcamento_id
from orcamento_unico unico where registro.orcamento_id is null and registro.obra_id = unico.obra_id;
