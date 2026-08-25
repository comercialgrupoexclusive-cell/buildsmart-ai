-- ═══════════════════════════════════════════════════════════════════════════
-- LABORATÓRIO INVESTIDOR — MARCO 2: Prospecções (Rodada 02)
--
-- Escopo desta migração: só o necessário para "Board" e "Arquivos" da tela
-- interna da Prospecção reaproveitarem o máximo possível da V1, conforme
-- autorizado. Nenhuma tabela nova de Ativos/Comparador/Cenários — essas já
-- existem do Marco 1 e não mudam aqui.
--
-- 1) BOARD — o Board de Project não usa a tabela `boards` (essa é só para
--    obra/portal): usa uma coluna `board_data` jsonb direto em `projetos` +
--    `board_files` com `projeto_id`. Não há como reaproveitar isso para
--    Prospecção sem tocar nesse mesmo mecanismo (documentado no relatório
--    da rodada). Solução mínima: mesma forma para `prospeccoes`.
-- 2) ARQUIVOS — `obra_files.obra_id` é NOT NULL e a tabela carrega várias
--    colunas específicas de obra/portal (publicado_cliente, source_type/
--    source_id de IA, edited_by) que não fazem sentido para Prospecção.
--    Reaproveitar essa tabela exigiria relaxar sua NOT NULL e ainda deixar
--    colunas mortas em toda linha de prospecção — pior que uma tabela nova
--    pequena e focada. Documentado no relatório da rodada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Board de Prospecção (mesmo mecanismo do Board de Project) ────────────
alter table public.prospeccoes add column board_data jsonb;

alter table public.board_files add column prospeccao_id uuid references public.prospeccoes(id) on delete cascade;

alter table public.board_files drop constraint board_files_owner_check;
alter table public.board_files add constraint board_files_owner_check
  check (projeto_id is not null or board_id is not null or prospeccao_id is not null);

create unique index board_files_prospeccao_file_uidx on public.board_files(prospeccao_id, id);

comment on column public.prospeccoes.board_data is 'Board (Excalidraw) da prospecção — mesmo mecanismo de projetos.board_data. Ver ExcalidrawBoard.tsx prop prospeccaoId.';
comment on column public.board_files.prospeccao_id is 'Preenchido quando o arquivo do Board pertence a uma Prospecção (mutuamente exclusivo com projeto_id/board_id na prática, não reforçado por CHECK).';

-- ─── 2) Arquivos da Prospecção (tabela nova, pequena e focada) ───────────────
create table public.prospeccao_arquivos (
  id uuid primary key default gen_random_uuid(),
  prospeccao_id uuid not null references public.prospeccoes(id) on delete cascade,
  nome text not null,
  tipo text not null,
  tamanho bigint not null default 0,
  categoria text not null default 'outro',
  url text,
  criado_em timestamptz not null default now()
);

create index idx_prospeccao_arquivos_prospeccao_id on public.prospeccao_arquivos(prospeccao_id);

comment on table public.prospeccao_arquivos is 'Arquivos anexados a uma Prospecção (Marco 2/Rodada 2) — equivalente reduzido de obra_files, sem os campos específicos de obra/portal que não se aplicam aqui.';

alter table public.prospeccao_arquivos enable row level security;
create policy prospeccao_arquivos_all on public.prospeccao_arquivos for all using (true) with check (true);
