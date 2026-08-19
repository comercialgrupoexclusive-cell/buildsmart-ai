-- As RPCs administrativas do Portal/Feed recebem p_profile_id e so validam se
-- esse id pertence a um perfil admin/usuario, sem checar se corresponde a
-- quem esta de fato chamando. Como estao liberadas para anon/authenticated,
-- qualquer requisicao direta ao Supabase (fora do app) pode se passar por
-- qualquer perfil admin/usuario existente. A partir de agora essas RPCs so
-- podem ser chamadas via service_role (proxy server-side em /api/portal-admin,
-- que injeta o profile_id vindo de uma sessao assinada, nao o que o cliente
-- mandar). O corpo das funcoes nao muda: a checagem "tipo in (admin,usuario)"
-- continua valendo, agora sobre um p_profile_id confiavel.

revoke execute on function public.feed_admin_archive(uuid, uuid, boolean) from anon, authenticated, public;
grant execute on function public.feed_admin_archive(uuid, uuid, boolean) to service_role;

revoke execute on function public.feed_admin_list(uuid, uuid) from anon, authenticated, public;
grant execute on function public.feed_admin_list(uuid, uuid) to service_role;

revoke execute on function public.feed_admin_publish(uuid, uuid, uuid, text, text, text, boolean, text, uuid[], text, text) from anon, authenticated, public;
grant execute on function public.feed_admin_publish(uuid, uuid, uuid, text, text, text, boolean, text, uuid[], text, text) to service_role;

revoke execute on function public.feed_admin_send_photo_to_board(uuid, uuid, uuid) from anon, authenticated, public;
grant execute on function public.feed_admin_send_photo_to_board(uuid, uuid, uuid) to service_role;

revoke execute on function public.feed_admin_update_photo(uuid, uuid, text, bigint) from anon, authenticated, public;
grant execute on function public.feed_admin_update_photo(uuid, uuid, text, bigint) to service_role;

revoke execute on function public.portal_content_admin_get(uuid, uuid) from anon, authenticated, public;
grant execute on function public.portal_content_admin_get(uuid, uuid) to service_role;

revoke execute on function public.portal_content_admin_set(uuid, uuid, text, text, boolean) from anon, authenticated, public;
grant execute on function public.portal_content_admin_set(uuid, uuid, text, text, boolean) to service_role;

revoke execute on function public.portal_link_create(uuid, uuid, text, text, text) from anon, authenticated, public;
grant execute on function public.portal_link_create(uuid, uuid, text, text, text) to service_role;

revoke execute on function public.portal_link_set_active(uuid, uuid, uuid, boolean) from anon, authenticated, public;
grant execute on function public.portal_link_set_active(uuid, uuid, uuid, boolean) to service_role;

revoke execute on function public.portal_links_list(uuid, uuid) from anon, authenticated, public;
grant execute on function public.portal_links_list(uuid, uuid) to service_role;

revoke execute on function public.portal_message_admin_send(uuid, uuid, uuid, text) from anon, authenticated, public;
grant execute on function public.portal_message_admin_send(uuid, uuid, uuid, text) to service_role;

revoke execute on function public.portal_messages_admin_get(uuid, uuid) from anon, authenticated, public;
grant execute on function public.portal_messages_admin_get(uuid, uuid) to service_role;

revoke execute on function public.portal_tour_admin_list(uuid, uuid, uuid) from anon, authenticated, public;
grant execute on function public.portal_tour_admin_list(uuid, uuid, uuid) to service_role;

revoke execute on function public.portal_tour_admin_manage(uuid, text, uuid, uuid, uuid, jsonb) from anon, authenticated, public;
grant execute on function public.portal_tour_admin_manage(uuid, text, uuid, uuid, uuid, jsonb) to service_role;

revoke execute on function public.portal_visibility_admin_get(uuid, uuid) from anon, authenticated, public;
grant execute on function public.portal_visibility_admin_get(uuid, uuid) to service_role;

revoke execute on function public.portal_visibility_admin_set(uuid, uuid, text, boolean) from anon, authenticated, public;
grant execute on function public.portal_visibility_admin_set(uuid, uuid, text, boolean) to service_role;
