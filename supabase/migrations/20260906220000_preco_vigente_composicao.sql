-- Fase 2a do rebuild de Orçamento — preço vigente de uma composição num único
-- lugar. Corrige a causa raiz do bug #1 (TemplateOrcamentoModal.tsx lia
-- composicoes_proprias.custo_unitario, coluna que não existe — confirmado ao
-- vivo). Composição própria nunca teve preço armazenado (é sempre a soma dos
-- insumos, que pode mudar a qualquer momento); SINAPI tem custo agregado
-- pronto. Esta função é a única forma de perguntar "quanto essa composição
-- custa hoje", usada por template, Luiza (obra-ai) e qualquer tela futura —
-- ninguém mais escreve essa query à mão.
create or replace function public.preco_vigente_composicao(
  p_composicao_id uuid,
  p_sinapi_composicao_id uuid,
  p_uf text
) returns numeric
language plpgsql
stable
as $$
declare
  v_uf text := coalesce(p_uf, 'SP');
  v_soma numeric;
  v_tem_preco boolean;
begin
  if p_composicao_id is not null then
    select
      bool_or(coalesce(public.preco_vigente_insumo(ci.insumo_proprio_id, ci.insumo_id, v_uf), 0) > 0),
      coalesce(sum(ci.coeficiente * public.preco_vigente_insumo(ci.insumo_proprio_id, ci.insumo_id, v_uf)), 0)
    into v_tem_preco, v_soma
    from public.composicao_insumos ci
    where ci.composicao_id = p_composicao_id;

    if v_tem_preco then
      return v_soma;
    end if;
    return null;
  end if;

  if p_sinapi_composicao_id is not null then
    return (
      select coalesce((custos->>v_uf)::numeric, custo_unitario)
      from public.sinapi_composicoes
      where id = p_sinapi_composicao_id
    );
  end if;

  return null;
end;
$$;
