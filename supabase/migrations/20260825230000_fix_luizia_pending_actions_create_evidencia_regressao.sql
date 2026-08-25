-- Hotfix pré-reunião: a migration `investidor_rotinas_agentes` (Rodada 8,
-- aplicada ao vivo por outra sessão/ferramenta sem passar pelo repositório
-- — ver 20260825204005_investidor_rotinas_agentes.sql) reescreveu este
-- CHECK a partir de uma versão desatualizada do array, perdendo
-- 'create_evidencia' (adicionado na Rodada 7 — ver
-- 20260825190500_luizia_pending_actions_investidor_evidencia.sql). Isso
-- quebrava silenciosamente o registro de Evidências pela Luiza (o
-- confirm_pending_action de propose_create_evidencia falhava no INSERT).
-- Restaura 'create_evidencia' preservando todos os outros valores.
alter table public.luizia_pending_task_actions
  drop constraint luizia_pending_task_actions_tool_check;

alter table public.luizia_pending_task_actions
  add constraint luizia_pending_task_actions_tool_check
  check (tool = any (array[
    'create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task',
    'create_alert', 'update_alert',
    'create_prospeccao', 'update_prospeccao',
    'create_cenario', 'update_cenario', 'delete_cenario', 'set_cenario_principal',
    'convert_to_ativo', 'create_evidencia',
    'create_investidor_rotina', 'update_investidor_rotina', 'run_investidor_rotina'
  ]));
