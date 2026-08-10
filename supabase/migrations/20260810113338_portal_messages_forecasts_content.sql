-- Portal: mensagens, conteudo granular, previsoes assistidas e financeiro completo.

alter table public.portal_configuracoes
  add column if not exists conteudos jsonb not null default '{}'::jsonb;

create or replace function public.portal_content_defaults()
returns jsonb language sql immutable set search_path = '' as $$
  select '{
    "feed":{"stories":true,"posts":true,"messages":true},
    "overview":{"hero":true,"indicators":true,"charts":true,"forecasts":true,"quickLinks":true},
    "evolucao":{"indicators":true,"activeStages":true,"stageProgress":true},
    "financeiro":{"indicators":true,"chart":true,"recent":true,"allEntries":true},
    "previsoes":{"indicators":true,"launches":true,"purchases":true,"charts":true}
  }'::jsonb;
$$;

create or replace function public.portal_content_admin_get(p_profile_id uuid, p_obra_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if not exists (select 1 from public.profiles where id=p_profile_id and tipo in ('admin','usuario')) then
    raise exception 'portal_content_management_denied' using errcode='42501';
  end if;
  select public.portal_content_defaults() || coalesce(c.conteudos,'{}'::jsonb) into resultado
  from public.portal_configuracoes c where c.obra_id=p_obra_id;
  return coalesce(resultado, public.portal_content_defaults());
end; $$;

create or replace function public.portal_content_admin_set(
  p_profile_id uuid, p_obra_id uuid, p_secao text, p_item text, p_habilitado boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare atual jsonb; caminho text[];
begin
  if not exists (select 1 from public.profiles where id=p_profile_id and tipo in ('admin','usuario')) then
    raise exception 'portal_content_management_denied' using errcode='42501';
  end if;
  atual := public.portal_content_admin_get(p_profile_id,p_obra_id);
  if not (atual ? p_secao) or not ((atual->p_secao) ? p_item) then
    raise exception 'portal_content_item_invalid' using errcode='22023';
  end if;
  caminho := array[p_secao,p_item];
  atual := jsonb_set(atual,caminho,to_jsonb(p_habilitado),true);
  insert into public.portal_configuracoes(obra_id,secoes,conteudos,updated_by,updated_at)
  values(p_obra_id,public.portal_visibility_defaults(),atual,p_profile_id,now())
  on conflict(obra_id) do update set conteudos=excluded.conteudos,updated_by=excluded.updated_by,updated_at=now();
  return atual;
end; $$;

create or replace function public.portal_get_content_visibility(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare acesso public.portal_access_links; resultado jsonb;
begin
  acesso := public.portal_authorize(p_token_hash);
  select public.portal_content_defaults() || coalesce(c.conteudos,'{}'::jsonb) into resultado
  from public.portal_configuracoes c where c.obra_id=acesso.obra_id;
  return coalesce(resultado,public.portal_content_defaults());
end; $$;

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  portal_access_id uuid references public.portal_access_links(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  destinatario_profile_id uuid references public.profiles(id) on delete set null,
  author_type text not null check(author_type in ('equipe','cliente')),
  texto text not null check(length(trim(texto)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_messages_obra_created on public.portal_messages(obra_id,created_at);
alter table public.portal_messages enable row level security;

create or replace function public.portal_message_json(m public.portal_messages)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',m.id,'authorType',m.author_type,'texto',m.texto,'createdAt',m.created_at,
    'autor',case when m.author_type='cliente' then coalesce(a.nome,'Cliente') else coalesce(p.apelido,p.name,'Equipe') end,
    'destinatario',coalesce(dp.apelido,dp.name,'Equipe da obra')
  ) from public.portal_access_links a
  left join public.profiles p on p.id=m.profile_id
  left join public.profiles dp on dp.id=m.destinatario_profile_id
  where a.id is not distinct from m.portal_access_id;
$$;

create or replace function public.portal_messages_get(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare acesso public.portal_access_links;
begin
  acesso:=public.portal_authorize(p_token_hash);
  return coalesce((select jsonb_agg(public.portal_message_json(m) order by m.created_at)
    from public.portal_messages m where m.obra_id=acesso.obra_id
      and (m.portal_access_id is null or m.portal_access_id=acesso.id)), '[]'::jsonb);
end; $$;

create or replace function public.portal_message_send(p_token_hash text,p_texto text,p_destinatario_profile_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare acesso public.portal_access_links; nova public.portal_messages;
begin
  acesso:=public.portal_authorize(p_token_hash);
  if p_destinatario_profile_id is not null and not exists(
    select 1 from public.obra_usuarios where obra_id=acesso.obra_id and profile_id=p_destinatario_profile_id
  ) then raise exception 'portal_message_recipient_denied' using errcode='42501'; end if;
  insert into public.portal_messages(obra_id,portal_access_id,destinatario_profile_id,author_type,texto)
  values(acesso.obra_id,acesso.id,p_destinatario_profile_id,'cliente',trim(p_texto)) returning * into nova;
  insert into public.portal_notifications(usuario_id,obra_id,tipo,titulo,mensagem)
  select ou.profile_id,acesso.obra_id,'portal_message','Nova mensagem do cliente',left(trim(p_texto),240)
  from public.obra_usuarios ou where ou.obra_id=acesso.obra_id
    and (p_destinatario_profile_id is null or ou.profile_id=p_destinatario_profile_id);
  return public.portal_message_json(nova);
end; $$;

create or replace function public.portal_messages_admin_get(p_obra_id uuid,p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=p_profile_id and tipo in ('admin','usuario')) then
    raise exception 'portal_message_management_denied' using errcode='42501';
  end if;
  return jsonb_build_object(
    'messages',coalesce((select jsonb_agg(public.portal_message_json(m) order by m.created_at) from public.portal_messages m where m.obra_id=p_obra_id),'[]'::jsonb),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',coalesce(p.apelido,p.name),'papel',ou.papel) order by p.name)
      from public.obra_usuarios ou join public.profiles p on p.id=ou.profile_id where ou.obra_id=p_obra_id),'[]'::jsonb)
  );
end; $$;

create or replace function public.portal_message_admin_send(
  p_obra_id uuid,p_profile_id uuid,p_portal_access_id uuid,p_texto text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare nova public.portal_messages;
begin
  if not exists(select 1 from public.profiles where id=p_profile_id and tipo in ('admin','usuario')) then
    raise exception 'portal_message_management_denied' using errcode='42501';
  end if;
  if p_portal_access_id is not null and not exists(select 1 from public.portal_access_links where id=p_portal_access_id and obra_id=p_obra_id and ativo) then
    raise exception 'portal_message_client_denied' using errcode='42501';
  end if;
  insert into public.portal_messages(obra_id,portal_access_id,profile_id,author_type,texto)
  values(p_obra_id,p_portal_access_id,p_profile_id,'equipe',trim(p_texto)) returning * into nova;
  return public.portal_message_json(nova);
end; $$;

alter table public.obra_previsoes
  add column if not exists fornecedor_nome text,
  add column if not exists external_key text;
alter table public.obra_previsoes alter column data_prevista drop not null;
create unique index if not exists idx_obra_previsoes_external_key on public.obra_previsoes(obra_id,external_key) where vigente and external_key is not null;

create or replace function public.obra_previsao_sugestoes(p_obra_id uuid,p_orcamento_id text default 'todos',p_antecedencia integer default 7)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key','cronograma:etapa:'||e.id,'etapaId',e.id,'titulo','Preparar '||e.nome,
    'dataPrevista',(e.data_inicio-greatest(0,least(p_antecedencia,60))),
    'inicioEtapa',e.data_inicio,'valorSugerido',null,'tipoSugerido','compra_material',
    'jaCriada',exists(select 1 from public.obra_previsoes p where p.obra_id=p_obra_id and p.external_key='cronograma:etapa:'||e.id and p.vigente)
  ) order by e.data_inicio,e.ordem),'[]'::jsonb)
  from public.etapas e
  where e.obra_id=p_obra_id and e.data_inicio is not null and e.data_inicio >= current_date-30
    and (p_orcamento_id is null or p_orcamento_id='todos' or exists(select 1 from public.orcamento_itens i where i.etapa_id=e.id and i.orcamento_id=p_orcamento_id::uuid));
$$;

create or replace function public.portal_get_financial(p_token_hash text,p_orcamento_id text default 'todos')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare acesso public.portal_access_links; budget_id uuid; valor_orcado numeric:=0; realizado numeric:=0; pago numeric:=0;
begin
  acesso:=public.portal_authorize(p_token_hash);
  if p_orcamento_id is not null and p_orcamento_id<>'todos' then budget_id:=p_orcamento_id::uuid; end if;
  select coalesce(sum(t.direto*(1+coalesce(t.bdi,0)/100+coalesce(t.gerenciamento,0)/100)),0) into valor_orcado
  from (select o.id,o.bdi_percentual bdi,o.gerenciamento_percentual gerenciamento,
    sum(coalesce(i.valor_total_informado_snapshot,i.quantidade*i.preco_unitario_snapshot,0)) direto
    from public.orcamentos o left join public.orcamento_itens i on i.orcamento_id=o.id
    where o.obra_id=acesso.obra_id and o.status<>'arquivado' and (budget_id is null or o.id=budget_id)
    group by o.id) t;
  select coalesce(sum(c.valor_total) filter(where c.status_valor='confirmado'),0),coalesce(sum(c.valor_total) filter(where c.status_pagamento='pago'),0)
  into realizado,pago from public.compra_itens c where c.obra_id=acesso.obra_id and (budget_id is null or c.orcamento_id=budget_id);
  return jsonb_build_object('budget',valor_orcado,'realized',realizado,'paid',pago,'balance',greatest(valor_orcado-realizado,0),
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('month',t.mes,'realized',t.realized,'paid',t.paid) order by t.mes) from (
      select to_char(date_trunc('month',coalesce(c.data_compra,c.created_at::date)),'YYYY-MM') mes,
      coalesce(sum(c.valor_total) filter(where c.status_valor='confirmado'),0) realized,
      coalesce(sum(c.valor_total) filter(where c.status_pagamento='pago'),0) paid
      from public.compra_itens c where c.obra_id=acesso.obra_id and (budget_id is null or c.orcamento_id=budget_id) group by 1)t),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(r) order by r.data desc,r.created_at desc) from (
      select c.id,c.descricao title,coalesce(c.data_compra,c.created_at::date) data,coalesce(c.valor_total,0) value,
      coalesce(e.nome,'Geral') stage,coalesce(o.nome,'Obra') budget_name,c.status_pagamento payment_status,c.fornecedor_nome supplier,c.forma_pagamento payment_method,c.created_at
      from public.compra_itens c left join public.etapas e on e.id=c.etapa_id left join public.orcamentos o on o.id=c.orcamento_id
      where c.obra_id=acesso.obra_id and c.status_valor='confirmado' and (budget_id is null or c.orcamento_id=budget_id)
    )r),'[]'::jsonb));
