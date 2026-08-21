-- Rodada de hardening Luiza x Tarefas V1.1: identidade estrutural
-- telefone->profile, proposta pendente persistente para sugestões da Luiza,
-- e bloqueio de escrita pública no log de auditoria.

-- 1) Vínculo estrutural WhatsApp -> profile. Sem isso, "minhas tarefas"
--    dependeria de casar o nome do contato do WhatsApp com profiles.name por
--    semelhança — o mesmo tipo de escolha silenciosa que este pacote de
--    correções está eliminando. O admin vincula manualmente em /admin-luiza.
alter table public.luizia_wa_phone_rules
  add column if not exists profile_id uuid references public.profiles(id);

-- 2) Propostas pendentes da Luiza. O rascunho assinado de lib/luizia-work.ts
--    (usado pelo widget Chat/Work) depende do CLIENTE reenviar o draft a
--    cada mensagem — funciona porque é uma sessão de browser contínua. No
--    WhatsApp não há client guardando estado entre mensagens: o servidor é
--    stateless por requisição (só o histórico em luizia_wa_messages
--    persiste). Por isso a "sugestão aguardando confirmação" precisa viver
--    no banco, não em memória nem no cliente.
create table if not exists public.luizia_pending_task_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null,
  profile_id uuid references public.profiles(id),
  actor text,
  origem text not null,
  tool text not null check (tool in ('create_task', 'update_task', 'complete_task', 'reopen_task', 'cancel_task')),
  argumentos jsonb not null,
  descricao text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);

create index if not exists idx_luizia_pending_conversation on public.luizia_pending_task_actions(conversation_key, status);

alter table public.luizia_pending_task_actions enable row level security;
-- Nenhuma policy definida de propósito: com RLS ligado e zero policies,
-- só a service_role (que ignora RLS) consegue ler/escrever. anon/authenticated
-- nunca devem ver nem fabricar uma proposta pendente de outra pessoa.
revoke all on public.luizia_pending_task_actions from anon, authenticated;

-- 3) luizia_tarefas_log tinha policy de INSERT pública (bs_mvp_insert_all,
--    with_check=true) e grants amplos (INSERT/UPDATE/DELETE/TRUNCATE) para
--    anon/authenticated — herdados do "ALTER DEFAULT PRIVILEGES" padrão do
--    projeto, não de intenção. Isso é incompatível com o uso deste log como
--    evidência de auditoria: qualquer client anônimo (ex. a chave pública
--    embutida no app) podia inserir uma linha fabricando histórico de uma
--    ação que nunca aconteceu. Correção: só o server (service_role, usado
--    pelas rotas de API) grava e lê — nenhum client direto.
drop policy if exists bs_mvp_insert_all on public.luizia_tarefas_log;
drop policy if exists bs_mvp_select_all on public.luizia_tarefas_log;
revoke all on public.luizia_tarefas_log from anon, authenticated;
