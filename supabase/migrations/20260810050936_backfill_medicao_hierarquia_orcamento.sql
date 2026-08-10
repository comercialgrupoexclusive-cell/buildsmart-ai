-- Preserva valores e percentuais dos snapshots antigos; apenas acrescenta a
-- hierarquia usada pela interface para agrupar etapa -> subetapa.
update public.medicao_itens mi
set nome = concat(
  coalesce(e.nome, 'Sem etapa'),
  '|||',
  coalesce(nullif(trim(sub.nome), ''), nullif(trim(mi.nome), ''), 'Sem subetapa')
)
from public.medicoes m
join public.servicos_cronograma servico on true
left join public.subetapas_cronograma sub on sub.id = servico.subetapa_id
left join public.etapas e on e.id = sub.etapa_id
where mi.medicao_id = m.id
  and m.eixo = 'mao_obra'
  and mi.item_id = servico.id
  and position('|||' in coalesce(mi.nome, '')) = 0;

update public.medicao_itens mi
set nome = concat(
  coalesce(e.nome, 'Sem etapa'),
  '|||',
  coalesce(nullif(trim(oi.subetapa), ''), nullif(trim(mi.nome), ''), 'Sem subetapa')
)
from public.medicoes m
join public.orcamento_itens oi on true
left join public.etapas e on e.id = oi.etapa_id
where mi.medicao_id = m.id
  and m.eixo = 'mao_obra'
  and mi.item_id = oi.id
  and position('|||' in coalesce(mi.nome, '')) = 0;

update public.medicao_itens mi
set nome = concat(
  coalesce(e.nome, 'Sem etapa'),
  '|||',
  coalesce(nullif(trim(oi.subetapa), ''), nullif(trim(mi.nome), ''), 'Sem subetapa')
)
from public.medicoes m
join public.orcamento_item_insumos insumo on true
join public.orcamento_itens oi on oi.id = insumo.orcamento_item_id
left join public.etapas e on e.id = oi.etapa_id
where mi.medicao_id = m.id
  and m.eixo = 'mao_obra'
  and mi.item_id = insumo.id
  and position('|||' in coalesce(mi.nome, '')) = 0;

update public.medicao_itens mi
set nome = concat(e.nome, '|||Geral')
from public.medicoes m
join public.etapas e on true
where mi.medicao_id = m.id
  and m.eixo = 'gerenciamento'
  and mi.item_id = e.id
  and position('|||' in coalesce(mi.nome, '')) = 0;
