-- Hotfix pré-reunião: a Análise da Prospecção era orientada só a leilão.
-- `tipo_aquisicao` é uma dimensão independente de `modalidade` (forma de
-- pagamento: à vista/sac/price): 'leilao' (padrão, preserva 100% o
-- comportamento anterior) ou 'compra_direta' (sem leiloeiro — comissão de
-- leiloeiro não se aplica, tratada em lib/investidor-calculadora.ts, mesmo
-- motor financeiro, nenhuma fórmula nova).
--
-- NOTA: esta coluna já existia ao vivo no Supabase quando este hotfix
-- começou (aplicada fora do controle de versão, provavelmente pela mesma
-- sessão/ferramenta que deixou as migrations de Rotinas/Agentes — ver os
-- dois arquivos anteriores). O `if not exists`/checagem de constraint
-- abaixo tornam esta migration segura de aplicar tanto num banco que já
-- tem a coluna quanto num banco novo que ainda não tem.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospeccao_cenarios' and column_name = 'tipo_aquisicao'
  ) then
    alter table public.prospeccao_cenarios add column tipo_aquisicao text not null default 'leilao';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'prospeccao_cenarios_tipo_aquisicao_check'
  ) then
    alter table public.prospeccao_cenarios
      add constraint prospeccao_cenarios_tipo_aquisicao_check
      check (tipo_aquisicao in ('leilao', 'compra_direta'));
  end if;
end $$;

comment on column public.prospeccao_cenarios.tipo_aquisicao is 'leilao (padrão) ou compra_direta — independente de modalidade (à vista/sac/price). Compra direta não aplica comissão de leiloeiro.';
