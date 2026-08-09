create index if not exists idx_portal_configuracoes_updated_by
  on public.portal_configuracoes(updated_by)
  where updated_by is not null;
