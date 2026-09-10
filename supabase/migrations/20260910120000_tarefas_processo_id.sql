-- P4.2 — Motor de Processo: Tarefas + Board.
--
-- `tarefas` só tinha `obra_id`/`projeto_id` (duas raízes, mutuamente
-- exclusivas por convenção de aplicação, nunca reforçada no banco). Processo
-- é a terceira raiz possível, mesmo padrão já usado em `etapas`/
-- `planejamento_itens`/`planejamento_dependencias`. Aditivo: nullable, sem
-- tocar nas linhas existentes (obra_id/projeto_id continuam funcionando
-- exatamente como antes para /obras e /projetos).
alter table public.tarefas
  add column if not exists processo_id uuid references public.processos(id);

create index if not exists idx_tarefas_processo_id
  on public.tarefas(processo_id) where processo_id is not null;
