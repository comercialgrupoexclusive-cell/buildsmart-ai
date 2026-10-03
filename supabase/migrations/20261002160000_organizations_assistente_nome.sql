-- Nome do assistente de IA configurável por organização. O assistente não é mais
-- "Luiza" hardcoded: cada organização define o nome que seus usuários veem (e a
-- foto/branding vem de logo_url). Default genérico "Assistente".
--
-- Rollback: alter table public.organizations drop column assistente_nome;

alter table public.organizations
  add column if not exists assistente_nome text not null default 'Assistente';

comment on column public.organizations.assistente_nome is
  'Nome do assistente de IA exibido ao usuário (configurável por organização). Default genérico "Assistente" — nunca hardcode "Luiza".';
