-- Remove Data API execution from historical SECURITY DEFINER functions that
-- have no tenant-aware contract. Trusted auth helpers and the deliberately
-- public, token-bound client portal remain available.
begin;

do $$
declare
  target record;
begin
  for target in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and (
        has_function_privilege('anon', procedure.oid, 'execute')
        or has_function_privilege('authenticated', procedure.oid, 'execute')
      )
      and procedure.proname not in (
        'current_profile_id',
        'is_org_member',
        'current_organization_id',
        'is_platform_admin',
        'processo_is_accessible',
        'select_organization',
        'log_auth_event'
      )
      and not (
        (procedure.proname like 'portal_%' or procedure.proname like 'feed_portal_%')
        and pg_get_function_identity_arguments(procedure.oid) like '%p_token_hash text%'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target.signature
    );
  end loop;
end $$;

commit;
