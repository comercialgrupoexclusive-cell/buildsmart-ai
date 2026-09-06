-- Motor de Processo (P3.3 — primeiro módulo real: Orçamento).
--
-- Mesmo padrão dual-raiz já existente em `orcamentos`/`etapas`
-- (obra_id/projeto_id, ambos nullable — ver 20260810011028_project_work_cycle
-- e a Estabilização V1) — agora com um terceiro root nullable, processo_id.
-- Aditiva: não altera nem lê nenhuma linha existente; um orçamento/etapa
-- sem processo_id continua funcionando exatamente como hoje (obra ou
-- projeto legado). Reaproveita 100% de components/obra/ObraOrcamento.tsx
-- (que já resolve pelo orcamentoId recebido) sem duplicar o módulo — ver
-- RELATORIO_PROCESSO_P3_P3.3.md.
alter table public.orcamentos add column processo_id uuid references public.processos(id) on delete set null;
create index idx_orcamentos_processo_id on public.orcamentos(processo_id);

alter table public.etapas add column processo_id uuid references public.processos(id) on delete cascade;
create index idx_etapas_processo_id on public.etapas(processo_id);
