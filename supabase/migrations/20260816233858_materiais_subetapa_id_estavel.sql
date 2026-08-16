-- Regra 1/4 do documento de convergência de Suprimentos: materiais precisam de
-- vínculo estável com a origem no orçamento — não só etapa + nome da subetapa
-- + código. Reaproveita a mesma identidade estável já usada por Planejamento
-- (orcamento_itens.id da linha tipo_linha='subetapa'). subetapa (texto)
-- continua existindo só para exibição/legado.
alter table public.materiais
  add column if not exists subetapa_orcamento_item_id uuid references public.orcamento_itens(id);

update public.materiais m
set subetapa_orcamento_item_id = oi.id
from public.orcamento_itens oi
where m.orcamento_id is not null
  and m.subetapa is not null
  and m.subetapa_orcamento_item_id is null
  and oi.orcamento_id = m.orcamento_id
  and oi.etapa_id is not distinct from m.etapa_id
  and oi.tipo_linha = 'subetapa'
  and oi.subetapa = m.subetapa;

create index if not exists idx_materiais_subetapa_orc_item
  on public.materiais (subetapa_orcamento_item_id)
  where subetapa_orcamento_item_id is not null;
