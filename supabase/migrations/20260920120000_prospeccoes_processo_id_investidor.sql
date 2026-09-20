-- Template Investidor (Tellus R01 / Seção C2) — a oportunidade é o registro
-- interno 1:1 de um Processo.
--
-- Auditoria antes de escrever (feita no banco de TESTE compartilhado por
-- main/preview): as colunas prospeccoes.processo_id (FK → processos, ON DELETE
-- SET NULL) e prospeccoes.organization_id (FK → organizations) JÁ EXISTEM no
-- banco, aplicadas fora do versionamento em uma rodada anterior. Esta migration
-- só reconcilia o repositório com o banco (idempotente: nada muda onde já
-- existe) e ACRESCENTA a garantia de unicidade 1:1 que ainda faltava — um
-- Processo tem no máximo uma oportunidade (prospecção não-venda). O núcleo
-- continua sendo o Processo; prospeccoes é só o registro interno.
--
-- Reversível: as três operações têm o "drop" correspondente (índice único,
-- índice de busca, colunas) — nenhuma reescreve dado existente.

alter table public.prospeccoes
  add column if not exists processo_id uuid;

alter table public.prospeccoes
  add column if not exists organization_id uuid;

-- FKs idempotentes: só cria se ainda não houver a constraint (o banco de TESTE
-- já as tem; um ambiente limpo passa a ter).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospeccoes_processo_id_fkey'
  ) then
    alter table public.prospeccoes
      add constraint prospeccoes_processo_id_fkey
      foreign key (processo_id) references public.processos(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'prospeccoes_organization_id_fkey'
  ) then
    alter table public.prospeccoes
      add constraint prospeccoes_organization_id_fkey
      foreign key (organization_id) references public.organizations(id);
  end if;
end $$;

-- Busca da oportunidade pelo Processo (find-or-create em
-- lib/investidor-processo.ts).
create index if not exists idx_prospeccoes_processo_id
  on public.prospeccoes (processo_id)
  where processo_id is not null;

-- 1:1 de verdade: no máximo uma oportunidade (não-venda) por Processo. Parcial
-- para não conflitar com as prospecções do laboratório autônomo (processo_id
-- nulo) nem com a prospecção-sombra de venda (is_venda = true).
create unique index if not exists prospeccoes_processo_unico
  on public.prospeccoes (processo_id)
  where processo_id is not null and is_venda = false;

comment on column public.prospeccoes.processo_id is
  'Template Investidor: liga a oportunidade (registro interno 1:1) ao Processo dono. O Processo é o núcleo único; ver lib/investidor-processo.ts. Nulo nas prospecções do laboratório autônomo /investidor.';
comment on column public.prospeccoes.organization_id is
  'Organização dona da oportunidade, herdada do Processo na criação. Nulo nas prospecções antigas do laboratório autônomo.';
