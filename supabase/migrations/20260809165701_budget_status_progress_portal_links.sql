-- Orçamentos arquivados deixam os módulos operacionais sem perder histórico.
alter table public.orcamentos drop constraint if exists orcamentos_status_check;
alter table public.orcamentos
  add constraint orcamentos_status_check
  check (status in ('rascunho', 'ativo', 'finalizado', 'arquivado'));

alter table public.portal_access_links
  add column if not exists token_hint text;

-- Avanço físico da obra: calcula cada orçamento por peso financeiro e depois
-- tira a média dos orçamentos ainda em acompanhamento.
create or replace function public.obras_avanco_fisico_ativo()
returns table (obra_id uuid, avanco_fisico numeric, orcamentos_ativos integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with itemizado as (
    select
      o.obra_id,
      o.id as orcamento_id,
      coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0) as valor,
      coalesce(e.percentual_executado, 0) as percentual
    from public.orcamentos o
    left join public.orcamento_itens i on i.orcamento_id = o.id
    left join public.etapas e on e.id = i.etapa_id
    where o.obra_id is not null
      and o.status in ('rascunho', 'ativo')
  ), por_orcamento as (
    select
      obra_id,
      orcamento_id,
      case
        when sum(valor) > 0 then sum(valor * percentual) / sum(valor)
        else avg(percentual)
      end as avanco
    from itemizado
    group by obra_id, orcamento_id
  )
  select
    obra_id,
    round(coalesce(avg(avanco), 0), 2) as avanco_fisico,
    count(*)::integer as orcamentos_ativos
  from por_orcamento
  group by obra_id;
$$;

revoke all on function public.obras_avanco_fisico_ativo() from public;
grant execute on function public.obras_avanco_fisico_ativo() to anon, authenticated, service_role;

-- Gestão interna mínima dos links enquanto o BuildSmart ainda usa perfis locais.
-- O token bruto nunca chega ao banco; somente SHA-256 e uma dica curta.
create or replace function public.portal_links_list(
  p_obra_id uuid,
  p_profile_id uuid
)
returns table (
  id uuid,
  nome text,
  ativo boolean,
  token_hint text,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.tipo in ('admin', 'usuario')
  ) then
    raise exception 'portal_link_management_denied' using errcode = '42501';
  end if;

  return query
  select l.id, l.nome, l.ativo, l.token_hint, l.expires_at, l.last_accessed_at, l.created_at
  from public.portal_access_links l
  where l.obra_id = p_obra_id
  order by l.created_at desc;
end;
$$;

create or replace function public.portal_link_create(
  p_obra_id uuid,
  p_profile_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_nome text default 'Acesso do cliente'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare novo_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.tipo in ('admin', 'usuario')
  ) then
    raise exception 'portal_link_management_denied' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'portal_token_hash_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.obras o where o.id = p_obra_id) then
    raise exception 'portal_obra_not_found' using errcode = 'P0002';
  end if;

  insert into public.portal_access_links (obra_id, profile_id, token_hash, token_hint, nome)
  values (p_obra_id, p_profile_id, p_token_hash, left(p_token_hint, 12), nullif(trim(p_nome), ''))
  returning id into novo_id;

  insert into public.portal_audit_log (
    user_id, obra_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo
  ) values (
    p_profile_id, p_obra_id, 'buildsmart', 'portal_link_create', 'portal_access_link', novo_id::text,
    'criar', jsonb_build_object('nome', coalesce(nullif(trim(p_nome), ''), 'Acesso do cliente'))
  );
  return novo_id;
end;
$$;

create or replace function public.portal_link_set_active(
  p_link_id uuid,
  p_obra_id uuid,
  p_profile_id uuid,
  p_ativo boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.tipo in ('admin', 'usuario')
  ) then
    raise exception 'portal_link_management_denied' using errcode = '42501';
  end if;

  update public.portal_access_links
  set ativo = p_ativo
  where id = p_link_id and obra_id = p_obra_id;
  if not found then return false; end if;

  insert into public.portal_audit_log (
    user_id, obra_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo
  ) values (
    p_profile_id, p_obra_id, 'buildsmart', 'portal_link_set_active', 'portal_access_link', p_link_id::text,
    case when p_ativo then 'reativar' else 'desativar' end, jsonb_build_object('ativo', p_ativo)
  );
  return true;
end;
$$;

revoke all on function public.portal_links_list(uuid, uuid) from public, authenticated;
revoke all on function public.portal_link_create(uuid, uuid, text, text, text) from public, authenticated;
revoke all on function public.portal_link_set_active(uuid, uuid, uuid, boolean) from public, authenticated;
grant execute on function public.portal_links_list(uuid, uuid) to anon, service_role;
grant execute on function public.portal_link_create(uuid, uuid, text, text, text) to anon, service_role;
grant execute on function public.portal_link_set_active(uuid, uuid, uuid, boolean) to anon, service_role;
