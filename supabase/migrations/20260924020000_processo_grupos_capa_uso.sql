-- Listagem de Processos: capa, grupo e rastro de uso por pessoa.
--
-- Auditoria feita antes desta migration (sem estrutura paralela):
--   * `processos` não tinha nenhuma coluna de imagem nem de agrupamento —
--     conferido em information_schema antes de escrever isto.
--   * `operacoes`/`operacao_etapas` existem, mas são o encadeamento
--     operacional do Processo (etapa_operacional_id, ordem_etapa), não um
--     rótulo de listagem. Agrupar visualmente cards não é a mesma coisa que
--     posicionar um Processo numa Operação, então não reaproveitei.
--   * A capa reusa o bucket `project-files` já existente (mesmo padrão de
--     processo_caixa_entrada e prospeccao_arquivos), sem bucket novo.
--
-- Nada aqui é destrutivo: três adições (duas colunas nullable e duas
-- tabelas). Rollback é `drop table public.processo_uso, public.processo_grupos`
-- e `alter table public.processos drop column capa_url, drop column grupo_id`.

-- 1. Grupo: só um rótulo que envolve cards na listagem. Sem descrição, sem
-- hierarquia — o produto pede exatamente o nome e nada mais.
create table public.processo_grupos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (trim(nome) <> ''),
  created_at timestamptz not null default now(),
  unique (organization_id, nome)
);

comment on table public.processo_grupos is
  'Rótulo de agrupamento visual da listagem de Processos. Não carrega regra de negócio: agrupar cards não posiciona o Processo numa Operação (ver processos.operacao_id/etapa_operacional_id).';

alter table public.processo_grupos enable row level security;

-- Mesma fonte de verdade de tenancy que o resto do motor: organização da
-- sessão + membership ativo.
create policy processo_grupos_select on public.processo_grupos
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

create policy processo_grupos_insert on public.processo_grupos
  for insert to authenticated
  with check (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

create policy processo_grupos_update on public.processo_grupos
  for update to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_member(organization_id))
  with check (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

create policy processo_grupos_delete on public.processo_grupos
  for delete to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

revoke all on public.processo_grupos from public, anon, authenticated;
grant select, insert, update, delete on public.processo_grupos to authenticated;

-- 2. Colunas novas em processos. Ambas nullable: Processo sem capa e sem
-- grupo continua válido e é o estado padrão de tudo que já existe.
alter table public.processos
  add column capa_url text,
  add column grupo_id uuid references public.processo_grupos(id) on delete set null;

comment on column public.processos.capa_url is
  'Foto de fundo do card na listagem. Arquivo vive no bucket project-files, prefixo processo-capa/.';
comment on column public.processos.grupo_id is
  'Grupo visual da listagem (processo_grupos). on delete set null: apagar o grupo solta os Processos, nunca os apaga.';

create index processos_grupo_id_idx on public.processos (grupo_id) where grupo_id is not null;

-- 3. Rastro de uso por pessoa. Alimenta a ordenação da listagem ("último
-- uso" antes de "ordem de cadastro") e as últimas ações mostradas no card.
-- Uma linha por (processo, pessoa, módulo): o upsert só empurra used_at
-- para frente, então a tabela não cresce com o uso repetido.
create table public.processo_uso (
  processo_id uuid not null references public.processos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module_key text not null,
  used_at timestamptz not null default now(),
  primary key (processo_id, profile_id, module_key)
);

comment on table public.processo_uso is
  'Último acesso de cada pessoa a cada módulo de cada Processo. Só ordena e ilustra a listagem — nunca é fonte de permissão nem de auditoria (audit vive em portal_audit_log).';

create index processo_uso_ordenacao_idx on public.processo_uso (profile_id, used_at desc);

alter table public.processo_uso enable row level security;

-- profile_id nunca vem do cliente: as policies amarram a linha à pessoa da
-- sessão, então ninguém escreve nem lê rastro de uso de outra pessoa.
create policy processo_uso_select on public.processo_uso
  for select to authenticated
  using (profile_id = public.current_profile_id() and public.processo_is_accessible(processo_id));

create policy processo_uso_insert on public.processo_uso
  for insert to authenticated
  with check (profile_id = public.current_profile_id() and public.processo_is_accessible(processo_id));

create policy processo_uso_update on public.processo_uso
  for update to authenticated
  using (profile_id = public.current_profile_id() and public.processo_is_accessible(processo_id))
  with check (profile_id = public.current_profile_id() and public.processo_is_accessible(processo_id));

revoke all on public.processo_uso from public, anon, authenticated;
grant select, insert, update on public.processo_uso to authenticated;
