-- Ciclo unico Projeto -> Obra -> Entrega.
-- Os registros de planejamento sao vinculados, nunca copiados.

alter table public.orcamentos
  add column if not exists gerenciamento_percentual numeric(7,4) not null default 0,
  add column if not exists is_principal boolean not null default false,
  add column if not exists travado_em timestamptz;

alter table public.orcamentos
  drop constraint if exists orcamentos_gerenciamento_percentual_check;
alter table public.orcamentos
  add constraint orcamentos_gerenciamento_percentual_check
  check (gerenciamento_percentual >= 0 and gerenciamento_percentual <= 100);

alter table public.medicao_itens
  add column if not exists valor_pago numeric(14,2) not null default 0;

alter table public.medicoes drop constraint if exists medicoes_eixo_check;
alter table public.medicoes add constraint medicoes_eixo_check
  check (eixo in ('fisico', 'mao_obra', 'gerenciamento'));

-- Normaliza os estados sem apagar os estados historicos das obras independentes.
alter table public.projetos drop constraint if exists projetos_status_check;
update public.projetos
set status = case when status = 'concluido' then 'entregue' else 'projeto' end
where status not in ('projeto', 'em_obra', 'entregue');
alter table public.projetos alter column status set default 'projeto';
alter table public.projetos add constraint projetos_status_check
  check (status in ('projeto', 'em_obra', 'entregue'));

alter table public.orcamentos drop constraint if exists orcamentos_status_check;
update public.orcamentos set status = 'em_projeto' where status = 'rascunho';
alter table public.orcamentos alter column status set default 'em_projeto';
alter table public.orcamentos add constraint orcamentos_status_check
  check (status in ('em_projeto', 'ativo', 'finalizado', 'arquivado'));

update public.cronogramas set status = 'em_projeto' where status = 'rascunho';
alter table public.cronogramas alter column status set default 'em_projeto';

-- Um projeto gera uma unica obra, um orcamento principal e um cronograma.
create unique index if not exists obras_projeto_id_unique
  on public.obras (projeto_id) where projeto_id is not null;
create unique index if not exists orcamentos_projeto_principal_unique
  on public.orcamentos (projeto_id) where projeto_id is not null and is_principal;
create unique index if not exists cronogramas_projeto_id_unique
  on public.cronogramas (projeto_id) where projeto_id is not null;

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
  values (new.id, null, 'Cronograma - ' || new.nome, 'em_projeto')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists projetos_criar_planejamento on public.projetos;
create trigger projetos_criar_planejamento
after insert on public.projetos
for each row execute function public.criar_planejamento_projeto();

-- Backfill conservador: cria somente os planejamentos ausentes. Obras sem projeto
-- (incluindo as obras legadas) nao recebem qualquer vinculo inventado.
insert into public.orcamentos (
  projeto_id, obra_id, nome, cliente, endereco, responsavel,
  data_inicio, data_previsao, tipo, bdi_percentual,
  gerenciamento_percentual, status, versao, is_principal
)
select p.id, p.obra_id, p.nome, p.cliente, p.endereco, p.responsavel,
       p.data_inicio, p.data_previsao, 'executivo', 25, 0,
       case when p.status = 'em_obra' then 'ativo' else 'em_projeto' end,
       1, true
from public.projetos p
where not exists (select 1 from public.orcamentos o where o.projeto_id = p.id);

with primeiro as (
  select distinct on (o.projeto_id) o.id
  from public.orcamentos o
  where o.projeto_id is not null
    and not exists (
      select 1 from public.orcamentos p
      where p.projeto_id = o.projeto_id and p.is_principal
    )
  order by o.projeto_id, o.versao, o.created_at
)
update public.orcamentos o set is_principal = true
from primeiro p where p.id = o.id;

insert into public.cronogramas (projeto_id, obra_id, nome, status)
select p.id, p.obra_id, 'Cronograma - ' || p.nome,
       case when p.status = 'em_obra' then 'ativo' when p.status = 'entregue' then 'concluido' else 'em_projeto' end
from public.projetos p
where not exists (select 1 from public.cronogramas c where c.projeto_id = p.id);

