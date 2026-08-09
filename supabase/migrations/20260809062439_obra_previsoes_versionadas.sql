create table if not exists public.obra_previsoes (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null default gen_random_uuid(),
  versao integer not null default 1 check (versao > 0),
  vigente boolean not null default true,
  obra_id uuid not null references public.obras(id) on delete cascade,
  orcamento_id uuid references public.orcamentos(id) on delete set null,
  etapa_id uuid references public.etapas(id) on delete set null,
  subetapa_id uuid references public.subetapas_cronograma(id) on delete set null,
  servico_id uuid references public.servicos_cronograma(id) on delete set null,
  compra_item_id uuid references public.compra_itens(id) on delete set null,
  medicao_id uuid references public.medicoes(id) on delete set null,
  tipo text not null check (tipo in ('compra_material', 'desembolso_financeiro', 'mao_obra', 'outro')),
  titulo text not null check (length(trim(titulo)) between 2 and 180),
  descricao text,
  valor_previsto numeric check (valor_previsto is null or valor_previsto >= 0),
  data_prevista date not null,
  valor_realizado numeric check (valor_realizado is null or valor_realizado >= 0),
  data_realizada date,
  condicao_pagamento text check (condicao_pagamento is null or condicao_pagamento in ('pix', 'boleto', 'cartao', 'entrada_saldo', 'outro')),
  status text not null default 'prevista' check (status in ('prevista', 'confirmada', 'realizada', 'substituida', 'cancelada')),
  origem text not null default 'manual' check (origem in ('manual', 'orcamento', 'cronograma', 'material', 'compra', 'ia', 'baseline_importado')),
  baseline boolean not null default false,
  publicado_cliente boolean not null default false,
  observacao_interna text,
  metadados jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (serie_id, versao)
);

create unique index if not exists idx_obra_previsoes_serie_vigente
  on public.obra_previsoes(serie_id) where vigente;
create index if not exists idx_obra_previsoes_obra_data
  on public.obra_previsoes(obra_id, data_prevista) where vigente;
create index if not exists idx_obra_previsoes_orcamento
  on public.obra_previsoes(orcamento_id) where vigente;
create index if not exists idx_obra_previsoes_etapa on public.obra_previsoes(etapa_id);
create index if not exists idx_obra_previsoes_subetapa on public.obra_previsoes(subetapa_id);
create index if not exists idx_obra_previsoes_servico on public.obra_previsoes(servico_id);
create index if not exists idx_obra_previsoes_compra on public.obra_previsoes(compra_item_id);
create index if not exists idx_obra_previsoes_medicao on public.obra_previsoes(medicao_id);
create index if not exists idx_obra_previsoes_created_by on public.obra_previsoes(created_by);

alter table public.obra_previsoes enable row level security;

create or replace function public.obra_previsoes_list(
  p_obra_id uuid,
  p_orcamento_id text default 'todos'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'serieId', p.serie_id,
    'versao', p.versao,
    'obraId', p.obra_id,
    'orcamentoId', p.orcamento_id,
    'orcamentoNome', coalesce(o.nome, case when p.orcamento_id is null then 'Geral da obra' else 'Orcamento' end),
    'etapaId', p.etapa_id,
    'etapaNome', e.nome,
    'subetapaId', p.subetapa_id,
    'subetapaNome', se.nome,
    'servicoId', p.servico_id,
    'servicoNome', sc.nome,
    'tipo', p.tipo,
    'titulo', p.titulo,
    'descricao', p.descricao,
    'valorPrevisto', p.valor_previsto,
    'dataPrevista', p.data_prevista,
    'valorRealizado', p.valor_realizado,
    'dataRealizada', p.data_realizada,
    'condicaoPagamento', p.condicao_pagamento,
    'status', p.status,
    'origem', p.origem,
    'baseline', p.baseline,
    'publicadoCliente', p.publicado_cliente,
    'observacaoInterna', p.observacao_interna,
    'createdAt', p.created_at,
    'updatedAt', p.updated_at
  ) order by p.data_prevista, p.created_at), '[]'::jsonb)
  from public.obra_previsoes p
  left join public.orcamentos o on o.id = p.orcamento_id
  left join public.etapas e on e.id = p.etapa_id
  left join public.subetapas_cronograma se on se.id = p.subetapa_id
  left join public.servicos_cronograma sc on sc.id = p.servico_id
  where p.obra_id = p_obra_id
    and p.vigente
    and (p_orcamento_id is null or p_orcamento_id = 'todos' or p.orcamento_id = p_orcamento_id::uuid);
$$;

