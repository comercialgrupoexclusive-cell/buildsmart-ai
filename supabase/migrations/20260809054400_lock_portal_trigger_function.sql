-- This function is invoked only by the database trigger. It must not be
-- exposed as a callable Data API RPC.
revoke all on function public.portal_notification_admin_fallback() from public;
revoke all on function public.portal_notification_admin_fallback() from anon;
revoke all on function public.portal_notification_admin_fallback() from authenticated;
