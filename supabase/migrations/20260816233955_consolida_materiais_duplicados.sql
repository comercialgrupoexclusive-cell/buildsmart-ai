-- Regra 3 do documento de convergência de Suprimentos: consolida os
-- duplicados de `materiais` cuja identidade nova (obra+orcamento+etapa+
-- subetapa_orcamento_item_id+sinapi_codigo) já está totalmente resolvida
-- (não mexe nos casos com subetapa não resolvida — texto órfão/renomeado —
-- que ficam de fora por segurança, sem perda de dado, até um resync real).
--
-- Por grupo: mantém o menor id, soma quantidade_comprada (são compras reais
-- registradas, não demanda duplicada — quantidade_total nunca diverge dentro
-- do grupo, verificado antes de aplicar), recalcula status_compra a partir da
-- soma, preserva a data_necessidade mais antiga e a data_recebimento mais
-- recente. Antes de excluir os registros excedentes, reaponta
-- listas_compra.itens (JSON) e requisicao_itens.material_id (FK real) para o
-- id mantido.
do $$
declare
  g record;
  keeper_id uuid;
  outros_ids uuid[];
  qtd_total_grupo numeric;
  soma_comprada numeric;
  novo_status text;
  data_nec date;
  data_receb date;
  removidos_antes int;
  removidos_depois int;
begin
  for g in
    select obra_id, orcamento_id, etapa_id, subetapa_orcamento_item_id, sinapi_codigo,
      (array_agg(id order by id))[1] as menor_id,
      array_agg(id order by id) as todos_ids,
      count(distinct quantidade_total) as n_qtds,
      sum(quantidade_comprada) as soma_comprada,
      min(data_necessidade) as data_nec,
      max(data_recebimento) as data_receb,
      max(quantidade_total) as qtd_total
    from public.materiais
    where orcamento_id is not null and (subetapa is null or subetapa_orcamento_item_id is not null)
    group by obra_id, orcamento_id, etapa_id, subetapa_orcamento_item_id, sinapi_codigo
    having count(*) > 1
  loop
    if g.n_qtds > 1 then
      raise exception 'Grupo % / % / % tem quantidade_total divergente — abortando consolidacao', g.etapa_id, g.subetapa_orcamento_item_id, g.sinapi_codigo;
    end if;

    keeper_id := g.menor_id;
    select array_agg(x) into outros_ids from unnest(g.todos_ids) x where x <> keeper_id;
    qtd_total_grupo := g.qtd_total;
    soma_comprada := least(g.soma_comprada, qtd_total_grupo);
    novo_status := case when soma_comprada >= qtd_total_grupo and qtd_total_grupo > 0 then 'comprado'
                        when soma_comprada > 0 then 'parcial'
                        else 'nao_comprado' end;
    data_nec := g.data_nec;
    data_receb := g.data_receb;

    -- reaponta listas_compra.itens (JSONB, sem FK) para o keeper
    update public.listas_compra lc
    set itens = (
      select jsonb_agg(
        case when (elem->>'id')::uuid = any(outros_ids)
          then jsonb_set(elem, '{id}', to_jsonb(keeper_id::text))
          else elem
        end
      )
      from jsonb_array_elements(lc.itens) elem
    )
    where lc.itens is not null
      and exists (
        select 1 from jsonb_array_elements(lc.itens) elem2
        where (elem2->>'id')::uuid = any(outros_ids)
      );

    -- reaponta requisicao_itens.material_id (FK real) para o keeper
    update public.requisicao_itens
    set material_id = keeper_id
    where material_id = any(outros_ids);

    -- consolida os valores no registro mantido
    update public.materiais
    set quantidade_comprada = soma_comprada,
        status_compra = novo_status,
        data_necessidade = data_nec,
        data_recebimento = data_receb
    where id = keeper_id;

    delete from public.materiais where id = any(outros_ids);
  end loop;

  -- validacao final: nenhum grupo resolvido continua duplicado
  select count(*) into removidos_depois from (
    select 1 from public.materiais
    where orcamento_id is not null and (subetapa is null or subetapa_orcamento_item_id is not null)
    group by obra_id, orcamento_id, etapa_id, subetapa_orcamento_item_id, sinapi_codigo
    having count(*) > 1
  ) x;
  if removidos_depois > 0 then
    raise exception 'Ainda restam % grupos duplicados resolvidos apos a consolidacao — abortando', removidos_depois;
  end if;
end $$;
