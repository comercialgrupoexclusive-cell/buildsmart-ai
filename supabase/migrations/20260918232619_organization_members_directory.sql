-- Camada Organização → Pessoas: primeira peça, um jeito seguro de listar
-- QUEM está na organização ativa, sem abrir profiles inteiro.
--
-- Por que RPC e não RLS direta em `profiles`: profiles é identidade GLOBAL
-- (uma pessoa pode pertencer a várias organizações) — dar a qualquer membro
-- de uma organização permissão de SELECT sobre profiles.* de outro membro
-- vazaria esse perfil pra qualquer outra organização de que essa pessoa
-- também participe. A fundação de auth já resolveu isso deixando profiles
-- com RLS só-própria (global_profile_self_read); esta RPC é o único
-- caminho aprovado pra ver dados de OUTROS membros, e projeta apenas os 4
-- campos operacionais pedidos — nunca profiles.* inteiro.
--
-- Escopo: current_organization_id(), a mesma função que já decide toda
-- visibilidade de dados de negócio (processos, compras, etc.) nesta
-- fundação. Sem branch especial pra platform_admin — ele vê a própria
-- organização selecionada como qualquer outro membro, igual já vale para
-- select_organization()/current_organization_id().
create or replace function public.organization_members_list()
returns table (
  profile_id uuid,
  nome text,
  foto_url text,
  papel text,
  ativo boolean
)
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select
    p.id,
    coalesce(nullif(trim(p.apelido), ''), p.name),
    p.photo_url,
    m.role,
    m.ativo
  from public.organization_members m
  join public.profiles p on p.id = m.profile_id
  where m.organization_id = public.current_organization_id()
    and m.user_id is not null
    and m.role in ('owner', 'admin', 'member')
  order by 2
$$;

comment on function public.organization_members_list() is
  'Diretório mínimo de pessoas da organização ativa (profile_id, nome, foto, papel, ativo) — nunca profiles.* inteiro, nunca outra organização. Fonte para qualquer seletor de pessoa (Responsável, agentes, compartilhamento) daqui pra frente.';

revoke all on function public.organization_members_list() from public, anon;
grant execute on function public.organization_members_list() to authenticated;
