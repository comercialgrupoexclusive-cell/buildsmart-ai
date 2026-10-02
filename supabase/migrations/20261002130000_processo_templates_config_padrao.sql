-- Template define, por tipo (Leilão/Obra/Projeto…), não só QUAIS módulos nascem
-- ligados, mas também a CONFIG PADRÃO de cada módulo — ex.: um template que já
-- nasce com a numeração automática da EAP desligada. Até aqui a config de módulo
-- só existia por Processo (processo_modulos.config, 20260924…); o template não
-- carregava defaults, então toda config era feita manualmente depois.
--
-- config_padrao é um mapa { "<module_key>": { "<opcao>": <valor> } }, aplicado
-- na criação do Processo (lib/processo/service/processo-service.ts) sobre
-- processo_modulos.config dos módulos habilitados. As chaves são validadas no
-- service contra o module-registry — por isso o banco guarda jsonb livre, sem
-- check (seguindo o mesmo critério de `modulos text[]` nesta tabela).
--
-- Rollback: alter table public.processo_templates drop column config_padrao;

alter table public.processo_templates
  add column if not exists config_padrao jsonb not null default '{}'::jsonb;

comment on column public.processo_templates.config_padrao is
  'Config padrão por módulo aplicada na criação do Processo: { "<module_key>": { "<opcao>": <valor> } }. Chaves validadas no service contra o module-registry.';
