-- Feed social unico para equipe e Portal do Cliente.
-- Publicacoes referenciam arquivos existentes em obra_files; stories so existem
-- quando a equipe marca explicitamente a publicacao como destaque.

create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  orcamento_id uuid references public.orcamentos(id) on delete set null,
  source_type text not null default 'manual' check (source_type in ('manual','diario','comunicado','board','relatorio','album','etapa')),
  source_id text,
  titulo text not null,
  conteudo text,
  visibility text not null default 'client' check (visibility in ('internal','client','shared')),
  is_story boolean not null default false,
  album_nome text,
  publicado_por uuid references public.profiles(id) on delete set null,
  publicado_em timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feed_item_files (
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  obra_file_id uuid not null references public.obra_files(id) on delete cascade,
  ordem integer not null default 0,
  primary key (feed_item_id, obra_file_id)
);

create table if not exists public.feed_reactions (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  portal_access_id uuid references public.portal_access_links(id) on delete cascade,
  reaction text not null default 'like' check (reaction = 'like'),
  created_at timestamptz not null default now(),
  check ((profile_id is not null) <> (portal_access_id is not null))
);

create unique index if not exists uq_feed_reaction_profile
  on public.feed_reactions(feed_item_id, profile_id) where profile_id is not null;
create unique index if not exists uq_feed_reaction_portal
  on public.feed_reactions(feed_item_id, portal_access_id) where portal_access_id is not null;

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  portal_access_id uuid references public.portal_access_links(id) on delete set null,
  author_type text not null check (author_type in ('equipe','cliente','ia')),
  texto text not null check (char_length(trim(texto)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (profile_id is not null or portal_access_id is not null)
);

create table if not exists public.feed_story_views (
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  portal_access_id uuid not null references public.portal_access_links(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (feed_item_id, portal_access_id)
);

create index if not exists idx_feed_items_obra_publicado on public.feed_items(obra_id, publicado_em desc);
create index if not exists idx_feed_items_orcamento on public.feed_items(orcamento_id);
create index if not exists idx_feed_comments_item on public.feed_comments(feed_item_id, created_at);
create index if not exists idx_feed_files_item on public.feed_item_files(feed_item_id, ordem);

alter table public.feed_items enable row level security;
alter table public.feed_item_files enable row level security;
alter table public.feed_reactions enable row level security;
alter table public.feed_comments enable row level security;
alter table public.feed_story_views enable row level security;

revoke all on public.feed_items, public.feed_item_files, public.feed_reactions, public.feed_comments, public.feed_story_views from anon, authenticated;

create or replace function public.feed_item_json(p_item public.feed_items, p_access_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_item.id,
    'obraId', p_item.obra_id,
    'orcamentoId', p_item.orcamento_id,
    'sourceType', p_item.source_type,
    'sourceId', p_item.source_id,
    'titulo', p_item.titulo,
    'conteudo', p_item.conteudo,
    'visibility', p_item.visibility,
    'isStory', p_item.is_story,
    'storySeen', case when p_access_id is null then false else exists(
      select 1 from public.feed_story_views v where v.feed_item_id = p_item.id and v.portal_access_id = p_access_id
    ) end,
    'albumNome', p_item.album_nome,
    'publicadoEm', p_item.publicado_em,
    'archivedAt', p_item.archived_at,
    'autor', coalesce((select p.name from public.profiles p where p.id = p_item.publicado_por), 'Equipe BuildSmart'),
    'files', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'tipo', f.tipo, 'url', f.url
    ) order by ff.ordem) from public.feed_item_files ff join public.obra_files f on f.id = ff.obra_file_id
      where ff.feed_item_id = p_item.id), '[]'::jsonb),
    'likes', (select count(*) from public.feed_reactions r where r.feed_item_id = p_item.id),
    'likedByMe', case when p_access_id is null then false else exists(
      select 1 from public.feed_reactions r where r.feed_item_id = p_item.id and r.portal_access_id = p_access_id
    ) end,
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'texto', c.texto, 'authorType', c.author_type,
      'autor', case when c.author_type = 'cliente' then 'Cliente' else coalesce(p.name, 'Equipe BuildSmart') end,
      'createdAt', c.created_at
    ) order by c.created_at) from public.feed_comments c left join public.profiles p on p.id = c.profile_id
      where c.feed_item_id = p_item.id), '[]'::jsonb)
  );
