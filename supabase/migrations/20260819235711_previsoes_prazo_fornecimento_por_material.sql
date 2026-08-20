-- V1 do motor de sugestoes de Previsoes: cada material passa a ter prazo de
-- fornecimento proprio (editavel antes de aceitar), a data de necessidade
-- passa a priorizar o vinculo estrutural orcamento_item -> planejamento_itens
-- (em vez de so casar nome com subetapas_cronograma/servicos_cronograma), e
-- a sugestao passa a indicar quando ja existe compra_itens vinculado
-- estruturalmente. Nao cria tabela nova: usa obra_previsoes.metadados
-- (jsonb, ja existente) para guardar prazoFornecimentoDias, dataNecessidade
-- e origemCronograma.

create or replace function public.obra_previsao_sugestoes(p_obra_id uuid, p_orcamento_id text default 'todos'::text, p_antecedencia integer default 7)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
with itens_base as (
  select
    oi.id,
    oi.orcamento_id,
    o.nome as orcamento_nome,
    oi.etapa_id,
    e.nome as etapa_nome,
    subm.id as subetapa_orcamento_item_id,
    se.id as subetapa_id,
    coalesce(se.nome, oi.subetapa) as subetapa_nome,
    sc.id as servico_id,
    coalesce(sc.nome, oi.descricao_snapshot) as servico_nome,
    oi.descricao_snapshot,
    oi.quantidade,
    oi.unidade_snapshot,
    oi.preco_unitario_snapshot,
    oi.valor_total_informado_snapshot,
    oi.classificacao_snapshot,
    oi.grupo_snapshot,
    -- Data de necessidade: prioriza o inicio estrutural do planejamento
    -- (orcamento_item_id da subetapa -> planejamento_itens.data_inicio),
    -- so cai para o casamento por nome no cronograma quando a subetapa
    -- ainda nao tem planejamento_itens gerado.
    coalesce(pi.data_inicio, sc.data_inicio, se.data_inicio, e.data_inicio, oi.data_inicio) as data_necessidade,
    case
      when pi.data_inicio is not null then 'planejamento_itens'
      when sc.data_inicio is not null then 'servico_cronograma_nome'
      when se.data_inicio is not null then 'subetapa_cronograma_nome'
      when e.data_inicio is not null then 'etapa'
      when oi.data_inicio is not null then 'orcamento_item'
      else null
    end as fonte_data,
    pi.id as planejamento_item_id
  from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  left join public.etapas e on e.id = oi.etapa_id and e.obra_id = p_obra_id
  left join lateral (
    select sm.id
    from public.orcamento_itens sm
    where sm.orcamento_id = oi.orcamento_id
      and sm.tipo_linha = 'subetapa'
      and sm.etapa_id = oi.etapa_id
      and lower(trim(sm.subetapa)) = lower(trim(coalesce(oi.subetapa, '')))
    limit 1
  ) subm on true
  left join public.planejamento_itens pi on pi.orcamento_item_id = subm.id and pi.obra_id = p_obra_id
  left join lateral (
    select s.id, s.nome, s.data_inicio
    from public.subetapas_cronograma s
    where s.etapa_id = e.id
      and lower(trim(s.nome)) = lower(trim(coalesce(oi.subetapa, '')))
    order by s.ordem
    limit 1
  ) se on true
  left join lateral (
    select s.id, s.nome, s.data_inicio
    from public.servicos_cronograma s
    where s.subetapa_id = se.id
      and lower(trim(s.nome)) = lower(trim(coalesce(oi.descricao_snapshot, '')))
    order by s.ordem
    limit 1
  ) sc on true
  where o.obra_id = p_obra_id
    and o.status in ('ativo', 'finalizado')
    and (p_orcamento_id is null or p_orcamento_id = 'todos' or o.id = p_orcamento_id::uuid)
), fontes as (
  select
    'orcamento:insumo:' || ins.id as chave,
    base.orcamento_id,
    base.orcamento_nome,
    base.etapa_id,
    base.etapa_nome,
    base.subetapa_id,
    base.subetapa_nome,
    base.servico_id,
    base.servico_nome,
    base.subetapa_orcamento_item_id,
    base.planejamento_item_id,
    base.id as orcamento_item_id,
    coalesce(ins.descricao_snapshot, ins.sinapi_codigo, 'Insumo do orcamento') as titulo,
    concat_ws(' · ',
      case when base.servico_nome is not null then 'Servico: ' || base.servico_nome end,
      case when coalesce(ins.quantidade_adotada, ins.quantidade_calculada) > 0
        then trim(to_char(coalesce(ins.quantidade_adotada, ins.quantidade_calculada), 'FM999999990.####')) ||
          case when ins.unidade_snapshot is not null then ' ' || ins.unidade_snapshot else '' end end,
      case when ins.grupo_snapshot is not null then ins.grupo_snapshot end
    ) as descricao,
    coalesce(
      ins.valor_total_informado_snapshot,
      coalesce(ins.quantidade_adotada, ins.quantidade_calculada) * ins.preco_unitario_snapshot
    ) as valor_sugerido,
    ins.classificacao_snapshot as classificacao,
    base.data_necessidade,
    base.fonte_data
  from itens_base base
  join public.orcamento_item_insumos ins on ins.orcamento_item_id = base.id

  union all

  select
    'orcamento:item:' || base.id,
    base.orcamento_id,
    base.orcamento_nome,
    base.etapa_id,
    base.etapa_nome,
    base.subetapa_id,
    base.subetapa_nome,
    base.servico_id,
    base.servico_nome,
    base.subetapa_orcamento_item_id,
    base.planejamento_item_id,
    base.id,
    coalesce(base.descricao_snapshot, base.servico_nome, 'Item do orcamento'),
    concat_ws(' · ',
      case when base.quantidade > 0 then trim(to_char(base.quantidade, 'FM999999990.####')) ||
        case when base.unidade_snapshot is not null then ' ' || base.unidade_snapshot else '' end end,
      case when base.grupo_snapshot is not null then base.grupo_snapshot end
    ),
    coalesce(base.valor_total_informado_snapshot, base.quantidade * base.preco_unitario_snapshot),
    base.classificacao_snapshot,
    base.data_necessidade,
    base.fonte_data
  from itens_base base
  where not exists (
    select 1 from public.orcamento_item_insumos ins where ins.orcamento_item_id = base.id
  )
), sugestoes as (
  select
    fonte.*,
    case
      when upper(coalesce(fonte.classificacao, '')) = 'MAO_DE_OBRA' then 'mao_obra'
      when upper(coalesce(fonte.classificacao, '')) in ('MATERIAL_SERVICOS', 'EQUIPAMENTO') then 'compra_material'
      else 'desembolso_financeiro'
    end as tipo_sugerido,
    greatest(0, least(p_antecedencia, 60)) as prazo_padrao,
    exists (
      select 1 from public.compra_itens ci
      where ci.obra_id = p_obra_id
        and (
          (fonte.orcamento_item_id is not null and ci.orcamento_item_id = fonte.orcamento_item_id)
          or (fonte.subetapa_orcamento_item_id is not null and ci.subetapa_orcamento_item_id = fonte.subetapa_orcamento_item_id)
        )
    ) as compra_vinculada
  from fontes fonte
  where fonte.data_necessidade is not null
    and fonte.data_necessidade >= current_date - 30
)
select coalesce(jsonb_agg(jsonb_build_object(
  'key', s.chave,
  'orcamentoId', s.orcamento_id,
  'orcamentoNome', s.orcamento_nome,
  'etapaId', s.etapa_id,
  'etapaNome', s.etapa_nome,
  'subetapaId', s.subetapa_id,
  'subetapaNome', s.subetapa_nome,
  'servicoId', s.servico_id,
  'servicoNome', s.servico_nome,
  'titulo', s.titulo,
  'descricao', nullif(s.descricao, ''),
  'dataNecessidade', s.data_necessidade,
  'prazoFornecimentoDias', s.prazo_padrao,
  'dataPrevista', case when s.tipo_sugerido = 'compra_material'
    then s.data_necessidade - s.prazo_padrao
    else s.data_necessidade end,
  'valorSugerido', s.valor_sugerido,
  'tipoSugerido', s.tipo_sugerido,
  'compraVinculada', s.compra_vinculada,
  'origemCronograma', jsonb_build_object(
    'fonte', s.fonte_data,
    'subetapaOrcamentoItemId', s.subetapa_orcamento_item_id,
    'planejamentoItemId', s.planejamento_item_id
  ),
  'jaCriada', exists (
    select 1 from public.obra_previsoes p
    where p.obra_id = p_obra_id and p.external_key = s.chave and p.vigente
  )
) order by s.data_necessidade, s.etapa_nome, s.subetapa_nome, s.titulo), '[]'::jsonb)
from (select * from sugestoes order by data_necessidade, etapa_nome, subetapa_nome, titulo limit 250) s;
$function$;