end; $$;

-- Baseline validado no aplicativo provisório da Resid. Jardim Allegra.
insert into public.obra_previsoes(obra_id,orcamento_id,tipo,titulo,valor_previsto,data_prevista,condicao_pagamento,status,origem,baseline,publicado_cliente,fornecedor_nome,external_key,descricao)
select o.id,r.id,v.tipo,v.titulo,v.valor,v.data_prevista,v.pagamento,v.status,'baseline_importado',true,true,v.fornecedor,'controle-dr:'||v.chave,'Importado do controle provisório utilizado pela cliente.'
from public.obras o join public.orcamentos r on r.obra_id=o.id and r.status<>'arquivado'
cross join (values
 ('gerenciamento','desembolso_financeiro','Gerenciamento',6159.50,date '2026-08-10','pix','prevista','Contratada'),
 ('locacao','desembolso_financeiro','Locação de Equipamentos',370.00,date '2026-08-14','pix','prevista','Eletromaque'),
 ('boleto-laje','desembolso_financeiro','Boleto Material Laje Pré-Moldada',3559.11,date '2026-09-06','boleto','prevista','ConstruRhor'),
 ('laje-paga','compra_material','Material Laje Pré-Moldada',3559.00,date '2026-08-05','entrada_saldo','realizada','ConstruRhor'),
 ('supra','compra_material','Material Supraestrutura',1000.00,date '2026-08-11','cartao','prevista','Petter Ferragem'),
 ('eletroduto','compra_material','Material Eletroduto Corrugado e Caixas',1950.00,date '2026-08-15','cartao','prevista','Petter Ferragem'),
 ('hidraulico','compra_material','Material Hidráulico',2150.00,date '2026-08-15','cartao','prevista','Petter Ferragem'),
 ('bordo-laje','compra_material','Fechamento de Bordo Laje',1625.00,date '2026-08-15','cartao','prevista','Petter Ferragem'),
 ('concreto','compra_material','Concreto Usinado',9795.00,date '2026-08-21','outro','prevista','Ultramix Concretos'),
 ('pilares','compra_material','Material Básico Pilares',950.00,date '2026-08-22','cartao','prevista','Petter Ferragem'),
 ('alvenaria','compra_material','Material Básico Alvenaria',1750.00,date '2026-08-22','cartao','prevista','Petter Ferragem'),
 ('aco','compra_material','Aço',4350.00,date '2026-08-25','pix','prevista','RR Comercial de Aços'),
 ('tijolos','compra_material','Tijolos Pav2',7000.00,null,'boleto','prevista','ConstruRhor')
) as v(chave,tipo,titulo,valor,data_prevista,pagamento,status,fornecedor)
where lower(o.nome) like '%jardim allegra%'
on conflict do nothing;

