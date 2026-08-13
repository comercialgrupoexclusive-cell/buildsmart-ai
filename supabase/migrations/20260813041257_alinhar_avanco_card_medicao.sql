-- Replica o fallback financeiro usado por lib/obra-progresso.ts. O valor total
-- informado serve para auditoria da importacao; a medicao usa quantidade x
-- preco congelado, portanto o card deve usar a mesma base.
create or replace function public.obras_avanco_fisico_ativo()
returns table (obra_id uuid, avanco_fisico numeric, orcamentos_ativos integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with orcamentos_ativos as (
    select id, obra_id
    from public.orcamentos
    where obra_id is not null and status = 'ativo'
  ), valores_etapa as (
    select
      oa.obra_id,
      i.etapa_id,
      sum(coalesce(i.quantidade, 0) * coalesce(i.preco_unitario_snapshot, 0)) as valor
    from orcamentos_ativos oa
    join public.orcamento_itens i on i.orcamento_id = oa.id
    where i.etapa_id is not null and coalesce(i.tipo_linha, '') <> 'subetapa'
    group by oa.obra_id, i.etapa_id
  ), etapas_base as (
    select
      e.obra_id,
      e.id as etapa_id,
      greatest(0, least(100, coalesce(e.percentual_executado, 0)))::numeric as percentual,
      greatest(0, coalesce(e.peso_fisico_percentual, 0))::numeric as peso_fisico,
      greatest(0, coalesce(v.valor, 0))::numeric as valor
    from public.etapas e
    join (select distinct obra_id from orcamentos_ativos) oa on oa.obra_id = e.obra_id
    left join valores_etapa v on v.obra_id = e.obra_id and v.etapa_id = e.id
  ), progresso as (
    select
      obra_id,
      case
        when sum(peso_fisico) > 0 then sum(percentual * peso_fisico) / sum(peso_fisico)
        when sum(valor) > 0 then sum(percentual * valor) / sum(valor)
        else avg(percentual)
      end as avanco_fisico
    from etapas_base
    group by obra_id
  ), contagem as (
    select obra_id, count(*)::integer as orcamentos_ativos
    from orcamentos_ativos
    group by obra_id
  )
  select c.obra_id, round(coalesce(p.avanco_fisico, 0), 2), c.orcamentos_ativos
  from contagem c
  left join progresso p on p.obra_id = c.obra_id;
$$;

revoke all on function public.obras_avanco_fisico_ativo() from public;
grant execute on function public.obras_avanco_fisico_ativo() to anon, authenticated, service_role;
