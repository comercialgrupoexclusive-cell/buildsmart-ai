-- Inclui a cascata subetapa/servico no mesmo calculo usado pela tela de medicao.
create or replace function public.obras_avanco_fisico_ativo()
returns table (obra_id uuid, avanco_fisico numeric, orcamentos_ativos integer)
language sql stable security invoker set search_path = '' as $$
  with ativos as (
    select id, obra_id from public.orcamentos
    where obra_id is not null and status = 'ativo'
  ), itens_normais as (
    select a.obra_id, i.etapa_id, lower(trim(coalesce(i.subetapa, ''))) subetapa,
      sum(coalesce(i.quantidade, 0) * coalesce(i.preco_unitario_snapshot, 0))::numeric valor
    from ativos a join public.orcamento_itens i on i.orcamento_id = a.id
    where i.etapa_id is not null and coalesce(i.tipo_linha, '') <> 'subetapa'
    group by a.obra_id, i.etapa_id, lower(trim(coalesce(i.subetapa, '')))
  ), manuais as (
    select a.obra_id, i.etapa_id, lower(trim(coalesce(i.subetapa, ''))) subetapa,
      max(coalesce(i.subetapa_valor_manual, 0))::numeric valor
    from ativos a join public.orcamento_itens i on i.orcamento_id = a.id
    where i.etapa_id is not null and i.tipo_linha = 'subetapa'
      and coalesce(i.subetapa_valor_manual_ativo, false)
    group by a.obra_id, i.etapa_id, lower(trim(coalesce(i.subetapa, '')))
  ), valores_sub as (
    select coalesce(n.obra_id, m.obra_id) obra_id, coalesce(n.etapa_id, m.etapa_id) etapa_id,
      coalesce(n.subetapa, m.subetapa) subetapa, coalesce(m.valor, n.valor, 0)::numeric valor
    from itens_normais n full join manuais m
      on m.obra_id=n.obra_id and m.etapa_id=n.etapa_id and m.subetapa=n.subetapa
  ), valores_etapa as (
    select obra_id, etapa_id, sum(valor)::numeric valor
    from valores_sub group by obra_id, etapa_id
  ), servico_rollup as (
    select sc.subetapa_id,
      sum(greatest(0, coalesce(sc.peso_fisico_percentual, 0)))::numeric peso,
      case when sum(greatest(0, coalesce(sc.peso_fisico_percentual, 0))) > 0
        then sum(greatest(0, least(100, coalesce(sc.percentual_executado, 0))) * greatest(0, coalesce(sc.peso_fisico_percentual, 0)))
          / sum(greatest(0, coalesce(sc.peso_fisico_percentual, 0)))
      end::numeric percentual
    from public.servicos_cronograma sc group by sc.subetapa_id
  ), subs as (
    select e.obra_id, e.id etapa_id, s.id subetapa_id,
      coalesce(v.valor, 0)::numeric valor,
      greatest(0, coalesce(nullif(s.peso_fisico_percentual, 0), sr.peso, 0))::numeric peso,
      greatest(0, least(100, coalesce(sr.percentual, s.percentual_executado, 0)))::numeric percentual
    from public.etapas e
    join (select distinct obra_id from ativos) a on a.obra_id=e.obra_id
    join public.subetapas_cronograma s on s.etapa_id=e.id
    left join servico_rollup sr on sr.subetapa_id=s.id
    left join valores_sub v on v.obra_id=e.obra_id and v.etapa_id=e.id
      and v.subetapa=lower(trim(coalesce(s.nome, '')))
  ), etapas_rollup as (
    select e.obra_id, e.id etapa_id,
      greatest(0, coalesce(nullif(e.peso_fisico_percentual, 0), sum(s.peso), 0))::numeric peso,
      coalesce(ve.valor, 0)::numeric valor,
      case
        when sum(s.peso) > 0 then sum(s.percentual*s.peso)/sum(s.peso)
        when coalesce(ve.valor, 0) > 0 and sum(s.valor) > 0
          then (sum(s.percentual*s.valor) + greatest(0, ve.valor-sum(s.valor))*greatest(0,least(100,coalesce(e.percentual_executado,0))))/ve.valor
        else greatest(0, least(100, coalesce(e.percentual_executado, 0)))
      end::numeric percentual
    from public.etapas e
    join (select distinct obra_id from ativos) a on a.obra_id=e.obra_id
    left join subs s on s.etapa_id=e.id
    left join valores_etapa ve on ve.obra_id=e.obra_id and ve.etapa_id=e.id
    group by e.obra_id,e.id,e.peso_fisico_percentual,e.percentual_executado,ve.valor
  ), progresso as (
    select obra_id, case
      when sum(peso)>0 then sum(percentual*peso)/sum(peso)
      when sum(valor)>0 then sum(percentual*valor)/sum(valor)
      else avg(percentual) end avanco
    from etapas_rollup group by obra_id
  ), contagem as (
    select obra_id,count(*)::integer qtd from ativos group by obra_id
  )
  select c.obra_id,round(coalesce(p.avanco,0),2),c.qtd
  from contagem c left join progresso p on p.obra_id=c.obra_id;
$$;

revoke all on function public.obras_avanco_fisico_ativo() from public;
grant execute on function public.obras_avanco_fisico_ativo() to anon, authenticated, service_role;
