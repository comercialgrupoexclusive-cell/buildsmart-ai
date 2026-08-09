-- Leitura individual por foto para sequencia automatica de Stories.
create table if not exists public.feed_story_file_views (
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  obra_file_id uuid not null references public.obra_files(id) on delete cascade,
  portal_access_id uuid not null references public.portal_access_links(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (feed_item_id, obra_file_id, portal_access_id)
);

create index if not exists idx_feed_story_file_views_access
  on public.feed_story_file_views(portal_access_id, viewed_at desc);

alter table public.feed_story_file_views enable row level security;
revoke all on public.feed_story_file_views from anon, authenticated;

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
    'storyViewedAt', case when p_access_id is null then null else (
      select v.viewed_at from public.feed_story_views v
      where v.feed_item_id = p_item.id and v.portal_access_id = p_access_id
    ) end,
    'albumNome', p_item.album_nome,
    'publicadoEm', p_item.publicado_em,
    'archivedAt', p_item.archived_at,
    'autor', coalesce((select p.name from public.profiles p where p.id = p_item.publicado_por), 'Equipe BuildSmart'),
    'files', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'tipo', f.tipo, 'url', f.url,
      'editedAt', f.edited_at,
      'storyViewedAt', case when p_access_id is null then null else coalesce(
        (select sv.viewed_at from public.feed_story_file_views sv
          where sv.feed_item_id = p_item.id and sv.obra_file_id = f.id and sv.portal_access_id = p_access_id),
        (select iv.viewed_at from public.feed_story_views iv
          where iv.feed_item_id = p_item.id and iv.portal_access_id = p_access_id)
      ) end
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

create or replace function public.feed_portal_mark_story_slide_viewed(
  p_token_hash text,
  p_item_id uuid,
  p_file_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  first_view timestamptz;
begin
  acesso := public.portal_authorize(p_token_hash);
  if not exists (select 1 from public.feed_items i where i.id = p_item_id and i.obra_id = acesso.obra_id
    and i.is_story and i.archived_at is null and i.visibility in ('client','shared')) then
    raise exception 'feed_story_denied' using errcode = '42501';
  end if;

  if p_file_id is null then
    insert into public.feed_story_views(feed_item_id, portal_access_id) values (p_item_id, acesso.id)
    on conflict (feed_item_id, portal_access_id) do nothing;
    select viewed_at into first_view from public.feed_story_views
      where feed_item_id = p_item_id and portal_access_id = acesso.id;
  else
    if not exists (select 1 from public.feed_item_files f where f.feed_item_id = p_item_id and f.obra_file_id = p_file_id) then
      raise exception 'feed_story_file_denied' using errcode = '42501';
    end if;
    insert into public.feed_story_file_views(feed_item_id, obra_file_id, portal_access_id)
    values (p_item_id, p_file_id, acesso.id) on conflict do nothing;
    select viewed_at into first_view from public.feed_story_file_views
      where feed_item_id = p_item_id and obra_file_id = p_file_id and portal_access_id = acesso.id;
  end if;
  return first_view;
end;
$$;

revoke all on function public.feed_portal_mark_story_slide_viewed(text, uuid, uuid) from public;
grant execute on function public.feed_portal_mark_story_slide_viewed(text, uuid, uuid) to anon, authenticated;
