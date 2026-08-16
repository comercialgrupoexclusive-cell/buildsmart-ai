-- Converte o progresso legado gravado em planejamento_itens (ref_tipo='subetapa')
-- para os itens-folha reais do orçamento, já que subetapa/etapa deixaram de ter
-- percentual próprio (regra 8) e passam a ser sempre calculados a partir dos
-- filhos. Estratégia controlada: todo item-folha da subetapa recebe o MESMO
-- percentual que a subetapa já tinha — isso garante, por construção, que a
-- média ponderada por valor dos itens reproduz exatamente o percentual antigo
-- da subetapa, e a função valida isso explicitamente antes de seguir (aborta
-- a migração inteira se algum caso não bater).
do $$
declare
  r record;
  v_item_count int;
  v_valor_total numeric;
  v_new_rollup numeric;
begin
  for r in
    select pi.id, pi.obra_id, pi.orcamento_id, pi.etapa_id, pi.subetapa_key,
           pi.progresso_executado, pi.progresso_planejado, pi.status
    from public.planejamento_itens pi
    where pi.ref_tipo = 'subetapa' and pi.progresso_executado > 0
  loop
    select count(*), sum(oi.quantidade * oi.preco_unitario_snapshot)
    into v_item_count, v_valor_total
    from public.orcamento_itens oi
    where oi.orcamento_id = r.orcamento_id and oi.etapa_id = r.etapa_id
      and oi.tipo_linha = 'item' and oi.subetapa = r.subetapa_key;

    if v_item_count = 0 then
      raise exception 'Subetapa "%" (etapa %) tem progresso % mas nenhum item-folha — abortando migracao', r.subetapa_key, r.etapa_id, r.progresso_executado;
    end if;

    insert into public.planejamento_itens (obra_id, orcamento_id, ref_tipo, etapa_id, subetapa_key, orcamento_item_id, progresso_executado, progresso_planejado, status)
    select r.obra_id, r.orcamento_id, 'item', r.etapa_id, r.subetapa_key, oi.id, r.progresso_executado, coalesce(r.progresso_planejado, r.progresso_executado), r.status
    from public.orcamento_itens oi
    where oi.orcamento_id = r.orcamento_id and oi.etapa_id = r.etapa_id
      and oi.tipo_linha = 'item' and oi.subetapa = r.subetapa_key
    on conflict (orcamento_id, orcamento_item_id) where ref_tipo = 'item' do nothing;

    -- valida: rollup novo (media ponderada por valor dos itens-folha) == valor antigo da subetapa
    select
      case when v_valor_total > 0
        then sum(coalesce(pi2.progresso_executado, 0) * oi.quantidade * oi.preco_unitario_snapshot) / v_valor_total
        else avg(coalesce(pi2.progresso_executado, 0))
      end
    into v_new_rollup
    from public.orcamento_itens oi
    left join public.planejamento_itens pi2 on pi2.orcamento_item_id = oi.id and pi2.ref_tipo = 'item'
    where oi.orcamento_id = r.orcamento_id and oi.etapa_id = r.etapa_id
      and oi.tipo_linha = 'item' and oi.subetapa = r.subetapa_key;

    if abs(coalesce(v_new_rollup, -1) - r.progresso_executado) > 0.01 then
      raise exception 'Rollup novo (%) nao reproduz o valor antigo (%) da subetapa "%" — abortando migracao', v_new_rollup, r.progresso_executado, r.subetapa_key;
    end if;
  end loop;
end $$;
