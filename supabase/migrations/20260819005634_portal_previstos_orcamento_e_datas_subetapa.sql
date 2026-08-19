-- Portal do Cliente — última rodada de convergência para a obra de teste.
--
-- 1) VISAO GERAL: os "previstos" (materiais/MO/gerenciamento/total) vinham
--    de valor_contratado congelado na última medição fechada, não do
--    orçamento atual. Quando a medição de gerenciamento tinha valor > 0,
--    o direto era DERIVADO dividindo esse valor congelado pelo percentual
--    de gerenciamento -- por isso não acompanhava os ajustes recentes do
--    orçamento (piso etc.). Direto e gerenciamento previstos passam a vir
--    sempre do orçamento atual (orcamento_itens + gerenciamento_percentual);
--    "pago"/"MO prevista" continuam da medição (fonte oficial de avanço e
--    pagamento). Nada hardcoded -- segue o orçamento vivo da obra.
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
        coalesce((select sum(mi.valor_pago) from public.medicao_itens mi where mi.medicao_id = r.management_id), 0) management_paid
      from measurement_refs r
    ),
    operational_values as (
      select
        sum(bv.snapshot_direct) direct_planned,
        sum(mv.labor_planned) labor_planned,
        sum(mv.labor_paid) labor_paid,
        sum(bv.snapshot_direct * bv.gerenciamento_percentual / 100) management_planned,
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

-- 2) EVOLUCAO FINANCEIRA: axes.financial usava só o direto do orçamento
-- (sem gerenciamento), divergindo do "orçamento completo" mostrado em
-- Financeiro/Visão Geral. Passa a usar o mesmo total com BDI+gerenciamento
-- (mesma fórmula de portal_get_financial), um único conceito de "orçamento
-- completo" em todas as telas.
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

  -- Orçamento completo (direto + BDI + gerenciamento) -- mesmo conceito
  -- usado em portal_get_financial.budget, nunca só o direto.
  select coalesce(sum(t.direto * (1 + coalesce(t.bdi, 0) / 100 + coalesce(t.gerenciamento, 0) / 100)), 0)
  into valor_orcado
  from (
    select
      o.id, o.bdi_percentual bdi, o.gerenciamento_percentual gerenciamento,
      sum(coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0)) direto
    from public.orcamentos o
    left join public.orcamento_itens i on i.orcamento_id = o.id
    where o.obra_id = acesso.obra_id
      and o.status <> 'arquivado'
      and (budget_id is null or o.id = budget_id)
    group by o.id
  ) t;

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

-- 3) CRONOGRAMA: datas de subetapa agora preferem planejamento_itens
-- (ref_tipo='subetapa', casado por etapa_id + subetapa_key), que carrega o
-- planejamento real por subetapa. Sem essa linha, cai no fallback anterior
-- (orcamento_itens/etapas). O percentual continua só vindo de progresso
-- real em planejamento_itens (ref_tipo='item') -- nunca copiado da etapa.
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
          'inicio', coalesce(ps.data_inicio, g.inicio), 'fim', coalesce(ps.data_fim, g.fim), 'percentual', g.percentual
        ) order by coalesce(ps.data_inicio, g.inicio) nulls last, g.nome)
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
        left join public.planejamento_itens ps
          on ps.etapa_id = e.id and ps.ref_tipo = 'subetapa' and ps.subetapa_key = g.nome
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

-- 4) PREVISOES da obra de teste: corrige encoding quebrado herdado da
-- importação ("Ã³" -> "ó") e vincula a UNICA correspondência inequívoca de
-- etapa (titulo contém exatamente o nome da etapa). Preserva histórico --
-- nenhuma linha é apagada, apenas texto/vínculo corrigidos.
update public.obra_previsoes
set descricao = 'Importado do controle provisório utilizado pela cliente.'
where obra_id = 'ca79a72f-d864-4f9a-982b-ee6dd2db677c'
  and descricao = 'Importado do controle provisÃ³rio utilizado pela cliente.';

update public.obra_previsoes p
set etapa_id = e.id
from public.etapas e
where p.obra_id = 'ca79a72f-d864-4f9a-982b-ee6dd2db677c'
  and e.obra_id = 'ca79a72f-d864-4f9a-982b-ee6dd2db677c'
  and p.etapa_id is null
  and p.titulo ilike '%' || regexp_replace(e.nome, '^\d+\s+', '') || '%';
