-- P4.5 FOCO 1 — fundação de autenticação/autorização (Organização → Processo
-- → Módulo/registro), passo 1 de 2 (schema, aditivo, não mexe em policy
-- nenhuma ainda).
--
-- Confirmado ao vivo (P4.4 seção 8): 5 registros em profiles, 0 em
-- auth.users, nenhum profile vinculado a Supabase Auth; processos.
-- organization_id já existe mas não há tabela de organizações/membros; RLS
-- de praticamente toda tabela operacional é qual=true para anon/public.
--
-- Direção adotada: Supabase Auth como identidade real (auth.users), profiles
-- continua sendo o perfil de negócio (nome/foto/tema/tipo) e ganha um
-- vínculo auth_user_id — não é substituído. organizations/organization_members
-- é a camada mínima que falta para RLS poder filtrar por organização. As
-- policies só são trocadas na migration seguinte, depois que o fluxo de
-- login real estiver funcionando (nunca apertar RLS sem sessão real
-- funcionando primeiro — trocaria "todo mundo entra" por "ninguém entra").

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('owner', 'admin', 'membro')),
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

alter table public.profiles
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists email text unique;

-- Backfill: uma organização (a única empresa real usando o sistema hoje)
-- com todos os profiles atuais como membros; admin vira owner. Idempotente
-- (seguro rodar de novo).
do $$
declare
  v_org_id uuid;
begin
  select id into v_org_id from public.organizations order by created_at limit 1;
  if v_org_id is null then
    insert into public.organizations (nome) values ('BuildSmart') returning id into v_org_id;
  end if;

  insert into public.organization_members (organization_id, profile_id, papel)
  select v_org_id, p.id, case when p.tipo = 'admin' then 'owner' else 'membro' end
  from public.profiles p
  where not exists (select 1 from public.organization_members m where m.profile_id = p.id);

  update public.processos set organization_id = v_org_id where organization_id is null;
end $$;

-- Resolve o profile do usuário autenticado real (auth.uid()) — null quando
-- não há sessão Supabase Auth (equivalente a "anon" para as policies).
create or replace function public.current_profile_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_organization_id is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
    and m.profile_id = public.current_profile_id()
  )
$$;

-- Regra única de acesso por Processo: precisa de sessão real (profile
-- vinculado) sempre; se a linha pertence a um Processo (p_processo_id não
-- nulo), precisa também ser membro da organização daquele Processo. Linhas
-- ainda só ligadas a Obra/Projeto legado (p_processo_id nulo) ficam
-- liberadas para qualquer usuário autenticado — hoje é o mesmo universo de
-- usuários da única organização real, e a ontologia Organização→Processo
-- do Plano Canônico é sobre o caminho novo (Processo), não sobre o legado
-- que está sendo desativado.
create or replace function public.processo_is_accessible(p_processo_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.current_profile_id() is not null
    and (
      p_processo_id is null
      or public.is_org_member((select organization_id from public.processos where id = p_processo_id))
    )
$$;

revoke all on function public.current_profile_id() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.processo_is_accessible(uuid) from public;
grant execute on function public.current_profile_id() to anon, authenticated;
grant execute on function public.is_org_member(uuid) to anon, authenticated;
grant execute on function public.processo_is_accessible(uuid) to anon, authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Leitura liberada a qualquer autenticado (só existe uma organização real
-- hoje); escrita só para quem já é membro da própria organização.
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.current_profile_id() is not null);
create policy organizations_write on public.organizations
  for all to authenticated
  using (public.is_org_member(id))
  with check (public.is_org_member(id));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy organization_members_write on public.organization_members
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
