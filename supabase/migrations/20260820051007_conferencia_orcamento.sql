-- Conferencia do Orcamento (QA/revisao) -- NAO e execucao fisica, conclusao
-- de servico, publicacao no Portal, nem altera calculo financeiro algum.
-- Hierarquia conferivel: etapa -> subetapa/item (ambos em orcamento_itens,
-- diferenciados por tipo_linha) -> insumo (orcamento_item_insumos).

alter table public.etapas
  add column verificado boolean not null default false,
  add column verificado_por uuid references public.profiles(id),
  add column verificado_em timestamptz;

alter table public.orcamento_itens
  add column verificado boolean not null default false,
  add column verificado_por uuid references public.profiles(id),
  add column verificado_em timestamptz;

alter table public.orcamento_item_insumos
  add column verificado boolean not null default false,
  add column verificado_por uuid references public.profiles(id),
  add column verificado_em timestamptz;

-- Historico unico (nao uma tabela por nivel), suficiente para responder
-- "quem conferiu" / "quem reabriu" / "quem alterou algo ja conferido" sem
-- virar sistema de versionamento.
create table public.orcamento_verificacao_historico (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos(id) on delete cascade,
  entidade_tipo text not null check (entidade_tipo in ('etapa','subetapa','item','insumo')),
  entidade_id uuid not null,
  acao text not null check (acao in ('verificado','reaberto','alterado_apos_verificacao','verificacao_em_lote')),
  usuario_id uuid references public.profiles(id),
  valor_anterior jsonb,
  valor_novo jsonb,
  created_at timestamptz not null default now()
);
create index idx_orc_verif_hist_orcamento on public.orcamento_verificacao_historico(orcamento_id, created_at desc);
create index idx_orc_verif_hist_entidade on public.orcamento_verificacao_historico(entidade_tipo, entidade_id, created_at desc);

alter table public.orcamento_verificacao_historico enable row level security;
create policy bs_mvp_select_all on public.orcamento_verificacao_historico for select using (true);
create policy bs_mvp_insert_all on public.orcamento_verificacao_historico for insert with check (true);