create or replace function public.obra_previsao_save(
  p_obra_id uuid,
  p_id uuid,
  p_payload jsonb,
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  anterior public.obra_previsoes;
  novo public.obra_previsoes;
  budget_id uuid := nullif(p_payload->>'orcamentoId', '')::uuid;
  stage_id uuid := nullif(p_payload->>'etapaId', '')::uuid;
  substage_id uuid := nullif(p_payload->>'subetapaId', '')::uuid;
  service_id uuid := nullif(p_payload->>'servicoId', '')::uuid;
  next_series uuid := gen_random_uuid();
  next_version integer := 1;
  next_status text := coalesce(nullif(p_payload->>'status', ''), 'prevista');
begin
  if not exists (select 1 from public.obras where id = p_obra_id) then
    raise exception 'obra_nao_encontrada' using errcode = '22023';
  end if;
  if budget_id is not null and not exists (select 1 from public.orcamentos where id = budget_id and obra_id = p_obra_id) then
    raise exception 'orcamento_invalido' using errcode = '22023';
  end if;
  if stage_id is not null and not exists (select 1 from public.etapas where id = stage_id and obra_id = p_obra_id) then
    raise exception 'etapa_invalida' using errcode = '22023';
  end if;
  if substage_id is not null and not exists (
    select 1 from public.subetapas_cronograma s join public.etapas e on e.id = s.etapa_id
    where s.id = substage_id and e.obra_id = p_obra_id and (stage_id is null or e.id = stage_id)
  ) then raise exception 'subetapa_invalida' using errcode = '22023'; end if;
  if service_id is not null and not exists (
    select 1 from public.servicos_cronograma s
    join public.subetapas_cronograma se on se.id = s.subetapa_id
    join public.etapas e on e.id = se.etapa_id
    where s.id = service_id and e.obra_id = p_obra_id and (substage_id is null or se.id = substage_id)
  ) then raise exception 'servico_invalido' using errcode = '22023'; end if;
  if length(trim(coalesce(p_payload->>'titulo', ''))) < 2 then raise exception 'titulo_obrigatorio'; end if;
  if nullif(p_payload->>'dataPrevista', '') is null then raise exception 'data_obrigatoria'; end if;

  if p_id is not null then
    select * into anterior from public.obra_previsoes
    where id = p_id and obra_id = p_obra_id and vigente for update;
    if anterior.id is null then raise exception 'previsao_nao_encontrada' using errcode = '22023'; end if;
    next_series := anterior.serie_id;
    next_version := anterior.versao + 1;
    update public.obra_previsoes set vigente = false, status = 'substituida', updated_at = now() where id = anterior.id;
  end if;

  insert into public.obra_previsoes (
    serie_id, versao, obra_id, orcamento_id, etapa_id, subetapa_id, servico_id,
    tipo, titulo, descricao, valor_previsto, data_prevista, valor_realizado, data_realizada,
    condicao_pagamento, status, origem, baseline, publicado_cliente, observacao_interna, created_by
  ) values (
    next_series, next_version, p_obra_id, budget_id, stage_id, substage_id, service_id,
    p_payload->>'tipo', trim(p_payload->>'titulo'), nullif(trim(p_payload->>'descricao'), ''),
    nullif(p_payload->>'valorPrevisto', '')::numeric, (p_payload->>'dataPrevista')::date,
    nullif(p_payload->>'valorRealizado', '')::numeric, nullif(p_payload->>'dataRealizada', '')::date,
    nullif(p_payload->>'condicaoPagamento', ''), next_status,
    coalesce(nullif(p_payload->>'origem', ''), 'manual'),
    coalesce((p_payload->>'baseline')::boolean, false),
    coalesce((p_payload->>'publicadoCliente')::boolean, false),
    nullif(trim(p_payload->>'observacaoInterna'), ''), p_profile_id
  ) returning * into novo;

  insert into public.portal_audit_log (
    user_id, obra_id, orcamento_id, origem, ferramenta, entidade, entidade_id,
    acao, valor_anterior, valor_novo
  ) values (
    p_profile_id, p_obra_id, budget_id, 'operacional', 'forecast.save', 'obra_previsao', novo.id::text,
    case when anterior.id is null then 'create' else 'version' end,
    case when anterior.id is null then null else to_jsonb(anterior) end, to_jsonb(novo)
  );

  return jsonb_build_object('id', novo.id, 'serieId', novo.serie_id, 'versao', novo.versao);
end;
$$;

create or replace function public.portal_get_previsoes(
  p_token_hash text,
  p_orcamento_id text default 'todos'
)
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'orcamentoId', p.orcamento_id,
    'orcamentoNome', coalesce(o.nome, 'Geral da obra'),
    'tipo', p.tipo,
    'titulo', p.titulo,
    'descricao', p.descricao,
    'valorPrevisto', p.valor_previsto,
    'dataPrevista', p.data_prevista,
    'valorRealizado', p.valor_realizado,
    'dataRealizada', p.data_realizada,
    'condicaoPagamento', p.condicao_pagamento,
    'status', p.status,
    'origem', p.origem,
    'baseline', p.baseline,
    'etapaNome', e.nome
  ) order by p.data_prevista), '[]'::jsonb) into resultado
  from public.obra_previsoes p
  left join public.orcamentos o on o.id = p.orcamento_id
  left join public.etapas e on e.id = p.etapa_id
  where p.obra_id = acesso.obra_id
    and p.vigente
    and p.publicado_cliente
    and p.status not in ('cancelada', 'substituida')
    and (budget_id is null or p.orcamento_id = budget_id);
  return resultado;
end;
$$;

revoke all on function public.obra_previsoes_list(uuid, text) from public, anon, authenticated;
revoke all on function public.obra_previsao_save(uuid, uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.portal_get_previsoes(text, text) from public, anon, authenticated;
grant execute on function public.obra_previsoes_list(uuid, text) to anon, service_role;
grant execute on function public.obra_previsao_save(uuid, uuid, jsonb, uuid) to anon, service_role;
grant execute on function public.portal_get_previsoes(text, text) to anon, service_role;
