-- Corretiva: applied diretamente no Supabase durante testes com dados
-- descartáveis (criar projeto -> etapa -> item -> planejamento -> obra,
-- sem obra) e só agora alinhada ao repositório.
--
-- Descoberta ao testar iniciar_obra_por_orcamento: etapas.obra_id era
-- propagado corretamente, mas planejamento_itens/planejamento_dependencias
-- ficavam com obra_id nulo mesmo depois de a obra existir (só orcamento_id
-- era preenchido na criação em fase de projeto). Esta migração adiciona a
-- propagação de obra_id para o planejamento do orçamento promovido,
-- preservando projeto_id como linhagem histórica.
create or replace function public.iniciar_obra_por_orcamento(p_orcamento_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_orcamento public.orcamentos%rowtype;
  v_projeto public.projetos%rowtype;
  v_obra_id uuid;
  v_baseline_capturada boolean := false;
begin
  select * into v_orcamento
  from public.orcamentos
  where id = p_orcamento_id
  for update;

  if not found then raise exception 'Orcamento nao encontrado.'; end if;
  if v_orcamento.status = 'arquivado' then raise exception 'Orcamento arquivado nao pode iniciar uma obra.'; end if;

  -- Chamada repetida devolve o mesmo vinculo sem duplicar a obra.
  if v_orcamento.obra_id is not null and v_orcamento.status = 'ativo' then
    return jsonb_build_object(
      'projeto_id', v_orcamento.projeto_id,
      'orcamento_id', v_orcamento.id,
      'obra_id', v_orcamento.obra_id,
      'fase_ciclo', case when v_orcamento.projeto_id is null then null else 'em_obra' end,
      'status', 'ativo',
      'baseline_capturada', exists (select 1 from public.orcamento_itens_baseline where orcamento_id = v_orcamento.id)
    );
  end if;

  if v_orcamento.projeto_id is not null then
    select * into v_projeto
    from public.projetos
    where id = v_orcamento.projeto_id
    for update;

    if not found then raise exception 'Projeto do orcamento nao encontrado.'; end if;
    if v_projeto.fase_ciclo = 'entregue' then raise exception 'A obra deste projeto ja foi entregue.'; end if;

    select id into v_obra_id
    from public.obras
    where projeto_id = v_projeto.id;

    if v_projeto.obra_id is not null then
      if v_obra_id is not null and v_obra_id <> v_projeto.obra_id then
        raise exception 'Projeto possui vinculos de obra conflitantes.';
      end if;
      v_obra_id := v_projeto.obra_id;
    end if;

    if v_obra_id is null then
      insert into public.obras (
        nome, endereco, foto_url, status, data_inicio, data_previsao,
        responsavel, projeto_id, area_m2
      ) values (
        coalesce(v_orcamento.nome, v_projeto.nome),
        coalesce(v_orcamento.endereco, v_projeto.endereco, ''),
        v_projeto.foto_url, 'ativa',
        coalesce(v_orcamento.data_inicio, v_projeto.data_inicio),
        coalesce(v_orcamento.data_previsao, v_projeto.data_previsao),
        coalesce(v_orcamento.responsavel, v_projeto.responsavel),
        v_projeto.id, v_orcamento.area_m2
      ) returning id into v_obra_id;
    elsif exists (select 1 from public.obras where id = v_obra_id and status = 'concluida') then
      raise exception 'A obra vinculada ja esta concluida.';
    end if;

    update public.projetos
    set obra_id = v_obra_id, fase_ciclo = 'em_obra', updated_at = now()
    where id = v_projeto.id;

    update public.cronogramas
    set obra_id = v_obra_id,
        status = case when status = 'rascunho' then 'ativo' else status end
    where projeto_id = v_projeto.id;

    -- As etapas formam o cronograma unico do projeto e conservam seus IDs.
    update public.etapas
    set obra_id = v_obra_id
    where projeto_id = v_projeto.id and obra_id is null;
  else
    v_obra_id := v_orcamento.obra_id;
    if v_obra_id is null then
      insert into public.obras (
        nome, endereco, status, data_inicio, data_previsao,
        responsavel, area_m2, uf
      ) values (
        coalesce(v_orcamento.nome, 'Nova obra'),
        coalesce(v_orcamento.endereco, ''), 'ativa',
        v_orcamento.data_inicio, v_orcamento.data_previsao,
        v_orcamento.responsavel, v_orcamento.area_m2,
        coalesce(nullif(v_orcamento.uf, ''), 'SP')
      ) returning id into v_obra_id;
    end if;

    update public.etapas e
    set obra_id = v_obra_id
    where e.obra_id is null
      and exists (
        select 1 from public.orcamento_itens oi
        where oi.orcamento_id = v_orcamento.id and oi.etapa_id = e.id
      );
  end if;

  -- O planejamento deste orcamento (itens e dependencias) acompanha a
  -- promocao para obra, preenchendo obra_id sem perder o projeto_id de
  -- origem (linhagem historica).
  update public.planejamento_itens
  set obra_id = v_obra_id
  where orcamento_id = v_orcamento.id and obra_id is null;

  update public.planejamento_dependencias
  set obra_id = v_obra_id
  where orcamento_id = v_orcamento.id and obra_id is null;

  perform public.congelar_orcamento(v_orcamento.id);

  -- Baseline: fotografia imutável do orçamento e do planejamento no exato
  -- momento em que a obra começa. So-insercao, idempotente por orcamento_id
  -- (chamada repetida nao duplica nem sobrescreve a baseline ja existente).
  if not exists (select 1 from public.orcamento_itens_baseline where orcamento_id = v_orcamento.id) then
    insert into public.orcamento_itens_baseline (
      orcamento_id, orcamento_item_id, etapa_id, subetapa, composicao_id, sinapi_composicao_id,
      tipo_linha, quantidade, preco_unitario_snapshot, descricao_snapshot, codigo_snapshot,
      unidade_snapshot, data_inicio, data_fim, ordem
    )
    select
      orcamento_id, id, etapa_id, subetapa, composicao_id, sinapi_composicao_id,
      tipo_linha, quantidade, preco_unitario_snapshot, descricao_snapshot, codigo_snapshot,
      unidade_snapshot, data_inicio, data_fim, ordem
    from public.orcamento_itens
    where orcamento_id = v_orcamento.id;

    with itens_baseline as (
      insert into public.planejamento_itens_baseline (
        orcamento_id, planejamento_item_id, ref_tipo, etapa_id, subetapa_key,
        orcamento_item_id, data_inicio, data_fim, progresso_planejado
      )
      select
        orcamento_id, id, ref_tipo, etapa_id, subetapa_key,
        orcamento_item_id, data_inicio, data_fim, progresso_planejado
      from public.planejamento_itens
      where orcamento_id = v_orcamento.id
      returning id, planejamento_item_id
    )
    insert into public.planejamento_dependencias_baseline (
      orcamento_id, item_baseline_id, predecessor_baseline_id, tipo, lag_dias
    )
    select pd.orcamento_id, ib.id, pb.id, pd.tipo, pd.lag_dias
    from public.planejamento_dependencias pd
    join itens_baseline ib on ib.planejamento_item_id = pd.item_id
    join itens_baseline pb on pb.planejamento_item_id = pd.predecessor_id
    where pd.orcamento_id = v_orcamento.id;

    v_baseline_capturada := true;
  else
    v_baseline_capturada := true;
  end if;

  update public.orcamentos
  set obra_id = v_obra_id, status = 'ativo'
  where id = v_orcamento.id;

  return jsonb_build_object(
    'projeto_id', v_orcamento.projeto_id,
    'orcamento_id', v_orcamento.id,
    'obra_id', v_obra_id,
    'fase_ciclo', case when v_orcamento.projeto_id is null then null else 'em_obra' end,
    'status', 'ativo',
    'baseline_capturada', v_baseline_capturada
  );
end;
$function$;
