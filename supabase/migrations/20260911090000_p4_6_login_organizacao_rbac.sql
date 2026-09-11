-- P4.6 Bloco A — Login MVP por Organização (usuário + senha, tema, RBAC).
--
-- Aditivo sobre a fundação da P4.5 (organizations/organization_members/
-- profiles.auth_user_id já existem) — não desfaz nada, só estende:
-- Supabase Auth continua sendo a identidade/sessão real; profiles continua
-- sendo o perfil de negócio. O que muda é a experiência: em vez de e-mail,
-- o usuário digita um "usuário" (username) único DENTRO da sua
-- organização, resolvido no servidor para o e-mail técnico interno via
-- app/api/auth/login-organizacao (nunca exposto na UI).

alter table public.organizations
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists cor_principal text,
  add column if not exists cor_destaque text,
  add column if not exists cor_fundo_login text,
  add column if not exists ativo boolean not null default true;

update public.organizations set slug = 'buildsmart' where slug is null and nome = 'BuildSmart';
update public.organizations set slug = lower(regexp_replace(nome, '[^a-zA-Z0-9]+', '-', 'g')) where slug is null;

alter table public.organizations alter column slug set not null;
create unique index if not exists organizations_slug_key on public.organizations (slug);

-- username: identificador de login, único por organização (não global —
-- duas organizações podem ter usuários "rodrigo" sem colidir). ativo:
-- suporta desativar/revogar acesso sem apagar o vínculo (histórico).
alter table public.organization_members
  add column if not exists username text,
  add column if not exists ativo boolean not null default true;

alter table public.organization_members drop constraint if exists organization_members_papel_check;
alter table public.organization_members
  add constraint organization_members_papel_check check (papel in ('owner', 'admin', 'membro', 'convidado'));

create unique index if not exists organization_members_org_username_key
  on public.organization_members (organization_id, lower(username))
  where username is not null;

-- Concessão explícita de Processo a membro CONVIDADO — relação mínima, não
-- um framework genérico de permissões. Membros owner/admin/membro não
-- precisam de linha aqui (acesso já é por organização inteira).
create table if not exists public.processo_convidados (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (processo_id, profile_id)
);
alter table public.processo_convidados enable row level security;

-- current_profile_id/is_org_member (P4.5) passam a respeitar `ativo`
-- (membro desativado perde acesso sem precisar apagar o histórico do
-- vínculo). processo_is_accessible (P4.5) ganha a regra do CONVIDADO —
-- mesma assinatura, então todas as ~20 policies que já a usam (P4.5) valem
-- automaticamente sem precisar recriar nenhuma.
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p_organization_id is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
    and m.profile_id = public.current_profile_id()
    and coalesce(m.ativo, true)
  )
$$;

create or replace function public.processo_is_accessible(p_processo_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.current_profile_id() is not null
    and (
      p_processo_id is null
      or exists (
        select 1 from public.processos p
        join public.organization_members m on m.organization_id = p.organization_id
        where p.id = p_processo_id
          and m.profile_id = public.current_profile_id()
          and coalesce(m.ativo, true)
          and (
            m.papel <> 'convidado'
            or exists (
              select 1 from public.processo_convidados pc
              where pc.processo_id = p_processo_id and pc.profile_id = public.current_profile_id()
            )
          )
      )
    )
$$;

-- processo_convidados: quem já tem acesso ao Processo (via
-- processo_is_accessible, que agora consulta esta própria tabela por
-- dentro de uma função SECURITY DEFINER — sem recursão de RLS) pode ver a
-- lista de concessões; só quem NÃO é convidado (owner/admin/membro) pode
-- criar/remover concessões — conceder acesso é ação de gestão, não do
-- próprio convidado.
create policy processo_convidados_select on public.processo_convidados
  for select to authenticated
  using (public.processo_is_accessible(processo_id));

create policy processo_convidados_write on public.processo_convidados
  for all to authenticated
  using (
    exists (
      select 1 from public.processos p
      join public.organization_members m on m.organization_id = p.organization_id
      where p.id = processo_id
        and m.profile_id = public.current_profile_id()
        and coalesce(m.ativo, true)
        and m.papel <> 'convidado'
    )
  )
  with check (
    exists (
      select 1 from public.processos p
      join public.organization_members m on m.organization_id = p.organization_id
      where p.id = processo_id
        and m.profile_id = public.current_profile_id()
        and coalesce(m.ativo, true)
        and m.papel <> 'convidado'
    )
  );

-- Tema público por slug — ÚNICA leitura permitida a anon sobre
-- organizations (nunca a tabela inteira): só os campos cosméticos
-- necessários para pintar a tela de login antes da sessão existir.
create or replace function public.organizacao_tema_publico(p_slug text)
returns table (nome text, logo_url text, cor_principal text, cor_destaque text, cor_fundo_login text, ativo boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select nome, logo_url, cor_principal, cor_destaque, cor_fundo_login, ativo
  from public.organizations
  where slug = p_slug and ativo = true
$$;
revoke all on function public.organizacao_tema_publico(text) from public;
grant execute on function public.organizacao_tema_publico(text) to anon, authenticated;

-- Diretório público de organizações ativas — substitui o antigo seletor
-- global de profiles (P4.4/P4.5) na tela inicial: agora lista
-- organizações, não pessoas. Só nome/slug/logo/cor — nunca dado
-- operacional.
create or replace function public.organizacoes_publicas()
returns table (nome text, slug text, logo_url text, cor_principal text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select nome, slug, logo_url, cor_principal
  from public.organizations
  where ativo = true
  order by nome
$$;
revoke all on function public.organizacoes_publicas() from public;
grant execute on function public.organizacoes_publicas() to anon, authenticated;