-- Congela os insumos vivos das composicoes proprias no proprio orcamento.
-- A partir daqui alteracoes no catalogo nao mudam nomes, unidades ou precos aprovados.
create or replace function public.congelar_orcamento(p_orcamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.orcamento_item_insumos (
    orcamento_item_id, sinapi_codigo, quantidade_calculada, quantidade_adotada,
    preco_unitario_snapshot, descricao_snapshot, unidade_snapshot,
    classificacao_snapshot, grupo_snapshot, coeficiente_snapshot, ordem
  )
  select
    oi.id,
    coalesce(si.codigo, ip.codigo, 'INS-' || ci.id::text),
    oi.quantidade * ci.coeficiente,
    oi.quantidade * ci.coeficiente,
    coalesce(
      case when si.id is not null then
        coalesce(nullif(si.precos ->> coalesce(o.uf, 'SP'), '')::numeric, si.preco_unitario)
      end,
      ip.preco_unitario,
      0
    ),
    coalesce(si.descricao, ip.descricao, 'Insumo'),
    coalesce(si.unidade, ip.unidade, 'UN'),
    case
      when coalesce(si.classificacao, ip.classificacao, ip.categoria, '') in ('MAO_DE_OBRA', 'MAO DE OBRA') then 'MAO_DE_OBRA'
      when coalesce(si.classificacao, ip.classificacao, ip.categoria, '') = 'EQUIPAMENTO' then 'EQUIPAMENTO'
      else 'MATERIAL_SERVICOS'
    end,
    ip.grupo,
    ci.coeficiente,
    row_number() over (partition by oi.id order by ci.created_at, ci.id)::integer - 1
  from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  join public.composicao_insumos ci on ci.composicao_id = oi.composicao_id
  left join public.sinapi_insumos si on si.id = ci.insumo_id
  left join public.insumos_proprios ip on ip.id = ci.insumo_proprio_id
  where oi.orcamento_id = p_orcamento_id
    and not exists (
      select 1 from public.orcamento_item_insumos snap
      where snap.orcamento_item_id = oi.id
    );

  update public.orcamentos
  set travado_em = coalesce(travado_em, now())
  where id = p_orcamento_id;
end;
$$;

-- Helper explicito para RPC e backfills. Mantem a funcao de trigger simples.
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
    v_projeto.id, v_projeto.obra_id, v_projeto.nome, v_projeto.cliente,
    v_projeto.endereco, v_projeto.responsavel, v_projeto.data_inicio,
    v_projeto.data_previsao, 'executivo', 25, 0,
    case when v_projeto.status = 'em_obra' then 'ativo' else 'em_projeto' end,
    1, true
  ) on conflict do nothing;

  insert into public.cronogramas (projeto_id, obra_id, nome, status)
  values (
    v_projeto.id, v_projeto.obra_id, 'Cronograma - ' || v_projeto.nome,
    case when v_projeto.status = 'em_obra' then 'ativo' else 'em_projeto' end
  ) on conflict do nothing;
end;
$$;

