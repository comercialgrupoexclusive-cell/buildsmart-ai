-- Log mínimo de auditoria para escritas da Luiza no motor de Tarefas.
-- Não reaproveitei portal_audit_log porque ele exige obra_id OU projeto_id
-- (tarefas podem ser globais, sem nenhum dos dois) e não tem valor_anterior.
-- Também não reaproveitei luizia_logs (é só transcript de pergunta/resposta,
-- não registra qual entidade/ação). Espelha o padrão já usado nesta sessão em
-- orcamento_verificacao_historico (entidade_id sem FK — registro histórico
-- sobrevive à exclusão da tarefa).

create table if not exists public.luizia_tarefas_log (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid,
  acao text not null check (acao in ('criar','editar','concluir','reabrir','cancelar')),
  usuario text,
  origem text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  resultado text not null check (resultado in ('ok','erro')),
  erro text,
  created_at timestamptz not null default now()
);

create index if not exists idx_luizia_tarefas_log_tarefa_id on public.luizia_tarefas_log(tarefa_id);
create index if not exists idx_luizia_tarefas_log_created_at on public.luizia_tarefas_log(created_at desc);

alter table public.luizia_tarefas_log enable row level security;
create policy bs_mvp_select_all on public.luizia_tarefas_log for select using (true);
create policy bs_mvp_insert_all on public.luizia_tarefas_log for insert with check (true);
