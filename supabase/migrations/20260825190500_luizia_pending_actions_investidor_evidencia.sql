-- Laboratório Investidor — Marco 7 (Evidências). Amplia o CHECK de `tool`
-- em luizia_pending_task_actions com 'create_evidencia' (mesma tabela
-- genérica de propostas pendentes, sem tabela paralela).
alter table public.luizia_pending_task_actions
  drop constraint luizia_pending_task_actions_tool_check;

alter table public.luizia_pending_task_actions
  add constraint luizia_pending_task_actions_tool_check
  check (tool = any (array[
    'create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task',
    'create_alert', 'update_alert',
    'create_prospeccao', 'update_prospeccao',
    'create_cenario', 'update_cenario', 'delete_cenario', 'set_cenario_principal',
    'convert_to_ativo', 'create_evidencia'
  ]));
