-- Fecha o ultimo passo do fluxo previsao -> compra: garante que o vinculo
-- exato ao insumo (orcamento_item_insumo_id) so pode ser gravado apontando
-- para um insumo da MESMA obra (nunca de obra cruzada), tanto ao salvar uma
-- previsao quanto ao salvar um lancamento de compra manual. Tambem expoe
-- uma identificacao simples (fornecedor/descricao) da compra vinculada,
-- para a tela "Materiais a providenciar" mostrar o que foi comprado sem
-- poluir a interface.

-- 1) compra_itens.orcamento_item_insumo_id so pode apontar para um insumo
--    cujo orcamento pertence a mesma obra da compra.
create or replace function public.validar_compra_item_insumo_mesma_obra()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.orcamento_item_insumo_id is not null then
    if not exists (
      select 1
      from public.orcamento_item_insumos oii
      join public.orcamento_itens oi on oi.id = oii.orcamento_item_id
      join public.orcamentos o on o.id = oi.orcamento_id
      where oii.id = new.orcamento_item_insumo_id
        and o.obra_id = new.obra_id
    ) then
      raise exception 'insumo_de_outra_obra' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_compra_item_insumo_mesma_obra on public.compra_itens;
create trigger trg_validar_compra_item_insumo_mesma_obra
before insert or update of orcamento_item_insumo_id, obra_id on public.compra_itens
for each row execute function public.validar_compra_item_insumo_mesma_obra();

-- 2) obra_previsao_save ganha a mesma validacao para metadados.orcamentoItemInsumoId,
--    seguindo o padrao ja existente de validar orcamento/etapa/subetapa/servico.
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
  insumo_id uuid:=nullif(p_payload->'metadados'->>'orcamentoItemInsumoId','')::uuid;
  next_series uuid:=gen_random_uuid();
  next_version integer:=1;
  next_status text:=coalesce(nullif(p_payload->>'status',''),'prevista');
  next_key text:=nullif(p_payload->>'externalKey','');
  publish_client boolean:=coalesce((p_payload->>'publicadoCliente')::boolean,false);
  next_metadados jsonb:=coalesce(p_payload->'metadados','{}'::jsonb);
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'previsao_nao_autorizada' using errcode = '42501';
  end if;
  if not exists(select 1 from public.obras where id=p_obra_id) then raise exception 'obra_nao_encontrada'; end if;
  if budget_id is not null and not exists(select 1 from public.orcamentos where id=budget_id and obra_id=p_obra_id) then raise exception 'orcamento_invalido'; end if;
  if stage_id is not null and not exists(select 1 from public.etapas where id=stage_id and obra_id=p_obra_id) then raise exception 'etapa_invalida'; end if;
  if substage_id is not null and not exists(select 1 from public.subetapas_cronograma s join public.etapas e on e.id=s.etapa_id where s.id=substage_id and e.obra_id=p_obra_id) then raise exception 'subetapa_invalida'; end if;
  if service_id is not null and not exists(select 1 from public.servicos_cronograma s join public.subetapas_cronograma se on se.id=s.subetapa_id join public.etapas e on e.id=se.etapa_id where s.id=service_id and e.obra_id=p_obra_id) then raise exception 'servico_invalido'; end if;
  if insumo_id is not null and not exists(
    select 1 from public.orcamento_item_insumos oii
    join public.orcamento_itens oi on oi.id = oii.orcamento_item_id
    join public.orcamentos o on o.id = oi.orcamento_id
    where oii.id = insumo_id and o.obra_id = p_obra_id
  ) then raise exception 'insumo_invalido'; end if;
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

-- 3) obra_previsoes_list ganha identificacao simples (fornecedor/descricao)
--    da compra vinculada, exclusivamente para vinculo a nivel de insumo
--    (o unico caso em que a identidade da compra e garantida exata por
--    este vinculo estrutural).
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
  ),
  'vinculoEstruturalId', coalesce(vinc.insumo_id::text, vinc.item_id::text, vinc.subetapa_item_id::text),
  'orcamentoItemInsumoId', vinc.insumo_id,
  'compraVinculada', case
    when vinc.insumo_id is not null then exists (
      select 1 from public.compra_itens ci
      where ci.obra_id = p.obra_id and ci.orcamento_item_insumo_id = vinc.insumo_id
    )
    when vinc.item_id is not null and gran.item_tem_insumos then null
    when vinc.item_id is not null or vinc.subetapa_item_id is not null then exists (
      select 1 from public.compra_itens ci
      where ci.obra_id = p.obra_id
        and (
          (vinc.item_id is not null and ci.orcamento_item_id = vinc.item_id)
          or (vinc.subetapa_item_id is not null and ci.subetapa_orcamento_item_id = vinc.subetapa_item_id)
        )
    )
    else null
  end,
  'compraRecebida', case
    when vinc.insumo_id is not null then exists (
      select 1 from public.compra_itens ci
      where ci.obra_id = p.obra_id and ci.orcamento_item_insumo_id = vinc.insumo_id and ci.status_recebimento = 'recebido'
    )
    when vinc.item_id is not null and gran.item_tem_insumos then false
    when vinc.item_id is not null or vinc.subetapa_item_id is not null then exists (
      select 1 from public.compra_itens ci
      where ci.obra_id = p.obra_id and ci.status_recebimento = 'recebido'
        and (
          (vinc.item_id is not null and ci.orcamento_item_id = vinc.item_id)
          or (vinc.subetapa_item_id is not null and ci.subetapa_orcamento_item_id = vinc.subetapa_item_id)
        )
    )
    else false
  end,
  'compraFornecedorNome', compra_detalhe.fornecedor_nome,
  'compraDescricao', compra_detalhe.descricao
) order by p.data_prevista nulls last,p.created_at),'[]'::jsonb)
from public.obra_previsoes p
left join public.orcamentos o on o.id=p.orcamento_id
left join public.etapas e on e.id=p.etapa_id
left join public.subetapas_cronograma se on se.id=p.subetapa_id
left join public.servicos_cronograma sc on sc.id=p.servico_id
left join public.planejamento_itens pi_live
  on pi_live.orcamento_item_id = nullif(p.metadados->'origemCronograma'->>'subetapaOrcamentoItemId','')::uuid
  and pi_live.obra_id = p.obra_id
left join lateral (
  select
    nullif(p.metadados->>'orcamentoItemInsumoId','')::uuid as insumo_id,
    nullif(p.metadados->'origemCronograma'->>'orcamentoItemId','')::uuid as item_id,
    nullif(p.metadados->'origemCronograma'->>'subetapaOrcamentoItemId','')::uuid as subetapa_item_id
) vinc on true
left join lateral (
  select exists (
    select 1 from public.orcamento_item_insumos oii where oii.orcamento_item_id = vinc.item_id
  ) as item_tem_insumos
) gran on true
left join lateral (
  select ci.fornecedor_nome, ci.descricao
  from public.compra_itens ci
  where vinc.insumo_id is not null
    and ci.obra_id = p.obra_id
    and ci.orcamento_item_insumo_id = vinc.insumo_id
  order by ci.created_at desc nulls last
  limit 1
) compra_detalhe on true
where p.obra_id=p_obra_id and p.vigente
  and (p_orcamento_id is null or p_orcamento_id='todos' or p.orcamento_id=p_orcamento_id::uuid);
$function$;