-- Some migration runners may transcode UTF-8 literals as latin1. Repair only
-- strings containing the characteristic mojibake marker.
update public.obra_previsoes
set
  titulo = case
    when titulo like '%Ã%' then convert_from(convert_to(titulo, 'LATIN1'), 'UTF8')
    else titulo
  end,
  fornecedor_nome = case
    when fornecedor_nome like '%Ã%' then convert_from(convert_to(fornecedor_nome, 'LATIN1'), 'UTF8')
    else fornecedor_nome
  end
where external_key like 'controle-dr:%'
  and (titulo like '%Ã%' or fornecedor_nome like '%Ã%');

update public.obra_previsoes
set condicao_pagamento = 'pix'
where external_key in ('controle-dr:concreto', 'controle-dr:laje-paga');

revoke all on function public.portal_content_defaults() from public;
revoke all on function public.portal_content_admin_get(uuid,uuid) from public;
revoke all on function public.portal_content_admin_set(uuid,uuid,text,text,boolean) from public;
revoke all on function public.portal_get_content_visibility(text) from public;
revoke all on function public.portal_messages_get(text) from public;
revoke all on function public.portal_message_send(text,text,uuid) from public;
revoke all on function public.portal_messages_admin_get(uuid,uuid) from public;
revoke all on function public.portal_message_admin_send(uuid,uuid,uuid,text) from public;
revoke all on function public.obra_previsao_sugestoes(uuid,text,integer) from public;
revoke all on function public.portal_get_financial(text,text) from public;
grant execute on function public.portal_content_admin_get(uuid,uuid),public.portal_content_admin_set(uuid,uuid,text,text,boolean),public.portal_messages_admin_get(uuid,uuid),public.portal_message_admin_send(uuid,uuid,uuid,text),public.obra_previsao_sugestoes(uuid,text,integer) to anon,authenticated,service_role;
grant execute on function public.portal_get_content_visibility(text),public.portal_messages_get(text),public.portal_message_send(text,text,uuid),public.portal_get_financial(text,text) to anon,service_role;

