-- TELLUS — COMPATIBILIZAÇÃO FUNCIONAL 01 (parte B): Financeiro Real do Processo.
--
-- Fonte canônica de movimentação financeira REAL de um Processo — distinta
-- de prospeccao_cenarios (previsão/simulação de viabilidade) e distinta do
-- Financeiro de obra (Orçamento/compra_itens), que não representa
-- corretamente investimento imobiliário. Um custo pendente/obrigação real
-- pertence aqui; uma hipótese de cenário continua em prospeccao_cenarios.
--
-- `categoria` é texto livre (NÃO enum) — configuração de uso do usuário
-- (Aquisição/Arrematação, Leiloeiro, ITBI, Registro/Escritura, Condomínio,
-- IPTU, Reforma, Jurídico, Corretagem, Impostos, Venda, Outros…), nunca
-- regra de código.
--
-- Mesmo padrão de RLS de `processo_modulos`: guard RESTRICTIVE (organização
-- + membership, via processo_is_accessible) AND'd com uma única política
-- PERMISSIVE ALL — registro filho simples de `processos`, sem verbo
-- diferenciado por papel.
--
-- Rollback:
--   drop table if exists public.processo_lancamentos_financeiros;

create table public.processo_lancamentos_financeiros (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos(id) on delete cascade,
  natureza text not null check (natureza in ('ENTRADA', 'SAIDA')),
  categoria text not null check (btrim(categoria) <> ''),
  descricao text,
  valor numeric not null check (valor > 0),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'REALIZADO', 'CANCELADO')),
  -- Competência (quando o lançamento se refere) e realização (quando foi de
  -- fato pago/recebido) são independentes — ambas nullable porque nem
  -- sempre são conhecidas no momento do registro.
  data_lancamento date,
  data_realizacao date,
  comprovante_url text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_processo_lancamentos_financeiros_processo_id
  on public.processo_lancamentos_financeiros (processo_id);
create index idx_processo_lancamentos_financeiros_processo_status
  on public.processo_lancamentos_financeiros (processo_id, status);

comment on table public.processo_lancamentos_financeiros is
  'Financeiro REAL de um Processo (entradas/saídas realizadas e pendentes) — distinto de prospeccao_cenarios (viabilidade/simulação) e do Financeiro de obra (Orçamento/compra_itens).';

alter table public.processo_lancamentos_financeiros enable row level security;

revoke all on public.processo_lancamentos_financeiros from public, anon;
grant select, insert, update, delete on public.processo_lancamentos_financeiros to authenticated;

create policy auth_global_processo_financeiro_guard
  on public.processo_lancamentos_financeiros
  as restrictive
  for all
  to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));

create policy processo_lancamentos_financeiros_all
  on public.processo_lancamentos_financeiros
  as permissive
  for all
  to authenticated
  using (public.processo_is_accessible(processo_id))
  with check (public.processo_is_accessible(processo_id));
