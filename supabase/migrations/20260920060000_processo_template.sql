-- Tellus R01 / Seção A — Template como contrato técnico persistente do Motor
-- de Processo.
--
-- ADITIVA E RETROCOMPATÍVEL por exigência da rodada: main e branches
-- compartilham o mesmo banco de teste, então esta migration não pode quebrar
-- o código já publicado na main. Só adiciona duas colunas nullable.
--
-- Não remove, não renomeia e não altera tipo de nenhuma coluna existente.
-- Processos criados antes desta migration permanecem válidos com
-- template_key/template_version nulos.
--
-- Rollback: alter table public.processos drop column template_version, drop column template_key;
--
-- Deliberadamente NÃO é FK para uma tabela de templates: nesta fase o registry
-- vive no código (lib/processo/domain/template-registry.ts) e a validação
-- acontece no Service antes da escrita. Criar tabela+FK agora seria estrutura
-- sem necessidade comprovada.
--
-- `template_key` é conceito separado de `processos.tipo`. `tipo` continua
-- sendo rótulo descritivo livre digitado pelo usuário e nenhum código deriva
-- comportamento dele.
alter table public.processos
  add column if not exists template_key text,
  add column if not exists template_version integer;

comment on column public.processos.template_key is 'Receita de composição declarada pelo Processo (Tellus R01/A). Nullable: Processos anteriores não possuem template. Fonte das chaves válidas: lib/processo/domain/template-registry.ts — validado no Service, sem FK nesta fase.';
comment on column public.processos.template_version is 'Versão da receita com que o Processo nasceu. Preservada para que uma versão futura do mesmo template não reescreva a configuração de Processos já criados.';

-- Coerência mínima sem travar retrocompatibilidade: ou os dois campos estão
-- preenchidos, ou os dois estão nulos. NOT VALID para não reprovar linhas
-- pré-existentes na criação; todas as linhas atuais têm ambos nulos e
-- portanto já satisfazem a regra.
alter table public.processos
  add constraint processos_template_par_completo
  check (
    (template_key is null and template_version is null)
    or (template_key is not null and template_version is not null)
  ) not valid;

-- Índice parcial: só Processos que declaram template entram, mantendo o
-- índice pequeno enquanto a maioria dos Processos não tem template.
create index if not exists idx_processos_template_key
  on public.processos(template_key)
  where template_key is not null;
