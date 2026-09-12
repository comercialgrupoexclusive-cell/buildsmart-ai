-- P4.7 — ciclo normal de acesso do SaaS: criar Organização e "Primeiro
-- acesso" de um member pré-cadastrado, os dois inteiramente via Supabase
-- Auth público (signUp/signInWithPassword com a anon key) + RPC SECURITY
-- DEFINER — sem o app (Vercel) nunca precisar da service_role key para
-- cadastro/login normal. Isso tira do caminho normal a dependência
-- operacional do fluxo anterior (bootstrap_owner_tokens + operador rodando
-- um token manualmente) — aquela migration/rota continuam existindo como
-- histórico/escape-hatch, mas nenhuma tela do produto depende delas.
--
-- Convenção de e-mail técnico interno (nunca exposto na UI): mesmo formato
-- de lib/supabase/technical-email.ts, "p-<profile_id>@users.buildsmart.internal".
-- Usado aqui só para permitir Supabase Auth sem coletar e-mail real do
-- usuário; o trigger abaixo faz o vínculo automaticamente assim que o
-- auth.users correspondente é criado.

-- resolver_acesso_organizacao: única leitura pré-sessão sobre organization_
-- members/profiles liberada a anon — nunca a tabela inteira, só o suficiente
-- para a tela de login por Organização decidir entre "Entrar" (member já
-- configurado) e "Primeiro acesso" (member existe, ativo, mas ainda sem
-- auth_user_id), sem vazar quem existe: os três status (nao_encontrado /
-- sem_acesso / ok) e o e-mail técnico calculado são a única informação
-- exposta, nunca senha/hash.
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
    return query select 'sem_acesso'::text, ('p-' || v_profile_id::text || '@users.buildsmart.internal'), v_org_id, v_org_nome;
  else
    return query select 'ok'::text, coalesce(v_stored_email, 'p-' || v_profile_id::text || '@users.buildsmart.internal'), v_org_id, v_org_nome;
  end if;
end;
$$;
revoke all on function public.resolver_acesso_organizacao(text, text) from public;
grant execute on function public.resolver_acesso_organizacao(text, text) to anon, authenticated;

-- Vínculo automático no "Primeiro acesso": quando o e-mail técnico do novo
-- auth.users bate com o padrão p-<profile_id>@users.buildsmart.internal E
-- existe um profile com esse id ainda sem auth_user_id, vincula. Para
-- signUp de Criar Organização (e-mail técnico com um uuid novo, que não é
-- id de profile nenhum ainda) o UPDATE simplesmente não acha linha — sem
-- efeito, sem erro; a ligação desse caso é feita explicitamente por
-- criar_organizacao_publica logo em seguida, na mesma sessão.
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
    v_profile_id := substring(new.email from '^p-([0-9a-fA-F-]{36})@users\.buildsmart\.internal$')::uuid;
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

drop trigger if exists on_auth_user_created_link_profile on auth.users;
create trigger on_auth_user_created_link_profile
  after insert on auth.users
  for each row execute function public.link_profile_on_auth_user_created();

-- criar_organizacao_publica: único caminho para nascer uma Organização nova
-- pelo fluxo público — chamada só por quem já tem sessão Supabase Auth real
-- (signUp acabou de rodar). Cria profile+organization+organization_member
-- (owner) atomicamente; SECURITY DEFINER porque organizations_write/
-- organization_members_write (P4.5) exigem is_org_member, impossível antes
-- de o primeiro membro existir — a própria função é o único jeito de furar
-- esse ovo-e-galinha, e só cria exatamente 1 organização+1 membro (owner)
-- por chamada, nunca membro de organização alheia.
create or replace function public.criar_organizacao_publica(p_org_nome text, p_user_nome text, p_username text)
returns table (organization_id uuid, organization_slug text, profile_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.email();
  v_org_nome text := trim(p_org_nome);
  v_user_nome text := trim(p_user_nome);
  v_username text := trim(p_username);
  v_base_slug text;
  v_slug text;
  v_suffix int := 1;
  v_org_id uuid;
  v_profile_id uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if v_org_nome = '' or v_user_nome = '' or v_username = '' then
    raise exception 'Dados incompletos.' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where auth_user_id = v_uid) then
    raise exception 'Este acesso já está vinculado a um perfil.' using errcode = '23505';
  end if;

  v_base_slug := trim(both '-' from lower(regexp_replace(v_org_nome, '[^a-zA-Z0-9]+', '-', 'g')));
  if v_base_slug = '' then
    v_base_slug := 'org';
  end if;
  v_slug := v_base_slug;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.profiles (name, tipo, auth_user_id, email, pode_excluir, dark_mode, onboarding_done)
  values (v_user_nome, 'usuario', v_uid, v_email, true, true, false)
  returning id into v_profile_id;

  insert into public.organizations (nome, slug, ativo)
  values (v_org_nome, v_slug, true)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, profile_id, papel, username, ativo)
  values (v_org_id, v_profile_id, 'owner', v_username, true);

  return query select v_org_id, v_slug, v_profile_id;
end;
$$;
-- Este projeto tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE em toda
-- função nova do schema public direto para anon/authenticated/service_role
-- (não passa por PUBLIC) — "revoke all ... from public" sozinho não tira
-- esse acesso default de anon. Como esta função só deve rodar com sessão
-- real (auth.uid() não nulo), o revoke explícito de anon é necessário.
revoke all on function public.criar_organizacao_publica(text, text, text) from public;
revoke execute on function public.criar_organizacao_publica(text, text, text) from anon;
grant execute on function public.criar_organizacao_publica(text, text, text) to authenticated;
