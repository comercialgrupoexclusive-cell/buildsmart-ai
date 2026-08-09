create index if not exists idx_feed_comments_profile on public.feed_comments(profile_id);
create index if not exists idx_feed_comments_portal_access on public.feed_comments(portal_access_id);
create index if not exists idx_feed_item_files_obra_file on public.feed_item_files(obra_file_id);
create index if not exists idx_feed_items_publicado_por on public.feed_items(publicado_por);
create index if not exists idx_feed_reactions_profile on public.feed_reactions(profile_id);
create index if not exists idx_feed_reactions_portal_access on public.feed_reactions(portal_access_id);
create index if not exists idx_feed_story_views_portal_access on public.feed_story_views(portal_access_id);
