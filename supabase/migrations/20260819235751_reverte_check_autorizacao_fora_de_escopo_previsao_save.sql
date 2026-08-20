-- A migration anterior (previsoes_prazo_fornecimento_por_material) incluiu
-- por engano uma checagem de autorizacao em obra_previsao_save que nao fazia
-- parte do escopo desta rodada (prazo de fornecimento por material). Essa
-- funcao ja tinha essa mesma lacuna antes (sinalizada em rodada anterior de
-- seguranca, tratada como pendencia dedicada) -- reverte para nao misturar
-- mudanca de autorizacao com a mudanca de dados desta rodada.
--
-- Nota: esta migration contem um erro de digitacao (se.obra_id em vez de
-- se.etapa_id na validacao de servico_id), corrigido na migration seguinte
-- (fix_typo_obra_previsao_save_servico_validacao). Mantida aqui tal como
-- aplicada, para o historico local ficar identico ao historico live.
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
  if service_id is not null and not exists(select 1 from public.servicos_cronograma s join public.subetapas_cronograma se on se.id=s.subetapa_id join public.etapas e on e.id=se.obra_id) then raise exception 'servico_invalido'; end if;
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