create or replace function public.portal_message_json(m public.portal_messages)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id',m.id,'authorType',m.author_type,'texto',m.texto,'createdAt',m.created_at,
    'autor',case when m.author_type='cliente' then coalesce((select a.nome from public.portal_access_links a where a.id=m.portal_access_id),'Cliente') else coalesce((select coalesce(p.apelido,p.name) from public.profiles p where p.id=m.profile_id),'Equipe') end,
    'destinatario',coalesce((select coalesce(p.apelido,p.name) from public.profiles p where p.id=m.destinatario_profile_id),'Equipe da obra')
  );
$$;

create or replace function public.obra_previsoes_list(p_obra_id uuid,p_orcamento_id text default 'todos')
returns jsonb language sql security definer set search_path = '' as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'serieId',p.serie_id,'versao',p.versao,'obraId',p.obra_id,'orcamentoId',p.orcamento_id,
  'orcamentoNome',coalesce(o.nome,case when p.orcamento_id is null then 'Geral da obra' else 'Orcamento' end),
  'etapaId',p.etapa_id,'etapaNome',e.nome,'subetapaId',p.subetapa_id,'subetapaNome',se.nome,
  'servicoId',p.servico_id,'servicoNome',sc.nome,'tipo',p.tipo,'titulo',p.titulo,'descricao',p.descricao,
  'valorPrevisto',p.valor_previsto,'dataPrevista',p.data_prevista,'valorRealizado',p.valor_realizado,'dataRealizada',p.data_realizada,
  'condicaoPagamento',p.condicao_pagamento,'status',p.status,'origem',p.origem,'baseline',p.baseline,
  'publicadoCliente',p.publicado_cliente,'observacaoInterna',p.observacao_interna,'fornecedorNome',p.fornecedor_nome,
  'externalKey',p.external_key,'createdAt',p.created_at,'updatedAt',p.updated_at
) order by p.data_prevista nulls last,p.created_at),'[]'::jsonb)
from public.obra_previsoes p left join public.orcamentos o on o.id=p.orcamento_id left join public.etapas e on e.id=p.etapa_id
left join public.subetapas_cronograma se on se.id=p.subetapa_id left join public.servicos_cronograma sc on sc.id=p.servico_id
where p.obra_id=p_obra_id and p.vigente and (p_orcamento_id is null or p_orcamento_id='todos' or p.orcamento_id=p_orcamento_id::uuid);
$$;

