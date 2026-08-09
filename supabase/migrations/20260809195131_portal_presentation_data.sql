-- Dados executivos do Portal. A funcao valida o token antes de agregar
-- informacoes operacionais e devolve apenas campos apropriados ao cliente.
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

  select
    coalesce(sum(x.valor), 0),
    coalesce(round(sum(x.valor * x.fisico) / nullif(sum(x.valor), 0), 2), 0),
    coalesce(round(sum(x.valor * x.mao_obra) / nullif(sum(x.valor), 0), 2), 0)
  into valor_orcado, avanco_fisico, avanco_mao_obra
  from (
    select
      coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0) valor,
      coalesce(e.percentual_executado, 0) fisico,
      coalesce(e.percentual_mao_obra, 0) mao_obra
    from public.orcamento_itens i
    join public.orcamentos o on o.id = i.orcamento_id
    left join public.etapas e on e.id = i.etapa_id
    where o.obra_id = acesso.obra_id
      and o.status <> 'arquivado'
      and (budget_id is null or o.id = budget_id)
  ) x;

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
