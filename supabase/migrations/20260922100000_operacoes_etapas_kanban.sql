-- Tellus — Compatibilização Funcional 01: Operação + Processos + Etapa
-- Operacional configurável.
--
-- OPERAÇÃO
--   ↓
-- PROCESSOS
--   ↓
-- ETAPA OPERACIONAL CONFIGURÁVEL
--
-- Processo continua sendo a única unidade operacional do Motor — Operação é
-- só agrupador/contexto acima dele. Nenhum segundo Motor, nenhuma segunda
-- raiz. Tudo aditivo e retrocompatível: Processos existentes (sem Operação)
-- continuam válidos e funcionando sem nenhuma mudança de comportamento.
--
-- Etapa operacional (operacao_etapas) é dado do usuário, não enum de
-- código — nomes como "Aquisição"/"Reforma"/"À venda" nunca são hardcoded em
-- lógica de negócio. O ID da etapa é estável; só o nome/ordem/cor mudam.
--
-- processos.status (ACTIVE/ON_HOLD/COMPLETED/ARCHIVED) continua sendo o
-- estado TÉCNICO do Processo e não é tocado aqui. etapa_operacional_id é o
-- estado OPERACIONAL (onde o Processo está na operação real) — os dois
-- nunca se substituem.
--
-- Rollback:
--   alter table public.processos
--     drop constraint if exists processos_etapa_operacional_fkey,
--     drop constraint if exists processos_operacao_fkey,
--     drop column if exists ordem_etapa,
--     drop column if exists etapa_operacional_id,
--     drop column if exists operacao_id;
--   drop trigger if exists processos_validar_etapa_operacional on public.processos;
--   drop function if exists public.processos_validar_etapa_operacional();
--   drop table if exists public.operacao_etapas;
--   drop table if exists public.operacoes;
--   drop function if exists public.operacao_is_accessible(uuid);

-- ─── 1) operacoes ────────────────────────────────────────────────────────────
create table public.operacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  nome text not null,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.operacoes is 'Agrupador/contexto acima de Processos (Compatibilização Funcional 01). NÃO é um segundo Motor — Processo continua sendo a unidade operacional. Uma Operação organiza Processos em etapas configuráveis (operacao_etapas).';

create index idx_operacoes_organization_id on public.operacoes(organization_id);

