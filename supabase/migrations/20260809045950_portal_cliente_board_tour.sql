-- Fase 2: fundacao integrada Portal -> Tour -> Board -> IA.
-- Todas as alteracoes sao aditivas. Registros antigos permanecem internos.

alter table public.boards
  add column if not exists obra_id uuid references public.obras(id) on delete cascade,
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null,
  add column if not exists scope text not null default 'project',
  add column if not exists visibility text not null default 'internal';

update public.boards set scope = 'project' where project_id is not null and scope = 'project';

alter table public.boards drop constraint if exists boards_scope_check;
alter table public.boards add constraint boards_scope_check
  check (scope in ('project', 'internal', 'portal'));
alter table public.boards drop constraint if exists boards_visibility_check;
alter table public.boards add constraint boards_visibility_check
  check (visibility in ('internal', 'client'));

create index if not exists idx_boards_obra_scope on public.boards (obra_id, scope);
create index if not exists idx_boards_orcamento on public.boards (orcamento_id);
create unique index if not exists idx_boards_portal_unico_obra
  on public.boards (obra_id) where scope = 'portal';

alter table public.board_items
  add column if not exists titulo text,
  add column if not exists descricao text,
  add column if not exists categoria text not null default 'observacao',
  add column if not exists status text not null default 'aberto',
  add column if not exists visibility text not null default 'internal',
  add column if not exists created_by_type text not null default 'equipe',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists orcamento_id uuid references public.orcamentos(id) on delete set null,
  add column if not exists etapa_id uuid references public.etapas(id) on delete set null,
  add column if not exists subetapa_id uuid references public.subetapas_cronograma(id) on delete set null,
  add column if not exists servico_id uuid references public.servicos_cronograma(id) on delete set null,
  add column if not exists ambiente text,
  add column if not exists archived_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.board_items drop constraint if exists board_items_categoria_check;
alter table public.board_items add constraint board_items_categoria_check check (
  categoria in ('observacao', 'duvida', 'aprovacao', 'alteracao', 'pendencia', 'nao_conformidade')
);
alter table public.board_items drop constraint if exists board_items_status_portal_check;
alter table public.board_items add constraint board_items_status_portal_check check (
  status in ('aberto', 'em_analise', 'aguardando_cliente', 'aguardando_equipe', 'resolvido', 'arquivado')
);
alter table public.board_items drop constraint if exists board_items_visibility_check;
alter table public.board_items add constraint board_items_visibility_check check (visibility in ('internal', 'client'));
alter table public.board_items drop constraint if exists board_items_created_by_type_check;
alter table public.board_items add constraint board_items_created_by_type_check check (created_by_type in ('equipe', 'cliente', 'ia'));

create index if not exists idx_board_items_visibility on public.board_items (board_id, visibility, status);
create index if not exists idx_board_items_orcamento on public.board_items (orcamento_id);
create index if not exists idx_board_items_etapa on public.board_items (etapa_id);