-- RPC unica que marca/desmarca conferencia, com cascata opcional para
-- filhos, gravando o profile responsavel (mesmo padrao de autorizacao ja
-- usado em iniciar_obra_por_orcamento/finalizar_orcamento: SECURITY DEFINER
-- validando p_profile_id contra profiles, chamada direto do browser).
create or replace function public.orcamento_verificacao_marcar(
  p_orcamento_id uuid,
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_acao text,
  p_profile_id uuid,
  p_incluir_filhos boolean default false
) returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  marcado boolean;
  agora timestamptz := now();
  acao_primaria text;
  etapa_ids uuid[] := '{}';
  subetapa_row_ids uuid[] := '{}';
  item_ids uuid[] := '{}';
  insumo_ids uuid[] := '{}';
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'verificacao_nao_autorizada' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orcamentos where id = p_orcamento_id) then
    raise exception 'orcamento_invalido';
  end if;
  if p_acao not in ('verificar','reabrir') then
    raise exception 'acao_invalida';
  end if;
  if p_entidade_tipo not in ('etapa','subetapa','item','insumo') then
    raise exception 'entidade_invalida';
  end if;

  marcado := (p_acao = 'verificar');
  acao_primaria := case when marcado then 'verificado' else 'reaberto' end;

  if p_entidade_tipo = 'etapa' then
    if not exists (select 1 from public.etapas where id = p_entidade_id and orcamento_id = p_orcamento_id) then
      raise exception 'etapa_invalida';
    end if;
    etapa_ids := array[p_entidade_id];
    if p_incluir_filhos then
      select coalesce(array_agg(id) filter (where tipo_linha = 'subetapa'), '{}'),
             coalesce(array_agg(id) filter (where tipo_linha = 'item'), '{}')
        into subetapa_row_ids, item_ids
      from public.orcamento_itens
      where orcamento_id = p_orcamento_id and etapa_id = p_entidade_id;
    end if;

  elsif p_entidade_tipo = 'subetapa' then
    if not exists (select 1 from public.orcamento_itens where id = p_entidade_id and orcamento_id = p_orcamento_id and tipo_linha = 'subetapa') then
      raise exception 'subetapa_invalida';
    end if;
    subetapa_row_ids := array[p_entidade_id];
    select coalesce(array_agg(oi.id), '{}') into item_ids
    from public.orcamento_itens oi
    join public.orcamento_itens sm on sm.id = p_entidade_id
    where oi.orcamento_id = p_orcamento_id and oi.tipo_linha = 'item' and oi.etapa_id = sm.etapa_id
      and lower(trim(coalesce(oi.subetapa, ''))) = lower(trim(coalesce(sm.subetapa, '')));

  elsif p_entidade_tipo = 'item' then
    if not exists (select 1 from public.orcamento_itens where id = p_entidade_id and orcamento_id = p_orcamento_id and tipo_linha = 'item') then
      raise exception 'item_invalido';
    end if;
    item_ids := array[p_entidade_id];

  elsif p_entidade_tipo = 'insumo' then
    if not exists (
      select 1 from public.orcamento_item_insumos oii
      join public.orcamento_itens oi on oi.id = oii.orcamento_item_id
      where oii.id = p_entidade_id and oi.orcamento_id = p_orcamento_id
    ) then
      raise exception 'insumo_invalido';
    end if;
    insumo_ids := array[p_entidade_id];
  end if;

  -- Item sempre carrega seus insumos junto (regra fixa, sem confirmacao);
  -- subetapa e etapa(com filhos) tambem alcancam os insumos via seus itens.
  if array_length(item_ids, 1) > 0 then
    select insumo_ids || coalesce(array_agg(id), '{}') into insumo_ids
    from public.orcamento_item_insumos where orcamento_item_id = any(item_ids);
  end if;

  if array_length(etapa_ids, 1) > 0 then
    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    select p_orcamento_id, 'etapa', id,
      case when id = p_entidade_id then acao_primaria else 'verificacao_em_lote' end,
      p_profile_id, jsonb_build_object('verificado', verificado), jsonb_build_object('verificado', marcado)
    from public.etapas where id = any(etapa_ids);

    update public.etapas set
      verificado = marcado,
      verificado_por = case when marcado then p_profile_id else null end,
      verificado_em = case when marcado then agora else null end
    where id = any(etapa_ids);
  end if;

  if array_length(subetapa_row_ids, 1) > 0 or array_length(item_ids, 1) > 0 then
    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    select p_orcamento_id, case when tipo_linha = 'subetapa' then 'subetapa' else 'item' end, id,
      case when id = p_entidade_id then acao_primaria else 'verificacao_em_lote' end,
      p_profile_id, jsonb_build_object('verificado', verificado), jsonb_build_object('verificado', marcado)
    from public.orcamento_itens where id = any(subetapa_row_ids || item_ids);

    update public.orcamento_itens set
      verificado = marcado,
      verificado_por = case when marcado then p_profile_id else null end,
      verificado_em = case when marcado then agora else null end
    where id = any(subetapa_row_ids || item_ids);
  end if;

  if array_length(insumo_ids, 1) > 0 then
    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    select p_orcamento_id, 'insumo', id,
      case when id = p_entidade_id then acao_primaria else 'verificacao_em_lote' end,
      p_profile_id, jsonb_build_object('verificado', verificado), jsonb_build_object('verificado', marcado)
    from public.orcamento_item_insumos where id = any(insumo_ids);

    update public.orcamento_item_insumos set
      verificado = marcado,
      verificado_por = case when marcado then p_profile_id else null end,
      verificado_em = case when marcado then agora else null end
    where id = any(insumo_ids);
  end if;

  return jsonb_build_object(
    'ok', true, 'acao', p_acao,
    'etapas', coalesce(array_length(etapa_ids,1),0),
    'subetapas', coalesce(array_length(subetapa_row_ids,1),0),
    'itens', coalesce(array_length(item_ids,1),0),
    'insumos', coalesce(array_length(insumo_ids,1),0)
  );
end;
$$;

-- Invalidacao automatica: se algo ja conferido for alterado (nao pela
-- propria RPC de conferencia, que so toca as 3 colunas verificado*), volta
-- para pendente e registra no historico. So compara o CONTEUDO relevante ao
-- orcamento -- ignora campos de execucao/cronograma/agenda que pertencem a
-- outros modulos (medicoes, planejamento).
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
    values (new.orcamento_id, 'etapa', new.id, 'alterado_apos_verificacao', null,
      jsonb_build_object('nome', old.nome), jsonb_build_object('nome', new.nome));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_etapas_invalidar_verificacao on public.etapas;
create trigger trg_etapas_invalidar_verificacao
before update on public.etapas
for each row execute function public.trg_invalidar_verificacao_etapas();

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
      values (new.orcamento_id, case when new.tipo_linha = 'subetapa' then 'subetapa' else 'item' end, new.id, 'alterado_apos_verificacao', null, old_j, new_j);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orcamento_itens_invalidar_verificacao on public.orcamento_itens;
create trigger trg_orcamento_itens_invalidar_verificacao
before update on public.orcamento_itens
for each row execute function public.trg_invalidar_verificacao_orcamento_itens();

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
        values (orc_id, 'insumo', new.id, 'alterado_apos_verificacao', null, old_j, new_j);
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orcamento_item_insumos_invalidar_verificacao on public.orcamento_item_insumos;
create trigger trg_orcamento_item_insumos_invalidar_verificacao
before update on public.orcamento_item_insumos
for each row execute function public.trg_invalidar_verificacao_orcamento_item_insumos();