-- Mesmo padrão de processo_is_accessible: função reaproveitada pelas
-- policies desta tabela e pelas de operacao_etapas (guarda de organização,
-- sem escape para linha órfã).
create function public.operacao_is_accessible(p_operacao_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_operacao_id is not null and exists (
    select 1 from public.operacoes o where o.id = p_operacao_id
      and o.organization_id = public.current_organization_id()
      and public.is_org_member(o.organization_id))
$$;

alter table public.operacoes enable row level security;

create policy auth_global_tenant_guard on public.operacoes
  as restrictive for all to public
  using (organization_id = public.current_organization_id()
         and public.is_org_member(organization_id))
  with check (organization_id = public.current_organization_id()
         and public.is_org_member(organization_id));

create policy operacoes_select on public.operacoes for select to authenticated
  using (public.operacao_is_accessible(id));
create policy operacoes_insert on public.operacoes for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy operacoes_update on public.operacoes for update to authenticated
  using (public.operacao_is_accessible(id))
  with check (public.operacao_is_accessible(id) and public.is_org_member(organization_id));
create policy operacoes_delete on public.operacoes for delete to authenticated
  using (public.operacao_is_accessible(id));

revoke all on public.operacoes from public, anon;
grant select, insert, update, delete on public.operacoes to authenticated;

-- ─── 2) operacao_etapas ──────────────────────────────────────────────────────
create table public.operacao_etapas (
  id uuid primary key default gen_random_uuid(),
  operacao_id uuid not null references public.operacoes(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  cor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.operacao_etapas is 'Etapas configuráveis de uma Operação (Compatibilização Funcional 01). Nome/ordem/cor são dado do usuário — nenhuma lógica de negócio deve depender do texto do nome. O id permanece estável quando o nome muda (é o que processos.etapa_operacional_id referencia).';

create index idx_operacao_etapas_operacao_id on public.operacao_etapas(operacao_id, ordem);

alter table public.operacao_etapas enable row level security;

-- Mesmo padrão de processo_modulos: uma guarda RESTRICTIVE + uma policy
-- PERMISSIVE ALL, ambas via o accessor da tabela-mãe.
create policy auth_global_operacao_guard on public.operacao_etapas
  as restrictive for all to public
  using (public.operacao_is_accessible(operacao_id))
  with check (public.operacao_is_accessible(operacao_id));

create policy operacao_etapas_all on public.operacao_etapas for all to authenticated
  using (public.operacao_is_accessible(operacao_id))
  with check (public.operacao_is_accessible(operacao_id));

revoke all on public.operacao_etapas from public, anon;
grant select, insert, update, delete on public.operacao_etapas to authenticated;

-- ─── 3) processos: vínculo opcional com Operação/Etapa ───────────────────────
alter table public.processos
  add column if not exists operacao_id uuid references public.operacoes(id) on delete set null,
  add column if not exists etapa_operacional_id uuid references public.operacao_etapas(id) on delete set null,
  add column if not exists ordem_etapa integer not null default 0;

comment on column public.processos.operacao_id is 'Operação (agrupador) a que este Processo pertence, quando houver. Nullable: Processos sem Operação continuam válidos (comportamento anterior preservado).';
comment on column public.processos.etapa_operacional_id is 'Etapa operacional configurável (operacao_etapas) onde o Processo está na operação real. Distinto de processos.status (estado técnico) — nunca um substitui o outro.';
comment on column public.processos.ordem_etapa is 'Posição do card dentro da etapa no Kanban (drag-and-drop). Sem significado fora dessa etapa.';

create index if not exists idx_processos_operacao_id on public.processos(operacao_id) where operacao_id is not null;
create index if not exists idx_processos_etapa_operacional_id on public.processos(etapa_operacional_id, ordem_etapa) where etapa_operacional_id is not null;

-- Integridade cross-tenant: FKs do Postgres não respeitam RLS, então nada
-- impediria hoje um UPDATE apontar etapa_operacional_id/operacao_id para uma
-- linha de OUTRA organização (a linha existe, a FK fica satisfeita). Esta
-- trigger fecha essa lacuna e também deriva operacao_id a partir da etapa
-- quando o chamador só informou a etapa (evita os dois campos divergirem).
--
-- Deliberadamente SEM security definer: a trigger roda como o papel
-- 'authenticated' que fez o UPDATE/INSERT em processos, então o SELECT
-- abaixo já é filtrado pela RLS de operacoes/operacao_etapas — uma etapa/
-- operação de outra organização simplesmente não aparece (mesmo efeito de
-- segurança de um comparativo explícito de organization_id, sem o risco de
-- rodar com privilégio elevado).
create function public.processos_validar_etapa_operacional() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_etapa_operacao_id uuid;
begin
  if new.etapa_operacional_id is not null then
    select oe.operacao_id into v_etapa_operacao_id
      from public.operacao_etapas oe
     where oe.id = new.etapa_operacional_id;

    if v_etapa_operacao_id is null then
      raise exception 'Etapa operacional inexistente ou de outra organização.';
    end if;
    if new.operacao_id is not null and new.operacao_id <> v_etapa_operacao_id then
      raise exception 'Etapa operacional não pertence à Operação informada.';
    end if;
    new.operacao_id := v_etapa_operacao_id;
  elsif new.operacao_id is not null then
    if not exists (select 1 from public.operacoes o where o.id = new.operacao_id) then
      raise exception 'Operação inexistente ou de outra organização.';
    end if;
  end if;
  return new;
end;
$$;

create trigger processos_validar_etapa_operacional
  before insert or update of operacao_id, etapa_operacional_id on public.processos
  for each row execute function public.processos_validar_etapa_operacional();

revoke all on function public.operacao_is_accessible(uuid) from public, anon, authenticated;
grant execute on function public.operacao_is_accessible(uuid) to authenticated;
revoke all on function public.processos_validar_etapa_operacional() from public, anon, authenticated;
