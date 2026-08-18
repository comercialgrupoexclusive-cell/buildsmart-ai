-- Resumo fisico-financeiro da Visao Geral do Portal.
-- Agrega apenas fontes operacionais existentes e valida o acesso pelo token.
create or replace function public.portal_get_overview(
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
begin
  acesso := public.portal_authorize(p_token_hash);

  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (
      select 1
      from public.orcamentos o
      where o.id = budget_id
        and o.obra_id = acesso.obra_id
        and o.status <> 'arquivado'
    ) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;

  return (
    with selected_budgets as (
      select o.id, coalesce(o.gerenciamento_percentual, 0) gerenciamento_percentual
      from public.orcamentos o
      where o.obra_id = acesso.obra_id
        and o.status <> 'arquivado'
        and (budget_id is null or o.id = budget_id)
    ),
    budget_values as (
      select
        b.id,
        b.gerenciamento_percentual,
        coalesce(sum(
          case when coalesce(i.tipo_linha, 'item') <> 'subetapa'
            then coalesce(
              i.valor_total_informado_snapshot,
              coalesce(i.quantidade, 0) * coalesce(i.preco_unitario_snapshot, 0),
              0
            )
            else 0
          end
        ), 0) snapshot_direct
      from selected_budgets b
      left join public.orcamento_itens i on i.orcamento_id = b.id
      group by b.id, b.gerenciamento_percentual
    ),
    measurement_refs as (
      select
        b.id budget_id,
        (
          select m.id
          from public.medicoes m
          where m.obra_id = acesso.obra_id
            and m.eixo = 'mao_obra'
            and (m.orcamento_id = b.id or m.orcamento_id is null)
          order by (m.orcamento_id = b.id) desc, m.periodo_fim desc nulls last, m.created_at desc
          limit 1
        ) labor_id,
        (
          select m.id
          from public.medicoes m
          where m.obra_id = acesso.obra_id
            and m.eixo = 'gerenciamento'
            and (m.orcamento_id = b.id or m.orcamento_id is null)
          order by (m.orcamento_id = b.id) desc, m.periodo_fim desc nulls last, m.created_at desc
          limit 1
        ) management_id
      from selected_budgets b
    ),
    measurement_values as (
      select
        r.budget_id,
        coalesce((select sum(mi.valor_contratado) from public.medicao_itens mi where mi.medicao_id = r.labor_id), 0) labor_planned,
        coalesce((select sum(mi.valor_pago) from public.medicao_itens mi where mi.medicao_id = r.labor_id), 0) labor_paid,
        coalesce((select sum(mi.valor_contratado) from public.medicao_itens mi where mi.medicao_id = r.management_id), 0) management_planned,
        coalesce((select sum(mi.valor_pago) from public.medicao_itens mi where mi.medicao_id = r.management_id), 0) management_paid
      from measurement_refs r
    ),
    operational_values as (
      select
        sum(case
          when mv.management_planned > 0 and bv.gerenciamento_percentual > 0
            then mv.management_planned / (bv.gerenciamento_percentual / 100)
          else bv.snapshot_direct
        end) direct_planned,
        sum(mv.labor_planned) labor_planned,
        sum(mv.labor_paid) labor_paid,
        sum(mv.management_planned) management_planned,
        sum(mv.management_paid) management_paid
      from budget_values bv
      join measurement_values mv on mv.budget_id = bv.id
    ),
    purchase_values as (
      select
        coalesce(sum(c.valor_total) filter (
          where c.status_pagamento = 'pago'
            and lower(coalesce(c.tipo_custo, '')) in ('material', 'material_servicos')
        ), 0) material_paid,
        coalesce(sum(c.valor_total) filter (
          where c.status_pagamento = 'pago'
            and lower(coalesce(c.tipo_custo, '')) = 'equipamento'
        ), 0) equipment_paid
      from public.compra_itens c
      where c.obra_id = acesso.obra_id
        and (budget_id is null or c.orcamento_id = budget_id)
    ),
    caixa as (
      select coalesce(sum(f.valor_previsto), 0) total
      from public.obra_fontes_recursos f
      where f.obra_id = acesso.obra_id
        and (budget_id is null or f.orcamento_id = budget_id)
    ),
    current_physical as (
      select coalesce(
        (
          select m.avanco_acumulado
          from public.medicoes m
          where m.obra_id = acesso.obra_id
            and m.eixo = 'fisico'
            and (budget_id is null or m.orcamento_id = budget_id or m.orcamento_id is null)
          order by m.periodo_fim desc nulls last, m.created_at desc
          limit 1
        ),
        (
          select sum(fi.peso * fmi.pct_executado / 100)
          from public.financiamento_medicoes fm
          join public.financiamento_medicao_itens fmi on fmi.medicao_id = fm.id
          join public.financiamento_itens fi on fi.id = fmi.item_id
          where fm.obra_id = acesso.obra_id
            and fm.status = 'fechada'
            and (budget_id is null or fm.orcamento_id = budget_id)
          group by fm.id
          order by max(fm.data_medicao) desc
          limit 1
        ),
        0
      ) value
    ),
    calendar_context as (
      select
        coalesce(
          (select date_trunc('month', min(m.periodo_inicio))::date from public.medicoes m where m.obra_id = acesso.obra_id and m.eixo = 'fisico'),
          (select date_trunc('month', min(fm.data_medicao))::date from public.financiamento_medicoes fm where fm.obra_id = acesso.obra_id),
          date_trunc('month', current_date)::date
        ) base_month,
        coalesce(
          (select date_trunc('month', max(fm.data_medicao))::date from public.financiamento_medicoes fm where fm.obra_id = acesso.obra_id and fm.status = 'fechada' and (budget_id is null or fm.orcamento_id = budget_id)),
          (select date_trunc('month', max(m.periodo_fim))::date from public.medicoes m where m.obra_id = acesso.obra_id and m.eixo = 'fisico' and (budget_id is null or m.orcamento_id = budget_id or m.orcamento_id is null)),
          date_trunc('month', current_date)::date
        ) realized_through
    ),
    bank_schedule as (
      select
        (cc.base_month + ((cb.mes - 1) * interval '1 month'))::date month_date,
        cb.pct_acumulado_previsto planned_physical
      from public.financiamento_cronograma_banco cb
      cross join calendar_context cc
      where cb.obra_id = acesso.obra_id
        and (budget_id is null or cb.orcamento_id = budget_id)
    ),
    closed_financing as (
      select
        date_trunc('month', fm.data_medicao)::date month_date,
        sum(fi.peso * fmi.pct_executado / 100) physical,
        sum(fi.valor_financiado * fmi.pct_executado / 100) value
      from public.financiamento_medicoes fm
      join public.financiamento_medicao_itens fmi on fmi.medicao_id = fm.id
      join public.financiamento_itens fi on fi.id = fmi.item_id
      where fm.obra_id = acesso.obra_id
        and fm.status = 'fechada'
        and (budget_id is null or fm.orcamento_id = budget_id)
      group by date_trunc('month', fm.data_medicao)
    ),
    evolution_ranked as (
      select
        bs.month_date,
        coalesce(cf.physical, bs.planned_physical) physical,
        coalesce(cf.value, cx.total * bs.planned_physical / 100) value,
        case when bs.month_date <= cc.realized_through then 'realized' else 'forecast' end kind,
        row_number() over (
          partition by (bs.month_date > cc.realized_through)
          order by bs.month_date
        ) period_rank
      from bank_schedule bs
      cross join calendar_context cc
      cross join caixa cx
      left join closed_financing cf on cf.month_date = bs.month_date
    ),
    evolution as (
      select *
      from evolution_ranked
      where kind = 'realized' or (kind = 'forecast' and period_rank = 1)
    ),
    next_measurement as (
      select coalesce((select e.physical from evolution e where e.kind = 'forecast' order by e.month_date limit 1), (select value from current_physical), 0) value
    )
    select jsonb_build_object(
      'payments', jsonb_build_object(
        'materials', jsonb_build_object(
          'planned', greatest(coalesce(ov.direct_planned, 0) - coalesce(ov.labor_planned, 0), 0),
          'paid', pv.material_paid
        ),
        'labor', jsonb_build_object('planned', coalesce(ov.labor_planned, 0), 'paid', coalesce(ov.labor_paid, 0)),
        'management', jsonb_build_object('planned', coalesce(ov.management_planned, 0), 'paid', coalesce(ov.management_paid, 0)),
        'total', jsonb_build_object(
          'planned', coalesce(ov.direct_planned, 0) + coalesce(ov.management_planned, 0),
          'paid', pv.material_paid + coalesce(ov.labor_paid, 0) + coalesce(ov.management_paid, 0)
        ),
        'otherEquipmentPaid', pv.equipment_paid
      ),
      'physical', jsonb_build_object(
        'current', cp.value,
        'next', nm.value,
        'caixaTotal', cx.total
      ),
      'monthlyEvolution', coalesce((
        select jsonb_agg(jsonb_build_object(
          'month', to_char(e.month_date, 'YYYY-MM'),
          'physical', e.physical,
          'value', e.value,
          'kind', e.kind
        ) order by e.month_date)
        from evolution e
      ), '[]'::jsonb)
    )
    from operational_values ov
    cross join purchase_values pv
    cross join current_physical cp
    cross join next_measurement nm
    cross join caixa cx
  );
end;
$$;

revoke all on function public.portal_get_overview(text, text) from public, authenticated;
grant execute on function public.portal_get_overview(text, text) to anon, service_role;
