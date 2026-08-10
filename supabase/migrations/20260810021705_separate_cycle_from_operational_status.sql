-- Separa os status operacionais do marco superior Projeto -> Obra -> Entrega.
-- A obra passa a nascer da ativacao de um orcamento especifico.

alter table public.projetos
  add column if not exists fase_ciclo text not null default 'projeto';

alter table public.projetos drop constraint if exists projetos_fase_ciclo_check;
alter table public.projetos add constraint projetos_fase_ciclo_check
  check (fase_ciclo in ('projeto', 'em_obra', 'entregue'));

alter table public.projetos drop constraint if exists projetos_status_check;

-- A migration anterior substituiu estes estados. Como nenhuma transicao foi
-- executada, o backfill restaura o unico mapeamento seguro disponivel.
update public.projetos
set fase_ciclo = case
      when obra_id is null then 'projeto'
      when exists (
        select 1 from public.obras o
        where o.id = projetos.obra_id and o.status = 'concluida'
      ) then 'entregue'
      else 'em_obra'
    end,
    status = case status
      when 'entregue' then 'concluido'
      when 'em_obra' then 'em_andamento'
      when 'projeto' then 'em_andamento'
      else status
    end;

alter table public.projetos alter column status set default 'em_andamento';
alter table public.projetos add constraint projetos_status_check
  check (status in ('aguardando', 'em_andamento', 'concluido', 'suspenso'));

-- Somente o orcamento abandona o conceito de rascunho. O cronograma conserva
-- seus estados operacionais historicos.
update public.cronogramas set status = 'rascunho' where status = 'em_projeto';
alter table public.cronogramas alter column status set default 'rascunho';

