-- Corrige criação de Processo novo com RLS contextual.
--
-- A policy anterior usava processo_is_accessible(id) também no WITH CHECK
-- do INSERT. Para uma linha nova, esse id ainda não é acessível antes da
-- gravação, então a criação legítima falhava com RLS. Insert passa a validar
-- a organização gravada; leitura/alteração/remoção continuam presas ao
-- processo existente.

drop policy if exists processos_all on public.processos;
drop policy if exists processos_select on public.processos;
drop policy if exists processos_insert on public.processos;
drop policy if exists processos_update on public.processos;
drop policy if exists processos_delete on public.processos;

create policy processos_select on public.processos
  for select to authenticated
  using (public.processo_is_accessible(id));

create policy processos_insert on public.processos
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy processos_update on public.processos
  for update to authenticated
  using (public.processo_is_accessible(id))
  with check (
    public.processo_is_accessible(id)
    and public.is_org_member(organization_id)
  );

create policy processos_delete on public.processos
  for delete to authenticated
  using (public.processo_is_accessible(id));