create table if not exists public.board_item_comments (
  id uuid primary key default gen_random_uuid(),
  board_item_id text not null references public.board_items(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  autor_tipo text not null default 'equipe' check (autor_tipo in ('equipe', 'cliente', 'ia')),
  mensagem text not null check (length(trim(mensagem)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_board_item_comments_item on public.board_item_comments (board_item_id, created_at);

create table if not exists public.portal_tours (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  orcamento_id uuid references public.orcamentos(id) on delete set null,
  nome text not null,
  tipo text not null check (tipo in ('projeto', 'obra')),
  descricao text,
  publicado_cliente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_portal_tours_obra on public.portal_tours (obra_id, publicado_cliente);
create index if not exists idx_portal_tours_orcamento on public.portal_tours (orcamento_id);

create table if not exists public.portal_tour_nodes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.portal_tours(id) on delete cascade,
  nome text not null,
  pavimento text,
  ambiente text,
  obra_file_id uuid references public.obra_files(id) on delete set null,
  imagem_url text not null,
  thumbnail_url text,
  ordem integer not null default 0,
  yaw_inicial numeric not null default 0,
  pitch_inicial numeric not null default 0,
  publicado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_portal_tour_nodes_tour on public.portal_tour_nodes (tour_id, publicado, ordem);

create table if not exists public.portal_tour_links (
  id uuid primary key default gen_random_uuid(),
  node_origem_id uuid not null references public.portal_tour_nodes(id) on delete cascade,
  node_destino_id uuid not null references public.portal_tour_nodes(id) on delete cascade,
  yaw numeric not null,
  pitch numeric not null default 0,
  label text,
  created_at timestamptz not null default now(),
  unique (node_origem_id, node_destino_id)
);
create index if not exists idx_portal_tour_links_origem on public.portal_tour_links (node_origem_id);

create table if not exists public.portal_tour_hotspots (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.portal_tour_nodes(id) on delete cascade,
  yaw numeric not null,
  pitch numeric not null,
  titulo text not null,
  descricao text,
  tipo text not null default 'observacao',
  board_item_id text references public.board_items(id) on delete set null,
  projeto_item_id uuid references public.projeto_itens(id) on delete set null,
  etapa_id uuid references public.etapas(id) on delete set null,
  subetapa_id uuid references public.subetapas_cronograma(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  publicado_cliente boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_tour_hotspots_node on public.portal_tour_hotspots (node_id, publicado_cliente);
create unique index if not exists idx_portal_tour_hotspots_board_item on public.portal_tour_hotspots (board_item_id) where board_item_id is not null;

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id) on delete cascade,
  obra_id uuid not null references public.obras(id) on delete cascade,
  board_item_id text references public.board_items(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  mensagem text,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_notifications_usuario on public.portal_notifications (usuario_id, lida, created_at desc);
create index if not exists idx_portal_notifications_obra on public.portal_notifications (obra_id, created_at desc);

create table if not exists public.portal_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  obra_id uuid not null references public.obras(id) on delete cascade,
  orcamento_id uuid references public.orcamentos(id) on delete set null,
  origem text not null,
  ferramenta text,
  entidade text not null,
  entidade_id text not null,
  acao text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_audit_obra on public.portal_audit_log (obra_id, created_at desc);

create table if not exists public.portal_access_links (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  token_hash text not null unique,
  nome text,
  ativo boolean not null default true,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_access_obra on public.portal_access_links (obra_id, ativo);

alter table public.obra_files
  add column if not exists publicado_cliente boolean not null default false;

-- Tabelas novas sao acessadas exclusivamente pelos servicos server-side.
alter table public.board_item_comments enable row level security;
alter table public.portal_tours enable row level security;
alter table public.portal_tour_nodes enable row level security;
alter table public.portal_tour_links enable row level security;
alter table public.portal_tour_hotspots enable row level security;
alter table public.portal_notifications enable row level security;
alter table public.portal_audit_log enable row level security;
alter table public.portal_access_links enable row level security;

-- O Portal usa somente estas RPCs. O hash nunca e devolvido ao frontend.
create or replace function public.portal_authorize(p_token_hash text)
returns public.portal_access_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
begin
  select * into acesso
  from public.portal_access_links
  where token_hash = p_token_hash
    and ativo = true
    and (expires_at is null or expires_at > now());
  if acesso.id is null then
    raise exception 'portal_access_denied' using errcode = '42501';
  end if;
  return acesso;
end;
$$;
revoke all on function public.portal_authorize(text) from public;

create or replace function public.portal_get_context(p_token_hash text, p_orcamento_id text default 'todos')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  budget_id uuid;
  resultado jsonb;
begin
  acesso := public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (select 1 from public.orcamentos where id = budget_id and obra_id = acesso.obra_id) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;

  update public.portal_access_links set last_accessed_at = now() where id = acesso.id;

  select jsonb_build_object(
    'access', jsonb_build_object('id', acesso.id, 'profileId', acesso.profile_id),
    'obra', (select jsonb_build_object(
      'id', o.id, 'nome', o.nome, 'endereco', o.endereco, 'fotoUrl', o.foto_url,
      'status', o.status, 'dataInicio', o.data_inicio, 'dataPrevisao', o.data_previsao
    ) from public.obras o where o.id = acesso.obra_id),
    'orcamentos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'nome', coalesce(o.nome, 'Orcamento v' || o.versao), 'status', o.status, 'versao', o.versao
    ) order by o.versao desc) from public.orcamentos o where o.obra_id = acesso.obra_id), '[]'::jsonb),
    'selectedOrcamentoId', coalesce(budget_id::text, 'todos'),
    'summary', jsonb_build_object(
      'valorOrcado', coalesce((select sum(coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0))
        from public.orcamento_itens i join public.orcamentos o on o.id = i.orcamento_id
        where o.obra_id = acesso.obra_id and (budget_id is null or o.id = budget_id)), 0),
      'avancoFisico', coalesce((select round(
        sum(coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0) * coalesce(e.percentual_executado, 0))
        / nullif(sum(coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0)), 0), 2)
        from public.orcamento_itens i
        join public.orcamentos o on o.id = i.orcamento_id
        left join public.etapas e on e.id = i.etapa_id
        where o.obra_id = acesso.obra_id and (budget_id is null or o.id = budget_id)), 0),
      'realizadoFinanceiro', coalesce((select sum(c.valor_total) from public.compra_itens c
        where c.obra_id = acesso.obra_id
          and (budget_id is null or c.orcamento_id = budget_id)
          and c.status_valor = 'confirmado'), 0),
      'pago', coalesce((select sum(c.valor_total) from public.compra_itens c
        where c.obra_id = acesso.obra_id
          and (budget_id is null or c.orcamento_id = budget_id)
          and c.status_pagamento = 'pago'), 0),
      'financiamentoPrevisto', coalesce((select sum(f.valor_previsto) from public.obra_fontes_recursos f
        where f.obra_id = acesso.obra_id and (budget_id is null or f.orcamento_id = budget_id)), 0),
      'financiamentoRecebido', coalesce((select sum(r.valor_recebido) from public.obra_reembolsos r
        where r.obra_id = acesso.obra_id and (budget_id is null or r.orcamento_id = budget_id)), 0)
    ),
    'cronograma', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'status', e.status, 'inicio', e.data_inicio,
      'fim', e.data_fim, 'percentual', coalesce(e.percentual_executado, 0)
    ) order by e.ordem) from public.etapas e where e.obra_id = acesso.obra_id), '[]'::jsonb),
    'boardItems', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'titulo', coalesce(i.titulo, i.content->>'text', 'Item'), 'descricao', i.descricao,
      'categoria', i.categoria, 'status', i.status, 'ambiente', i.ambiente,
      'orcamentoId', i.orcamento_id, 'createdByType', i.created_by_type, 'createdAt', i.created_at,
      'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'mensagem', c.mensagem, 'autorTipo', c.autor_tipo, 'createdAt', c.created_at
      ) order by c.created_at) from public.board_item_comments c where c.board_item_id = i.id), '[]'::jsonb),
      'tour', (select jsonb_build_object('hotspotId', h.id, 'nodeId', h.node_id, 'yaw', h.yaw, 'pitch', h.pitch)
        from public.portal_tour_hotspots h where h.board_item_id = i.id limit 1)
    ) order by i.updated_at desc)
      from public.board_items i join public.boards b on b.id = i.board_id
      where b.obra_id = acesso.obra_id and b.scope = 'portal'
        and i.visibility = 'client' and i.archived_at is null
        and (budget_id is null or i.orcamento_id is null or i.orcamento_id = budget_id)), '[]'::jsonb),
    'tours', coalesce((select jsonb_agg(jsonb_build_object(
      'id', t.id, 'nome', t.nome, 'tipo', t.tipo, 'descricao', t.descricao,
      'nodes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'nome', n.nome, 'pavimento', n.pavimento, 'ambiente', n.ambiente,
        'imagemUrl', n.imagem_url, 'thumbnailUrl', n.thumbnail_url, 'yawInicial', n.yaw_inicial,
        'pitchInicial', n.pitch_inicial,
        'links', coalesce((select jsonb_agg(jsonb_build_object(
          'id', l.id, 'nodeDestinoId', l.node_destino_id, 'yaw', l.yaw, 'pitch', l.pitch, 'label', l.label
        )) from public.portal_tour_links l where l.node_origem_id = n.id), '[]'::jsonb),
        'hotspots', coalesce((select jsonb_agg(jsonb_build_object(
          'id', h.id, 'titulo', h.titulo, 'descricao', h.descricao, 'tipo', h.tipo,
          'yaw', h.yaw, 'pitch', h.pitch, 'boardItemId', h.board_item_id
        )) from public.portal_tour_hotspots h where h.node_id = n.id and h.publicado_cliente), '[]'::jsonb)
      ) order by n.ordem) from public.portal_tour_nodes n where n.tour_id = t.id and n.publicado), '[]'::jsonb)
    ) order by t.created_at desc) from public.portal_tours t
      where t.obra_id = acesso.obra_id and t.publicado_cliente
        and (budget_id is null or t.orcamento_id is null or t.orcamento_id = budget_id)), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.nome, 'tipo', f.tipo, 'categoria', f.categoria, 'url', f.url, 'createdAt', f.criado_em
    ) order by f.criado_em desc) from public.obra_files f
      where f.obra_id = acesso.obra_id and f.publicado_cliente), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

