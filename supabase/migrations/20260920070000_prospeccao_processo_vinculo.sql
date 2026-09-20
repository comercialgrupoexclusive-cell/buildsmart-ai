-- Tellus R01 / Seção B — vínculo canônico Processo ↔ Oportunidade.
--
-- Antes desta migration, `prospeccoes` não tinha NENHUMA relação com
-- `processos`: só apontava para o legado `projetos` via project_id. As telas
-- listavam todas as oportunidades mesmo abertas dentro de um Processo.
--
-- ADITIVA E RETROCOMPATÍVEL: main e branches compartilham o mesmo banco de
-- teste. Só adiciona uma coluna nullable e dois índices. Não remove, não
-- renomeia e não altera tipo de coluna existente. `project_id` permanece
-- intacto — os dois vínculos coexistem e têm significados diferentes.
--
-- Rollback:
--   drop index if exists public.idx_prospeccoes_processo_unico;
--   drop index if exists public.idx_prospeccoes_processo_id;
--   alter table public.prospeccoes drop column if exists processo_id;
--
-- ATENÇÃO — esta migration NÃO altera RLS. `prospeccoes` está sob a policy
-- RESTRICTIVE `auth_global_legacy_quarantine` (using false) criada por
-- 20260917234152_quarantine_unscoped_legacy_rls.sql, portanto continua
-- invisível para clientes autenticados. Sair da quarentena exige adicionar
-- um guard (auth_global_process_guard / _parent_guard / _tenant_guard), o que
-- é decisão de segurança fora do escopo autorizado desta seção.
alter table public.prospeccoes
  add column if not exists processo_id uuid references public.processos(id) on delete set null;

comment on column public.prospeccoes.processo_id is 'Tellus R01/B — Processo dono desta oportunidade de aquisição. Nullable: oportunidade pode existir sem Processo, e prospecção-sombra de venda (is_venda=true) nunca é vinculada. Distinto de project_id, que aponta para o Ativo legado.';

-- Busca "qual a oportunidade deste Processo" — o caminho quente da Seção B.
create index if not exists idx_prospeccoes_processo_id
  on public.prospeccoes(processo_id)
  where processo_id is not null;

-- Cardinalidade travada: um Processo resolve NO MÁXIMO UMA oportunidade de
-- aquisição. O outro lado (uma oportunidade pertence a no máximo um Processo)
-- já é garantido pela coluna ser escalar.
--
-- Parcial de propósito: linhas sem processo_id não competem entre si, e
-- prospecção-sombra de venda fica fora. Compatível com os dados atuais —
-- auditado antes de aplicar: 5 prospecções, 3 de aquisição, nenhuma vinculada.
create unique index if not exists idx_prospeccoes_processo_unico
  on public.prospeccoes(processo_id)
  where processo_id is not null and is_venda = false;
