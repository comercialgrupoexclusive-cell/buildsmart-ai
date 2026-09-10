-- P4.3 — Motor de Processo: fundação de Compras/Suprimentos, Financeiro,
-- Financiamento e Medições completas.
--
-- Mesmo padrão já usado em tarefas/medicoes/rdo (P4.2): processo_id
-- nullable como segunda raiz, obra_id vira nullable, CHECK garante que ao
-- menos uma raiz exista. Aditivo — todas as linhas existentes já têm
-- obra_id preenchido, comportamento de /obras inalterado.

alter table public.compra_itens alter column obra_id drop not null;
alter table public.compra_itens add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_compra_itens_processo_id on public.compra_itens(processo_id) where processo_id is not null;
alter table public.compra_itens add constraint compra_itens_raiz_check check (obra_id is not null or processo_id is not null);

alter table public.materiais alter column obra_id drop not null;
alter table public.materiais add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_materiais_processo_id on public.materiais(processo_id) where processo_id is not null;
alter table public.materiais add constraint materiais_raiz_check check (obra_id is not null or processo_id is not null);

alter table public.requisicoes_compra alter column obra_id drop not null;
alter table public.requisicoes_compra add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_requisicoes_compra_processo_id on public.requisicoes_compra(processo_id) where processo_id is not null;
alter table public.requisicoes_compra add constraint requisicoes_compra_raiz_check check (obra_id is not null or processo_id is not null);

alter table public.listas_compra alter column obra_id drop not null;
alter table public.listas_compra add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_listas_compra_processo_id on public.listas_compra(processo_id) where processo_id is not null;
alter table public.listas_compra add constraint listas_compra_raiz_check check (obra_id is not null or processo_id is not null);

-- Financiamento: camada própria, consome medição/avanço do Processo mas
-- não é fonte dele (decisão de produto P4.3).
alter table public.financiamento_itens alter column obra_id drop not null;
alter table public.financiamento_itens add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_financiamento_itens_processo_id on public.financiamento_itens(processo_id) where processo_id is not null;
alter table public.financiamento_itens add constraint financiamento_itens_raiz_check check (obra_id is not null or processo_id is not null);
-- EAP bancária x EAP canônica: mapeamento por item, além do já existente
-- por etapa (etapa_ref_id) — "conforme necessidade da operação" (decisão 1).
alter table public.financiamento_itens add column if not exists orcamento_item_id uuid references public.orcamento_itens(id);

alter table public.financiamento_medicoes alter column obra_id drop not null;
alter table public.financiamento_medicoes add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_financiamento_medicoes_processo_id on public.financiamento_medicoes(processo_id) where processo_id is not null;
alter table public.financiamento_medicoes add constraint financiamento_medicoes_raiz_check check (obra_id is not null or processo_id is not null);

alter table public.financiamento_cronograma_banco alter column obra_id drop not null;
alter table public.financiamento_cronograma_banco add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_financiamento_cronograma_banco_processo_id on public.financiamento_cronograma_banco(processo_id) where processo_id is not null;
alter table public.financiamento_cronograma_banco add constraint financiamento_cronograma_banco_raiz_check check (obra_id is not null or processo_id is not null);

alter table public.obra_fontes_recursos alter column obra_id drop not null;
alter table public.obra_fontes_recursos add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_obra_fontes_recursos_processo_id on public.obra_fontes_recursos(processo_id) where processo_id is not null;
alter table public.obra_fontes_recursos add constraint obra_fontes_recursos_raiz_check check (obra_id is not null or processo_id is not null);

alter table public.obra_reembolsos alter column obra_id drop not null;
alter table public.obra_reembolsos add column if not exists processo_id uuid references public.processos(id);
create index if not exists idx_obra_reembolsos_processo_id on public.obra_reembolsos(processo_id) where processo_id is not null;
alter table public.obra_reembolsos add constraint obra_reembolsos_raiz_check check (obra_id is not null or processo_id is not null);

-- Medições completas: granularidade de item ganha origem, peso (quando
-- aplicável) e previsão da próxima medição — sem inventar tabela nova,
-- só os 3 campos que faltavam na linha do item (decisão de produto P4.3).
alter table public.medicao_itens add column if not exists origem text not null default 'interna';
alter table public.medicao_itens add constraint medicao_itens_origem_check check (origem in ('interna','vistoria','documento_bancario','estimativa'));
alter table public.medicao_itens add column if not exists previsao_proxima_pct numeric;
alter table public.medicao_itens add column if not exists peso numeric;

-- Financeiro: histórico de pagamentos por data — nunca sobrescrever um
-- pagamento anterior com um valor acumulado novo (decisão de produto P4.3).
-- compra_itens.status_pagamento/valor_total continuam como estão (snapshot
-- do compromisso); esta tabela é o detalhe de "quando e quanto foi pago".
create table if not exists public.compra_pagamentos (
  id uuid primary key default gen_random_uuid(),
  compra_item_id uuid not null references public.compra_itens(id) on delete cascade,
  data_pagamento date not null default current_date,
  valor_pago numeric not null check (valor_pago > 0),
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_compra_pagamentos_compra_item_id on public.compra_pagamentos(compra_item_id);
alter table public.compra_pagamentos enable row level security;
create policy compra_pagamentos_all on public.compra_pagamentos for all using (true) with check (true);
