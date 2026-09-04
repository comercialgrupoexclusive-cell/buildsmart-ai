-- Núcleo N06.3 (Investidor: Motor de Cálculo, Fase do Ativo e Cards Mobile),
-- item "Custos de aquisição realizados".
--
-- Custos reais pós-arrematação (comissão do leiloeiro, ITBI, registro,
-- escritura, advogado de desocupação, certidões, IPTU/condomínio pagos) não
-- tinham onde entrar de forma estruturada — o Orçamento de obra existente
-- (etapas/composições/insumos SINAPI) não é o lugar certo para isso, é uma
-- estrutura mais simples (categoria + valor + comprovante), vinculada direto
-- ao Ativo (`projetos`, não a uma etapa de obra). Compara com o "previsto"
-- já calculado pelo motor do Marco 3 (ProspeccaoCenario.investimento_total).
create table public.projeto_custos_aquisicao (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  categoria text not null check (categoria in (
    'comissao_leiloeiro', 'itbi', 'registro', 'escritura',
    'advogado_desocupacao', 'certidoes_outros', 'iptu_pago', 'condominio_pago'
  )),
  descricao text,
  valor numeric not null check (valor >= 0),
  data_pagamento date,
  comprovante_url text,
  comprovante_nome text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_projeto_custos_aquisicao_projeto on public.projeto_custos_aquisicao(projeto_id);

comment on table public.projeto_custos_aquisicao is 'Custos reais de aquisição pós-arrematação de um Ativo (Laboratório Investidor) — categoria + valor + comprovante opcional. Compara com o previsto do cenário financeiro (prospeccao_cenarios.investimento_total).';

alter table public.projeto_custos_aquisicao enable row level security;
create policy projeto_custos_aquisicao_all on public.projeto_custos_aquisicao for all using (true) with check (true);