create or replace function public.obra_previsao_save(p_obra_id uuid,p_id uuid,p_payload jsonb,p_profile_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare anterior public.obra_previsoes; novo public.obra_previsoes; budget_id uuid:=nullif(p_payload->>'orcamentoId','')::uuid;
stage_id uuid:=nullif(p_payload->>'etapaId','')::uuid; substage_id uuid:=nullif(p_payload->>'subetapaId','')::uuid; service_id uuid:=nullif(p_payload->>'servicoId','')::uuid;
next_series uuid:=gen_random_uuid(); next_version integer:=1; next_status text:=coalesce(nullif(p_payload->>'status',''),'prevista'); next_key text:=nullif(p_payload->>'externalKey','');
begin
  if not exists(select 1 from public.obras where id=p_obra_id) then raise exception 'obra_nao_encontrada'; end if;
  if budget_id is not null and not exists(select 1 from public.orcamentos where id=budget_id and obra_id=p_obra_id) then raise exception 'orcamento_invalido'; end if;
  if stage_id is not null and not exists(select 1 from public.etapas where id=stage_id and obra_id=p_obra_id) then raise exception 'etapa_invalida'; end if;
  if length(trim(coalesce(p_payload->>'titulo','')))<2 then raise exception 'titulo_obrigatorio'; end if;
  if p_id is not null then
    select * into anterior from public.obra_previsoes where id=p_id and obra_id=p_obra_id and vigente for update;
    if anterior.id is null then raise exception 'previsao_nao_encontrada'; end if;
    next_series:=anterior.serie_id; next_version:=anterior.versao+1; if next_key is null then next_key:=anterior.external_key; end if;
    update public.obra_previsoes set vigente=false,status='substituida',updated_at=now() where id=anterior.id;
  elsif next_key is not null and exists(select 1 from public.obra_previsoes where obra_id=p_obra_id and external_key=next_key and vigente) then
    raise exception 'previsao_automatica_ja_criada' using errcode='23505';
  end if;
  insert into public.obra_previsoes(serie_id,versao,obra_id,orcamento_id,etapa_id,subetapa_id,servico_id,tipo,titulo,descricao,valor_previsto,data_prevista,
    valor_realizado,data_realizada,condicao_pagamento,status,origem,baseline,publicado_cliente,observacao_interna,fornecedor_nome,external_key,created_by)
  values(next_series,next_version,p_obra_id,budget_id,stage_id,substage_id,service_id,p_payload->>'tipo',trim(p_payload->>'titulo'),nullif(trim(p_payload->>'descricao'),''),
    nullif(p_payload->>'valorPrevisto','')::numeric,nullif(p_payload->>'dataPrevista','')::date,nullif(p_payload->>'valorRealizado','')::numeric,nullif(p_payload->>'dataRealizada','')::date,
    nullif(p_payload->>'condicaoPagamento',''),next_status,coalesce(nullif(p_payload->>'origem',''),'manual'),coalesce((p_payload->>'baseline')::boolean,false),
    coalesce((p_payload->>'publicadoCliente')::boolean,false),nullif(trim(p_payload->>'observacaoInterna'),''),nullif(trim(p_payload->>'fornecedorNome'),''),next_key,p_profile_id) returning * into novo;
  insert into public.portal_audit_log(user_id,obra_id,orcamento_id,origem,ferramenta,entidade,entidade_id,acao,valor_anterior,valor_novo)
  values(p_profile_id,p_obra_id,budget_id,'operacional','forecast.save','obra_previsao',novo.id::text,case when anterior.id is null then 'create' else 'version' end,
    case when anterior.id is null then null else to_jsonb(anterior) end,to_jsonb(novo));
  return jsonb_build_object('id',novo.id,'serieId',novo.serie_id,'versao',novo.versao);
end; $$;

create or replace function public.portal_get_previsoes(p_token_hash text,p_orcamento_id text default 'todos')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare acesso public.portal_access_links; budget_id uuid;
begin
  acesso:=public.portal_authorize(p_token_hash); if p_orcamento_id is not null and p_orcamento_id<>'todos' then budget_id:=p_orcamento_id::uuid; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'orcamentoId',p.orcamento_id,'orcamentoNome',coalesce(o.nome,'Geral da obra'),'tipo',p.tipo,
    'titulo',p.titulo,'descricao',p.descricao,'valorPrevisto',p.valor_previsto,'dataPrevista',p.data_prevista,'valorRealizado',p.valor_realizado,'dataRealizada',p.data_realizada,
    'condicaoPagamento',p.condicao_pagamento,'status',p.status,'origem',p.origem,'baseline',p.baseline,'etapaNome',e.nome,'fornecedorNome',p.fornecedor_nome)
    order by p.data_prevista nulls last) from public.obra_previsoes p left join public.orcamentos o on o.id=p.orcamento_id left join public.etapas e on e.id=p.etapa_id
    where p.obra_id=acesso.obra_id and p.vigente and p.publicado_cliente and p.status not in('cancelada','substituida') and (budget_id is null or p.orcamento_id=budget_id)),'[]'::jsonb);
end; $$;

revoke all on function public.obra_previsoes_list(uuid,text),public.obra_previsao_save(uuid,uuid,jsonb,uuid),public.portal_get_previsoes(text,text) from public;
grant execute on function public.obra_previsoes_list(uuid,text),public.obra_previsao_save(uuid,uuid,jsonb,uuid) to anon,authenticated,service_role;
grant execute on function public.portal_get_previsoes(text,text) to anon,service_role;
