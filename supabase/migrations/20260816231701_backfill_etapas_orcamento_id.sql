-- etapas.orcamento_id ficou NULL em todas as 72 linhas existentes desde que a
-- coluna foi criada (só passou a ser preenchida em etapas novas, via
-- iniciar_obra_por_orcamento). Preenche usando o vínculo real de
-- orcamento_itens.etapa_id -> orcamento_id, só quando não-ambíguo (exatamente
-- 1 orçamento distinto ligado à etapa). Não cria etapas, não duplica nada:
-- etapas sem nenhum item vinculado (cronograma legado órfão) e a única etapa
-- referenciada por 2 orçamentos diferentes permanecem com orcamento_id NULL.
update public.etapas e
set orcamento_id = x.oid
from (
  select etapa_id, (array_agg(distinct orcamento_id))[1] as oid
  from public.orcamento_itens
  where etapa_id is not null
  group by etapa_id
  having count(distinct orcamento_id) = 1
) x
where e.id = x.etapa_id and e.orcamento_id is null;
