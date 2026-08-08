-- Remove somente duplicatas de etapa sem qualquer dado associado e impede
-- que duas etapas com o mesmo nome sejam criadas novamente na mesma obra.
with referencias as (
  select
    e.id,
    e.obra_id,
    lower(btrim(e.nome)) as nome_normalizado,
    (
      (select count(*) from orcamento_itens oi where oi.etapa_id = e.id) +
      (select count(*) from etapa_composicoes ec where ec.etapa_id = e.id) +
      (select count(*) from etapa_caixa cx where cx.etapa_id = e.id) +
      (select count(*) from subetapas_cronograma sc where sc.etapa_id = e.id) +
      (select count(*) from compra_itens ci where ci.etapa_id = e.id) +
      (select count(*) from materiais m where m.etapa_id = e.id) +
      (select count(*) from medicoes md where md.etapa_id = e.id) +
      (select count(*) from diario_obra d where d.etapa_id = e.id)
    ) as total_referencias
  from etapas e
  where e.obra_id is not null
), ranqueadas as (
  select
    id,
    total_referencias,
    row_number() over (
      partition by obra_id, nome_normalizado
      order by total_referencias desc, id
    ) as posicao
  from referencias
), duplicatas_vazias as (
  select id
  from ranqueadas
  where posicao > 1 and total_referencias = 0
)
delete from etapas e
using duplicatas_vazias d
where e.id = d.id;

create unique index if not exists etapas_obra_nome_normalizado_uidx
  on etapas (obra_id, lower(btrim(nome)))
  where obra_id is not null;
