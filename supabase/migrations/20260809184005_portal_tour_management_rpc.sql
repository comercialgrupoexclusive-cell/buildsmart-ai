-- Gestão interna dos tours enquanto o MVP ainda usa perfis locais.
-- As tabelas permanecem com RLS fechado; o cliente usa somente dados publicados.
create or replace function public.portal_tour_admin_list(
  p_profile_id uuid,
  p_obra_id uuid default null,
  p_project_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare resultado jsonb;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.tipo in ('admin', 'usuario')
  ) then
    raise exception 'portal_tour_management_denied' using errcode = '42501';
  end if;
  if (p_obra_id is null) = (p_project_id is null) then
    raise exception 'portal_tour_context_invalid' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'nome', t.nome,
    'tipo', t.tipo,
    'descricao', t.descricao,
    'publicado_cliente', t.publicado_cliente,
    'obra_id', t.obra_id,
    'projeto_id', t.projeto_id,
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'tour_id', n.tour_id,
        'nome', n.nome,
        'pavimento', n.pavimento,
        'ambiente', n.ambiente,
        'imagem_url', n.imagem_url,
        'thumbnail_url', n.thumbnail_url,
        'ordem', n.ordem,
        'yaw_inicial', n.yaw_inicial,
        'pitch_inicial', n.pitch_inicial,
        'publicado', n.publicado
      ) order by n.ordem, n.created_at)
      from public.portal_tour_nodes n where n.tour_id = t.id
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'node_origem_id', l.node_origem_id,
        'node_destino_id', l.node_destino_id,
        'yaw', l.yaw,
        'pitch', l.pitch,
        'label', l.label
      ) order by l.created_at)
      from public.portal_tour_links l
      join public.portal_tour_nodes origem on origem.id = l.node_origem_id
      where origem.tour_id = t.id
    ), '[]'::jsonb)
  ) order by t.updated_at desc), '[]'::jsonb)
  into resultado
  from public.portal_tours t
  where (p_obra_id is not null and t.obra_id = p_obra_id)
     or (p_project_id is not null and t.projeto_id = p_project_id);

  return resultado;
end;
$$;

