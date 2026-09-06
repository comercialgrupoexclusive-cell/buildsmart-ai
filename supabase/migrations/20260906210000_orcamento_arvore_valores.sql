-- Fase 1 do rebuild de Orçamento — parte 4: árvore com valores, achatada.
--
-- Uma linha por linha de orcamento_itens (item OU cabeçalho de subetapa),
-- já com etapa/grupo resolvidos por id (nunca texto) e o valor calculado
-- pela função canônica única (orcamento_item_valor). Rollups por grupo/etapa
-- ficam a cargo de quem consome (GROUP BY simples sobre isto) — não há
-- lógica de negócio nova aqui além da já existente em orcamento_item_valor,
-- só achatamento + join de nomes.
--
-- SQL puro (não PL/pgSQL) de propósito: as funções do Portal (SECURITY
-- DEFINER, sem acesso a TS) e o client (via .rpc()) passam a ler a mesma
-- fonte — elimina o bug #6 (3+ reimplementações divergentes).
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
    public.orcamento_item_valor(oi.id) as valor
  from public.orcamento_itens oi
  left join public.etapas e on e.id = oi.etapa_id
  left join public.orcamento_itens header on header.id = oi.grupo_id
  where oi.orcamento_id = any(p_orcamento_ids)
$$;
