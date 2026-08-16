-- Regra 3: subetapa passa a ter identidade estável (FK), não só o nome.
-- Reaproveita a linha orcamento_itens (tipo_linha='subetapa') já existente
-- como âncora, gravando seu id em planejamento_itens.orcamento_item_id
-- também para ref_tipo='subetapa' (até aqui só era usado para ref_tipo='item').
update public.planejamento_itens pi
set orcamento_item_id = oi.id
from public.orcamento_itens oi
where pi.ref_tipo = 'subetapa'
  and pi.orcamento_item_id is null
  and oi.tipo_linha = 'subetapa'
  and oi.orcamento_id = pi.orcamento_id
  and oi.etapa_id is not distinct from pi.etapa_id
  and oi.subetapa = pi.subetapa_key;

-- Índice para consulta rápida por âncora estável (a unicidade continua em
-- uq_plan_subetapa por subetapa_key; este índice é só para leitura por FK).
create index if not exists idx_plan_itens_subetapa_orc_item
  on public.planejamento_itens (orcamento_item_id)
  where ref_tipo = 'subetapa' and orcamento_item_id is not null;
