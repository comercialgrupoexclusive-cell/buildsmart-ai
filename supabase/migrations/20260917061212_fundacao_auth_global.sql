-- Global identity, closed invitations and a server-validated tenant per Auth session.
-- Additive: historical business rows and legacy profile/membership columns are retained.
-- Legacy memberships are deliberately NOT promoted to trusted global memberships.
-- Their earlier API allowed self-assignment: an operator must explicitly reapprove them.
-- Rollback: restore a database backup or forward-fix. Do not restore permissive policies
-- or the public technical-email claim trigger as an application rollback.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

alter table public.organization_members
  add column user_id uuid references auth.users(id) on delete cascade,
  add column role text check (role in ('owner', 'admin', 'member'));
alter table public.organization_members add constraint membership_global_identity_pair
  check ((user_id is null and role is null) or (user_id is not null and role is not null));
create unique index organization_members_global_user_key
  on public.organization_members (organization_id, user_id) where user_id is not null;

create table app_private.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table app_private.auth_invitations (
  email text primary key check (email = lower(trim(email))),
  organization_id uuid references public.organizations(id),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  platform_admin boolean not null default false,
  expires_at timestamptz,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create table app_private.session_organizations (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  selected_at timestamptz not null default now()
);
create table app_private.auth_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  event text not null,
  organization_id uuid,
  subject_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table app_private.platform_admins enable row level security;
alter table app_private.auth_invitations enable row level security;
alter table app_private.session_organizations enable row level security;
alter table app_private.auth_audit_log enable row level security;
revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all sequences in schema app_private from public, anon, authenticated;

create function app_private.live_session_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_session uuid;
begin
  if auth.uid() is null then return null; end if;
  begin v_session := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then return null; end;
  return (select s.id from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = v_session and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now()));
end $$;

create or replace function public.current_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.auth_user_id = auth.uid() and app_private.live_session_id() is not null
$$;

