-- Remove duplicacoes comprovadas do cadastro historico do Muro de Arrimo.

with ranked as (
  select id,
         row_number() over (
           partition by orcamento_id, etapa_id, coalesce(subetapa, ''),
                        coalesce(sinapi_codigo, ''), coalesce(descricao, ''), coalesce(unidade, '')
           order by id
         ) as position
  from public.materiais
  where orcamento_id = '67aedb0f-fab7-4a73-aeb8-a2a98bde1c36'
)
delete from public.materiais material
using ranked duplicate
where material.id = duplicate.id and duplicate.position > 1;

delete from public.servicos_cronograma
where subetapa_id = 'ab100cf8-452c-4849-aa59-87a0b70b5397'
  and data_inicio is null
  and data_fim is null
  and id not in (select servico_id from public.compra_itens where servico_id is not null)
  and id not in (select servico_id from public.obra_previsoes where servico_id is not null)
  and id not in (select servico_id from public.board_items where servico_id is not null);
