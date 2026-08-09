-- Fase 4: um mesmo motor de Board para projeto e Portal, Tour operacional e
-- cronograma detalhado do cliente. As funcoes publicas continuam autorizadas
-- exclusivamente pelo token opaco do Portal.

alter table public.boards
  add column if not exists document_data jsonb not null default '{"elements":[],"appState":{}}'::jsonb;

alter table public.board_files
  add column if not exists file_row_id uuid default gen_random_uuid(),
  add column if not exists board_id uuid references public.boards(id) on delete cascade;

update public.board_files set file_row_id = gen_random_uuid() where file_row_id is null;
alter table public.board_files alter column file_row_id set not null;
alter table public.board_files drop constraint if exists board_files_pkey;
alter table public.board_files alter column projeto_id drop not null;
alter table public.board_files add constraint board_files_pkey primary key (file_row_id);
create unique index if not exists board_files_project_file_uidx
  on public.board_files (projeto_id, id);
create unique index if not exists board_files_board_file_uidx
  on public.board_files (board_id, id);
alter table public.board_files drop constraint if exists board_files_owner_check;
alter table public.board_files add constraint board_files_owner_check
  check (projeto_id is not null or board_id is not null);

alter table public.portal_tours
  add column if not exists projeto_id uuid references public.projetos(id) on delete cascade;
alter table public.portal_tours alter column obra_id drop not null;
alter table public.portal_tours drop constraint if exists portal_tours_context_check;
alter table public.portal_tours add constraint portal_tours_context_check
  check (obra_id is not null or projeto_id is not null);
create index if not exists portal_tours_projeto_idx on public.portal_tours(projeto_id, updated_at desc);

create or replace function public.portal_board_canvas_get(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  quadro public.boards;
begin
  acesso := public.portal_authorize(p_token_hash);

  select * into quadro
  from public.boards
  where obra_id = acesso.obra_id and scope = 'portal'
  order by created_at
  limit 1;

  if quadro.id is null then
    insert into public.boards (obra_id, name, scope, visibility, document_data)
    values (acesso.obra_id, 'Board do cliente', 'portal', 'client', '{"elements":[],"appState":{}}'::jsonb)
    returning * into quadro;
  end if;

  return jsonb_build_object(
    'boardId', quadro.id,
    'document', coalesce(quadro.document_data, '{"elements":[],"appState":{}}'::jsonb),
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'mimeType', f.mime_type, 'dataURL', f.data_url,
        'created', coalesce(f.created, 0)
      )) from public.board_files f where f.board_id = quadro.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.portal_board_canvas_save(
  p_token_hash text,
  p_document jsonb,
  p_files jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  quadro public.boards;
  arquivo jsonb;
begin
  acesso := public.portal_authorize(p_token_hash);
  select * into quadro from public.boards
  where obra_id = acesso.obra_id and scope = 'portal'
  order by created_at limit 1;

  if quadro.id is null then
    insert into public.boards (obra_id, name, scope, visibility, document_data)
    values (acesso.obra_id, 'Board do cliente', 'portal', 'client', coalesce(p_document, '{}'::jsonb))
    returning * into quadro;
  else
    update public.boards set document_data = coalesce(p_document, '{}'::jsonb), updated_at = now()
    where id = quadro.id;
  end if;

  for arquivo in select value from jsonb_array_elements(coalesce(p_files, '[]'::jsonb)) loop
    if nullif(arquivo->>'id', '') is not null and nullif(arquivo->>'dataURL', '') is not null then
      insert into public.board_files (id, board_id, mime_type, data_url, created)
      values (
        arquivo->>'id', quadro.id, coalesce(arquivo->>'mimeType', 'image/png'),
        arquivo->>'dataURL', coalesce((arquivo->>'created')::bigint, 0)
      )
      on conflict (board_id, id) where board_id is not null do update
        set mime_type = excluded.mime_type, data_url = excluded.data_url, created = excluded.created;
    end if;
  end loop;

  return jsonb_build_object('boardId', quadro.id, 'saved', true);
end;
$$;

revoke all on function public.portal_board_canvas_get(text) from public;
revoke all on function public.portal_board_canvas_save(text, jsonb, jsonb) from public;
grant execute on function public.portal_board_canvas_get(text) to anon, authenticated;
grant execute on function public.portal_board_canvas_save(text, jsonb, jsonb) to anon, authenticated;

create or replace function public.portal_get_schedule(p_token_hash text, p_orcamento_id text default 'todos')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  budget_id uuid;
begin
  acesso := public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (select 1 from public.orcamentos where id = budget_id and obra_id = acesso.obra_id) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'status', e.status, 'inicio', e.data_inicio,
      'fim', e.data_fim, 'percentual', coalesce(e.percentual_executado, 0),
      'filhos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nome', x.nome, 'status', x.status,
          'inicio', x.inicio, 'fim', x.fim, 'percentual', x.percentual
        ) order by x.inicio nulls last, x.nome)
        from (
          select min(oi.id)::text id,
            coalesce(nullif(oi.subetapa, ''), oi.descricao_snapshot, 'Item') nome,
            case when coalesce(e.percentual_executado, 0) >= 100 then 'concluida' else e.status end status,
            min(coalesce(oi.data_inicio, e.data_inicio)) inicio,
            max(coalesce(oi.data_fim, e.data_fim)) fim,
            coalesce(e.percentual_executado, 0) percentual
          from public.orcamento_itens oi
          where oi.etapa_id = e.id and (budget_id is null or oi.orcamento_id = budget_id)
          group by coalesce(nullif(oi.subetapa, ''), oi.descricao_snapshot, 'Item'), e.status, e.percentual_executado
        ) x
      ), '[]'::jsonb)
    ) order by e.ordem)
    from public.etapas e
    where e.obra_id = acesso.obra_id
      and (budget_id is null or exists (
        select 1 from public.orcamento_itens oi
        where oi.orcamento_id = budget_id and oi.etapa_id = e.id
      ))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_get_schedule(text, text) from public;
grant execute on function public.portal_get_schedule(text, text) to anon, authenticated;
