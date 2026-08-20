-- Corrige o bug encontrado na validacao operacional: compraVinculada estava
-- confirmando como "comprado" TODOS os materiais de um mesmo servico
-- (orcamento_item_id) ou subetapa (subetapa_orcamento_item_id) quando
-- qualquer um deles tinha uma compra vinculada -- inclusive materiais
-- diferentes que nunca foram comprados. Ex.: uma compra de "Formas SUPRA"
-- vinculada ao item "Vigas de entrepiso" marcava como compradas tambem
-- "Armaduras - Vigas - Entrepiso" e "Formas - Vigas ate 40 cm", que sao
-- insumos distintos dentro do mesmo servico.
--
-- Solucao: compra_itens ganha um vinculo nullable no nivel do INSUMO
-- especifico (orcamento_item_insumo_id -> orcamento_item_insumos.id).
-- orcamento_item_id/subetapa_orcamento_item_id sao mantidos (continuam
-- uteis como contexto/filtro), mas deixam de valer como prova de compra
-- para sugestoes originadas de um insumo especifico: nesse caso
-- compraVinculada so pode ser true via orcamento_item_insumo_id igual.
--
-- Para sugestoes que NAO tem quebra por insumo (fallback 'orcamento:item:',
-- usado quando o servico nao tem nenhuma linha em orcamento_item_insumos),
-- o item/subetapa continuam sendo a granularidade correta e valida, pois
-- ali a previsao representa a linha inteira, nao um material entre varios.
--
-- Nao ha hoje nenhum INSERT em compra_itens (nem em codigo, nem em RPC)
-- que preencha orcamento_item_id/subetapa_orcamento_item_id a partir de uma
-- previsao -- previsoes e compras sao modulos paralelos, sem passagem
-- automatica. A nova coluna e nullable e simplesmente fica null nesses
-- pontos existentes (o que e o estado correto: "vinculo nao identificado"),
-- sem exigir nenhuma tela nova nesta rodada.

alter table public.compra_itens
  add column orcamento_item_insumo_id uuid references public.orcamento_item_insumos(id) on delete set null;

create index idx_compra_itens_orcamento_item_insumo on public.compra_itens using btree (orcamento_item_insumo_id);

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
    ins.id as orcamento_item_insumo_id,
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
    null::uuid,
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
    case
      when fonte.orcamento_item_insumo_id is not null then exists (
        select 1 from public.compra_itens ci
        where ci.obra_id = p_obra_id
          and ci.orcamento_item_insumo_id = fonte.orcamento_item_insumo_id
      )
      else exists (
        select 1 from public.compra_itens ci
        where ci.obra_id = p_obra_id
          and (
            (fonte.orcamento_item_id is not null and ci.orcamento_item_id = fonte.orcamento_item_id)
            or (fonte.subetapa_orcamento_item_id is not null and ci.subetapa_orcamento_item_id = fonte.subetapa_orcamento_item_id)
          )
      )
    end as compra_vinculada
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
  'orcamentoItemInsumoId', s.orcamento_item_insumo_id,
  'origemCronograma', jsonb_build_object(
    'fonte', s.fonte_data,
    'subetapaOrcamentoItemId', s.subetapa_orcamento_item_id,
    'orcamentoItemId', s.orcamento_item_id,
    'planejamentoItemId', s.planejamento_item_id
  ),
  'jaCriada', exists (
    select 1 from public.obra_previsoes p
    where p.obra_id = p_obra_id and p.external_key = s.chave and p.vigente
  )
) order by s.data_necessidade, s.etapa_nome, s.subetapa_nome, s.titulo), '[]'::jsonb)
from (select * from sugestoes order by data_necessidade, etapa_nome, subetapa_nome, titulo limit 250) s;
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
  end
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
where p.obra_id=p_obra_id and p.vigente
  and (p_orcamento_id is null or p_orcamento_id='todos' or p.orcamento_id=p_orcamento_id::uuid);
$function$;
