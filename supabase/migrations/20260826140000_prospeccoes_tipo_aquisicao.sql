-- Promove tipo_aquisicao (leilão vs. compra direta) para o nível da
-- Prospecção. Hoje só existia em prospeccao_cenarios.tipo_aquisicao (ver
-- 20260825230500_prospeccao_cenarios_tipo_aquisicao.sql), e os 3 pontos que
-- criam um Cenário sempre gravavam 'leilao' sem olhar a prospecção-mãe —
-- por isso uma compra direta calculava custos de leilão. Default
-- 'compra_direta' (não 'leilao'): dados reais mostram fontes de anúncio
-- comuns (loft.com.br, imobiliária Foxter) sendo tratadas como leilão só
-- porque "Link do leilão/anúncio" era o único campo de link disponível —
-- auction-specific não deveria ser a suposição padrão.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prospeccoes' and column_name = 'tipo_aquisicao'
  ) then
    alter table public.prospeccoes add column tipo_aquisicao text not null default 'compra_direta';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'prospeccoes_tipo_aquisicao_check'
  ) then
    alter table public.prospeccoes
      add constraint prospeccoes_tipo_aquisicao_check
      check (tipo_aquisicao in ('leilao', 'compra_direta'));
  end if;
end $$;

comment on column public.prospeccoes.tipo_aquisicao is
  'leilao ou compra_direta (padrão) — escolhido explicitamente na criação da prospecção; cenários novos herdam este valor em vez de assumir leilao.';

-- Backfill não-fictício: único sinal real disponível hoje é link_leilao
-- preenchido. É uma HEURÍSTICA, não um fato confirmado — revisar manualmente
-- pela tela depois (ex.: "Bella" tem link de imobiliária comum, não um
-- leiloeiro confirmado).
update public.prospeccoes
set tipo_aquisicao = 'leilao'
where link_leilao is not null
  and tipo_aquisicao = 'compra_direta';

-- Fallback de prospeccao_cenarios também vira compra_direta (só é usado se
-- um insert de cenário acontecer fora do app, sem herdar da prospecção).
alter table public.prospeccao_cenarios alter column tipo_aquisicao set default 'compra_direta';
