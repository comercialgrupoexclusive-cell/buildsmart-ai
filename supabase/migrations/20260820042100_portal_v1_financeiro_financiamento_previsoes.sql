-- Fecha o Portal do Cliente V1 (somente Obra): unifica o conceito de "Pago"
-- entre portal_get_financial e portal_get_overview (hoje divergiam porque
-- financial.paid somava so compra_itens, enquanto overview.payments.total
-- soma materiais pagos + mao de obra medida + gerenciamento medido), corrige
-- o denominador do indicador de financiamento (hoje incluia Recursos
-- Proprios, que nao e "recebido" no sentido de financiamento/FGTS) e expoe
-- em portal_get_previsoes os campos estruturais ja existentes (necessidade,
-- prazo de fornecimento, compra vinculada) para materiais, sem criar nenhum
-- motor novo -- mesma logica ja usada em obra_previsoes_list, exposta aqui
-- em formato somente-leitura para o cliente.

-- 1) portal_get_financial.paid passa a ser o MESMO total operacional de
--    portal_get_overview (materiais + mao de obra + gerenciamento pagos),
--    reaproveitando o resultado que a funcao ja chama (nao duplica calculo).
--    compra_itens continua sendo a fonte de 'realized'/'timeline'/'entries'
--    (detalhamento de lancamentos), nunca mais apresentado como "Pago" da obra.
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
  select coalesce(sum(c.valor_total) filter(where c.status_valor='confirmado'),0)
  into realizado from public.compra_itens c where c.obra_id=acesso.obra_id and (budget_id is null or c.orcamento_id=budget_id);
  operacional := public.portal_get_overview(p_token_hash, p_orcamento_id) -> 'payments';
  pago := coalesce((operacional->'total'->>'paid')::numeric, 0);
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

-- 2) portal_get_presentation: financiamento (axes.financing e financing.*)
--    passa a considerar apenas fontes tipo Financiamento Caixa + FGTS no
--    denominador -- Recursos Proprios nunca "sao recebidos" no sentido de
--    financiamento, entao nao contam nem no numerador nem no denominador
--    deste indicador. Expoe tambem 'ownResources' para o cliente mostrar
--    Recursos Proprios separadamente, sem misturar com o percentual.
create or replace function public.portal_get_presentation(p_token_hash text, p_orcamento_id text default 'todos'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  -- Denominador do indicador "Financiamento": somente Financiamento Caixa +
  -- FGTS. Recursos Proprios sao contrapartida direta do cliente, nunca
  -- "recebidos" de uma fonte externa, entao nunca entram neste percentual.
  select coalesce(sum(f.valor_previsto), 0)
  into financiamento_previsto
  from public.obra_fontes_recursos f
  where f.obra_id = acesso.obra_id
    and f.tipo in ('financiamento', 'fgts')
    and (budget_id is null or f.orcamento_id = budget_id);

  -- Numerador: reembolsos vinculados a Financiamento/FGTS (ou sem fonte
  -- vinculada -- historico anterior ao vinculo estrutural). Reembolsos
  -- vinculados a Recursos Proprios (se algum dia existirem) ficam de fora.
  select coalesce(sum(r.valor_recebido), 0)
  into financiamento_recebido
  from public.obra_reembolsos r
  left join public.obra_fontes_recursos f2 on f2.id = r.fonte_id
  where r.obra_id = acesso.obra_id
    and (f2.tipo is null or f2.tipo in ('financiamento', 'fgts'))
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
      'requested', coalesce((
        select sum(r.valor_solicitado) from public.obra_reembolsos r
        left join public.obra_fontes_recursos f2 on f2.id = r.fonte_id
        where r.obra_id = acesso.obra_id
          and (f2.tipo is null or f2.tipo in ('financiamento', 'fgts'))
          and (budget_id is null or r.orcamento_id = budget_id)
      ), 0),
      'approved', coalesce((
        select sum(r.valor_aprovado) from public.obra_reembolsos r
        left join public.obra_fontes_recursos f2 on f2.id = r.fonte_id
        where r.obra_id = acesso.obra_id
          and (f2.tipo is null or f2.tipo in ('financiamento', 'fgts'))
          and (budget_id is null or r.orcamento_id = budget_id)
      ), 0),
      'received', financiamento_recebido,
      'balance', greatest(financiamento_previsto - financiamento_recebido, 0),
      'ownResources', coalesce((
        select sum(f.valor_previsto) from public.obra_fontes_recursos f
        where f.obra_id = acesso.obra_id
          and f.tipo = 'recursos_proprios'
          and (budget_id is null or f.orcamento_id = budget_id)
      ), 0),
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
        left join public.obra_fontes_recursos f2 on f2.id = r.fonte_id
        where r.obra_id = acesso.obra_id
          and (f2.tipo is null or f2.tipo in ('financiamento', 'fgts'))
          and (budget_id is null or r.orcamento_id = budget_id)
      ), '[]'::jsonb)
    )
  );
