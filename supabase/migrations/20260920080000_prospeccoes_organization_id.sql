-- Tellus R01 / Seção C — dar dono real às prospecções e substituir a
-- quarentena por isolamento de organização.
--
-- PROBLEMA MEDIDO
-- As sete tabelas do Investidor estão com a policy RESTRICTIVE
-- `auth_global_legacy_quarantine` (using false) desde
-- 20260917234152_quarantine_unscoped_legacy_rls.sql. Restritiva é AND, então
-- `true AND false = false`: invisíveis para qualquer cliente autenticado.
-- /investidor, /investidor/[id] e TelaPesquisa usam o cliente do navegador e
-- recebem ZERO linhas desde 17/09. Só o runtime server-side enxerga, por usar
-- SUPABASE_SERVICE_ROLE_KEY.
--
-- A quarentena está CORRETA: `prospeccoes` realmente não tinha como ser
-- escopada. Faltava a coluna de dono. Esta migration corrige a causa em vez de
-- abrir exceção — a tabela ganha `organization_id` e passa a usar exatamente a
-- mesma guarda de `processos` (auth_global_tenant_guard).
--
-- EFEITO LÍQUIDO SOBRE SEGURANÇA: APERTA.
--   antes de 17/09 : `using true` — qualquer autenticado via tudo, sem escopo;
--   17/09 até aqui : `using false` — ninguém via nada, módulo morto;
--   depois desta   : só membros ativos da organização dona veem as linhas dela.
-- Não existe ramo de escape: linha sem organization_id fica invisível.
--
-- BACKFILL
-- As 5 prospecções existentes vão para a organização Sandbox
-- (d724950e-4b55-431a-ba64-8fb58f43d7a7). Justificativa factual: é a
-- organização do usuário real e a do Processo usado como laboratório; as
-- outras quatro (BuildSmart, Gasparini, Espindola x2) foram declaradas dados
-- de teste sem usuários. `projetos` não possui organization_id, então não
-- existe caminho para derivar dono por project_id.
--
-- Rollback:
--   drop policy if exists auth_global_tenant_guard on public.prospeccoes;
--   drop policy if exists auth_global_parent_guard on public.prospeccao_ficha; -- (idem nas outras 5)
--   create policy auth_global_legacy_quarantine on public.<tabela>
--     as restrictive for all to public using (false) with check (false);
--   alter table public.prospeccoes drop column organization_id;

alter table public.prospeccoes
  add column if not exists organization_id uuid references public.organizations(id);

comment on column public.prospeccoes.organization_id is 'Organização dona da oportunidade (Tellus R01/C). Base do isolamento RLS — antes disto a tabela não era escopável e por isso caiu na quarentena legada. Linha sem organização é invisível por design.';

update public.prospeccoes
   set organization_id = 'd724950e-4b55-431a-ba64-8fb58f43d7a7'
 where organization_id is null;

create index if not exists idx_prospeccoes_organization_id
  on public.prospeccoes(organization_id);

-- Sem isto, todo INSERT vindo do navegador passaria a falhar no `with check`:
-- o código atual (app/(app)/investidor/page.tsx) não preenche organization_id,
-- e não deve precisar saber disso. Mesmo padrão do trigger de autoria da
-- Caixa de Entrada: o servidor decide, o cliente não informa.
create or replace function public.prospeccoes_set_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.current_organization_id();
  end if;
  return new;
end;
$$;

drop trigger if exists prospeccoes_set_organization on public.prospeccoes;
create trigger prospeccoes_set_organization
  before insert on public.prospeccoes
  for each row execute function public.prospeccoes_set_organization();

-- Raiz: mesma guarda de `processos`, sem escape para linha órfã.
create policy auth_global_tenant_guard on public.prospeccoes
  as restrictive for all to public
  using (organization_id = public.current_organization_id()
         and public.is_org_member(organization_id))
  with check (organization_id = public.current_organization_id()
         and public.is_org_member(organization_id));

drop policy if exists auth_global_legacy_quarantine on public.prospeccoes;

-- Filhas: seguem a organização da prospecção-mãe. O teste é replicado de forma
-- explícita em vez de depender de RLS aninhada em subconsulta.
create policy auth_global_parent_guard on public.prospeccao_ficha
  as restrictive for all to public
  using (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)));
drop policy if exists auth_global_legacy_quarantine on public.prospeccao_ficha;

create policy auth_global_parent_guard on public.prospeccao_evidencias
  as restrictive for all to public
  using (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)));
drop policy if exists auth_global_legacy_quarantine on public.prospeccao_evidencias;

create policy auth_global_parent_guard on public.prospeccao_comparaveis
  as restrictive for all to public
  using (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)));
drop policy if exists auth_global_legacy_quarantine on public.prospeccao_comparaveis;

create policy auth_global_parent_guard on public.prospeccao_cenarios
  as restrictive for all to public
  using (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)));
drop policy if exists auth_global_legacy_quarantine on public.prospeccao_cenarios;

create policy auth_global_parent_guard on public.prospeccao_analises_mercado
  as restrictive for all to public
  using (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)));
drop policy if exists auth_global_legacy_quarantine on public.prospeccao_analises_mercado;

create policy auth_global_parent_guard on public.prospeccao_arquivos
  as restrictive for all to public
  using (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)))
  with check (exists (select 1 from public.prospeccoes p where p.id = prospeccao_id
           and p.organization_id = public.current_organization_id()
           and public.is_org_member(p.organization_id)));
drop policy if exists auth_global_legacy_quarantine on public.prospeccao_arquivos;

create index if not exists idx_prospeccao_ficha_prospeccao_id on public.prospeccao_ficha(prospeccao_id);
create index if not exists idx_prospeccao_evidencias_prospeccao_id on public.prospeccao_evidencias(prospeccao_id);
create index if not exists idx_prospeccao_comparaveis_prospeccao_id on public.prospeccao_comparaveis(prospeccao_id);
create index if not exists idx_prospeccao_cenarios_prospeccao_id on public.prospeccao_cenarios(prospeccao_id);
create index if not exists idx_prospeccao_analises_mercado_prospeccao_id on public.prospeccao_analises_mercado(prospeccao_id);
create index if not exists idx_prospeccao_arquivos_prospeccao_id on public.prospeccao_arquivos(prospeccao_id);
