-- Direct-link access intentionally uses anon, but only through the narrow
-- token-validated Portal RPC surface. Remove implicit PUBLIC/authenticated
-- execution and keep the authorization helper internal.
revoke all on function public.portal_authorize(text) from public;
revoke all on function public.portal_authorize(text) from anon;
revoke all on function public.portal_authorize(text) from authenticated;

revoke all on function public.portal_get_context(text, text) from public;
revoke all on function public.portal_get_context(text, text) from authenticated;
grant execute on function public.portal_get_context(text, text) to anon, service_role;

revoke all on function public.portal_get_schedule(text, text) from public;
revoke all on function public.portal_get_schedule(text, text) from authenticated;
grant execute on function public.portal_get_schedule(text, text) to anon, service_role;

revoke all on function public.portal_board_create(text, text, text, text, text, text, uuid, numeric, numeric, text) from public;
revoke all on function public.portal_board_create(text, text, text, text, text, text, uuid, numeric, numeric, text) from authenticated;
grant execute on function public.portal_board_create(text, text, text, text, text, text, uuid, numeric, numeric, text) to anon, service_role;

revoke all on function public.portal_board_update(text, text, jsonb, text) from public;
revoke all on function public.portal_board_update(text, text, jsonb, text) from authenticated;
grant execute on function public.portal_board_update(text, text, jsonb, text) to anon, service_role;

revoke all on function public.portal_board_comment(text, text, text, text) from public;
revoke all on function public.portal_board_comment(text, text, text, text) from authenticated;
grant execute on function public.portal_board_comment(text, text, text, text) to anon, service_role;
