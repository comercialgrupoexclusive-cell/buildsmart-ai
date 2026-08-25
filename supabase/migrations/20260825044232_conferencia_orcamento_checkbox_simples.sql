-- Simplificação radical da conferência do orçamento (hotfix "checkbox +
-- CRUD"): o checkbox passa a ser um booleano puro e independente por nível
-- (etapa/subetapa/item/insumo) — SEM cascata pai-filho, sem exigir que
-- filhos estejam conferidos, sem validar a composição. Substitui a versão
-- anterior (20260820051007_conferencia_orcamento.sql), que fazia cascata
-- automática (etapa->subetapa/item->insumo) e, para o nível "insumo",
-- exigia que o id apontasse para uma linha já existente em
-- orcamento_item_insumos — mas a maioria dos itens do orçamento (tudo que
-- não veio de importação XLSX) nunca tem essa linha materializada; a UI usa
-- o id de `composicao_insumos` (definição da composição) só para exibição.
-- Isso fazia QUALQUER clique no checkbox de um insumo não-importado estourar
-- 'insumo_invalido' — inclusive quando o clique era, na prática, no
-- checkbox do item, que ficava preso pela mesma trava por causa da lógica
-- "item sempre carrega seus insumos junto".
--
-- Fix: quando o insumo clicado não é uma linha existente em
-- orcamento_item_insumos, materializa uma linha mínima usando o mesmo
-- snapshot (código/descrição/unidade/classificação/coeficiente/quantidade
-- calculada/preço unitário) que a própria UI já está exibindo — não altera
-- preço, coeficiente nem nenhuma regra de cálculo da composição, só dá ao
-- insumo um lugar para guardar o "conferido" dali em diante.
create or replace function public.orcamento_verificacao_marcar(
  p_orcamento_id uuid,
  p_entidade_tipo text,
  p_entidade_id uuid,
  p_acao text,
  p_profile_id uuid,
  p_orcamento_item_id uuid default null,
  p_insumo_snapshot jsonb default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  marcado boolean;
  agora timestamptz := now();
  acao_reg text;
  alvo_id uuid;
  verificado_anterior boolean;
begin
  if not exists (select 1 from public.profiles p where p.id = p_profile_id and p.tipo in ('admin','usuario')) then
    raise exception 'verificacao_nao_autorizada' using errcode = '42501';
  end if;
  if p_acao not in ('verificar','reabrir') then
    raise exception 'acao_invalida';
  end if;
  if p_entidade_tipo not in ('etapa','subetapa','item','insumo') then
    raise exception 'entidade_invalida';
  end if;

  marcado := (p_acao = 'verificar');
  acao_reg := case when marcado then 'verificado' else 'reaberto' end;

  if p_entidade_tipo = 'etapa' then
    select verificado into verificado_anterior from public.etapas
      where id = p_entidade_id and orcamento_id = p_orcamento_id;
    if not found then
      raise exception 'etapa_invalida';
    end if;
    alvo_id := p_entidade_id;

    update public.etapas set
      verificado = marcado,
      verificado_por = case when marcado then p_profile_id else null end,
      verificado_em = case when marcado then agora else null end
    where id = alvo_id;

    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    values (p_orcamento_id, 'etapa', alvo_id, acao_reg, p_profile_id, jsonb_build_object('verificado', verificado_anterior), jsonb_build_object('verificado', marcado));

  elsif p_entidade_tipo in ('subetapa', 'item') then
    select verificado into verificado_anterior from public.orcamento_itens
      where id = p_entidade_id and orcamento_id = p_orcamento_id
        and tipo_linha = p_entidade_tipo;
    if not found then
      raise exception '%', (p_entidade_tipo || '_invalido');
    end if;
    alvo_id := p_entidade_id;

    update public.orcamento_itens set
      verificado = marcado,
      verificado_por = case when marcado then p_profile_id else null end,
      verificado_em = case when marcado then agora else null end
    where id = alvo_id;

    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    values (p_orcamento_id, p_entidade_tipo, alvo_id, acao_reg, p_profile_id, jsonb_build_object('verificado', verificado_anterior), jsonb_build_object('verificado', marcado));

  elsif p_entidade_tipo = 'insumo' then
    select id, verificado into alvo_id, verificado_anterior
      from public.orcamento_item_insumos where id = p_entidade_id;

    if alvo_id is null then
      if p_orcamento_item_id is null or p_insumo_snapshot is null then
        raise exception 'insumo_invalido';
      end if;
      if not exists (select 1 from public.orcamento_itens where id = p_orcamento_item_id and orcamento_id = p_orcamento_id) then
        raise exception 'item_invalido';
      end if;

      insert into public.orcamento_item_insumos (
        orcamento_item_id, sinapi_codigo, descricao_snapshot, unidade_snapshot,
        classificacao_snapshot, coeficiente_snapshot, quantidade_calculada,
        quantidade_adotada, preco_unitario_snapshot
      ) values (
        p_orcamento_item_id,
        coalesce(nullif(p_insumo_snapshot->>'codigo', ''), 'SEM-COD-' || left(p_entidade_id::text, 8)),
        nullif(p_insumo_snapshot->>'descricao', ''),
        nullif(p_insumo_snapshot->>'unidade', ''),
        nullif(p_insumo_snapshot->>'classificacao', ''),
        (p_insumo_snapshot->>'coeficiente')::numeric,
        coalesce((p_insumo_snapshot->>'quantidade_calculada')::numeric, 0),
        coalesce((p_insumo_snapshot->>'quantidade_calculada')::numeric, 0),
        coalesce((p_insumo_snapshot->>'preco_unitario')::numeric, 0)
      ) returning id into alvo_id;
      verificado_anterior := false;
    end if;

    update public.orcamento_item_insumos set
      verificado = marcado,
      verificado_por = case when marcado then p_profile_id else null end,
      verificado_em = case when marcado then agora else null end
    where id = alvo_id;

    insert into public.orcamento_verificacao_historico(orcamento_id, entidade_tipo, entidade_id, acao, usuario_id, valor_anterior, valor_novo)
    values (p_orcamento_id, 'insumo', alvo_id, acao_reg, p_profile_id, jsonb_build_object('verificado', verificado_anterior), jsonb_build_object('verificado', marcado));
  end if;

  return jsonb_build_object('ok', true, 'id', alvo_id);
end;
$$;
