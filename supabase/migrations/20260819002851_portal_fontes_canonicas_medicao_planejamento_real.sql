-- Portal do Cliente: adota as fontes canonicas do documento de arquitetura.
--
-- MEDICOES = fonte oficial de avanco fisico e avanco/pagamento de mao de obra
-- e gerenciamento. ORCAMENTO = fonte oficial de valores previstos/estrutura.
-- COMPRA_ITENS = fonte oficial de pagamentos efetivamente lancados.
--
-- Problema 1: portal_get_presentation.axes recalculava avanco fisico e mao
-- de obra como media ponderada pelo valor do orcamento usando
-- etapas.percentual_executado/percentual_mao_obra (cronograma legado). Passa
-- a ler a mesma medicao (eixo='fisico'/'mao_obra') que portal_get_overview ja
-- usa corretamente -- sem duplicar logica com valores diferentes.
--
-- Problema 3: portal_get_schedule copiava coalesce(e.percentual_executado,0)
-- da etapa para TODAS as subetapas (filhos). Etapa continua mostrando seu
-- proprio avanco oficial (nao ha medicao por etapa nesta base); subetapa so
-- mostra percentual quando existe dado real em planejamento_itens -- senao
-- fica null (frontend mostra so periodo/status, nunca fabrica numero).
create or replace function public.portal_get_presentation(
  p_token_hash text,
  p_orcamento_id text default 'todos'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  budget_id uuid;
  valor_orcado numeric := 0;
  avanco_fisico numeric := 0;
  avanco_mao_obra numeric := 0;
  realizado numeric := 0;
  pago numeric := 0;
  financiamento_previsto numeric := 0;
  financiamento_recebido numeric := 0;
begin
  acesso := public.portal_authorize(p_token_hash);

  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (
      select 1 from public.orcamentos o
      where o.id = budget_id and o.obra_id = acesso.obra_id and o.status <> 'arquivado'
    ) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;

  select coalesce(sum(coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0)), 0)
  into valor_orcado
  from public.orcamento_itens i
  join public.orcamentos o on o.id = i.orcamento_id
  where o.obra_id = acesso.obra_id
    and o.status <> 'arquivado'
    and (budget_id is null or o.id = budget_id);

  -- Avanco fisico e de mao de obra: sempre da medicao mais recente do eixo,
  -- nunca recalculado a partir do valor financeiro do orcamento.
  select coalesce((
    select m.avanco_acumulado
    from public.medicoes m
    where m.obra_id = acesso.obra_id
      and m.eixo = 'fisico'
      and (budget_id is null or m.orcamento_id = budget_id or m.orcamento_id is null)
    order by m.periodo_fim desc nulls last, m.created_at desc
    limit 1
  ), 0) into avanco_fisico;

  select coalesce((
    select m.avanco_acumulado
    from public.medicoes m
    where m.obra_id = acesso.obra_id
      and m.eixo = 'mao_obra'
      and (budget_id is null or m.orcamento_id = budget_id or m.orcamento_id is null)
    order by m.periodo_fim desc nulls last, m.created_at desc
    limit 1
  ), 0) into avanco_mao_obra;

  select
    coalesce(sum(c.valor_total) filter (where c.status_valor = 'confirmado'), 0),
    coalesce(sum(c.valor_total) filter (where c.status_pagamento = 'pago'), 0)
  into realizado, pago
  from public.compra_itens c
  where c.obra_id = acesso.obra_id
    and (budget_id is null or c.orcamento_id = budget_id);

  select coalesce(sum(f.valor_previsto), 0)
  into financiamento_previsto
  from public.obra_fontes_recursos f
  where f.obra_id = acesso.obra_id
    and (budget_id is null or f.orcamento_id = budget_id);

  select coalesce(sum(r.valor_recebido), 0)
  into financiamento_recebido
  from public.obra_reembolsos r
  where r.obra_id = acesso.obra_id
    and (budget_id is null or r.orcamento_id = budget_id);

  return jsonb_build_object(
    'axes', jsonb_build_object(
      'physical', avanco_fisico,
      'labor', avanco_mao_obra,
      'financial', case when valor_orcado > 0 then round(realizado / valor_orcado * 100, 2) else 0 end,
      'financing', case when financiamento_previsto > 0 then round(financiamento_recebido / financiamento_previsto * 100, 2) else 0 end
    ),
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.nome,
        'status', s.status,
        'start', s.data_inicio,
        'end', s.data_fim,
        'physical', coalesce(s.percentual_executado, 0),
        'labor', coalesce(s.percentual_mao_obra, 0),
        'budget', coalesce(s.valor, 0)
      ) order by s.ordem)
      from (
        select e.*, sum(coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0)) valor
        from public.etapas e
        left join public.orcamento_itens i on i.etapa_id = e.id
        left join public.orcamentos o on o.id = i.orcamento_id
        where e.obra_id = acesso.obra_id
          and (budget_id is null or o.id = budget_id)
          and (o.id is null or o.status <> 'arquivado')
        group by e.id
      ) s
    ), '[]'::jsonb),
    'financial', jsonb_build_object(
      'budget', valor_orcado,
      'realized', realizado,
      'paid', pago,
      'balance', greatest(valor_orcado - realizado, 0),
      'timeline', coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', t.mes,
          'realized', t.realizado,
          'paid', t.pago
        ) order by t.mes)
        from (
          select
            to_char(date_trunc('month', coalesce(c.data_compra, c.created_at::date)), 'YYYY-MM') mes,
            coalesce(sum(c.valor_total) filter (where c.status_valor = 'confirmado'), 0) realizado,
            coalesce(sum(c.valor_total) filter (where c.status_pagamento = 'pago'), 0) pago
          from public.compra_itens c
          where c.obra_id = acesso.obra_id
            and (budget_id is null or c.orcamento_id = budget_id)
          group by 1
        ) t
      ), '[]'::jsonb),
      'recent', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.data desc, r.created_at desc)
        from (
          select
            c.id,
            c.descricao title,
            coalesce(c.data_compra, c.created_at::date) data,
            coalesce(c.valor_total, 0) value,
            coalesce(e.nome, 'Geral') stage,
            coalesce(o.nome, 'Obra') budget_name,
            c.status_pagamento payment_status,
            c.created_at
          from public.compra_itens c
          left join public.etapas e on e.id = c.etapa_id
          left join public.orcamentos o on o.id = c.orcamento_id
          where c.obra_id = acesso.obra_id
            and c.status_valor = 'confirmado'
            and (budget_id is null or c.orcamento_id = budget_id)
          order by coalesce(c.data_compra, c.created_at::date) desc, c.created_at desc
          limit 8
        ) r
      ), '[]'::jsonb)
    ),
    'financing', jsonb_build_object(
      'expected', financiamento_previsto,
      'requested', coalesce((select sum(r.valor_solicitado) from public.obra_reembolsos r where r.obra_id = acesso.obra_id and (budget_id is null or r.orcamento_id = budget_id)), 0),
      'approved', coalesce((select sum(r.valor_aprovado) from public.obra_reembolsos r where r.obra_id = acesso.obra_id and (budget_id is null or r.orcamento_id = budget_id)), 0),
      'received', financiamento_recebido,
      'balance', greatest(financiamento_previsto - financiamento_recebido, 0),
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id,
          'type', f.tipo,
          'value', f.valor_previsto,
          'note', f.observacao,
          'budgetName', coalesce(o.nome, 'Geral da obra')
        ) order by f.valor_previsto desc)
        from public.obra_fontes_recursos f
        left join public.orcamentos o on o.id = f.orcamento_id
        where f.obra_id = acesso.obra_id
          and (budget_id is null or f.orcamento_id = budget_id)
      ), '[]'::jsonb),
      'reimbursements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'title', r.descricao,
          'status', r.status,
          'requested', r.valor_solicitado,
          'approved', r.valor_aprovado,
          'received', r.valor_recebido,
          'date', coalesce(r.data_recebimento, r.data_aprovacao, r.data_solicitacao)
        ) order by coalesce(r.data_recebimento, r.data_aprovacao, r.data_solicitacao) desc nulls last)
        from public.obra_reembolsos r
        where r.obra_id = acesso.obra_id
          and (budget_id is null or r.orcamento_id = budget_id)
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.portal_get_presentation(text, text) from public, authenticated;
grant execute on function public.portal_get_presentation(text, text) to anon, service_role;

