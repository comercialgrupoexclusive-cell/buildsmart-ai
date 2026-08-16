-- Cada orçamento do projeto precisa da sua própria hierarquia
-- Etapa -> Subetapa -> Item -> Planejamento, sem compartilhar etapas
-- mutáveis com outros orçamentos do mesmo projeto. Antes, etapas em fase
-- de projeto eram escopadas só por projeto_id — dois orçamentos do mesmo
-- projeto reaproveitavam (e podiam editar/excluir) as mesmas etapas.
-- Não há dado existente em produção nessa fase (0 etapas com projeto_id
-- e obra_id nulo), então não precisa de backfill.
alter table public.etapas add column orcamento_id uuid references public.orcamentos(id) on delete cascade;
create index etapas_orcamento_id_idx on public.etapas(orcamento_id);
