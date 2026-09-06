-- Motor de Processo (P3.1 — Fundação do domínio).
--
-- `processos` é a nova raiz operacional canônica do BuildSmart (contrato
-- aprovado em PROCESSO_P2_CONTRATO_MOTOR.md, plano de execução em
-- PROCESSO_P3_PLANO_ACAO_CLAUDE.md). NÃO é alias de `projetos` nem de
-- `obras` — essas continuam existindo como legado durante a convergência
-- (P3.3 em diante), mas nenhuma tabela nova do motor referencia `obra_id`
-- ou `projeto_id`. Aditiva: não altera nem lê nenhuma tabela existente.
--
-- Campos deliberadamente mínimos (seção 3.2 do plano) — nenhum campo de
-- `projetos`/`obras` foi copiado automaticamente; cada um aqui existe
-- porque o Core do motor precisa dele (identidade, dados gerais, status,
-- responsável, auditoria de timestamps).
create table public.processos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  nome text not null,
  tipo text,
  cliente_nome text,
  endereco text,
  responsavel_id uuid references public.profiles(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.processos is 'Raiz operacional canônica do Motor de Processo (P3). Não usar projetos.id/obras.id como substituto — ver PROCESSO_P2_CONTRATO_MOTOR.md seção 1.';
comment on column public.processos.organization_id is 'Nullable nesta fase — Organization ainda não é operacional no restante do sistema (seção 3.2 do plano P3).';
comment on column public.processos.status is 'Vocabulário canônico único do Processo. Nenhum módulo pode inventar um segundo status raiz concorrente (PROCESSO_P2_CONTRATO_MOTOR.md seção 2).';

create index idx_processos_status on public.processos(status);

alter table public.processos enable row level security;
create policy processos_all on public.processos for all using (true) with check (true);

-- Registry de módulos habilitados por Processo — vínculo explícito e
-- tipado (lib/processo/domain/module-registry.ts é a fonte da lista de
-- chaves válidas; esta tabela só guarda o estado habilitado/desabilitado
-- por Processo, nunca a definição do módulo em si).
create table public.processo_modulos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  enabled_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (processo_id, module_key)
);

comment on table public.processo_modulos is 'Vínculo de habilitação de módulo por Processo (seção 3.3 do plano P3) — permite ativar/desativar um módulo por Processo sem condicionar o Core às regras internas do módulo.';

create index idx_processo_modulos_processo_id on public.processo_modulos(processo_id);

alter table public.processo_modulos enable row level security;
create policy processo_modulos_all on public.processo_modulos for all using (true) with check (true);