create or replace function public.obra_previsao_save(p_obra_id uuid, p_id uuid, p_payload jsonb, p_profile_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  anterior public.obra_previsoes;
  novo public.obra_previsoes;
  budget_id uuid:=nullif(p_payload->>'orcamentoId','')::uuid;
  stage_id uuid:=nullif(p_payload->>'etapaId','')::uuid;
  substage_id uuid:=nullif(p_payload->>'subetapaId','')::uuid;
  service_id uuid:=nullif(p_payload->>'servicoId','')::uuid;
  next_series uuid:=gen_random_uuid();
  next_version integer:=1;
  next_status text:=coalesce(nullif(p_payload->>'status',''),'prevista');
  next_key text:=nullif(p_payload->>'externalKey','');
  publish_client boolean:=coalesce((p_payload->>'publicadoCliente')::boolean,false);
  next_metadados jsonb:=coalesce(p_payload->'metadados','{}'::jsonb);
begin
  if not exists(select 1 from public.obras where id=p_obra_id) then raise exception 'obra_nao_encontrada'; end if;
  if budget_id is not null and not exists(select 1 from public.orcamentos where id=budget_id and obra_id=p_obra_id) then raise exception 'orcamento_invalido'; end if;
  if stage_id is not null and not exists(select 1 from public.etapas where id=stage_id and obra_id=p_obra_id) then raise exception 'etapa_invalida'; end if;
  if substage_id is not null and not exists(select 1 from public.subetapas_cronograma s join public.etapas e on e.id=s.etapa_id where s.id=substage_id and e.obra_id=p_obra_id) then raise exception 'subetapa_invalida'; end if;
  if service_id is not null and not exists(select 1 from public.servicos_cronograma s join public.subetapas_cronograma se on se.id=s.subetapa_id join public.etapas e on e.id=se.etapa_id where s.id=service_id and e.obra_id=p_obra_id) then raise exception 'servico_invalido'; end if;
  if length(trim(coalesce(p_payload->>'titulo','')))<2 then raise exception 'titulo_obrigatorio'; end if;
  if publish_client and next_status not in ('confirmada','realizada') then raise exception 'confirme_antes_de_publicar'; end if;
  if p_id is not null then
    select * into anterior from public.obra_previsoes where id=p_id and obra_id=p_obra_id and vigente for update;
    if anterior.id is null then raise exception 'previsao_nao_encontrada'; end if;
    next_series:=anterior.serie_id; next_version:=anterior.versao+1;
    if next_key is null then next_key:=anterior.external_key; end if;
    update public.obra_previsoes set vigente=false,status='substituida',updated_at=now() where id=anterior.id;
  elsif next_key is not null and exists(select 1 from public.obra_previsoes where obra_id=p_obra_id and external_key=next_key and vigente) then
    raise exception 'previsao_automatica_ja_criada' using errcode='23505';
  end if;
  insert into public.obra_previsoes(
    serie_id,versao,obra_id,orcamento_id,etapa_id,subetapa_id,servico_id,tipo,titulo,descricao,titulo_cliente,descricao_cliente,
    valor_previsto,data_prevista,valor_realizado,data_realizada,condicao_pagamento,status,origem,baseline,publicado_cliente,
    observacao_interna,fornecedor_nome,external_key,metadados,created_by
  ) values(
    next_series,next_version,p_obra_id,budget_id,stage_id,substage_id,service_id,p_payload->>'tipo',trim(p_payload->>'titulo'),
    nullif(trim(p_payload->>'descricao'),''),nullif(trim(p_payload->>'tituloCliente'),''),nullif(trim(p_payload->>'descricaoCliente'),''),
    nullif(p_payload->>'valorPrevisto','')::numeric,nullif(p_payload->>'dataPrevista','')::date,
    nullif(p_payload->>'valorRealizado','')::numeric,nullif(p_payload->>'dataRealizada','')::date,
    nullif(p_payload->>'condicaoPagamento',''),next_status,coalesce(nullif(p_payload->>'origem',''),'manual'),
    coalesce((p_payload->>'baseline')::boolean,false),publish_client,nullif(trim(p_payload->>'observacaoInterna'),''),
    nullif(trim(p_payload->>'fornecedorNome'),''),next_key,next_metadados,p_profile_id
  ) returning * into novo;
  insert into public.portal_audit_log(user_id,obra_id,orcamento_id,origem,ferramenta,entidade,entidade_id,acao,valor_anterior,valor_novo)
  values(p_profile_id,p_obra_id,budget_id,'operacional','forecast.save','obra_previsao',novo.id::text,
    case when anterior.id is null then 'create' else 'version' end,case when anterior.id is null then null else to_jsonb(anterior) end,to_jsonb(novo));
  return jsonb_build_object('id',novo.id,'serieId',novo.serie_id,'versao',novo.versao);
end;
$function$;

create or replace function public.obra_previsoes_list(p_obra_id uuid, p_orcamento_id text default 'todos'::text)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
select coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'serieId',p.serie_id,'versao',p.versao,'obraId',p.obra_id,'orcamentoId',p.orcamento_id,
  'orcamentoNome',coalesce(o.nome,case when p.orcamento_id is null then 'Geral da obra' else 'Orcamento' end),
  'etapaId',p.etapa_id,'etapaNome',e.nome,'subetapaId',p.subetapa_id,'subetapaNome',se.nome,
  'servicoId',p.servico_id,'servicoNome',sc.nome,'tipo',p.tipo,'titulo',p.titulo,'descricao',p.descricao,
  'tituloCliente',p.titulo_cliente,'descricaoCliente',p.descricao_cliente,
  'valorPrevisto',p.valor_previsto,'dataPrevista',p.data_prevista,'valorRealizado',p.valor_realizado,'dataRealizada',p.data_realizada,
  'condicaoPagamento',p.condicao_pagamento,'status',p.status,'origem',p.origem,'baseline',p.baseline,
  'publicadoCliente',p.publicado_cliente,'observacaoInterna',p.observacao_interna,'fornecedorNome',p.fornecedor_nome,
  'externalKey',p.external_key,'createdAt',p.created_at,'updatedAt',p.updated_at,
  'prazoFornecimentoDias', nullif(p.metadados->>'prazoFornecimentoDias','')::int,
  'dataNecessidade', nullif(p.metadados->>'dataNecessidade','')::date,
  'cronogramaAlterado', (
    p.origem = 'orcamento'
    and p.status in ('prevista','confirmada')
    and (p.metadados->'origemCronograma'->>'subetapaOrcamentoItemId') is not null
    and (p.metadados->>'dataNecessidade') is not null
    and pi_live.data_inicio is not null
    and pi_live.data_inicio <> nullif(p.metadados->>'dataNecessidade','')::date
  )
) order by p.data_prevista nulls last,p.created_at),'[]'::jsonb)
from public.obra_previsoes p
left join public.orcamentos o on o.id=p.orcamento_id
left join public.etapas e on e.id=p.etapa_id
left join public.subetapas_cronograma se on se.id=p.subetapa_id
left join public.servicos_cronograma sc on sc.id=p.servico_id
left join public.planejamento_itens pi_live
  on pi_live.orcamento_item_id = nullif(p.metadados->'origemCronograma'->>'subetapaOrcamentoItemId','')::uuid
  and pi_live.obra_id = p.obra_id
where p.obra_id=p_obra_id and p.vigente
  and (p_orcamento_id is null or p_orcamento_id='todos' or p.orcamento_id=p_orcamento_id::uuid);
$function$;
