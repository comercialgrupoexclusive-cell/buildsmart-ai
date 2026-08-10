-- Uma obra representa a execucao de exatamente um orcamento.
-- Separa o Muro de Arrimo da Resid. Jardim Allegra e normaliza os vinculos operacionais.

do $$
declare
  v_allegra_id constant uuid := 'fd954f3a-ee3a-4205-bfa7-9e17b564f474';
  v_principal_id constant uuid := 'b2339a33-4cf9-43ca-b113-22a0cd13cadf';
  v_muro_orcamento_id constant uuid := '67aedb0f-fab7-4a73-aeb8-a2a98bde1c36';
  v_muro_subetapa_id constant uuid := 'ab100cf8-452c-4849-aa59-87a0b70b5397';
  v_muro_obra_id uuid;
  v_muro_cronograma_id uuid;
  v_muro_etapa_id uuid;
begin
  select obra_id into v_muro_obra_id
  from public.orcamentos
  where id = v_muro_orcamento_id
  for update;

  if not found then
    raise exception 'Orcamento Muro de Arrimo nao encontrado.';
  end if;

  -- Idempotencia: cria a obra separada somente enquanto o muro ainda estiver na Allegra.
  if v_muro_obra_id = v_allegra_id then
    insert into public.obras (
      nome, endereco, status, data_inicio, data_previsao, responsavel,
      area_m2, uf, proprietario_id, valor_contrato
    )
    select
      'Muro de Arrimo', endereco, 'concluida', date '2026-04-18', date '2026-05-15',
      responsavel, null, uf, proprietario_id, 23200
    from public.obras
    where id = v_allegra_id
    returning id into v_muro_obra_id;

    insert into public.cronogramas (nome, obra_id, status)
    values ('Muro de Arrimo', v_muro_obra_id, 'concluido')
    returning id into v_muro_cronograma_id;

    insert into public.etapas (
      obra_id, nome, data_inicio, data_fim, status, ordem,
      percentual_executado, is_marco, cronograma_id, percentual_mao_obra
    ) values (
      v_muro_obra_id, 'Muro de Arrimo', date '2026-04-18', date '2026-05-15',
      'concluida', 1, 100, false, v_muro_cronograma_id, 100
    ) returning id into v_muro_etapa_id;

    -- A subetapa e seus servicos ja representam exclusivamente o muro.
    update public.subetapas_cronograma
    set etapa_id = v_muro_etapa_id, ordem = 1, updated_at = now()
    where id = v_muro_subetapa_id;

    update public.orcamento_itens
    set etapa_id = v_muro_etapa_id, updated_at = now()
    where orcamento_id = v_muro_orcamento_id;

    update public.orcamentos
    set obra_id = v_muro_obra_id,
        status = 'finalizado',
        is_principal = true,
        data_inicio = coalesce(data_inicio, date '2026-04-18'),
        data_previsao = coalesce(data_previsao, date '2026-05-15')
    where id = v_muro_orcamento_id;

    update public.medicoes
    set obra_id = v_muro_obra_id, etapa_id = v_muro_etapa_id
    where orcamento_id = v_muro_orcamento_id;

    update public.materiais
    set obra_id = v_muro_obra_id, etapa_id = v_muro_etapa_id
    where orcamento_id = v_muro_orcamento_id;

    -- Estes lancamentos foram cadastrados com identificacao explicita do orcamento separado.
    update public.compra_itens
    set obra_id = v_muro_obra_id,
        orcamento_id = v_muro_orcamento_id,
        etapa_id = v_muro_etapa_id,
        updated_at = now()
    where obra_id = v_allegra_id
      and (
        subetapa_id = v_muro_subetapa_id
        or observacao ilike 'Orcamento separado: Muro de Arrimo%'
      );

    update public.listas_compra set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.requisicoes_compra set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.obra_previsoes set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.obra_fontes_recursos set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.obra_reembolsos set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.boards set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.feed_items set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.portal_tours set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
    update public.portal_audit_log set obra_id = v_muro_obra_id
    where orcamento_id = v_muro_orcamento_id;
  end if;

  update public.orcamentos
  set is_principal = true
  where id = v_principal_id;
end $$;

-- Registros legados sem orcamento passam a pertencer ao unico orcamento da obra.
with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id
  from public.orcamentos
  where obra_id is not null
  group by obra_id
  having count(*) = 1
)
update public.compra_itens x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.materiais x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.listas_compra x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.requisicoes_compra x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.medicoes x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.obra_previsoes x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.obra_fontes_recursos x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.obra_reembolsos x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.boards x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.feed_items x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

with unico as (
  select obra_id, (array_agg(id order by created_at))[1] as orcamento_id from public.orcamentos
  where obra_id is not null group by obra_id having count(*) = 1
)
update public.portal_tours x set orcamento_id = u.orcamento_id
from unico u where x.obra_id = u.obra_id and x.orcamento_id is null;

-- Impede regressao para multiplos orcamentos dentro da mesma obra.
create unique index if not exists ux_orcamentos_obra_unico
  on public.orcamentos (obra_id)
  where obra_id is not null;

comment on index public.ux_orcamentos_obra_unico is
  'Uma obra operacional possui exatamente um orcamento; novos orcamentos iniciam novas obras.';