-- Problema 3: subetapas (filhos) so mostram percentual quando existe dado
-- real em planejamento_itens para algum item do grupo -- nunca copiam o
-- percentual da etapa. Datas continuam vindo de orcamento_itens/etapas.
create or replace function public.portal_get_schedule(
  p_token_hash text,
  p_orcamento_id text default 'todos'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare acesso public.portal_access_links; budget_id uuid;
begin
  acesso := public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (select 1 from public.orcamentos where id = budget_id and obra_id = acesso.obra_id) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'status', e.status, 'inicio', e.data_inicio,
      'fim', e.data_fim, 'percentual', coalesce(e.percentual_executado, 0),
      'filhos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', g.id, 'nome', g.nome,
          'status', case when g.percentual is not null and g.percentual >= 100 then 'concluida' else e.status end,
          'inicio', g.inicio, 'fim', g.fim, 'percentual', g.percentual
        ) order by g.inicio nulls last, g.nome)
        from (
          select
            min(item.orcamento_item_id::text) id,
            item.nome,
            min(item.inicio) inicio,
            max(item.fim) fim,
            case when bool_or(item.tem_dado) then
              round(coalesce(
                sum(item.progresso * item.peso) filter (where item.tem_dado) / nullif(sum(item.peso) filter (where item.tem_dado), 0),
                avg(item.progresso) filter (where item.tem_dado)
              ), 2)
            else null end percentual
          from (
            select
              oi.id orcamento_item_id,
              coalesce(nullif(oi.subetapa, ''), oi.descricao_snapshot, 'Item') nome,
              coalesce(oi.data_inicio, e.data_inicio) inicio,
              coalesce(oi.data_fim, e.data_fim) fim,
              (pi.id is not null) tem_dado,
              coalesce(pi.progresso_executado, 0) progresso,
              coalesce(oi.quantidade, 0) * coalesce(oi.preco_unitario_snapshot, 0) peso
            from public.orcamento_itens oi
            left join public.planejamento_itens pi
              on pi.orcamento_item_id = oi.id and pi.ref_tipo = 'item'
            where oi.etapa_id = e.id and oi.tipo_linha = 'item'
              and (budget_id is null or oi.orcamento_id = budget_id)
          ) item
          group by item.nome
        ) g
      ), '[]'::jsonb)
    ) order by e.ordem)
    from public.etapas e
    where e.obra_id = acesso.obra_id
      and (budget_id is null or exists (
        select 1 from public.orcamento_itens oi where oi.orcamento_id = budget_id and oi.etapa_id = e.id
      ))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_get_schedule(text, text) from public, authenticated;
