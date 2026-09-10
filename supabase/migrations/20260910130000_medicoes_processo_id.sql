-- P4.2 — Motor de Processo: Medições (avanço físico + boletim formal).
--
-- `medicoes` só suportava obra_id (nem projeto_id existe aqui — Medições
-- nunca foi usado na fase Projeto). Processo passa a ser uma segunda raiz
-- possível, nos mesmos moldes de tarefas/etapas/orcamentos: processo_id
-- nullable, e obra_id deixa de ser NOT NULL (aditivo — toda medição
-- existente já tem obra_id preenchido, comportamento de /obras/[id] e
-- /medicoes inalterado).
alter table public.medicoes
  alter column obra_id drop not null;

alter table public.medicoes
  add column if not exists processo_id uuid references public.processos(id);

create index if not exists idx_medicoes_processo_id
  on public.medicoes(processo_id) where processo_id is not null;

alter table public.medicoes
  add constraint medicoes_raiz_check check (obra_id is not null or processo_id is not null);
