-- Regra 3 (proteção no banco) do documento de convergência de Suprimentos:
-- depois da consolidação, garante que a mesma origem (obra + orçamento +
-- etapa + subetapa estável + código do insumo) nunca mais gera duas linhas.
-- Escopo deliberadamente restrito ao que é seguro comparar: só materiais
-- vindos de orçamento (orcamento_id not null), com sinapi_codigo preenchido,
-- e cuja subetapa já foi resolvida para o id estável (ou não tem subetapa).
-- Materiais legados com subetapa não resolvida (texto órfão/renomeado) ou
-- sem sinapi_codigo ficam de fora da proteção até um resync real — não são
-- forçados a colidir sob um mesmo "sentinel" nulo.
create unique index if not exists uq_materiais_identidade
  on public.materiais (
    obra_id,
    orcamento_id,
    coalesce(etapa_id::text, ''),
    coalesce(subetapa_orcamento_item_id::text, ''),
    sinapi_codigo
  )
  where orcamento_id is not null
    and sinapi_codigo is not null
    and (subetapa is null or subetapa_orcamento_item_id is not null);