grant execute on function public.portal_get_schedule(text, text) to anon, service_role;

-- Problema 2: portal_get_financial ganha o mesmo detalhamento
-- fisico-financeiro operacional de portal_get_overview (materiais/mao de
-- obra/gerenciamento/equipamentos/total), reaproveitando a MESMA funcao em
-- vez de recalcular em paralelo. "paid" continua sendo só compra_itens
-- pagos (Pagamentos lançados / Caixa realizado); "operational.total.paid" é
-- o conceito fisico-financeiro completo (materiais + MO medida +
-- gerenciamento medido) -- nunca a mesma coisa, agora com nomes distintos.
create or replace function public.portal_get_financial(p_token_hash text, p_orcamento_id text default 'todos'::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare acesso public.portal_access_links; budget_id uuid; valor_orcado numeric:=0; realizado numeric:=0; pago numeric:=0; operacional jsonb;
begin
  acesso:=public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id<>'todos' then budget_id:=p_orcamento_id::uuid; end if;
  select coalesce(sum(t.direto*(1+coalesce(t.bdi,0)/100+coalesce(t.gerenciamento,0)/100)),0) into valor_orcado
  from (select o.id,o.bdi_percentual bdi,o.gerenciamento_percentual gerenciamento,
    sum(coalesce(i.valor_total_informado_snapshot,i.quantidade*i.preco_unitario_snapshot,0)) direto
    from public.orcamentos o left join public.orcamento_itens i on i.orcamento_id=o.id
    where o.obra_id=acesso.obra_id and o.status<>'arquivado' and (budget_id is null or o.id=budget_id)
    group by o.id) t;
  select coalesce(sum(c.valor_total) filter(where c.status_valor='confirmado'),0),coalesce(sum(c.valor_total) filter(where c.status_pagamento='pago'),0)
  into realizado,pago from public.compra_itens c where c.obra_id=acesso.obra_id and (budget_id is null or c.orcamento_id=budget_id);
  operacional := public.portal_get_overview(p_token_hash, p_orcamento_id) -> 'payments';
  return jsonb_build_object('budget',valor_orcado,'realized',realizado,'paid',pago,'balance',greatest(valor_orcado-realizado,0),
    'operational',operacional,
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('month',t.mes,'realized',t.realized,'paid',t.paid) order by t.mes) from (
      select to_char(date_trunc('month',coalesce(c.data_compra,c.created_at::date)),'YYYY-MM') mes,
      coalesce(sum(c.valor_total) filter(where c.status_valor='confirmado'),0) realized,
      coalesce(sum(c.valor_total) filter(where c.status_pagamento='pago'),0) paid
      from public.compra_itens c where c.obra_id=acesso.obra_id and (budget_id is null or c.orcamento_id=budget_id) group by 1)t),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(r) order by r.data desc,r.created_at desc) from (
      select c.id,c.descricao title,coalesce(c.data_compra,c.created_at::date) data,coalesce(c.valor_total,0) value,
      coalesce(e.nome,'Geral') stage,coalesce(o.nome,'Obra') budget_name,c.status_pagamento payment_status,c.fornecedor_nome supplier,c.forma_pagamento payment_method,c.created_at
      from public.compra_itens c left join public.etapas e on e.id=c.etapa_id left join public.orcamentos o on o.id=c.orcamento_id
      where c.obra_id=acesso.obra_id and c.status_valor='confirmado' and (budget_id is null or c.orcamento_id=budget_id)
    )r),'[]'::jsonb));
end; $function$;

revoke all on function public.portal_get_financial(text, text) from public, authenticated;
grant execute on function public.portal_get_financial(text, text) to anon, service_role;
