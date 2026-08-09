-- Fluxo editorial de imagens do Feed: preserva o original, integra com RDO/Board
-- e mantem Stories visualizados em destaque por 24 horas.

alter table public.obra_files
  add column if not exists original_url text,
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists source_index integer;

create unique index if not exists uq_obra_files_source_photo
  on public.obra_files(obra_id, source_type, source_id, source_index)
  where source_type is not null and source_id is not null and source_index is not null;

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
      'editedAt', f.edited_at
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
  on conflict (feed_item_id, portal_access_id) do nothing;
end;
$$;

create or replace function public.feed_admin_update_photo(
  p_file_id uuid,
  p_profile_id uuid,
  p_url text,
  p_tamanho bigint default null
)
returns public.obra_files
language plpgsql
security definer
set search_path = ''
as $$
declare arquivo public.obra_files;
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'feed_management_denied' using errcode = '42501';
  end if;
  if trim(coalesce(p_url, '')) = '' then
    raise exception 'photo_url_required' using errcode = '22023';
  end if;

  update public.obra_files
     set original_url = coalesce(original_url, url),
         url = trim(p_url),
         tamanho = coalesce(p_tamanho, tamanho),
         edited_at = now(),
         edited_by = p_profile_id
   where id = p_file_id and tipo like 'image/%'
   returning * into arquivo;

  if arquivo.id is null then raise exception 'photo_not_found' using errcode = 'P0002'; end if;

  insert into public.portal_audit_log(user_id, obra_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo)
  values (p_profile_id, arquivo.obra_id, 'buildsmart', 'feed_admin_update_photo', 'obra_file', arquivo.id::text,
    'recortar_foto', jsonb_build_object('url', arquivo.url));
  return arquivo;
end;
$$;

create or replace function public.feed_admin_send_photo_to_board(
  p_file_id uuid,
  p_profile_id uuid,
  p_orcamento_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  arquivo public.obra_files;
  board_uuid uuid;
  item_id text := gen_random_uuid()::text;
  item_count integer;
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'board_management_denied' using errcode = '42501';
  end if;
  select * into arquivo from public.obra_files where id = p_file_id and tipo like 'image/%';
  if arquivo.id is null then raise exception 'photo_not_found' using errcode = 'P0002'; end if;
  if p_orcamento_id is not null and not exists (
    select 1 from public.orcamentos o where o.id = p_orcamento_id and o.obra_id = arquivo.obra_id
  ) then raise exception 'board_budget_denied' using errcode = '42501'; end if;

  select b.id into board_uuid from public.boards b
  where b.obra_id = arquivo.obra_id and b.scope = 'portal'
  order by b.created_at limit 1;

  if board_uuid is null then
    insert into public.boards(obra_id, orcamento_id, name, scope, visibility)
    values (arquivo.obra_id, p_orcamento_id, 'Board do cliente', 'portal', 'client')
    returning id into board_uuid;
  end if;

  select count(*) into item_count from public.board_items where board_id = board_uuid and archived_at is null;
  insert into public.board_items(
    id, board_id, type, x, y, width, height, content, tags, titulo, descricao,
    categoria, status, visibility, created_by_type, created_by, orcamento_id, metadata
  ) values (
    item_id, board_uuid, 'image', 80 + (item_count % 4) * 340, 80 + (item_count / 4) * 260,
    300, 210, jsonb_build_object('url', arquivo.url, 'name', arquivo.nome), array['foto_obra'],
    arquivo.nome, 'Foto enviada pelo acervo da obra.', 'observacao', 'aberto', 'client', 'equipe',
    p_profile_id, p_orcamento_id, jsonb_build_object('obra_file_id', arquivo.id, 'image_url', arquivo.url)
  );

  insert into public.portal_audit_log(user_id, obra_id, orcamento_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo)
  values (p_profile_id, arquivo.obra_id, p_orcamento_id, 'buildsmart', 'feed_admin_send_photo_to_board',
    'board_item', item_id, 'enviar_foto_board', jsonb_build_object('obra_file_id', arquivo.id));
  return item_id;
end;
$$;

revoke all on function public.feed_admin_update_photo(uuid, uuid, text, bigint) from public;
revoke all on function public.feed_admin_send_photo_to_board(uuid, uuid, uuid) from public;
grant execute on function public.feed_admin_update_photo(uuid, uuid, text, bigint) to anon, authenticated;
grant execute on function public.feed_admin_send_photo_to_board(uuid, uuid, uuid) to anon, authenticated;
