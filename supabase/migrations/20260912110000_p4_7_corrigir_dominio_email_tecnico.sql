-- P4.7 hotfix — o Supabase Auth (signUp público) rejeita e-mails no domínio
-- "users.buildsmart.internal" com "Email address is invalid": confirmado ao
-- vivo (usuário testou Primeiro acesso e Criar Organização, os dois
-- falharam com esse erro). ".internal" é um sufixo de uso especial
-- reservado (RFC 9476, na mesma família de .test/.example/.invalid/.local),
-- e o validador de e-mail do GoTrue bloqueia esse tipo de domínio mesmo
-- sendo sintaticamente válido — diferente de auth.admin.createUser (usado
-- pelo bootstrap antigo), que não passa por essa validação.
--
-- Troca para "users.buildsmart.app" (TLD real, não reservado, não exige
-- DNS/MX de verdade pra passar na validação de formato) nos dois lugares
-- que geram/reconhecem esse e-mail no banco. lib/supabase/technical-email.ts
-- (app) e app/api/auth/criar-organizacao/route.ts foram corrigidos junto,
-- no mesmo commit.

create or replace function public.resolver_acesso_organizacao(p_slug text, p_username text)
returns table (status text, email text, organization_id uuid, organization_nome text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_org_nome text;
  v_profile_id uuid;
  v_auth_user_id uuid;
  v_stored_email text;
begin
  select id, nome into v_org_id, v_org_nome from public.organizations where slug = p_slug and ativo = true;
  if v_org_id is null then
    return query select 'nao_encontrado'::text, null::text, null::uuid, null::text;
    return;
  end if;

  select p.id, p.auth_user_id, p.email
    into v_profile_id, v_auth_user_id, v_stored_email
  from public.organization_members m
  join public.profiles p on p.id = m.profile_id
  where m.organization_id = v_org_id
    and lower(m.username) = lower(trim(p_username))
    and coalesce(m.ativo, true)
  limit 1;

  if v_profile_id is null then
    return query select 'nao_encontrado'::text, null::text, null::uuid, null::text;
  elsif v_auth_user_id is null then
    return query select 'sem_acesso'::text, ('p-' || v_profile_id::text || '@users.buildsmart.app'), v_org_id, v_org_nome;
  else
    return query select 'ok'::text, coalesce(v_stored_email, 'p-' || v_profile_id::text || '@users.buildsmart.app'), v_org_id, v_org_nome;
  end if;
end;
$$;

create or replace function public.link_profile_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
begin
  begin
    v_profile_id := substring(new.email from '^p-([0-9a-fA-F-]{36})@users\.buildsmart\.app$')::uuid;
  exception when others then
    v_profile_id := null;
  end;

  if v_profile_id is not null then
    update public.profiles
       set auth_user_id = new.id, email = new.email
     where id = v_profile_id
       and auth_user_id is null;
  end if;

  return new;
end;
$$;
