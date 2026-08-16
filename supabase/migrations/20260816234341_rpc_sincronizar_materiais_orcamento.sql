-- Regra 2 do documento de convergência de Suprimentos: upsert idempotente de
-- verdade (INSERT ... ON CONFLICT sobre o índice único uq_materiais_identidade),
-- não select-depois-decide como o código anterior — roda 1x/2x/10x e produz
-- exatamente os mesmos registros/quantidades, sem condição de corrida.
-- A expansão orçamento->insumos continua em TS (lib/materiais-sync.ts); esta
-- função só recebe a lista já calculada e grava, sem nunca tocar
-- quantidade_comprada/status_compra/data_recebimento (regra 5 — compra e
-- recebimento não podem ser perdidos por uma sincronização).
create or replace function public.sincronizar_materiais_orcamento(
  p_obra_id uuid, p_orcamento_id uuid, p_itens jsonb
) returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_criados int := 0;
  v_atualizados int := 0;
  v_item jsonb;
  v_etapa_id uuid;
  v_sub_id uuid;
  v_codigo text;
  v_descricao text;
  v_unidade text;
  v_qtd numeric;
  v_subetapa_texto text;
  v_inserted boolean;
begin
  if p_obra_id is null or p_orcamento_id is null then
    raise exception 'obra_id e orcamento_id sao obrigatorios';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_etapa_id := nullif(v_item->>'etapa_id', '')::uuid;
    v_sub_id := nullif(v_item->>'subetapa_orcamento_item_id', '')::uuid;
    v_codigo := nullif(v_item->>'sinapi_codigo', '');
    v_descricao := coalesce(v_item->>'descricao', v_codigo);
    v_unidade := coalesce(v_item->>'unidade', 'UN');
    v_qtd := round((v_item->>'quantidade')::numeric, 4);

    if v_codigo is null or v_qtd is null or v_qtd <= 0 then
      continue;
    end if;

    v_subetapa_texto := null;
    if v_sub_id is not null then
      select subetapa into v_subetapa_texto from public.orcamento_itens where id = v_sub_id;
    end if;

    insert into public.materiais (
      obra_id, orcamento_id, etapa_id, subetapa, subetapa_orcamento_item_id,
      sinapi_codigo, descricao, unidade, quantidade_total, quantidade_comprada, status_compra
    ) values (
      p_obra_id, p_orcamento_id, v_etapa_id, v_subetapa_texto, v_sub_id,
      v_codigo, v_descricao, v_unidade, v_qtd, 0, 'nao_comprado'
    )
    on conflict (
      obra_id, orcamento_id, coalesce(etapa_id::text, ''), coalesce(subetapa_orcamento_item_id::text, ''), sinapi_codigo
    ) where orcamento_id is not null and sinapi_codigo is not null and (subetapa is null or subetapa_orcamento_item_id is not null)
    do update set
      quantidade_total = excluded.quantidade_total,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      subetapa = excluded.subetapa
    returning (xmax = 0) into v_inserted;

    if v_inserted then
      v_criados := v_criados + 1;
    else
      v_atualizados := v_atualizados + 1;
    end if;
  end loop;

  return jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados);
end;
$function$;

grant execute on function public.sincronizar_materiais_orcamento(uuid, uuid, jsonb) to anon, authenticated, service_role;
