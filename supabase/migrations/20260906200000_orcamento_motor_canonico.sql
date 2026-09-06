-- Fase 1 do rebuild de Orçamento — parte 3: motor de cálculo canônico.
--
-- Tradução linha-a-linha de getItemTotal/custoPorCategoria
-- (components/obra/ObraOrcamento.tsx:840-932), a única fonte de verdade
-- hoje. Objetivo: uma função SQL que tanto o client (via .rpc) quanto as
-- funções do Portal (SQL puro, não podem chamar TS) possam consumir —
-- eliminando a causa raiz (bug #6: 3+ reimplementações divergentes da
-- árvore etapa/subetapa/item com valores).
--
-- Regras preservadas (não uma reinterpretação, é a mesma matemática):
--  - subetapa (tipo_linha='subetapa'): só tem valor próprio quando
--    subetapa_valor_manual_ativo; senão 0 (rollup fica a cargo de quem
--    consome, exatamente como hoje).
--  - valor_total_manual_ativo vence tudo (override de item).
--  - se o item já tem linhas em orcamento_item_insumos (materializado por
--    congelamento, importação ou conferência), o valor vem SÓ delas —
--    nunca mistura com composicao_insumos "ao vivo" (mesmo comportamento
--    hoje: `insumosImportados.length ? insumosImportados : cp?.composicao_insumos`).
--  - senão, se tem composição própria (composicao_id), resolve preço vigente
--    de cada insumo (insumo_proprio.preco_unitario ou sinapi_insumo.precos[uf])
--    e soma coeficiente × quantidade × preço. Se NENHUM insumo tem preço,
--    cai no fallback preco_unitario_snapshot × quantidade (mesma regra
--    `temPreco` do JS).
--  - senão (SINAPI, insumo direto, item livre — composição SINAPI nunca é
--    expandida em insumos hoje, só usa o custo unitário já agregado):
--    preco_unitario_snapshot × quantidade.
--
-- Overrides de insumo (bug #2) ficam de fora desta função: ela lê
-- orcamento_item_insumos.quantidade_adotada já persistida — quem passa a
-- gravar ali em vez de localStorage é a Fase 2 (UI), sem mudança de schema.

create or replace function public.preco_vigente_insumo(
  p_insumo_proprio_id uuid,
  p_sinapi_insumo_id uuid,
  p_uf text
) returns numeric
language sql
stable
as $$
  select coalesce(
    (select preco_unitario from public.insumos_proprios where id = p_insumo_proprio_id),
    (select (precos->>coalesce(p_uf, 'SP'))::numeric from public.sinapi_insumos where id = p_sinapi_insumo_id),
    0
  );
$$;

create or replace function public.orcamento_item_valor(p_item_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v_item record;
  v_uf text;
  v_tem_materializado boolean;
  v_soma_materializada numeric;
  v_soma_composicao numeric;
  v_tem_preco boolean;
begin
  select oi.*, o.uf into v_item
  from public.orcamento_itens oi
  join public.orcamentos o on o.id = oi.orcamento_id
  where oi.id = p_item_id;

  if not found then
    return 0;
  end if;

  v_uf := coalesce(v_item.uf, 'SP');

  if v_item.tipo_linha = 'subetapa' then
    if v_item.subetapa_valor_manual_ativo then
      return coalesce(v_item.subetapa_valor_manual, 0);
    end if;
    return 0;
  end if;

  if v_item.valor_total_manual_ativo and v_item.valor_total_informado_snapshot is not null then
    return v_item.valor_total_informado_snapshot;
  end if;

  select count(*) > 0 into v_tem_materializado
  from public.orcamento_item_insumos
  where orcamento_item_id = p_item_id;

  if v_tem_materializado then
    select coalesce(sum(coalesce(quantidade_adotada, quantidade_calculada) * preco_unitario_snapshot), 0)
    into v_soma_materializada
    from public.orcamento_item_insumos
    where orcamento_item_id = p_item_id;
    return v_soma_materializada;
  end if;

  if v_item.composicao_id is not null then
    select
      bool_or(coalesce(public.preco_vigente_insumo(ci.insumo_proprio_id, ci.insumo_id, v_uf), 0) > 0),
      coalesce(sum(coalesce(v_item.quantidade, 0) * ci.coeficiente * public.preco_vigente_insumo(ci.insumo_proprio_id, ci.insumo_id, v_uf)), 0)
    into v_tem_preco, v_soma_composicao
    from public.composicao_insumos ci
    where ci.composicao_id = v_item.composicao_id;

    if v_tem_preco then
      return v_soma_composicao;
    end if;
    -- nenhum insumo da composição tem preço vigente: cai no snapshot
    -- (mesma regra `temPreco` do JS) em vez de devolver 0.
    return coalesce(v_item.preco_unitario_snapshot, 0) * coalesce(v_item.quantidade, 0);
  end if;

  -- SINAPI (custo já agregado, sem expansão em insumos), insumo direto,
  -- ou item livre.
  return coalesce(v_item.preco_unitario_snapshot, 0) * coalesce(v_item.quantidade, 0);
end;
$$;
