drop index if exists public.board_files_project_file_uidx;
drop index if exists public.board_files_board_file_uidx;
create unique index board_files_project_file_uidx on public.board_files (projeto_id, id);
create unique index board_files_board_file_uidx on public.board_files (board_id, id);
