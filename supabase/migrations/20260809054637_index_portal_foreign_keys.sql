create index if not exists idx_board_item_comments_autor
  on public.board_item_comments(autor_id);
create index if not exists idx_portal_access_links_profile
  on public.portal_access_links(profile_id);
create index if not exists idx_portal_audit_orcamento
  on public.portal_audit_log(orcamento_id);
create index if not exists idx_portal_audit_user
  on public.portal_audit_log(user_id);
create index if not exists idx_portal_notifications_board_item
  on public.portal_notifications(board_item_id);
create index if not exists idx_portal_hotspots_created_by
  on public.portal_tour_hotspots(created_by);
create index if not exists idx_portal_hotspots_etapa
  on public.portal_tour_hotspots(etapa_id);
create index if not exists idx_portal_hotspots_projeto_item
  on public.portal_tour_hotspots(projeto_item_id);
create index if not exists idx_portal_hotspots_subetapa
  on public.portal_tour_hotspots(subetapa_id);
create index if not exists idx_portal_tour_links_destino
  on public.portal_tour_links(node_destino_id);
create index if not exists idx_portal_tour_nodes_obra_file
  on public.portal_tour_nodes(obra_file_id);
