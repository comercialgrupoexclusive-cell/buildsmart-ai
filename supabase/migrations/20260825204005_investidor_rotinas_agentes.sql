-- Laboratório Investidor — Rodada 8: Rotinas + Agentes.
-- Estrutura mínima e auditável: agentes definem papéis/permissões; rotinas
-- definem gatilhos; runs registram cada execução. Nada executa sozinho nesta
-- migration e nenhuma rotina escreve em prospecções/cenários/ativos.
--
-- NOTA (Hotfix pré-reunião, sincronização de drift): esta migration já
-- estava aplicada ao vivo no Supabase (fora do controle de versão — nenhum
-- commit do repositório a criou) quando este hotfix começou. Foi
-- encontrada durante a Rodada de hotfix pré-reunião ao investigar
-- `list_migrations`, junto com `investidor_rotina_padrao` logo abaixo.
-- Este arquivo só espelha o que já existe ao vivo, para o repositório
-- parar de divergir do banco — nenhuma tela ou tool desta rodada usa essas
-- tabelas. O hotfix pré-reunião foi explícito em não avançar Rotinas/
-- Agentes (Marco 8); ver RELATORIO_INVESTIDOR_HOTFIX_PRE_REUNIAO.md.
create table if not exists public.investidor_agentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'prospeccao',
  descricao text,
  ativo boolean not null default true,
  skill text not null default 'investidor',
  permissoes jsonb not null default '["read"]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investidor_agentes_tipo_check check (tipo in ('prospeccao', 'cenario', 'mercado', 'carteira')),
  constraint investidor_agentes_nome_unique unique (nome)
);

create table if not exists public.investidor_rotinas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid references public.investidor_agentes(id) on delete set null,
  nome text not null,
  descricao text,
  tipo text not null default 'triagem_prospeccoes',
  frequencia text not null default 'manual',
  horario time null,
  dias_semana int[] not null default '{}'::int[],
  ativo boolean not null default true,
  parametros jsonb not null default '{}'::jsonb,
  proxima_execucao timestamptz null,
  ultima_execucao timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investidor_rotinas_tipo_check check (tipo in ('triagem_prospeccoes', 'revisao_cenarios', 'monitoramento_leilao', 'pesquisa_mercado')),
  constraint investidor_rotinas_frequencia_check check (frequencia in ('manual', 'diaria', 'semanal'))
);

create table if not exists public.investidor_rotina_runs (
  id uuid primary key default gen_random_uuid(),
  rotina_id uuid not null references public.investidor_rotinas(id) on delete cascade,
  agente_id uuid references public.investidor_agentes(id) on delete set null,
  status text not null default 'concluida',
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  resumo text,
  resultado jsonb not null default '{}'::jsonb,
  erro text,
  created_by uuid null,
  constraint investidor_rotina_runs_status_check check (status in ('rodando', 'concluida', 'erro', 'cancelada'))
);

create index if not exists idx_investidor_rotinas_agente on public.investidor_rotinas(agente_id);
create index if not exists idx_investidor_rotinas_ativo on public.investidor_rotinas(ativo, proxima_execucao);
create index if not exists idx_investidor_rotina_runs_rotina on public.investidor_rotina_runs(rotina_id, started_at desc);

alter table public.investidor_agentes enable row level security;
alter table public.investidor_rotinas enable row level security;
alter table public.investidor_rotina_runs enable row level security;

drop policy if exists investidor_agentes_mvp_all on public.investidor_agentes;
drop policy if exists investidor_rotinas_mvp_all on public.investidor_rotinas;
drop policy if exists investidor_rotina_runs_mvp_all on public.investidor_rotina_runs;
create policy investidor_agentes_mvp_all on public.investidor_agentes for all using (true) with check (true);
create policy investidor_rotinas_mvp_all on public.investidor_rotinas for all using (true) with check (true);
create policy investidor_rotina_runs_mvp_all on public.investidor_rotina_runs for all using (true) with check (true);

insert into public.investidor_agentes (nome, tipo, descricao, permissoes, config)
values (
  'Agente de Prospecção',
  'prospeccao',
  'Acompanha oportunidades, próximos leilões, ausência de cenários e pontos de atenção do laboratório investidor.',
  '["read","propose"]'::jsonb,
  '{"escopo":"prospeccoes","modo":"assistido"}'::jsonb
)
on conflict (nome) do update
set descricao = excluded.descricao,
    permissoes = excluded.permissoes,
    config = excluded.config,
    updated_at = now();

create or replace function public.investidor_executar_rotina(
  p_rotina_id uuid,
  p_actor text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rotina record;
  total_prospeccoes int := 0;
  sem_cenario int := 0;
  proximos_leiloes int := 0;
  em_analise int := 0;
  resumo text;
  resultado jsonb;
  run_id uuid;
begin
  select r.*, a.nome as agente_nome
    into rotina
  from public.investidor_rotinas r
  left join public.investidor_agentes a on a.id = r.agente_id
  where r.id = p_rotina_id;

  if rotina.id is null then
    raise exception 'rotina_nao_encontrada';
  end if;

  select count(*) into total_prospeccoes from public.prospeccoes;
  select count(*) into em_analise from public.prospeccoes where fase = 'em_analise';
  select count(*) into proximos_leiloes
  from public.prospeccoes
  where data_leilao is not null
    and data_leilao >= current_date
    and data_leilao <= current_date + interval '14 days';

  select count(*) into sem_cenario
  from public.prospeccoes p
  where not exists (
    select 1 from public.prospeccao_cenarios c where c.prospeccao_id = p.id
  );

  resumo := concat(
    coalesce(rotina.agente_nome, 'Agente'), ' executou "', rotina.nome, '": ',
    total_prospeccoes, ' prospecção(ões), ',
    em_analise, ' em análise, ',
    proximos_leiloes, ' leilão(ões) nos próximos 14 dias, ',
    sem_cenario, ' sem cenário financeiro.'
  );

  resultado := jsonb_build_object(
    'rotina_id', rotina.id,
    'rotina_nome', rotina.nome,
    'agente_nome', rotina.agente_nome,
    'tipo', rotina.tipo,
    'actor', p_actor,
    'indicadores', jsonb_build_object(
      'total_prospeccoes', total_prospeccoes,
      'em_analise', em_analise,
      'proximos_leiloes_14d', proximos_leiloes,
      'sem_cenario', sem_cenario
    )
  );

  insert into public.investidor_rotina_runs (rotina_id, agente_id, status, finished_at, resumo, resultado)
  values (rotina.id, rotina.agente_id, 'concluida', now(), resumo, resultado)
  returning id into run_id;

  update public.investidor_rotinas
  set ultima_execucao = now(), updated_at = now()
  where id = rotina.id;

  return resultado || jsonb_build_object('run_id', run_id, 'resumo', resumo);
end;
$$;

revoke all on function public.investidor_executar_rotina(uuid, text) from public;
grant execute on function public.investidor_executar_rotina(uuid, text) to anon, authenticated, service_role;

alter table public.luizia_pending_task_actions
  drop constraint if exists luizia_pending_task_actions_tool_check;

alter table public.luizia_pending_task_actions
  add constraint luizia_pending_task_actions_tool_check
  check (tool = any (array[
    'create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task',
    'create_alert', 'update_alert',
    'create_prospeccao', 'update_prospeccao',
    'create_cenario', 'update_cenario', 'delete_cenario', 'set_cenario_principal',
    'convert_to_ativo',
    'create_investidor_rotina', 'update_investidor_rotina', 'run_investidor_rotina'
  ]));
