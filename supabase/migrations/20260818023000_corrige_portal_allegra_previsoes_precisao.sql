-- Corrige o cadastro piloto da Allegra sem criar uma fonte paralela.
-- As previsoes permanecem em obra_previsoes e o Portal continua lendo a RPC existente.

alter table public.financiamento_cronograma_banco
  alter column pct_acumulado_previsto type numeric(12, 8)
  using pct_acumulado_previsto::numeric(12, 8);

-- O cronograma original foi informado com valor acumulado de R$ 188.463,75.
-- Guardar a razao com precisao evita que o Portal derive R$ 188.468,00 de 29,68%.
with caixa as (
  select coalesce(sum(valor_previsto), 0) total
  from public.obra_fontes_recursos
  where obra_id = 'ca79a72f-d864-4f9a-982b-ee6dd2db677c'::uuid
)
update public.financiamento_cronograma_banco c
set pct_acumulado_previsto = 188463.75 / nullif(caixa.total, 0) * 100
from caixa
where c.obra_id = 'ca79a72f-d864-4f9a-982b-ee6dd2db677c'::uuid
  and c.orcamento_id = 'eb285efe-12c9-4c4c-818d-29b13a854c59'::uuid
  and c.mes = 7;

-- A obra de compatibilizacao substitui o cadastro piloto para validacao do Portal.
-- Reaproveita as previsoes publicadas, sem copiar etapas/itens invalidos do orcamento antigo.
insert into public.obra_previsoes (
  serie_id,
  versao,
  vigente,
  obra_id,
  orcamento_id,
  etapa_id,
  subetapa_id,
  servico_id,
  compra_item_id,
  medicao_id,
  tipo,
  titulo,
  descricao,
  valor_previsto,
  data_prevista,
  valor_realizado,
  data_realizada,
  condicao_pagamento,
  status,
  origem,
  baseline,
  publicado_cliente,
  observacao_interna,
  metadados,
  created_by,
  fornecedor_nome,
  external_key,
  titulo_cliente,
  descricao_cliente
)
select
  gen_random_uuid(),
  1,
  true,
  'ca79a72f-d864-4f9a-982b-ee6dd2db677c'::uuid,
  'eb285efe-12c9-4c4c-818d-29b13a854c59'::uuid,
  null,
  null,
  null,
  null,
  null,
  p.tipo,
  p.titulo,
  p.descricao,
  p.valor_previsto,
  p.data_prevista,
  p.valor_realizado,
  p.data_realizada,
  p.condicao_pagamento,
  p.status,
  p.origem,
  p.baseline,
  p.publicado_cliente,
  p.observacao_interna,
  coalesce(p.metadados, '{}'::jsonb) || jsonb_build_object('migrada_de_previsao_id', p.id),
  p.created_by,
  p.fornecedor_nome,
  p.external_key,
  p.titulo_cliente,
  p.descricao_cliente
from public.obra_previsoes p
where p.obra_id = 'fd954f3a-ee3a-4205-bfa7-9e17b564f474'::uuid
  and p.vigente
  and p.publicado_cliente
  and not exists (
    select 1
    from public.obra_previsoes destino
    where destino.obra_id = 'ca79a72f-d864-4f9a-982b-ee6dd2db677c'::uuid
      and destino.vigente
      and destino.external_key is not distinct from p.external_key
      and destino.titulo = p.titulo
  );
