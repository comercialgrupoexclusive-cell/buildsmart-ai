-- P4.3 — Financiamento bancário (Banrisul configurável): item de medição
-- bancária ganha previsão da próxima medição e origem, mesmo padrão de
-- medicao_itens (física). Sem gerar liberação automática — decisão 6.
alter table public.financiamento_medicao_itens add column if not exists previsao_proxima_pct numeric;
alter table public.financiamento_medicao_itens add column if not exists origem text not null default 'interna';
alter table public.financiamento_medicao_itens add constraint financiamento_medicao_itens_origem_check check (origem in ('interna','vistoria','documento_bancario','estimativa'));