-- A definicao precisa existir antes da RPC que a chama; recompila a RPC depois.
create or replace function public.iniciar_obra(p_projeto_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_projeto public.projetos%rowtype;
  v_obra_id uuid;
  v_orcamento_id uuid;
begin
  select * into v_projeto from public.projetos where id = p_projeto_id for update;
  if not found then raise exception 'Projeto nao encontrado.'; end if;
  if v_projeto.status = 'entregue' then raise exception 'Projeto ja foi entregue.'; end if;

  perform public.criar_planejamento_projeto_manual(p_projeto_id);
  select id into v_obra_id from public.obras where projeto_id = p_projeto_id;

  if v_projeto.obra_id is not null then
    if v_obra_id is not null and v_obra_id <> v_projeto.obra_id then
      raise exception 'Projeto possui vinculos de obra conflitantes.';
    end if;
    v_obra_id := v_projeto.obra_id;
  end if;

  if v_obra_id is null then
    insert into public.obras (nome, endereco, foto_url, status, data_inicio, data_previsao, responsavel, projeto_id)
    values (v_projeto.nome, coalesce(v_projeto.endereco, ''), v_projeto.foto_url, 'ativa', v_projeto.data_inicio, v_projeto.data_previsao, v_projeto.responsavel, v_projeto.id)
    returning id into v_obra_id;
  else
    update public.obras set projeto_id = p_projeto_id, status = 'ativa' where id = v_obra_id;
  end if;

  if exists (select 1 from public.etapas where projeto_id = p_projeto_id and obra_id is not null and obra_id <> v_obra_id) then
    raise exception 'Existem etapas do projeto vinculadas a outra obra.';
  end if;

  update public.projetos set obra_id = v_obra_id, status = 'em_obra', updated_at = now() where id = p_projeto_id;
  update public.orcamentos set obra_id = v_obra_id, status = case when status = 'em_projeto' then 'ativo' else status end where projeto_id = p_projeto_id;
  update public.cronogramas set obra_id = v_obra_id, status = case when status = 'em_projeto' then 'ativo' else status end where projeto_id = p_projeto_id;
  update public.etapas set obra_id = v_obra_id where projeto_id = p_projeto_id and obra_id is null;

  for v_orcamento_id in select id from public.orcamentos where projeto_id = p_projeto_id and status <> 'arquivado'
  loop perform public.congelar_orcamento(v_orcamento_id); end loop;

  return jsonb_build_object('projeto_id', p_projeto_id, 'obra_id', v_obra_id, 'status', 'em_obra');
end;
$$;

create or replace function public.finalizar_orcamento(p_orcamento_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_orcamento public.orcamentos%rowtype;
begin
  select * into v_orcamento from public.orcamentos where id = p_orcamento_id for update;
  if not found then raise exception 'Orcamento nao encontrado.'; end if;
  perform public.congelar_orcamento(p_orcamento_id);
  if v_orcamento.projeto_id is not null then
    return public.iniciar_obra(v_orcamento.projeto_id);
  end if;
  update public.orcamentos set status = case when obra_id is null then 'finalizado' else 'ativo' end where id = p_orcamento_id;
  return jsonb_build_object('orcamento_id', p_orcamento_id, 'obra_id', v_orcamento.obra_id, 'status', case when v_orcamento.obra_id is null then 'finalizado' else 'ativo' end);
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
  select * into v_projeto from public.projetos where id = p_projeto_id for update;
  if not found then raise exception 'Projeto nao encontrado.'; end if;
  if v_projeto.obra_id is null then raise exception 'Inicie a obra antes de entrega-la.'; end if;

  update public.projetos set status = 'entregue', updated_at = now() where id = p_projeto_id;
  update public.obras set status = 'concluida' where id = v_projeto.obra_id;
  update public.cronogramas set status = 'concluido' where projeto_id = p_projeto_id;

  return jsonb_build_object('projeto_id', p_projeto_id, 'obra_id', v_projeto.obra_id, 'status', 'entregue');
end;
$$;

revoke all on function public.criar_planejamento_projeto_manual(uuid) from public;
revoke all on function public.congelar_orcamento(uuid) from public;
revoke all on function public.iniciar_obra(uuid) from public;
revoke all on function public.finalizar_orcamento(uuid) from public;
revoke all on function public.entregar_obra(uuid) from public;
grant execute on function public.criar_planejamento_projeto_manual(uuid) to anon, authenticated, service_role;
grant execute on function public.congelar_orcamento(uuid) to anon, authenticated, service_role;
grant execute on function public.iniciar_obra(uuid) to anon, authenticated, service_role;
grant execute on function public.finalizar_orcamento(uuid) to anon, authenticated, service_role;
grant execute on function public.entregar_obra(uuid) to anon, authenticated, service_role;

-- Mantem o calculo dos cards de obra compativel com o novo estado.
create or replace function public.obras_avanco_fisico_ativo()
returns table (obra_id uuid, avanco_fisico numeric, orcamentos_ativos integer)
language sql stable security invoker set search_path = '' as $$
  with itemizado as (
    select o.obra_id, o.id as orcamento_id,
      coalesce(i.valor_total_informado_snapshot, i.quantidade * i.preco_unitario_snapshot, 0) as valor,
      coalesce(e.percentual_executado, 0) as percentual
    from public.orcamentos o
    left join public.orcamento_itens i on i.orcamento_id = o.id
    left join public.etapas e on e.id = i.etapa_id
    where o.obra_id is not null and o.status = 'ativo'
  ), por_orcamento as (
    select obra_id, orcamento_id,
      case when sum(valor) > 0 then sum(valor * percentual) / sum(valor) else avg(percentual) end as avanco
    from itemizado group by obra_id, orcamento_id
  )
  select obra_id, round(coalesce(avg(avanco), 0), 2), count(*)::integer
  from por_orcamento group by obra_id;
$$;
