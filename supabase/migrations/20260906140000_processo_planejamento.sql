-- Motor de Processo (P3.4 — Planejamento + evolução física).
--
-- Mesmo padrão dual-root nullable já usado em `planejamento_itens`/
-- `planejamento_dependencias` (obra_id/projeto_id) — agora com processo_id.
-- Aditiva: nenhuma linha existente é tocada. `etapas.processo_id` já existe
-- desde a P3.3 (20260906130000_processo_orcamento.sql); esta migration só
-- completa o par de tabelas que components/obra/ObraPlanejamento2.tsx
-- também grava através do mesmo `etapaContexto` generalizado — ver
-- RELATORIO_PROCESSO_P3_P3.4.md.
alter table public.planejamento_itens add column processo_id uuid references public.processos(id) on delete cascade;
create index idx_planejamento_itens_processo_id on public.planejamento_itens(processo_id);

alter table public.planejamento_dependencias add column processo_id uuid references public.processos(id) on delete cascade;
create index idx_planejamento_dependencias_processo_id on public.planejamento_dependencias(processo_id);