$$;

create or replace function public.feed_admin_list(p_obra_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'feed_management_denied' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(public.feed_item_json(i, null) order by i.publicado_em desc)
    from public.feed_items i where i.obra_id = p_obra_id), '[]'::jsonb);
end;
$$;

create or replace function public.feed_admin_publish(
  p_obra_id uuid,
  p_profile_id uuid,
  p_orcamento_id uuid,
  p_titulo text,
  p_conteudo text,
  p_visibility text,
  p_is_story boolean,
  p_album_nome text,
  p_file_ids uuid[] default '{}'::uuid[],
  p_source_type text default 'manual',
  p_source_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo_id uuid;
  file_id uuid;
  pos integer := 0;
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'feed_management_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.obras o where o.id = p_obra_id) then
    raise exception 'feed_obra_not_found' using errcode = 'P0002';
  end if;
  if p_orcamento_id is not null and not exists (select 1 from public.orcamentos o where o.id = p_orcamento_id and o.obra_id = p_obra_id) then
    raise exception 'feed_budget_denied' using errcode = '42501';
  end if;
  if trim(coalesce(p_titulo, '')) = '' then
    raise exception 'feed_title_required' using errcode = '22023';
  end if;
  if p_visibility not in ('internal','client','shared') then
    raise exception 'feed_visibility_invalid' using errcode = '22023';
  end if;
  if p_source_type not in ('manual','diario','comunicado','board','relatorio','album','etapa') then
    raise exception 'feed_source_invalid' using errcode = '22023';
  end if;

  insert into public.feed_items (
    obra_id, orcamento_id, source_type, source_id, titulo, conteudo, visibility,
    is_story, album_nome, publicado_por
  ) values (
    p_obra_id, p_orcamento_id, p_source_type, nullif(trim(p_source_id), ''), trim(p_titulo),
    nullif(trim(p_conteudo), ''), p_visibility, coalesce(p_is_story, false),
    nullif(trim(p_album_nome), ''), p_profile_id
  ) returning id into novo_id;

  foreach file_id in array coalesce(p_file_ids, '{}'::uuid[]) loop
    if exists (select 1 from public.obra_files f where f.id = file_id and f.obra_id = p_obra_id) then
      insert into public.feed_item_files(feed_item_id, obra_file_id, ordem) values (novo_id, file_id, pos)
      on conflict do nothing;
      pos := pos + 1;
    end if;
  end loop;

  insert into public.portal_audit_log(user_id, obra_id, orcamento_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo)
  values (p_profile_id, p_obra_id, p_orcamento_id, 'buildsmart', 'feed_admin_publish', 'feed_item', novo_id::text,
    'publicar', jsonb_build_object('visibility', p_visibility, 'is_story', coalesce(p_is_story, false)));
  return novo_id;
end;
$$;

create or replace function public.feed_admin_archive(p_item_id uuid, p_profile_id uuid, p_archived boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare item public.feed_items;
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'feed_management_denied' using errcode = '42501';
  end if;
  update public.feed_items set archived_at = case when p_archived then now() else null end, updated_at = now()
  where id = p_item_id returning * into item;
  if item.id is null then raise exception 'feed_item_not_found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.feed_portal_get(p_token_hash text, p_orcamento_id text default 'todos')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  budget_id uuid;
begin
  acesso := public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (select 1 from public.orcamentos o where o.id = budget_id and o.obra_id = acesso.obra_id) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;
  return coalesce((select jsonb_agg(public.feed_item_json(i, acesso.id) order by i.publicado_em desc)
    from public.feed_items i
    where i.obra_id = acesso.obra_id and i.archived_at is null
      and i.visibility in ('client','shared')
      and (budget_id is null or i.orcamento_id is null or i.orcamento_id = budget_id)), '[]'::jsonb);
end;
$$;

create or replace function public.feed_portal_mark_story_viewed(p_token_hash text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare acesso public.portal_access_links;
begin
  acesso := public.portal_authorize(p_token_hash);
  if not exists (select 1 from public.feed_items i where i.id = p_item_id and i.obra_id = acesso.obra_id
    and i.is_story and i.archived_at is null and i.visibility in ('client','shared')) then
    raise exception 'feed_story_denied' using errcode = '42501';
  end if;
  insert into public.feed_story_views(feed_item_id, portal_access_id) values (p_item_id, acesso.id)
  on conflict (feed_item_id, portal_access_id) do update set viewed_at = now();
end;
$$;

create or replace function public.feed_portal_toggle_like(p_token_hash text, p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare acesso public.portal_access_links;
begin
  acesso := public.portal_authorize(p_token_hash);
  if not exists (select 1 from public.feed_items i where i.id = p_item_id and i.obra_id = acesso.obra_id
    and i.archived_at is null and i.visibility in ('client','shared')) then
    raise exception 'feed_item_denied' using errcode = '42501';
  end if;
  if exists (select 1 from public.feed_reactions r where r.feed_item_id = p_item_id and r.portal_access_id = acesso.id) then
    delete from public.feed_reactions where feed_item_id = p_item_id and portal_access_id = acesso.id;
    return false;
  end if;
  insert into public.feed_reactions(feed_item_id, portal_access_id) values (p_item_id, acesso.id);
  return true;
end;
$$;

create or replace function public.feed_portal_comment(p_token_hash text, p_item_id uuid, p_texto text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  novo public.feed_comments;
  admin_id uuid;
begin
  acesso := public.portal_authorize(p_token_hash);
  if not exists (select 1 from public.feed_items i where i.id = p_item_id and i.obra_id = acesso.obra_id
    and i.archived_at is null and i.visibility in ('client','shared')) then
    raise exception 'feed_item_denied' using errcode = '42501';
  end if;
  insert into public.feed_comments(feed_item_id, portal_access_id, author_type, texto)
  values (p_item_id, acesso.id, 'cliente', trim(p_texto)) returning * into novo;

  select p.id into admin_id from public.profiles p where p.tipo = 'admin' order by p.created_at limit 1;
  insert into public.portal_notifications(usuario_id, obra_id, tipo, titulo, mensagem)
  values (admin_id, acesso.obra_id, 'feed_comentario', 'Novo comentario no Feed', left(trim(p_texto), 240));

  return jsonb_build_object('id', novo.id, 'texto', novo.texto, 'authorType', novo.author_type,
    'autor', 'Cliente', 'createdAt', novo.created_at);
end;
$$;

revoke all on function public.feed_item_json(public.feed_items, uuid) from public, anon, authenticated;
revoke all on function public.feed_admin_list(uuid, uuid) from public;
revoke all on function public.feed_admin_publish(uuid, uuid, uuid, text, text, text, boolean, text, uuid[], text, text) from public;
revoke all on function public.feed_admin_archive(uuid, uuid, boolean) from public;
revoke all on function public.feed_portal_get(text, text) from public;
revoke all on function public.feed_portal_mark_story_viewed(text, uuid) from public;
revoke all on function public.feed_portal_toggle_like(text, uuid) from public;
revoke all on function public.feed_portal_comment(text, uuid, text) from public;

grant execute on function public.feed_admin_list(uuid, uuid) to anon, authenticated;
grant execute on function public.feed_admin_publish(uuid, uuid, uuid, text, text, text, boolean, text, uuid[], text, text) to anon, authenticated;
grant execute on function public.feed_admin_archive(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.feed_portal_get(text, text) to anon, authenticated;
grant execute on function public.feed_portal_mark_story_viewed(text, uuid) to anon, authenticated;
grant execute on function public.feed_portal_toggle_like(text, uuid) to anon, authenticated;
grant execute on function public.feed_portal_comment(text, uuid, text) to anon, authenticated;
