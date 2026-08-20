-- Atribuição de usuário nas reversões automáticas de conferência + RPC única
-- para os pontos de edição interativa do orçamento (ObraOrcamento.tsx) que
-- podem alterar conteúdo já conferido. A RPC seta um GUC transaction-local
-- (app.current_profile_id) que os triggers de invalidação leem para gravar
-- o usuario_id real em vez de null.

create or replace function public.orcamento_atualizar_com_ator(
  p_tabela text,
  p_ids uuid[],
  p_patch jsonb,
  p_profile_id uuid
) returns setof uuid
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_profile_id is null or not exists (
    select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')
  ) then
    raise exception 'edicao_nao_autorizada' using errcode = '42501';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  perform set_config('app.current_profile_id', p_profile_id::text, true);

  if p_tabela = 'etapas' then
    return query update public.etapas t set
      nome = case when p_patch ? 'nome' then p_patch->>'nome' else t.nome end
    where t.id = any(p_ids)
    returning t.id;

  elsif p_tabela = 'orcamento_itens' then
    return query update public.orcamento_itens t set
      composicao_id = case when p_patch ? 'composicao_id' then (p_patch->>'composicao_id')::uuid else t.composicao_id end,
      sinapi_composicao_id = case when p_patch ? 'sinapi_composicao_id' then (p_patch->>'sinapi_composicao_id')::uuid else t.sinapi_composicao_id end,
      quantidade = case when p_patch ? 'quantidade' then (p_patch->>'quantidade')::numeric else t.quantidade end,
      preco_unitario_snapshot = case when p_patch ? 'preco_unitario_snapshot' then (p_patch->>'preco_unitario_snapshot')::numeric else t.preco_unitario_snapshot end,
      descricao_snapshot = case when p_patch ? 'descricao_snapshot' then p_patch->>'descricao_snapshot' else t.descricao_snapshot end,
      codigo_snapshot = case when p_patch ? 'codigo_snapshot' then p_patch->>'codigo_snapshot' else t.codigo_snapshot end,
      unidade_snapshot = case when p_patch ? 'unidade_snapshot' then p_patch->>'unidade_snapshot' else t.unidade_snapshot end,
      etapa_id = case when p_patch ? 'etapa_id' then (p_patch->>'etapa_id')::uuid else t.etapa_id end,
      subetapa = case when p_patch ? 'subetapa' then p_patch->>'subetapa' else t.subetapa end,
      tipo_linha = case when p_patch ? 'tipo_linha' then p_patch->>'tipo_linha' else t.tipo_linha end,
      subetapa_valor_manual = case when p_patch ? 'subetapa_valor_manual' then (p_patch->>'subetapa_valor_manual')::numeric else t.subetapa_valor_manual end,
      subetapa_valor_manual_ativo = case when p_patch ? 'subetapa_valor_manual_ativo' then (p_patch->>'subetapa_valor_manual_ativo')::boolean else t.subetapa_valor_manual_ativo end,
      classificacao_snapshot = case when p_patch ? 'classificacao_snapshot' then p_patch->>'classificacao_snapshot' else t.classificacao_snapshot end,
      grupo_snapshot = case when p_patch ? 'grupo_snapshot' then p_patch->>'grupo_snapshot' else t.grupo_snapshot end,
      subetapa_categoria_snapshot = case when p_patch ? 'subetapa_categoria_snapshot' then p_patch->>'subetapa_categoria_snapshot' else t.subetapa_categoria_snapshot end,
      tipo_item_snapshot = case when p_patch ? 'tipo_item_snapshot' then p_patch->>'tipo_item_snapshot' else t.tipo_item_snapshot end,
      valor_total_informado_snapshot = case when p_patch ? 'valor_total_informado_snapshot' then (p_patch->>'valor_total_informado_snapshot')::numeric else t.valor_total_informado_snapshot end,
      valor_total_manual_ativo = case when p_patch ? 'valor_total_manual_ativo' then (p_patch->>'valor_total_manual_ativo')::boolean else t.valor_total_manual_ativo end,
      importacao_alertas = case when p_patch ? 'importacao_alertas' then p_patch->'importacao_alertas' else t.importacao_alertas end
    where t.id = any(p_ids)
    returning t.id;

  elsif p_tabela = 'orcamento_item_insumos' then
    return query update public.orcamento_item_insumos t set
      valor_total_divergente = case when p_patch ? 'valor_total_divergente' then (p_patch->>'valor_total_divergente')::boolean else t.valor_total_divergente end,
      valor_total_informado_snapshot = case when p_patch ? 'valor_total_informado_snapshot' then p_patch->>'valor_total_informado_snapshot' else t.valor_total_informado_snapshot::text end::numeric
    where t.id = any(p_ids)
    returning t.id;

  else
    raise exception 'tabela_invalida: %', p_tabela;
  end if;
end;
$$;

create or replace function public.trg_invalidar_verificacao_etapas()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.verificado is true and new.orcamento_id is not null and old.nome is distinct from new.nome then
    new.verificado := false;
    new.verificado_por := null;
    new.verificado_em := null;
    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    values (new.orcamento_id, 'etapa', new.id, 'alterado_apos_verificacao',
      nullif(current_setting('app.current_profile_id', true), '')::uuid,
      jsonb_build_object('nome', old.nome), jsonb_build_object('nome', new.nome));
  end if;
  return new;
end;
$$;

create or replace function public.trg_invalidar_verificacao_orcamento_itens()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  ignore_keys text[] := array['verificado','verificado_por','verificado_em','created_at','updated_at','ordem','data_inicio','data_fim'];
  old_j jsonb; new_j jsonb; k text;
begin
  if old.verificado is true then
    old_j := to_jsonb(old); new_j := to_jsonb(new);
    foreach k in array ignore_keys loop
      old_j := old_j - k; new_j := new_j - k;
    end loop;
    if old_j is distinct from new_j then
      new.verificado := false;
      new.verificado_por := null;
      new.verificado_em := null;
      insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
      values (new.orcamento_id, case when new.tipo_linha = 'subetapa' then 'subetapa' else 'item' end, new.id, 'alterado_apos_verificacao',
        nullif(current_setting('app.current_profile_id', true), '')::uuid, old_j, new_j);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trg_invalidar_verificacao_orcamento_item_insumos()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  ignore_keys text[] := array['verificado','verificado_por','verificado_em','ordem'];
  old_j jsonb; new_j jsonb; k text; orc_id uuid;
begin
  if old.verificado is true then
    old_j := to_jsonb(old); new_j := to_jsonb(new);
    foreach k in array ignore_keys loop
      old_j := old_j - k; new_j := new_j - k;
    end loop;
    if old_j is distinct from new_j then
      new.verificado := false;
      new.verificado_por := null;
      new.verificado_em := null;
      select oi.orcamento_id into orc_id from public.orcamento_itens oi where oi.id = new.orcamento_item_id;
      if orc_id is not null then
        insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
        values (orc_id, 'insumo', new.id, 'alterado_apos_verificacao',
          nullif(current_setting('app.current_profile_id', true), '')::uuid, old_j, new_j);
      end if;
    end if;
  end if;
  return new;
end;
$$;