create or replace function public.portal_tour_admin_manage(
  p_profile_id uuid,
  p_action text,
  p_obra_id uuid,
  p_project_id uuid,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultado uuid;
  tour_id uuid;
  origem_tour uuid;
  destino_tour uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.tipo in ('admin', 'usuario')
  ) then
    raise exception 'portal_tour_management_denied' using errcode = '42501';
  end if;
  if (p_obra_id is null) = (p_project_id is null) then
    raise exception 'portal_tour_context_invalid' using errcode = '22023';
  end if;

  if p_action = 'create_tour' then
    if p_obra_id is not null and not exists (select 1 from public.obras where id = p_obra_id) then
      raise exception 'portal_tour_obra_not_found' using errcode = 'P0002';
    end if;
    if p_project_id is not null and not exists (select 1 from public.projetos where id = p_project_id) then
      raise exception 'portal_tour_project_not_found' using errcode = 'P0002';
    end if;
    insert into public.portal_tours (obra_id, projeto_id, nome, tipo, descricao, publicado_cliente)
    values (
      p_obra_id,
      p_project_id,
      coalesce(nullif(trim(p_payload->>'nome'), ''), 'Tour'),
      case when p_project_id is not null then 'projeto' else 'obra' end,
      nullif(trim(p_payload->>'descricao'), ''),
      false
    ) returning id into resultado;

  elsif p_action in ('rename_tour', 'toggle_publish', 'delete_tour', 'create_node') then
    select t.id into tour_id from public.portal_tours t
    where t.id = p_entity_id
      and ((p_obra_id is not null and t.obra_id = p_obra_id)
        or (p_project_id is not null and t.projeto_id = p_project_id));
    if tour_id is null then raise exception 'portal_tour_not_found' using errcode = 'P0002'; end if;

    if p_action = 'rename_tour' then
      update public.portal_tours set
        nome = coalesce(nullif(trim(p_payload->>'nome'), ''), nome),
        updated_at = now()
      where id = tour_id;
      resultado := tour_id;
    elsif p_action = 'toggle_publish' then
      update public.portal_tours set publicado_cliente = not publicado_cliente, updated_at = now() where id = tour_id;
      resultado := tour_id;
    elsif p_action = 'delete_tour' then
      delete from public.portal_tours where id = tour_id;
      resultado := tour_id;
    else
      insert into public.portal_tour_nodes (
        tour_id, nome, ambiente, pavimento, imagem_url, thumbnail_url, ordem, publicado
      ) values (
        tour_id,
        coalesce(nullif(trim(p_payload->>'nome'), ''), 'Ambiente'),
        nullif(trim(p_payload->>'ambiente'), ''),
        nullif(trim(p_payload->>'pavimento'), ''),
        p_payload->>'imagem_url',
        coalesce(nullif(p_payload->>'thumbnail_url', ''), p_payload->>'imagem_url'),
        coalesce((p_payload->>'ordem')::integer, 0),
        true
      ) returning id into resultado;
    end if;

  elsif p_action = 'delete_node' then
    select n.tour_id into tour_id
    from public.portal_tour_nodes n join public.portal_tours t on t.id = n.tour_id
    where n.id = p_entity_id
      and ((p_obra_id is not null and t.obra_id = p_obra_id)
        or (p_project_id is not null and t.projeto_id = p_project_id));
    if tour_id is null then raise exception 'portal_tour_node_not_found' using errcode = 'P0002'; end if;
    delete from public.portal_tour_nodes where id = p_entity_id;
    resultado := p_entity_id;

  elsif p_action = 'create_link' then
    select n.tour_id into origem_tour from public.portal_tour_nodes n where n.id = (p_payload->>'origem_id')::uuid;
    select n.tour_id into destino_tour from public.portal_tour_nodes n where n.id = (p_payload->>'destino_id')::uuid;
    select t.id into tour_id from public.portal_tours t
    where t.id = origem_tour and origem_tour = destino_tour
      and ((p_obra_id is not null and t.obra_id = p_obra_id)
        or (p_project_id is not null and t.projeto_id = p_project_id));
    if tour_id is null then raise exception 'portal_tour_link_invalid' using errcode = '22023'; end if;
    insert into public.portal_tour_links (node_origem_id, node_destino_id, yaw, pitch, label)
    values (
      (p_payload->>'origem_id')::uuid,
      (p_payload->>'destino_id')::uuid,
      coalesce((p_payload->>'yaw')::numeric, 0),
      coalesce((p_payload->>'pitch')::numeric, 0),
      nullif(trim(p_payload->>'label'), '')
    ) returning id into resultado;
  else
    raise exception 'portal_tour_action_invalid' using errcode = '22023';
  end if;

  insert into public.portal_audit_log (
    user_id, obra_id, origem, ferramenta, entidade, entidade_id, acao, valor_novo
  ) values (
    p_profile_id, p_obra_id, 'buildsmart', 'portal_tour_admin_manage',
    case when p_action like '%node%' then 'portal_tour_node' when p_action like '%link%' then 'portal_tour_link' else 'portal_tour' end,
    resultado::text, p_action, p_payload
  );
  return resultado;
end;
$$;

revoke all on function public.portal_tour_admin_list(uuid, uuid, uuid) from public, authenticated;
revoke all on function public.portal_tour_admin_manage(uuid, text, uuid, uuid, uuid, jsonb) from public, authenticated;
grant execute on function public.portal_tour_admin_list(uuid, uuid, uuid) to anon, service_role;
grant execute on function public.portal_tour_admin_manage(uuid, text, uuid, uuid, uuid, jsonb) to anon, service_role;
