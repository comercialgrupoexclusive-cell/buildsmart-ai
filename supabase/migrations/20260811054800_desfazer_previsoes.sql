create or replace function public.obra_previsao_undo_last(
  p_obra_id uuid,
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_log public.portal_audit_log;
  current_row public.obra_previsoes;
  previous_id uuid;
  previous_status text;
  restored_id uuid;
begin
  if not exists(select 1 from public.obras where id = p_obra_id) then
    raise exception 'obra_nao_encontrada';
  end if;

  select audit.*
    into action_log
  from public.portal_audit_log audit
  join public.obra_previsoes forecast
    on forecast.id::text = audit.entidade_id
   and forecast.obra_id = p_obra_id
   and forecast.vigente
  where audit.obra_id = p_obra_id
    and audit.ferramenta = 'forecast.save'
    and audit.entidade = 'obra_previsao'
    and not exists (
      select 1
      from public.portal_audit_log undo_log
      where undo_log.obra_id = p_obra_id
        and undo_log.ferramenta = 'forecast.undo'
        and undo_log.valor_novo->>'saveAuditId' = audit.id::text
    )
  order by audit.created_at desc, audit.id desc
  limit 1
  for update of forecast;

  if action_log.id is null then
    raise exception 'nenhuma_acao_para_desfazer';
  end if;

  select * into current_row
  from public.obra_previsoes
  where id = action_log.entidade_id::uuid
    and obra_id = p_obra_id
    and vigente
  for update;

  if current_row.id is null then
    raise exception 'previsao_atual_nao_encontrada';
  end if;

  update public.obra_previsoes
  set vigente = false, status = 'substituida', updated_at = now()
  where id = current_row.id;

  if action_log.acao = 'version' and action_log.valor_anterior is not null then
    previous_id := nullif(action_log.valor_anterior->>'id', '')::uuid;
    previous_status := coalesce(nullif(action_log.valor_anterior->>'status', ''), 'confirmada');

    update public.obra_previsoes
    set vigente = true, status = previous_status, updated_at = now()
    where id = previous_id
      and obra_id = p_obra_id
    returning id into restored_id;

    if restored_id is null then
      raise exception 'versao_anterior_nao_encontrada';
    end if;
  end if;

  insert into public.portal_audit_log(
    user_id, obra_id, orcamento_id, origem, ferramenta,
    entidade, entidade_id, acao, valor_anterior, valor_novo
  ) values (
    p_profile_id, p_obra_id, current_row.orcamento_id, 'operacional', 'forecast.undo',
    'obra_previsao', coalesce(restored_id, current_row.id)::text, 'undo', to_jsonb(current_row),
    jsonb_build_object(
      'saveAuditId', action_log.id,
      'removedId', current_row.id,
      'restoredId', restored_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'titulo', current_row.titulo,
    'acaoOriginal', action_log.acao,
    'restoredId', restored_id
  );
end;
$$;

revoke all on function public.obra_previsao_undo_last(uuid, uuid) from public;
grant execute on function public.obra_previsao_undo_last(uuid, uuid) to anon, authenticated, service_role;
