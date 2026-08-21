-- Tarefas V1: adiciona status 'aguardando' (ações que dependem de terceiros —
-- cliente, prefeitura, fornecedor, projetista, equipe etc.) e índices para as
-- consultas filtradas do motor global de tarefas (Inbox/Minhas/Hoje/Próximas/
-- Aguardando). Tabela já existia e está vazia — mudança compatível, não
-- remove nenhum valor existente.

alter table public.tarefas drop constraint if exists tarefas_status_check;
alter table public.tarefas add constraint tarefas_status_check
  check (status = any (array['pendente','em_andamento','aguardando','concluida','cancelada']));

create index if not exists idx_tarefas_obra_id on public.tarefas(obra_id) where obra_id is not null;
create index if not exists idx_tarefas_projeto_id on public.tarefas(projeto_id) where projeto_id is not null;
create index if not exists idx_tarefas_responsavel_id on public.tarefas(responsavel_id) where responsavel_id is not null;
create index if not exists idx_tarefas_status on public.tarefas(status);
create index if not exists idx_tarefas_data_prazo on public.tarefas(data_prazo) where data_prazo is not null;
