-- UI canônica do Orçamento no Processo (Fase A/B) — components/processo/orcamento/.
--
-- orcamento_arvore_valores() já devolvia etapa/grupo/valor, mas a nova UI
-- também precisa mostrar quantidade/unidade/preço por linha (ex.: "18,40 m³
-- · R$ 517,00/m³ · R$ 9.512,80" na tela de Serviço) sem recalcular nada em
-- TypeScript — isso duplicaria orcamento_item_valor() pela enésima vez, o
-- mesmo erro que a Fase 1 já corrigiu uma vez (getItemTotal no client).
-- Mudança é só aditiva: colunas cruas de orcamento_itens, nenhum cálculo
-- novo. Assinatura de saída muda (mais colunas), mas nenhum consumidor
-- existe ainda em produção (Fase 3/4/5 do rebuild ainda não chegaram
-- nela) — sem risco de quebrar quem já lê essa função.
drop function if exists public.orcamento_arvore_valores(uuid[]);

create or replace function public.orcamento_arvore_valores(p_orcamento_ids uuid[])
returns table (
  orcamento_id uuid,
  etapa_id uuid,
  etapa_nome text,
  etapa_ordem integer,
  grupo_id uuid,
  grupo_nome text,
  item_id uuid,
  tipo_linha text,
  tipo_item_snapshot text,
  item_descricao text,
  item_codigo text,
  quantidade numeric,
  unidade text,
  classificacao text,
  ordem integer,
  composicao_id uuid,
  sinapi_composicao_id uuid,
  subetapa_valor_manual_ativo boolean,
  valor_total_manual_ativo boolean,
  valor numeric
)
language sql
stable
as $$
  select
    oi.orcamento_id,
    oi.etapa_id,
    e.nome as etapa_nome,
    e.ordem as etapa_ordem,
    oi.grupo_id,
    header.descricao_snapshot as grupo_nome,
    oi.id as item_id,
    oi.tipo_linha,
    oi.tipo_item_snapshot,
    oi.descricao_snapshot as item_descricao,
    oi.codigo_snapshot as item_codigo,
    oi.quantidade,
    oi.unidade_snapshot as unidade,
    oi.classificacao_snapshot as classificacao,
    oi.ordem,
    oi.composicao_id,
    oi.sinapi_composicao_id,
    oi.subetapa_valor_manual_ativo,
    oi.valor_total_manual_ativo,
    public.orcamento_item_valor(oi.id) as valor
  from public.orcamento_itens oi
  left join public.etapas e on e.id = oi.etapa_id
  left join public.orcamento_itens header on header.id = oi.grupo_id
  where oi.orcamento_id = any(p_orcamento_ids)
$$;

-- Detalhe de insumos por item — mesma prioridade materializado > composição
-- própria "ao vivo" já usada em orcamento_item_valor(), aqui expandida por
-- insumo em vez de somada. Sem isso a UI nova teria que reimplementar essa
-- ramificação em TypeScript pela terceira vez (a primeira já existe em
-- ObraOrcamento.tsx / infoDoItem, que esta função substitui para a UI nova
-- — não altera nem remove o código legado).
create or replace function public.orcamento_item_insumos_detalhe(p_item_id uuid)
returns table (
  origem text,
  insumo_id uuid,
  codigo text,
  descricao text,
  unidade text,
  classificacao text,
  coeficiente numeric,
  quantidade_calculada numeric,
  quantidade_adotada numeric,
  preco_unitario numeric,
  valor_total numeric
)
language plpgsql
stable
as $$
declare
  v_item record;
  v_uf text;
  v_tem_materializado boolean;
begin
  select oi.*, o.uf into v_item
  from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_item_id;

  if not found then
    return;
  end if;

  v_uf := coalesce(v_item.uf, 'SP');

  select count(*) > 0 into v_tem_materializado
  from public.orcamento_item_insumos
  where orcamento_item_id = p_item_id;

  if v_tem_materializado then
    return query
    select
      'materializado'::text as origem,
      null::uuid as insumo_id,
      coalesce(oii.sinapi_codigo, '') as codigo,
      coalesce(oii.descricao_snapshot, '(insumo removido)') as descricao,
      coalesce(oii.unidade_snapshot, 'UN') as unidade,
      coalesce(oii.classificacao_snapshot, 'MATERIAL_SERVICOS') as classificacao,
      oii.coeficiente_snapshot as coeficiente,
      oii.quantidade_calculada,
      coalesce(oii.quantidade_adotada, oii.quantidade_calculada) as quantidade_adotada,
      coalesce(oii.preco_unitario_snapshot, 0) as preco_unitario,
      coalesce(oii.quantidade_adotada, oii.quantidade_calculada) * coalesce(oii.preco_unitario_snapshot, 0) as valor_total
    from public.orcamento_item_insumos oii
    where oii.orcamento_item_id = p_item_id
    order by oii.ordem nulls last, oii.descricao_snapshot;
    return;
  end if;

  if v_item.composicao_id is not null then
    return query
    select
      'composicao_viva'::text as origem,
      coalesce(ci.insumo_proprio_id, ci.insumo_id) as insumo_id,
      coalesce(ip.codigo, si.codigo, '') as codigo,
      coalesce(ip.descricao, si.descricao, '(insumo removido)') as descricao,
      coalesce(ip.unidade, si.unidade, 'UN') as unidade,
      coalesce(ip.classificacao::text, si.classificacao, 'MATERIAL_SERVICOS') as classificacao,
      ci.coeficiente,
      coalesce(v_item.quantidade, 0) * ci.coeficiente as quantidade_calculada,
      coalesce(v_item.quantidade, 0) * ci.coeficiente as quantidade_adotada,
      public.preco_vigente_insumo(ci.insumo_proprio_id, ci.insumo_id, v_uf) as preco_unitario,
      coalesce(v_item.quantidade, 0) * ci.coeficiente * public.preco_vigente_insumo(ci.insumo_proprio_id, ci.insumo_id, v_uf) as valor_total
    from public.composicao_insumos ci
    left join public.insumos_proprios ip on ip.id = ci.insumo_proprio_id
    left join public.sinapi_insumos si on si.id = ci.insumo_id
    where ci.composicao_id = v_item.composicao_id
    order by coalesce(ip.descricao, si.descricao);
  end if;
end;
$$;
