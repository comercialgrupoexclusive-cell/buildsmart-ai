-- Regra do documento de reconciliação: sincronizar não é só upsert, é
-- ORÇAMENTO -> conjunto esperado -> compara com materiais existentes ->
-- cria novos -> atualiza existentes -> identifica obsoletos. Substitui a
-- versão anterior (só upsert) por uma que também reconcilia: materiais
-- origem='orcamento' que saíram do conjunto esperado são removidos (se sem
-- histórico) ou marcados ativo=false (se têm compra/lista/requisição).
-- Materiais origem='manual' NUNCA são tocados por esta função.
create or replace function public.sincronizar_materiais_orcamento(
  p_obra_id uuid, p_orcamento_id uuid, p_itens jsonb
) returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_criados int := 0;
  v_atualizados int := 0;
  v_reativados int := 0;
  v_marcados_obsoletos int := 0;
  v_removidos int := 0;
  v_item jsonb;
  v_etapa_id uuid;
  v_sub_id uuid;
  v_codigo text;
  v_descricao text;
  v_unidade text;
  v_qtd numeric;
  v_subetapa_texto text;
  v_inserted boolean;
  v_estava_ativo boolean;
  v_obsoleto record;
  v_tem_lista boolean;
  v_tem_requisicao boolean;
begin
  if p_obra_id is null or p_orcamento_id is null then
    raise exception 'obra_id e orcamento_id sao obrigatorios';
  end if;

  -- Tabela temporária com as chaves do conjunto esperado desta rodada —
  -- usada depois para achar o que NÃO está mais no conjunto (obsoletos).
  create temporary table _chaves_esperadas (
    etapa_id uuid, subetapa_orcamento_item_id uuid, sinapi_codigo text
  ) on commit drop;

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

    insert into _chaves_esperadas values (v_etapa_id, v_sub_id, v_codigo);

    v_subetapa_texto := null;
    if v_sub_id is not null then
      select subetapa into v_subetapa_texto from public.orcamento_itens where id = v_sub_id;
    end if;

    select ativo into v_estava_ativo
    from public.materiais
    where orcamento_id = p_orcamento_id and etapa_id is not distinct from v_etapa_id
      and subetapa_orcamento_item_id is not distinct from v_sub_id and sinapi_codigo = v_codigo
      and origem = 'orcamento';

    insert into public.materiais (
      obra_id, orcamento_id, etapa_id, subetapa, subetapa_orcamento_item_id,
      sinapi_codigo, descricao, unidade, quantidade_total, quantidade_comprada, status_compra,
      origem, ativo
    ) values (
      p_obra_id, p_orcamento_id, v_etapa_id, v_subetapa_texto, v_sub_id,
      v_codigo, v_descricao, v_unidade, v_qtd, 0, 'nao_comprado',
      'orcamento', true
    )
    on conflict (
      obra_id, orcamento_id, coalesce(etapa_id::text, ''), coalesce(subetapa_orcamento_item_id::text, ''), sinapi_codigo
    ) where orcamento_id is not null and sinapi_codigo is not null and (subetapa is null or subetapa_orcamento_item_id is not null)
    do update set
      quantidade_total = excluded.quantidade_total,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      subetapa = excluded.subetapa,
      ativo = true
    returning (xmax = 0) into v_inserted;

    if v_inserted then
      v_criados := v_criados + 1;
    elsif v_estava_ativo is false then
      v_reativados := v_reativados + 1;
    else
      v_atualizados := v_atualizados + 1;
    end if;
  end loop;

  -- Reconciliação: materiais origem='orcamento' ativos deste orçamento que
  -- não aparecem no conjunto esperado desta rodada. Materiais 'manual'
  -- nunca entram aqui (WHERE origem='orcamento' abaixo).
  for v_obsoleto in
    select m.id, m.quantidade_comprada
    from public.materiais m
    where m.orcamento_id = p_orcamento_id and m.origem = 'orcamento' and m.ativo = true
      and m.sinapi_codigo is not null
      and (m.subetapa is null or m.subetapa_orcamento_item_id is not null)
      and not exists (
        select 1 from _chaves_esperadas ce
        where ce.etapa_id is not distinct from m.etapa_id
          and ce.subetapa_orcamento_item_id is not distinct from m.subetapa_orcamento_item_id
          and ce.sinapi_codigo = m.sinapi_codigo
      )
  loop
    select exists (select 1 from public.requisicao_itens ri where ri.material_id = v_obsoleto.id) into v_tem_requisicao;
    select exists (
      select 1 from public.listas_compra lc, jsonb_array_elements(lc.itens) el
      where (el->>'id')::uuid = v_obsoleto.id
    ) into v_tem_lista;

    if v_obsoleto.quantidade_comprada > 0 or v_tem_requisicao or v_tem_lista then
      update public.materiais set ativo = false where id = v_obsoleto.id;
      v_marcados_obsoletos := v_marcados_obsoletos + 1;
    else
      delete from public.materiais where id = v_obsoleto.id;
      v_removidos := v_removidos + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'criados', v_criados, 'atualizados', v_atualizados, 'reativados', v_reativados,
    'marcados_obsoletos', v_marcados_obsoletos, 'removidos', v_removidos
  );
end;
$function$;

grant execute on function public.sincronizar_materiais_orcamento(uuid, uuid, jsonb) to anon, authenticated, service_role;
