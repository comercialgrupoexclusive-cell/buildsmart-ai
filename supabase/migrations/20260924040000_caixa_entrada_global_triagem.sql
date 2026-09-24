-- Caixa de Entrada global + camada de triagem.
--
-- Duas mudanças, uma dependente da outra:
--
-- 1. A entrada deixa de exigir um Processo. Hoje processo_id é NOT NULL, o
--    que torna impossível registrar algo ANTES de existir o Processo — e é
--    exatamente isso que o produto pede: jogar tudo numa caixa, e só depois
--    decidir que aquilo virou tarefa, virou Processo novo, ou não virou nada.
--
-- 2. A triagem vira tabela própria, e não coluna na entrada. A migration
--    20260919120000 fixou que a entrada é append-only e que "uma futura
--    camada de agentes lê estas linhas e escreve interpretação em tabelas
--    próprias, nunca aqui". Esta é essa camada. O que a pessoa falou fica
--    intacto; o que foi decidido sobre aquilo vive ao lado e pode mudar.
--
-- Sobre processo_caixa_entrada.status: a coluna existe desde 20260919120000
-- mas nunca pôde mudar (não há policy de UPDATE, de propósito). Ela fica como
-- está — dropar seria destrutivo — porém NÃO é a fonte de verdade de
-- situação. Quem responde "em que pé está esta entrada" é
-- caixa_entrada_triagem.status. Nada no código deve voltar a escrever na
-- coluna antiga.
--
-- Rollback: drop table caixa_entrada_triagem; drop function
-- caixa_entrada_is_accessible; restaurar as duas policies antigas; alter
-- table processo_caixa_entrada alter column processo_id set not null (só
-- possível se não houver entrada global gravada), drop column
-- organization_id.

-- ── 1. Entrada sem Processo ──────────────────────────────────────────────
alter table public.processo_caixa_entrada
  alter column processo_id drop not null,
  add column organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill: hoje toda entrada tem Processo (conferido antes desta migration:
-- 10 linhas, nenhuma com processo_id nulo), então a organização sai dele.
update public.processo_caixa_entrada e
set organization_id = p.organization_id
from public.processos p
where p.id = e.processo_id and e.organization_id is null;

-- Uma entrada precisa de pelo menos uma âncora de tenancy: ou o Processo
-- (que carrega a organização dele) ou a organização direta. Sem isso a linha
-- ficaria fora do alcance de qualquer policy.
alter table public.processo_caixa_entrada
  add constraint processo_caixa_entrada_ancora
  check (processo_id is not null or organization_id is not null);

comment on column public.processo_caixa_entrada.organization_id is
  'Organização da entrada. Preenchida por trigger: do Processo quando existe, senão da sessão. Para entradas globais (sem Processo) é a única âncora de tenancy.';

-- organization_id nunca vem do cliente, pelo mesmo motivo que
-- autor_profile_id não vem: é o que decide quem enxerga a linha.
create or replace function public.processo_caixa_entrada_set_org()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.processo_id is not null then
    select p.organization_id into new.organization_id
    from public.processos p where p.id = new.processo_id;
  else
    new.organization_id := public.current_organization_id();
  end if;
  return new;
end;
$$;

create trigger processo_caixa_entrada_set_org
  before insert on public.processo_caixa_entrada
  for each row execute function public.processo_caixa_entrada_set_org();

revoke all on function public.processo_caixa_entrada_set_org() from public, anon, authenticated;

-- As policies antigas liam só processo_is_accessible(processo_id), que
-- devolve null quando não há Processo e esconderia toda entrada global.
-- As novas mantêm EXATAMENTE a regra anterior para linhas com Processo e
-- acrescentam o caso global — é extensão, não alargamento do que já existia.
drop policy processo_caixa_entrada_select on public.processo_caixa_entrada;
drop policy processo_caixa_entrada_insert on public.processo_caixa_entrada;

create policy processo_caixa_entrada_select on public.processo_caixa_entrada
  for select to authenticated
  using (
    (processo_id is not null and public.processo_is_accessible(processo_id))
    or (processo_id is null and organization_id is not null
        and organization_id = public.current_organization_id()
        and public.is_org_member(organization_id))
  );

create policy processo_caixa_entrada_insert on public.processo_caixa_entrada
  for insert to authenticated
  with check (
    (processo_id is not null and public.processo_is_accessible(processo_id))
    or (processo_id is null and public.current_organization_id() is not null)
  );

-- ── 2. Triagem ───────────────────────────────────────────────────────────
-- Mesma fonte de verdade de acesso da entrada que ela descreve: quem enxerga
-- a entrada enxerga a triagem dela, e ninguém mais.
create or replace function public.caixa_entrada_is_accessible(p_entrada_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_entrada_id is not null and exists (
    select 1 from public.processo_caixa_entrada e
    where e.id = p_entrada_id
      and (
        (e.processo_id is not null and public.processo_is_accessible(e.processo_id))
        or (e.processo_id is null and e.organization_id is not null
            and e.organization_id = public.current_organization_id()
            and public.is_org_member(e.organization_id))
      ))
$$;

create table public.caixa_entrada_triagem (
  entrada_id uuid primary key references public.processo_caixa_entrada(id) on delete cascade,
  status text not null default 'novo'
    check (status in ('novo', 'tarefa', 'processo', 'um_dia_talvez', 'arquivado')),
  resumo text,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  processo_criado_id uuid references public.processos(id) on delete set null,
  triado_por_ia boolean not null default false,
  triado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.caixa_entrada_triagem is
  'O que foi decidido sobre uma entrada da Caixa: virou tarefa, virou Processo, fica para um dia talvez, ou foi arquivada. Mutável de propósito — a entrada que ela descreve continua append-only. Uma linha por entrada.';
comment on column public.caixa_entrada_triagem.tarefa_id is
  'on delete set null: apagar a tarefa não apaga o registro de que a entrada virou uma. O status permanece contando a história.';

create index caixa_entrada_triagem_status_idx on public.caixa_entrada_triagem (status);

alter table public.caixa_entrada_triagem enable row level security;

create policy caixa_entrada_triagem_select on public.caixa_entrada_triagem
  for select to authenticated
  using (public.caixa_entrada_is_accessible(entrada_id));

create policy caixa_entrada_triagem_insert on public.caixa_entrada_triagem
  for insert to authenticated
  with check (public.caixa_entrada_is_accessible(entrada_id));

create policy caixa_entrada_triagem_update on public.caixa_entrada_triagem
  for update to authenticated
  using (public.caixa_entrada_is_accessible(entrada_id))
  with check (public.caixa_entrada_is_accessible(entrada_id));

create policy caixa_entrada_triagem_delete on public.caixa_entrada_triagem
  for delete to authenticated
  using (public.caixa_entrada_is_accessible(entrada_id));

revoke all on public.caixa_entrada_triagem from public, anon, authenticated;
grant select, insert, update, delete on public.caixa_entrada_triagem to authenticated;
