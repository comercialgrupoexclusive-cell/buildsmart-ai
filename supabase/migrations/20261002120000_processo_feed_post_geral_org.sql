-- Feed: permitir POST geral da organização (processo_id null) além do post por
-- processo. Até aqui processo_feed.processo_id era NOT NULL, então todo post
-- precisava de um processo; o usuário agora pode publicar "Geral (organização)".
--
-- Reversível:
--   drop trigger trg_processo_feed_set_org on public.processo_feed;
--   drop function public.processo_feed_set_org();
--   drop function public.processo_feed_acessivel(uuid);
--   alter table public.processo_feed drop column organization_id;
--   alter table public.processo_feed alter column processo_id set not null;
-- (e restaurar as policies antigas baseadas só em processo_is_accessible).

alter table public.processo_feed alter column processo_id drop not null;
alter table public.processo_feed add column if not exists organization_id uuid references public.organizations(id);

-- Posts existentes herdam a organização do seu processo.
update public.processo_feed f
  set organization_id = p.organization_id
  from public.processos p
  where f.processo_id = p.id and f.organization_id is null;

-- No insert, preenche organization_id a partir do processo, ou da sessão (post geral).
create or replace function public.processo_feed_set_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    if new.processo_id is not null then
      select organization_id into new.organization_id from public.processos where id = new.processo_id;
    else
      new.organization_id := public.current_organization_id();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_processo_feed_set_org on public.processo_feed;
create trigger trg_processo_feed_set_org
  before insert on public.processo_feed
  for each row execute function public.processo_feed_set_org();

-- Um feed é acessível ao usuário atual? (processo acessível OU post da minha org)
create or replace function public.processo_feed_acessivel(f_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.processo_feed f
    where f.id = f_id
      and (
        (f.processo_id is not null and public.processo_is_accessible(f.processo_id))
        or (f.processo_id is null and f.organization_id = public.current_organization_id())
      )
  )
$$;

-- RLS processo_feed: processo acessível OU post geral da minha organização.
drop policy if exists processo_feed_select on public.processo_feed;
create policy processo_feed_select on public.processo_feed for select using (
  (processo_id is not null and public.processo_is_accessible(processo_id))
  or (processo_id is null and organization_id = public.current_organization_id())
);

drop policy if exists processo_feed_insert on public.processo_feed;
create policy processo_feed_insert on public.processo_feed for insert with check (
  (processo_id is not null and public.processo_is_accessible(processo_id))
  or (processo_id is null and organization_id is null) -- trigger preenche com a org da sessão
  or (processo_id is null and organization_id = public.current_organization_id())
);

drop policy if exists processo_feed_update on public.processo_feed;
create policy processo_feed_update on public.processo_feed for update using (
  (processo_id is not null and public.processo_is_accessible(processo_id))
  or (processo_id is null and organization_id = public.current_organization_id())
) with check (
  (processo_id is not null and public.processo_is_accessible(processo_id))
  or (processo_id is null and organization_id = public.current_organization_id())
);

drop policy if exists processo_feed_delete on public.processo_feed;
create policy processo_feed_delete on public.processo_feed for delete using (
  (processo_id is not null and public.processo_is_accessible(processo_id))
  or (processo_id is null and organization_id = public.current_organization_id())
);

-- Reações e comentários seguem a acessibilidade do feed pai (processo OU org).
drop policy if exists processo_feed_reacao_select on public.processo_feed_reacao;
create policy processo_feed_reacao_select on public.processo_feed_reacao for select using (
  public.processo_feed_acessivel(feed_id)
);

drop policy if exists processo_feed_reacao_insert on public.processo_feed_reacao;
create policy processo_feed_reacao_insert on public.processo_feed_reacao for insert with check (
  public.processo_feed_acessivel(feed_id)
);

drop policy if exists processo_feed_reacao_delete on public.processo_feed_reacao;
create policy processo_feed_reacao_delete on public.processo_feed_reacao for delete using (
  profile_id = public.current_profile_id() and public.processo_feed_acessivel(feed_id)
);

drop policy if exists processo_feed_comentario_select on public.processo_feed_comentario;
create policy processo_feed_comentario_select on public.processo_feed_comentario for select using (
  public.processo_feed_acessivel(feed_id)
);

drop policy if exists processo_feed_comentario_insert on public.processo_feed_comentario;
create policy processo_feed_comentario_insert on public.processo_feed_comentario for insert with check (
  public.processo_feed_acessivel(feed_id)
);

drop policy if exists processo_feed_comentario_delete on public.processo_feed_comentario;
create policy processo_feed_comentario_delete on public.processo_feed_comentario for delete using (
  autor_profile_id = public.current_profile_id() and public.processo_feed_acessivel(feed_id)
);