-- This helper intentionally does not require a selection: the selector needs all
-- active memberships. Operational policies also require current_organization_id().
create or replace function public.is_org_member(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.live_session_id() is not null and exists (
    select 1 from public.organization_members m join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and m.organization_id = p_organization_id
      and m.ativo and o.ativo and m.role in ('owner', 'admin', 'member'))
$$;
create function public.current_organization_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.organization_id from app_private.session_organizations s
  where s.session_id = app_private.live_session_id() and s.user_id = auth.uid()
    and public.is_org_member(s.organization_id)
$$;
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.live_session_id() is not null
    and exists (select 1 from app_private.platform_admins a where a.user_id = auth.uid())
$$;
create or replace function public.processo_is_accessible(p_processo_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_processo_id is not null and exists (
    select 1 from public.processos p where p.id = p_processo_id
      and p.organization_id = public.current_organization_id()
      and public.is_org_member(p.organization_id))
$$;
create function public.select_organization(p_organization_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_session uuid := app_private.live_session_id(); v_previous uuid;
begin
  if v_session is null or not public.is_org_member(p_organization_id) then
    raise exception 'Organization access denied' using errcode = '42501';
  end if;
  select organization_id into v_previous from app_private.session_organizations where session_id = v_session;
  insert into app_private.session_organizations(session_id,user_id,organization_id)
    values (v_session,auth.uid(),p_organization_id)
    on conflict (session_id) do update set organization_id = excluded.organization_id, selected_at = now();
  insert into app_private.auth_audit_log(actor_user_id,event,organization_id,details)
    values (auth.uid(),'organization_selected',p_organization_id,jsonb_build_object('previous_organization_id',v_previous,'session_id',v_session));
  return p_organization_id;
end $$;
create function public.log_auth_event(p_event text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if app_private.live_session_id() is null then
    raise exception 'Active session required' using errcode = '42501';
  end if;
  if p_event is null or p_event not in ('login','logout','password_recovery','password_changed') then
    raise exception 'Unsupported authentication event' using errcode = '22023';
  end if;
  insert into app_private.auth_audit_log(actor_user_id,event,organization_id,details)
    values (auth.uid(),p_event,public.current_organization_id(),jsonb_build_object('source','authenticated_client','session_id',app_private.live_session_id()));
end $$;

-- No arbitrary profile linking, registration or tenant management through old RPCs.
drop trigger if exists on_auth_user_created_link_profile on auth.users;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname in
      ('criar_organizacao_publica','resolver_acesso_organizacao','link_profile_on_auth_user_created',
       'organizacoes_publicas','organizacao_tema_publico',
       -- Verified in 20260820060020 / 20260825044232: these trust caller-supplied
       -- p_profile_id and bypass tenant RLS. Quarantine until contextual wrappers.
       'orcamento_atualizar_com_ator','orcamento_verificacao_marcar')
      or p.proname ~ '(claim|bootstrap)')
  loop execute format('revoke all on function %s from public, anon, authenticated',f.signature); end loop;
end $$;

create function app_private.provision_invited_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user auth.users%rowtype; v_invite app_private.auth_invitations%rowtype; v_profile uuid;
begin
  select * into v_user from auth.users where id=p_user_id;
  if v_user.id is null or v_user.email_confirmed_at is null then return; end if;
  select * into v_invite from app_private.auth_invitations where email=lower(trim(v_user.email)) for update;
  if not found or (v_invite.expires_at is not null and v_invite.expires_at <= now())
      or (v_invite.accepted_by is not null and v_invite.accepted_by <> p_user_id) then return; end if;
  select id into v_profile from public.profiles where auth_user_id=p_user_id;
  if v_profile is null then
    insert into public.profiles(name,email,auth_user_id,tipo,pode_excluir)
      values (split_part(v_user.email,'@',1),lower(v_user.email),p_user_id,'usuario',false) returning id into v_profile;
  end if;
  if v_invite.organization_id is not null then
    insert into public.organization_members(organization_id,profile_id,user_id,role,papel,ativo)
      values(v_invite.organization_id,v_profile,p_user_id,v_invite.role,
        case when v_invite.role='member' then 'membro' else v_invite.role end,true)
      on conflict (organization_id,profile_id) do update
        set user_id=excluded.user_id,role=excluded.role,papel=excluded.papel,ativo=true;
  end if;
  if v_invite.platform_admin then
    insert into app_private.platform_admins(user_id) values(p_user_id) on conflict do nothing;
  end if;
  update app_private.auth_invitations set accepted_by=p_user_id,accepted_at=coalesce(accepted_at,now()) where email=v_invite.email;
  insert into app_private.auth_audit_log(actor_user_id,event,subject_user_id,organization_id)
    values(null,'invitation_accepted',p_user_id,v_invite.organization_id);
end $$;
create function app_private.enforce_closed_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from app_private.auth_invitations i
      where i.email=lower(trim(new.email)) and i.accepted_by is null
      and (i.expires_at is null or i.expires_at>now())) then
    raise exception 'Registration requires an approved invitation' using errcode = '42501';
  end if;
  return new;
end $$;
create function app_private.on_invited_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and (tg_op='INSERT' or old.email_confirmed_at is null) then
    perform app_private.provision_invited_user(new.id);
  end if;
  return new;
end $$;
create trigger auth_global_closed_signup before insert on auth.users
  for each row execute function app_private.enforce_closed_signup();
create trigger auth_global_invitation_confirmed after insert or update of email_confirmed_at on auth.users
  for each row execute function app_private.on_invited_user_confirmed();

create function app_private.audit_access_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into app_private.auth_audit_log(actor_user_id,event,organization_id,subject_user_id,details)
    values(auth.uid(),case when tg_table_name='platform_admins' then 'platform_admin_changed' else 'membership_changed' end,
      (v_row->>'organization_id')::uuid,(v_row->>'user_id')::uuid,
      jsonb_build_object('operation',tg_op,'old',case when tg_op<>'INSERT' then to_jsonb(old) end,
        'new',case when tg_op<>'DELETE' then to_jsonb(new) end));
  return coalesce(new,old);
end $$;
create trigger membership_access_audit after insert or update or delete on public.organization_members
  for each row execute function app_private.audit_access_changes();
create trigger platform_admin_access_audit after insert or update or delete on app_private.platform_admins
  for each row execute function app_private.audit_access_changes();

-- Replace every historical policy on identity tables, including unknown permissive
-- names. Column grants prevent changing authority, linkage and the legacy password.
do $$ declare p record; begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('profiles','organizations','organization_members') loop
    execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
revoke all on public.profiles,public.organizations,public.organization_members from public,anon,authenticated;
grant select on public.profiles,public.organizations,public.organization_members to authenticated;
grant update(name,photo_url,theme_color,dark_mode,onboarding_done,apelido,descricao,cidade,estado) on public.profiles to authenticated;
create policy global_profile_self_read on public.profiles for select to authenticated
  using(auth_user_id=auth.uid() and app_private.live_session_id() is not null);
create policy global_profile_self_edit on public.profiles for update to authenticated
  using(auth_user_id=auth.uid() and app_private.live_session_id() is not null)
  with check(auth_user_id=auth.uid() and app_private.live_session_id() is not null);
create policy global_memberships_self_read on public.organization_members for select to authenticated
  using(user_id=auth.uid() and ativo and public.is_org_member(organization_id));
create policy global_organizations_member_read on public.organizations for select to authenticated
  using(public.is_org_member(id));

-- Restrictive guards cannot be OR'ed away by older permissive policies.
-- Every directly linked Processo row fails closed when its process is NULL.
do $$ declare t record; begin
  for t in select c.table_name from information_schema.columns c
    join information_schema.tables tbl on tbl.table_schema=c.table_schema and tbl.table_name=c.table_name
    where c.table_schema='public' and c.column_name='processo_id' and tbl.table_type='BASE TABLE' loop
    execute format('alter table public.%I enable row level security',t.table_name);
    execute format('create policy auth_global_process_guard on public.%I as restrictive for all to public using (public.processo_is_accessible(processo_id)) with check (public.processo_is_accessible(processo_id))',t.table_name);
  end loop;
end $$;
create policy auth_global_tenant_guard on public.processos as restrictive for all to public
  using(organization_id=public.current_organization_id() and public.is_org_member(organization_id))
  with check(organization_id=public.current_organization_id() and public.is_org_member(organization_id));

-- Indirect engine rows, including board_files with no board, are also closed.
do $$ declare t record; begin
  for t in select * from (values
    ('orcamento_itens','public.processo_is_accessible((select o.processo_id from public.orcamentos o where o.id=orcamento_id))'),
    ('orcamento_item_insumos','public.processo_is_accessible((select o.processo_id from public.orcamentos o join public.orcamento_itens i on i.orcamento_id=o.id where i.id=orcamento_item_id))'),
    ('medicao_itens','public.processo_is_accessible((select m.processo_id from public.medicoes m where m.id=medicao_id))'),
    ('compra_pagamentos','public.processo_is_accessible((select c.processo_id from public.compra_itens c where c.id=compra_item_id))'),
    ('requisicao_itens','public.processo_is_accessible((select r.processo_id from public.requisicoes_compra r where r.id=requisicao_id))'),
    ('financiamento_medicao_itens','public.processo_is_accessible((select m.processo_id from public.financiamento_medicoes m where m.id=medicao_id))'),
    ('board_items','public.processo_is_accessible((select b.processo_id from public.boards b where b.id=board_id))'),
    ('board_files','public.processo_is_accessible((select b.processo_id from public.boards b where b.id=board_id))')
  ) as guards(table_name,predicate) loop
    if to_regclass('public.'||t.table_name) is not null then
      execute format('alter table public.%I enable row level security',t.table_name);
      execute format('create policy auth_global_parent_guard on public.%I as restrictive for all to public using (%s) with check (%s)',t.table_name,t.predicate,t.predicate);
    end if;
  end loop;
end $$;

-- Explicit grants override this project's broad historical default EXECUTE grants.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.live_session_id() to authenticated;
revoke all on function public.current_profile_id(),public.is_org_member(uuid),
  public.current_organization_id(),public.is_platform_admin(),public.processo_is_accessible(uuid),
  public.select_organization(uuid),public.log_auth_event(text) from public,anon,authenticated;
grant execute on function public.current_profile_id(),public.is_org_member(uuid),
  public.current_organization_id(),public.is_platform_admin(),public.processo_is_accessible(uuid),
  public.select_organization(uuid),public.log_auth_event(text) to authenticated;
-- Anon policies may evaluate helpers; they only ever return NULL/false without Auth.
grant execute on function public.current_organization_id(),public.is_org_member(uuid),
  public.processo_is_accessible(uuid) to anon;

insert into public.organizations(nome,slug,ativo) values('Sandbox','sandbox',true)
  on conflict(slug) do nothing;
insert into app_private.auth_invitations(email,organization_id,role,platform_admin)
  select 'comercialgrupoexclusive@gmail.com',id,'owner',true from public.organizations where slug='sandbox';
do $$ declare v_user uuid; begin
  select id into v_user from auth.users where lower(email)='comercialgrupoexclusive@gmail.com' and email_confirmed_at is not null;
  if v_user is not null then perform app_private.provision_invited_user(v_user); end if;
end $$;
commit;