create or replace function public.criar_planejamento_projeto()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.orcamentos (
    projeto_id, obra_id, nome, cliente, endereco, responsavel,
    data_inicio, data_previsao, tipo, bdi_percentual,
    gerenciamento_percentual, status, versao, is_principal
  ) values (
    new.id, null, new.nome, new.cliente, new.endereco, new.responsavel,
    new.data_inicio, new.data_previsao, 'executivo', 25,
    0, 'em_projeto', 1, true
  ) on conflict do nothing;

  insert into public.cronogramas (projeto_id, obra_id, nome, status)
  values (new.id, null, 'Cronograma - ' || new.nome, 'rascunho')
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.criar_planejamento_projeto_manual(p_projeto_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_projeto public.projetos%rowtype;
begin
  select * into v_projeto from public.projetos where id = p_projeto_id;
  if not found then raise exception 'Projeto nao encontrado.'; end if;

  insert into public.orcamentos (
    projeto_id, obra_id, nome, cliente, endereco, responsavel,
    data_inicio, data_previsao, tipo, bdi_percentual,
    gerenciamento_percentual, status, versao, is_principal
  ) values (
    v_projeto.id, null, v_projeto.nome, v_projeto.cliente,
    v_projeto.endereco, v_projeto.responsavel, v_projeto.data_inicio,
    v_projeto.data_previsao, 'executivo', 25, 0,
    'em_projeto', 1, true
  ) on conflict do nothing;

  insert into public.cronogramas (projeto_id, obra_id, nome, status)
  values (v_projeto.id, null, 'Cronograma - ' || v_projeto.nome, 'rascunho')
  on conflict do nothing;
end;
$$;

create or replace function public.iniciar_obra_por_orcamento(p_orcamento_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_orcamento public.orcamentos%rowtype;
  v_projeto public.projetos%rowtype;
  v_obra_id uuid;
begin
  select * into v_orcamento
  from public.orcamentos
  where id = p_orcamento_id
  for update;

  if not found then raise exception 'Orcamento nao encontrado.'; end if;
  if v_orcamento.status = 'arquivado' then raise exception 'Orcamento arquivado nao pode iniciar uma obra.'; end if;

  -- Chamada repetida devolve o mesmo vinculo sem duplicar a obra.
  if v_orcamento.obra_id is not null and v_orcamento.status = 'ativo' then
    return jsonb_build_object(
      'projeto_id', v_orcamento.projeto_id,
      'orcamento_id', v_orcamento.id,
      'obra_id', v_orcamento.obra_id,
      'fase_ciclo', case when v_orcamento.projeto_id is null then null else 'em_obra' end,
      'status', 'ativo'
    );
  end if;

  if v_orcamento.projeto_id is not null then
    select * into v_projeto
    from public.projetos
    where id = v_orcamento.projeto_id
    for update;

    if not found then raise exception 'Projeto do orcamento nao encontrado.'; end if;
    if v_projeto.fase_ciclo = 'entregue' then raise exception 'A obra deste projeto ja foi entregue.'; end if;

    select id into v_obra_id
    from public.obras
    where projeto_id = v_projeto.id;

    if v_projeto.obra_id is not null then
      if v_obra_id is not null and v_obra_id <> v_projeto.obra_id then
        raise exception 'Projeto possui vinculos de obra conflitantes.';
      end if;
      v_obra_id := v_projeto.obra_id;
    end if;

    if v_obra_id is null then
      insert into public.obras (
        nome, endereco, foto_url, status, data_inicio, data_previsao,
        responsavel, projeto_id, area_m2
      ) values (
        coalesce(v_orcamento.nome, v_projeto.nome),
        coalesce(v_orcamento.endereco, v_projeto.endereco, ''),
        v_projeto.foto_url, 'ativa',
        coalesce(v_orcamento.data_inicio, v_projeto.data_inicio),
        coalesce(v_orcamento.data_previsao, v_projeto.data_previsao),
        coalesce(v_orcamento.responsavel, v_projeto.responsavel),
        v_projeto.id, v_orcamento.area_m2
      ) returning id into v_obra_id;
    elsif exists (select 1 from public.obras where id = v_obra_id and status = 'concluida') then
      raise exception 'A obra vinculada ja esta concluida.';
    end if;

    update public.projetos
    set obra_id = v_obra_id, fase_ciclo = 'em_obra', updated_at = now()
    where id = v_projeto.id;

    update public.cronogramas
    set obra_id = v_obra_id,
        status = case when status = 'rascunho' then 'ativo' else status end
    where projeto_id = v_projeto.id;

    -- As etapas formam o cronograma unico do projeto e conservam seus IDs.
    update public.etapas
    set obra_id = v_obra_id
    where projeto_id = v_projeto.id and obra_id is null;
  else
    v_obra_id := v_orcamento.obra_id;
    if v_obra_id is null then
      insert into public.obras (
        nome, endereco, status, data_inicio, data_previsao,
        responsavel, area_m2, uf
      ) values (
        coalesce(v_orcamento.nome, 'Nova obra'),
        coalesce(v_orcamento.endereco, ''), 'ativa',
        v_orcamento.data_inicio, v_orcamento.data_previsao,
        v_orcamento.responsavel, v_orcamento.area_m2,
        coalesce(nullif(v_orcamento.uf, ''), 'SP')
      ) returning id into v_obra_id;
    end if;

    update public.etapas e
    set obra_id = v_obra_id
    where e.obra_id is null
      and exists (
        select 1 from public.orcamento_itens oi
        where oi.orcamento_id = v_orcamento.id and oi.etapa_id = e.id
      );
  end if;

  perform public.congelar_orcamento(v_orcamento.id);
  update public.orcamentos
  set obra_id = v_obra_id, status = 'ativo'
  where id = v_orcamento.id;

  return jsonb_build_object(
    'projeto_id', v_orcamento.projeto_id,
    'orcamento_id', v_orcamento.id,
    'obra_id', v_obra_id,
    'fase_ciclo', case when v_orcamento.projeto_id is null then null else 'em_obra' end,
    'status', 'ativo'
  );
end;
$$;

-- Compatibilidade com clientes antigos: encaminha o projeto ao seu orcamento principal.
create or replace function public.iniciar_obra(p_projeto_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_orcamento_id uuid;
begin
  select id into v_orcamento_id
  from public.orcamentos
  where projeto_id = p_projeto_id and is_principal
  order by versao desc, created_at desc
  limit 1;

  if v_orcamento_id is null then
    perform public.criar_planejamento_projeto_manual(p_projeto_id);
    select id into v_orcamento_id
    from public.orcamentos
    where projeto_id = p_projeto_id and is_principal
    order by versao desc, created_at desc
    limit 1;
  end if;

  return public.iniciar_obra_por_orcamento(v_orcamento_id);
end;
$$;

create or replace function public.finalizar_orcamento(p_orcamento_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.iniciar_obra_por_orcamento(p_orcamento_id);
end;
$$;

create or replace function public.entregar_obra(p_projeto_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_projeto public.projetos%rowtype;
begin
  select * into v_projeto
  from public.projetos
  where id = p_projeto_id
  for update;

  if not found then raise exception 'Projeto nao encontrado.'; end if;
  if v_projeto.obra_id is null then raise exception 'Inicie a obra por um orcamento antes da entrega.'; end if;

  update public.projetos
  set fase_ciclo = 'entregue', updated_at = now()
  where id = p_projeto_id;
  update public.obras set status = 'concluida' where id = v_projeto.obra_id;
  update public.cronogramas set status = 'concluido' where projeto_id = p_projeto_id;

  return jsonb_build_object(
    'projeto_id', p_projeto_id,
    'obra_id', v_projeto.obra_id,
    'fase_ciclo', 'entregue',
    'status', 'concluida'
  );
end;
$$;

revoke all on function public.iniciar_obra_por_orcamento(uuid) from public;
grant execute on function public.iniciar_obra_por_orcamento(uuid) to anon, authenticated, service_role;
