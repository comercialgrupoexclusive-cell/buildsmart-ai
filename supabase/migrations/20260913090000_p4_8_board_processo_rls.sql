-- Board do Processo (rodada "núcleo operacional do Motor de Processo").
-- Reaproveita a tabela `boards` já existente (Excalidraw + PDF + arquivos +
-- NC via board_items/board_files), no mesmo padrão já usado para Board de
-- Obra (scope='portal') — só adiciona um vínculo por processo_id em vez de
-- criar uma tabela paralela. Cada Processo tem seu próprio Board
-- independente (find-or-create por processo_id, ver ExcalidrawBoard.tsx).
alter table public.boards
  add column if not exists processo_id uuid references public.processos(id) on delete cascade;

create index if not exists boards_processo_id_idx on public.boards (processo_id);

alter table public.boards drop constraint if exists boards_scope_check;
alter table public.boards add constraint boards_scope_check
  check (scope = any (array['project', 'internal', 'portal', 'processo']));

-- Saneamento de segurança (auditoria ao vivo encontrou ALL/true em boards,
-- board_files e board_items — qualquer requisição, autenticada ou anônima,
-- lia/escrevia qualquer Board do sistema).
--
-- Desenho: `processo_id is null` preserva EXATAMENTE o comportamento atual
-- para todo Board de Obra/Projeto/Prospecção/Portal — inclusive o acesso
-- anônimo do Portal do cliente (app/api/portal/[token]/canvas usa a anon
-- key, sem sessão; processo_id nunca é setado por esse fluxo). Só o
-- caminho NOVO por Processo passa a exigir processo_is_accessible(), a
-- mesma função já usada por `plantas`/`processos`/`processo_modulos` —
-- nenhuma regra nova é inventada, só aplicada ao Board.
drop policy if exists boards_all on public.boards;
create policy boards_all on public.boards
  for all to public
  using (processo_id is null or public.processo_is_accessible(processo_id))
  with check (processo_id is null or public.processo_is_accessible(processo_id));

drop policy if exists board_items_all on public.board_items;
create policy board_items_all on public.board_items
  for all to public
  using (
    exists (
      select 1 from public.boards b
      where b.id = board_items.board_id
        and (b.processo_id is null or public.processo_is_accessible(b.processo_id))
    )
  )
  with check (
    exists (
      select 1 from public.boards b
      where b.id = board_items.board_id
        and (b.processo_id is null or public.processo_is_accessible(b.processo_id))
    )
  );

-- board_files pode pertencer a projeto_id/prospeccao_id (sem relação com
-- Processo — passa direto, igual antes) OU a board_id (Obra/Portal/Processo
-- — aí o vínculo é resolvido através do Board, igual à policy acima).
drop policy if exists board_files_all on public.board_files;
create policy board_files_all on public.board_files
  for all to public
  using (
    board_id is null
    or exists (
      select 1 from public.boards b
      where b.id = board_files.board_id
        and (b.processo_id is null or public.processo_is_accessible(b.processo_id))
    )
  )
  with check (
    board_id is null
    or exists (
      select 1 from public.boards b
      where b.id = board_files.board_id
        and (b.processo_id is null or public.processo_is_accessible(b.processo_id))
    )
  );
