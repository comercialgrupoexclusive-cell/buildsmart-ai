-- Minimal pre-migration schema, retaining real types, constraints, policies and
-- PostgreSQL roles. PGlite runs PostgreSQL itself; no JavaScript authorization mocks.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
grant usage on schema auth, public to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text unique,
  email_confirmed_at timestamptz, banned_until timestamptz,
  raw_user_meta_data jsonb not null default '{}'
);
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  not_after timestamptz
);
create function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt()->>'email' $$;
create table public.profiles (
  id uuid primary key default gen_random_uuid(),name text not null,
  photo_url text,theme_color text not null default '#3B7BF8',
  dark_mode boolean not null default true,onboarding_done boolean not null default false,
  password_hash text,created_at timestamptz not null default now(),
  tipo text not null default 'usuario',apelido text,descricao text,cidade text,estado text,
  pode_excluir boolean not null default true
);
create table public.processos (id uuid primary key default gen_random_uuid(),organization_id uuid,nome text);
create table public.orcamentos (id uuid primary key default gen_random_uuid(),processo_id uuid references public.processos(id),nome text);
create table public.orcamento_itens(id uuid primary key default gen_random_uuid(),orcamento_id uuid references public.orcamentos(id),nome text);
create table public.boards(id uuid primary key default gen_random_uuid(),processo_id uuid references public.processos(id));
create table public.board_files(id uuid primary key default gen_random_uuid(),board_id uuid references public.boards(id));
create table public.legacy_secrets(id uuid primary key default gen_random_uuid(),secret text);
create function public.legacy_security_definer() returns bigint language sql security definer as $$select count(*) from public.processos$$;
-- Reproduce the broad historical defaults: revoking PUBLIC alone is insufficient.
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
grant execute on function public.legacy_security_definer() to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
grant all on all tables in schema public to anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['profiles','processos','orcamentos','orcamento_itens','boards','board_files','legacy_secrets'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy historical_open_policy on public.%I for all to public using(true) with check(true)',t);
 end loop;
end $$;
