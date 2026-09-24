-- Template de Processo vira dado, não código.
--
-- A rodada anterior (20260924, template-registry.ts) colocou o template num
-- registry no código, com "leilao" fixo. O produto pede que o usuário crie e
-- edite os próprios templates — escolhendo quais módulos nascem ligados e
-- quais campos do cadastro não fazem sentido. Isso não cabe num arquivo .ts,
-- então o registry é SUBSTITUÍDO por esta tabela (não duplicado: o arquivo
-- sai no mesmo commit).
--
-- Auditoria antes de criar:
--   * projeto_templates e orcamento_templates existem, mas são templates de
--     ESCOPO (itens de projeto, itens de orçamento) — guardam linhas-filhas
--     de um orçamento/projeto modelo. Um template de Processo guarda
--     configuração do motor (quais módulos, quais campos), não itens. Não há
--     o que reaproveitar além do padrão de nomenclatura.
--   * processos.template_key já existia (resquício da branch tellus, 4 linhas
--     preenchidas com chaves daquele período). Fica intocada — dropar seria
--     destrutivo — mas deixa de ser lida: quem manda passa a ser template_id.
--     As 4 linhas antigas já não casavam com nenhum template ativo, então
--     nada muda de comportamento para elas.
--
-- Rollback: alter table processos drop column template_id; drop table
-- processo_templates.

create table public.processo_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (trim(nome) <> ''),
  descricao text,
  -- Módulos que já nascem habilitados. Validado no service contra o
  -- module-registry: o banco não conhece as chaves válidas, e inventar um
  -- check aqui obrigaria migration a cada módulo novo.
  modulos text[] not null default '{}',
  -- Campos do cadastro escondidos por este template. Num leilão não existe
  -- cliente contratante, então pedir "Cliente" só produz campo vazio.
  campos_ocultos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, nome)
);

comment on table public.processo_templates is
  'Receita de Processo: quais módulos nascem ligados e quais campos do cadastro não se aplicam. Configuração do motor, não itens — diferente de projeto_templates/orcamento_templates, que guardam linhas-filhas.';

alter table public.processo_templates enable row level security;

create policy processo_templates_select on public.processo_templates
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

create policy processo_templates_insert on public.processo_templates
  for insert to authenticated
  with check (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

create policy processo_templates_update on public.processo_templates
  for update to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_member(organization_id))
  with check (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

create policy processo_templates_delete on public.processo_templates
  for delete to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_member(organization_id));

revoke all on public.processo_templates from public, anon, authenticated;
grant select, insert, update, delete on public.processo_templates to authenticated;

-- on delete set null: apagar o template nunca apaga Processos. O Processo
-- só perde a receita que o originou e passa a mostrar todos os campos.
alter table public.processos
  add column template_id uuid references public.processo_templates(id) on delete set null;

comment on column public.processos.template_id is
  'Template que originou o Processo. Decide quais campos do cadastro aparecem depois, não só na criação. Substitui a leitura de template_key (resquício da branch tellus, mantida por não ser destrutivo).';

create index processos_template_id_idx on public.processos (template_id) where template_id is not null;

-- Leilão já nasce pronto em toda organização: é o caso concreto que motivou
-- o recurso, e um template vazio não ensina nada sobre o que um template faz.
insert into public.processo_templates (organization_id, nome, descricao, modulos, campos_ocultos)
select o.id,
       'Leilão',
       'Aquisição de imóvel em leilão — ainda não há cliente, o comprador é você.',
       array['dados_gerais', 'caixa_entrada', 'orcamento', 'financeiro', 'tarefas'],
       array['cliente_nome']
from public.organizations o
on conflict (organization_id, nome) do nothing;
