-- UI canônica do Orçamento no Processo — edição de item (CRUD, rodada 2).
--
-- A tela de editar/exibir serviço precisa do preco_unitario_snapshot bruto,
-- não só do valor total já calculado — sem ele, "valor unitário" só podia
-- ser derivado como valor/quantidade, o que mostra "—" sempre que a
-- quantidade está "a conferir" mesmo quando o preço já é conhecido (o
-- inverso do que a coluna deveria mostrar). Mudança aditiva de novo: mais
-- uma coluna crua, mesmo raciocínio da migration anterior.
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
  preco_unitario_snapshot numeric,
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
    oi.preco_unitario_snapshot,
    public.orcamento_item_valor(oi.id) as valor
  from public.orcamento_itens oi
  left join public.etapas e on e.id = oi.etapa_id
  left join public.orcamento_itens header on header.id = oi.grupo_id
  where oi.orcamento_id = any(p_orcamento_ids)
$$;
