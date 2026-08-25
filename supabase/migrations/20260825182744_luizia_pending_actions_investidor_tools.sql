-- Laboratório Investidor — Marco 6 (Luiza com CRUD total).
-- Reaproveita a tabela genérica de propostas pendentes já usada por
-- Tarefas/Avisos (luizia_pending_task_actions + lib/luizia-pending-actions.ts)
-- em vez de criar uma tabela paralela só para o Investidor — mesmo
-- mecanismo "propor → confirmar/rejeitar" e mesma trava de servidor contra
-- escrita direta. Só amplia o CHECK de `tool` com os novos nomes.
alter table public.luizia_pending_task_actions
  drop constraint luizia_pending_task_actions_tool_check;

alter table public.luizia_pending_task_actions
  add constraint luizia_pending_task_actions_tool_check
  check (tool = any (array[
    'create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task',
    'create_alert', 'update_alert',
    'create_prospeccao', 'update_prospeccao',
    'create_cenario', 'update_cenario', 'delete_cenario', 'set_cenario_principal',
    'convert_to_ativo'
  ]));
