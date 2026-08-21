-- Rodada "Identidade única da Luiza x Painel x Avisos": as novas tools de
-- Avisos do chat flutuante (lib/luizia-avisos-ai-tools.ts) reaproveitam
-- INTEGRALMENTE o mecanismo existente de proposta pendente
-- (luizia_pending_task_actions / lib/luizia-pending-actions.ts) — mesma
-- regra "sugestão nunca escreve sozinha, só confirmação explícita grava" já
-- usada por Tarefas. Isso evita criar uma segunda arquitetura de
-- confirmação só para Avisos; a única mudança de schema necessária é
-- alargar o CHECK de `tool` para aceitar os dois novos valores.
alter table public.luizia_pending_task_actions
  drop constraint if exists luizia_pending_task_actions_tool_check;

alter table public.luizia_pending_task_actions
  add constraint luizia_pending_task_actions_tool_check
  check (tool in ('create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task', 'create_alert', 'update_alert'));
