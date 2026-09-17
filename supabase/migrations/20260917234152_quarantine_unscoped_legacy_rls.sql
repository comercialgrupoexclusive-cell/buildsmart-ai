-- Fail closed for historical tables whose policies still grant unconditional
-- access and which have not yet been mapped to the selected organization.
-- This is reversible and does not delete or rewrite business rows.
begin;

do $$
declare
  target record;
begin
  for target in
    select distinct policy.tablename
    from pg_policies policy
    where policy.schemaname = 'public'
      and (policy.qual = 'true' or policy.with_check = 'true')
      and policy.roles && array['public','anon','authenticated']::name[]
      and policy.tablename not in ('profiles','organizations','organization_members')
      and not exists (
        select 1
        from pg_policies guard
        where guard.schemaname = 'public'
          and guard.tablename = policy.tablename
          and guard.policyname in (
            'auth_global_process_guard',
            'auth_global_parent_guard',
            'auth_global_tenant_guard'
          )
      )
  loop
    execute format(
      'drop policy if exists auth_global_legacy_quarantine on public.%I',
      target.tablename
    );
    execute format(
      'create policy auth_global_legacy_quarantine on public.%I as restrictive for all to public using (false) with check (false)',
      target.tablename
    );
  end loop;
end $$;

-- This support table was the only table in the exposed public schema without
-- RLS. It belongs to an Orcamento and therefore follows the selected Processo.
do $$
begin
  if to_regclass('public.orcamento_codigo_livre_seq') is not null then
    alter table public.orcamento_codigo_livre_seq enable row level security;
    drop policy if exists auth_global_orcamento_sequence_guard
      on public.orcamento_codigo_livre_seq;
    create policy auth_global_orcamento_sequence_guard
      on public.orcamento_codigo_livre_seq
      as restrictive
      for all
      to public
      using (
        public.processo_is_accessible((
          select budget.processo_id
          from public.orcamentos budget
          where budget.id = orcamento_id
        ))
      )
      with check (
        public.processo_is_accessible((
          select budget.processo_id
          from public.orcamentos budget
          where budget.id = orcamento_id
        ))
      );
  end if;
end $$;

commit;
