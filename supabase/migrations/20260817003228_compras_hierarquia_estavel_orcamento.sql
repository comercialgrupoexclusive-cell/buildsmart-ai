-- Compras não deve mais depender da árvore do cronograma legado
-- (subetapas_cronograma / servicos_cronograma). Migra os lançamentos para a
-- hierarquia estável do orçamento: Orçamento -> Etapa (já existente) ->
-- Subetapa do orçamento -> Item do orçamento, quando aplicável.
alter table public.compra_itens
  add column if not exists subetapa_orcamento_item_id uuid references public.orcamento_itens(id) on delete set null,
  add column if not exists orcamento_item_id uuid references public.orcamento_itens(id) on delete set null,
  add column if not exists subetapa_legado_nome text,
  add column if not exists servico_legado_nome text;

-- Preserva o texto do cronograma legado (nunca renderizado hoje, mas mantido
-- como histórico) antes de remover a dependência das tabelas legadas.
update public.compra_itens ci
set subetapa_legado_nome = sc.nome
from public.subetapas_cronograma sc
where ci.subetapa_id = sc.id;

update public.compra_itens ci
set servico_legado_nome = svc.nome
from public.servicos_cronograma svc
where ci.servico_id = svc.id;

-- Vincula à subetapa do orçamento quando existe um cabeçalho com o mesmo
-- nome na mesma etapa/orçamento (match exato, conservador: só liga quando
-- há certeza; o resto fica no nível Etapa, que já é estável).
update public.compra_itens ci
set subetapa_orcamento_item_id = (
  select oh.id
  from public.subetapas_cronograma sc
  join public.orcamento_itens oh
    on oh.orcamento_id = ci.orcamento_id
   and oh.etapa_id = ci.etapa_id
   and oh.tipo_linha = 'subetapa'
   and trim(lower(oh.subetapa)) = trim(lower(sc.nome))
  where sc.id = ci.subetapa_id
  limit 1
)
where ci.subetapa_id is not null;

-- Remove as colunas que referenciavam a árvore do cronograma legado.
alter table public.compra_itens
  drop column if exists subetapa_id,
  drop column if exists servico_id;

create index if not exists idx_compra_itens_subetapa_orc_item on public.compra_itens (subetapa_orcamento_item_id);
create index if not exists idx_compra_itens_orcamento_item on public.compra_itens (orcamento_item_id);
