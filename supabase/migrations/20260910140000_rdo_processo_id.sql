-- P4.2 — Motor de Processo: RDO (Diário de Obra).
--
-- `rdo` só suportava obra_id (nem projeto_id existe — RDO nunca existiu na
-- fase Projeto, só em /canteiro/[id]). Processo passa a ser uma segunda
-- raiz possível, no mesmo padrão de tarefas/medicoes: processo_id nullable,
-- obra_id deixa de ser NOT NULL (aditivo — toda linha existente já tem
-- obra_id preenchido, /canteiro/[id] inalterado). O DDL original desta
-- tabela não está versionado no repo (criada antes do rastreamento de
-- migrations); este é o primeiro ALTER rastreado.
alter table public.rdo
  alter column obra_id drop not null;

alter table public.rdo
  add column if not exists processo_id uuid references public.processos(id);

create index if not exists idx_rdo_processo_id
  on public.rdo(processo_id) where processo_id is not null;

alter table public.rdo
  add constraint rdo_raiz_check check (obra_id is not null or processo_id is not null);
