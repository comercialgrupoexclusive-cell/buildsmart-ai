-- Preferências da Visão Geral por usuário + organização + módulo: ordem dos
-- widgets e quais estão ocultos. Enquanto esta tabela não existe, a Visão Geral
-- funciona só com localStorage (por dispositivo); com ela, a preferência passa a
-- valer cross-device por usuário. Ver lib/dashboard/preferencias.ts.
--
-- Rollback: drop table public.dashboard_preferencias;

create table if not exists public.dashboard_preferencias (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  modulo text not null,
  ordem text[] not null default '{}',
  ocultos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, modulo)
);

comment on table public.dashboard_preferencias is
  'Preferências da Visão Geral por usuário+módulo: ordem e ocultos dos widgets. organization_id é rótulo de contexto; a identidade da linha é (profile_id, modulo).';

alter table public.dashboard_preferencias enable row level security;

-- Cada um só enxerga e escreve as próprias preferências.
create policy dashboard_preferencias_rw on public.dashboard_preferencias
  for all to authenticated
  using (profile_id = public.current_profile_id())
  with check (profile_id = public.current_profile_id());

revoke all on public.dashboard_preferencias from public, anon, authenticated;
grant select, insert, update, delete on public.dashboard_preferencias to authenticated;