create or replace function public.portal_board_create(
  p_token_hash text,
  p_orcamento_id text,
  p_titulo text,
  p_descricao text default null,
  p_categoria text default 'observacao',
  p_ambiente text default null,
  p_node_id uuid default null,
  p_yaw numeric default null,
  p_pitch numeric default null,
  p_origem text default 'portal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  budget_id uuid;
  board_id uuid;
  item_id text := gen_random_uuid()::text;
  node_ok boolean;
begin
  acesso := public.portal_authorize(p_token_hash);
  if length(trim(coalesce(p_titulo, ''))) = 0 then raise exception 'titulo_obrigatorio'; end if;
  if p_orcamento_id is not null and p_orcamento_id <> 'todos' then
    budget_id := p_orcamento_id::uuid;
    if not exists (select 1 from public.orcamentos where id = budget_id and obra_id = acesso.obra_id) then
      raise exception 'portal_budget_denied' using errcode = '42501';
    end if;
  end if;

  select id into board_id from public.boards where obra_id = acesso.obra_id and scope = 'portal' limit 1;
  if board_id is null then
    insert into public.boards (obra_id, name, scope, visibility)
    values (acesso.obra_id, 'Board do Cliente', 'portal', 'client') returning id into board_id;
  end if;

  insert into public.board_items (
    id, board_id, type, content, titulo, descricao, categoria, status, visibility,
    created_by_type, created_by, orcamento_id, ambiente, metadata
  ) values (
    item_id, board_id, 'sticky', jsonb_build_object('text', p_titulo, 'color', '#FFFFFF'),
    trim(p_titulo), nullif(trim(coalesce(p_descricao, '')), ''), p_categoria, 'aberto', 'client',
    case when p_origem = 'portal_ai' then 'ia' else 'cliente' end, acesso.profile_id, budget_id,
    nullif(trim(coalesce(p_ambiente, '')), ''), jsonb_build_object('origem', p_origem)
  );

  if p_node_id is not null and p_yaw is not null and p_pitch is not null then
    select exists(select 1 from public.portal_tour_nodes n join public.portal_tours t on t.id = n.tour_id
      where n.id = p_node_id and n.publicado and t.publicado_cliente and t.obra_id = acesso.obra_id) into node_ok;
    if not node_ok then raise exception 'portal_tour_node_denied' using errcode = '42501'; end if;
    insert into public.portal_tour_hotspots (node_id, yaw, pitch, titulo, descricao, tipo, board_item_id, created_by)
    values (p_node_id, p_yaw, p_pitch, trim(p_titulo), p_descricao, p_categoria, item_id, acesso.profile_id);
  end if;

  insert into public.portal_notifications (usuario_id, obra_id, board_item_id, tipo, titulo, mensagem)
  select ou.profile_id, acesso.obra_id, item_id, 'board_item_created', 'Nova anotacao do cliente', trim(p_titulo)
  from public.obra_usuarios ou join public.profiles p on p.id = ou.profile_id
  where ou.obra_id = acesso.obra_id and p.tipo in ('admin', 'usuario');

  insert into public.portal_audit_log (user_id, obra_id, orcamento_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo)
  values (acesso.profile_id, acesso.obra_id, budget_id, p_origem, 'board.create_item', 'board_item', item_id, 'create',
    jsonb_build_object('titulo', trim(p_titulo), 'categoria', p_categoria, 'ambiente', p_ambiente));
  return (select to_jsonb(i) from public.board_items i where i.id = item_id);
end;
$$;

create or replace function public.portal_board_update(
  p_token_hash text,
  p_item_id text,
  p_patch jsonb,
  p_origem text default 'portal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  anterior public.board_items;
  atualizado public.board_items;
begin
  acesso := public.portal_authorize(p_token_hash);
  select i.* into anterior from public.board_items i join public.boards b on b.id = i.board_id
  where i.id = p_item_id and b.obra_id = acesso.obra_id and b.scope = 'portal' and i.visibility = 'client';
  if anterior.id is null then raise exception 'portal_board_item_denied' using errcode = '42501'; end if;

  update public.board_items set
    titulo = case when p_patch ? 'titulo' then nullif(trim(p_patch->>'titulo'), '') else titulo end,
    descricao = case when p_patch ? 'descricao' then nullif(trim(p_patch->>'descricao'), '') else descricao end,
    categoria = case when p_patch ? 'categoria' then p_patch->>'categoria' else categoria end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    ambiente = case when p_patch ? 'ambiente' then nullif(trim(p_patch->>'ambiente'), '') else ambiente end,
    archived_at = case when p_patch->>'status' = 'arquivado' then now() else archived_at end,
    updated_at = now()
  where id = p_item_id returning * into atualizado;

  insert into public.portal_notifications (usuario_id, obra_id, board_item_id, tipo, titulo, mensagem)
  select ou.profile_id, acesso.obra_id, p_item_id, 'board_item_updated', 'Anotacao atualizada', atualizado.titulo
  from public.obra_usuarios ou join public.profiles p on p.id = ou.profile_id
  where ou.obra_id = acesso.obra_id and p.tipo in ('admin', 'usuario');

  insert into public.portal_audit_log (user_id, obra_id, orcamento_id, origem, ferramenta, entidade, entidade_id, acao, valor_anterior, valor_novo)
  values (acesso.profile_id, acesso.obra_id, anterior.orcamento_id, p_origem, 'board.update_item', 'board_item', p_item_id, 'update', to_jsonb(anterior), to_jsonb(atualizado));
  return to_jsonb(atualizado);
end;
$$;

create or replace function public.portal_board_comment(
  p_token_hash text,
  p_item_id text,
  p_mensagem text,
  p_origem text default 'portal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acesso public.portal_access_links;
  item public.board_items;
  comentario public.board_item_comments;
begin
  acesso := public.portal_authorize(p_token_hash);
  select i.* into item from public.board_items i join public.boards b on b.id = i.board_id
  where i.id = p_item_id and b.obra_id = acesso.obra_id and b.scope = 'portal' and i.visibility = 'client';
  if item.id is null then raise exception 'portal_board_item_denied' using errcode = '42501'; end if;
  if length(trim(coalesce(p_mensagem, ''))) = 0 then raise exception 'mensagem_obrigatoria'; end if;

  insert into public.board_item_comments (board_item_id, autor_id, autor_tipo, mensagem)
  values (p_item_id, acesso.profile_id, case when p_origem = 'portal_ai' then 'ia' else 'cliente' end, trim(p_mensagem))
  returning * into comentario;

  insert into public.portal_notifications (usuario_id, obra_id, board_item_id, tipo, titulo, mensagem)
  select ou.profile_id, acesso.obra_id, p_item_id, 'board_comment_created', 'Novo comentario do cliente', trim(p_mensagem)
  from public.obra_usuarios ou join public.profiles p on p.id = ou.profile_id
  where ou.obra_id = acesso.obra_id and p.tipo in ('admin', 'usuario');

  insert into public.portal_audit_log (user_id, obra_id, orcamento_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo)
  values (acesso.profile_id, acesso.obra_id, item.orcamento_id, p_origem, 'board.add_comment', 'board_item_comment', comentario.id::text, 'create', to_jsonb(comentario));
  return to_jsonb(comentario);
end;
$$;

grant execute on function public.portal_get_context(text, text) to anon, authenticated;
grant execute on function public.portal_board_create(text, text, text, text, text, text, uuid, numeric, numeric, text) to anon, authenticated;
grant execute on function public.portal_board_update(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.portal_board_comment(text, text, text, text) to anon, authenticated;
