-- Visibilidade das secoes do Portal por obra. O padrao preserva todas as
-- secoes existentes e a leitura publica continua condicionada ao link valido.
create table if not exists public.portal_configuracoes (
  obra_id uuid primary key references public.obras(id) on delete cascade,
  secoes jsonb not null default '{"overview":true,"evolucao":true,"cronograma":true,"financeiro":true,"previsoes":true,"financiamento":true,"tour":true,"board":true,"fotos":true,"relatorios":true,"ia":true}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint portal_configuracoes_secoes_object check (jsonb_typeof(secoes) = 'object')
);

alter table public.portal_configuracoes enable row level security;

create or replace function public.portal_visibility_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"overview":true,"evolucao":true,"cronograma":true,"financeiro":true,"previsoes":true,"financiamento":true,"tour":true,"board":true,"fotos":true,"relatorios":true,"ia":true}'::jsonb;
$$;

create or replace function public.portal_visibility_admin_get(
  p_profile_id uuid,
  p_obra_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare resultado jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.tipo in ('admin', 'usuario')
  ) then
    raise exception 'portal_visibility_management_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.obras o where o.id = p_obra_id) then
    raise exception 'portal_visibility_obra_not_found' using errcode = 'P0002';
  end if;

  select public.portal_visibility_defaults() || coalesce(c.secoes, '{}'::jsonb)
  into resultado
  from (select 1) base
  left join public.portal_configuracoes c on c.obra_id = p_obra_id;

  return coalesce(resultado, public.portal_visibility_defaults());
end;
$$;

create or replace function public.portal_visibility_admin_set(
  p_profile_id uuid,
  p_obra_id uuid,
  p_secao text,
  p_habilitada boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual jsonb;
  novo jsonb;
begin
  if p_secao not in (
    'overview', 'evolucao', 'cronograma', 'financeiro', 'previsoes',
    'financiamento', 'tour', 'board', 'fotos', 'relatorios', 'ia'
  ) then
    raise exception 'portal_visibility_section_invalid' using errcode = '22023';
  end if;

  atual := public.portal_visibility_admin_get(p_profile_id, p_obra_id);
  novo := jsonb_set(atual, array[p_secao], to_jsonb(p_habilitada), true);

  if not exists (
    select 1 from jsonb_each_text(novo) item where item.value = 'true'
  ) then
    raise exception 'portal_visibility_requires_one_section' using errcode = '23514';
  end if;

  insert into public.portal_configuracoes (obra_id, secoes, updated_by, updated_at)
  values (p_obra_id, novo, p_profile_id, now())
  on conflict (obra_id) do update set
    secoes = excluded.secoes,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.portal_audit_log (
    user_id, obra_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo
  ) values (
    p_profile_id, p_obra_id, 'buildsmart', 'portal_visibility_admin_set',
    'portal_configuracao', p_obra_id::text, 'update_visibility',
    jsonb_build_object('secao', p_secao, 'habilitada', p_habilitada)
  );

  return novo;
end;
$$;

create or replace function public.portal_get_visibility(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  resultado jsonb;
begin
  acesso := public.portal_authorize(p_token_hash);
  select public.portal_visibility_defaults() || coalesce(c.secoes, '{}'::jsonb)
  into resultado
  from (select 1) base
  left join public.portal_configuracoes c on c.obra_id = acesso.obra_id;
  return coalesce(resultado, public.portal_visibility_defaults());
end;
$$;

revoke all on function public.portal_visibility_defaults() from public;
revoke all on function public.portal_visibility_admin_get(uuid, uuid) from public, authenticated;
revoke all on function public.portal_visibility_admin_set(uuid, uuid, text, boolean) from public, authenticated;
revoke all on function public.portal_get_visibility(text) from public, authenticated;

grant execute on function public.portal_visibility_admin_get(uuid, uuid) to anon, service_role;
grant execute on function public.portal_visibility_admin_set(uuid, uuid, text, boolean) to anon, service_role;
grant execute on function public.portal_get_visibility(text) to anon, service_role;