end;
$function$;

-- 3) portal_get_previsoes expoe dataNecessidade/prazoFornecimentoDias/
--    compraVinculada -- mesmos campos ja calculados em obra_previsao_save/
--    obra_previsoes_list (metadados + vinculo estrutural por insumo), sem
--    criar motor novo. O frontend usa isso para nao esconder previsoes
--    vencidas como "Proximas".
create or replace function public.portal_get_previsoes(p_token_hash text, p_orcamento_id text default 'todos'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare acesso public.portal_access_links; budget_id uuid;
begin
  acesso:=public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id<>'todos' then
    budget_id:=p_orcamento_id::uuid;
    if not exists(select 1 from public.orcamentos where id=budget_id and obra_id=acesso.obra_id) then raise exception 'portal_budget_denied'; end if;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'orcamentoId',p.orcamento_id,'orcamentoNome',coalesce(o.nome,'Geral da obra'),'tipo',p.tipo,
    'titulo',coalesce(nullif(p.titulo_cliente,''),p.titulo),'descricao',coalesce(nullif(p.descricao_cliente,''),p.descricao),
    'valorPrevisto',p.valor_previsto,'dataPrevista',p.data_prevista,'valorRealizado',p.valor_realizado,'dataRealizada',p.data_realizada,
    'condicaoPagamento',p.condicao_pagamento,'status',p.status,'origem',p.origem,'baseline',p.baseline,
    'etapaNome',e.nome,'fornecedorNome',p.fornecedor_nome,
    'dataNecessidade', nullif(p.metadados->>'dataNecessidade','')::date,
    'prazoFornecimentoDias', nullif(p.metadados->>'prazoFornecimentoDias','')::int,
    'compraVinculada', case
      when vinc.insumo_id is not null then exists (
        select 1 from public.compra_itens ci
        where ci.obra_id = p.obra_id and ci.orcamento_item_insumo_id = vinc.insumo_id
      )
      when vinc.item_id is not null and gran.item_tem_insumos then null
      when vinc.item_id is not null or vinc.subetapa_item_id is not null then exists (
        select 1 from public.compra_itens ci
        where ci.obra_id = p.obra_id
          and (
            (vinc.item_id is not null and ci.orcamento_item_id = vinc.item_id)
            or (vinc.subetapa_item_id is not null and ci.subetapa_orcamento_item_id = vinc.subetapa_item_id)
          )
      )
      else null
    end
  ) order by p.data_prevista nulls last)
  from public.obra_previsoes p
  left join public.orcamentos o on o.id=p.orcamento_id
  left join public.etapas e on e.id=p.etapa_id
  left join lateral (
    select
      nullif(p.metadados->>'orcamentoItemInsumoId','')::uuid as insumo_id,
      nullif(p.metadados->'origemCronograma'->>'orcamentoItemId','')::uuid as item_id,
      nullif(p.metadados->'origemCronograma'->>'subetapaOrcamentoItemId','')::uuid as subetapa_item_id
  ) vinc on true
  left join lateral (
    select exists (
      select 1 from public.orcamento_item_insumos oii where oii.orcamento_item_id = vinc.item_id
    ) as item_tem_insumos
  ) gran on true
  where p.obra_id=acesso.obra_id and p.vigente and p.publicado_cliente
    and p.status in ('confirmada','realizada') and (budget_id is null or p.orcamento_id=budget_id)),'[]'::jsonb);
end;
$function$;
