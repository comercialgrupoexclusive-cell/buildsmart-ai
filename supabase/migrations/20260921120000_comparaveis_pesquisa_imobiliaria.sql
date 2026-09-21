-- Tellus — Template Investidor — Pesquisa Imobiliária.
--
-- Campos do comparável exigidos pelo processo canônico da pesquisa (doc
-- "Processo e Modelos de Saída", §6) que ainda não existiam em
-- prospeccao_comparaveis. Aditivo e retrocompatível: todas as colunas são
-- nullable ou têm default, então a main atual (sem este código) continua
-- válida. Nenhuma coluna existente é alterada ou removida.
--
-- Semântica (regras invioláveis do processo):
--   tipo_area           = área útil/privativa/construída/total — distinção
--                         obrigatória (a área de um anúncio não é a do imóvel).
--   andar               = texto (pode ser "térreo", "2º", desconhecido).
--   disponibilidade     = estado da página/anúncio (ex.: disponível, indisponível).
--   possivel_duplicado  = marcação humana de anúncio possivelmente repetido.
--   tipo                = tipologia do comparável (apartamento, sobrado…).
alter table public.prospeccao_comparaveis
  add column if not exists tipo text,
  add column if not exists andar text,
  add column if not exists tipo_area text,
  add column if not exists disponibilidade text,
  add column if not exists possivel_duplicado boolean not null default false;

comment on column public.prospeccao_comparaveis.tipo_area is
  'Tipo da área informada no anúncio: util | privativa | construida | total | outro. Nunca atribuir a área do comparável ao imóvel analisado.';
comment on column public.prospeccao_comparaveis.possivel_duplicado is
  'Marcação humana de anúncio possivelmente duplicado — não conta como imóvel distinto na análise.';
comment on column public.prospeccao_comparaveis.disponibilidade is
  'Disponibilidade da página/anúncio (ex.: disponivel, indisponivel). Anúncio indisponível pode permanecer como evidência histórica, identificado como tal.';
