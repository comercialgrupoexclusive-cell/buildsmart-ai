-- Fase 1 do rebuild de Orçamento — parte 1: identidade estável de grupo
-- (bug #6/#3 do plano de reconstrução) e fechamento do tipo_item_snapshot
-- (bug #3). Sem dados reais em produção — teste-only, backfill best-effort.

-- 1) grupo_id: item passa a referenciar o id da linha-cabeçalho de subetapa,
--    nunca mais por comparação de texto solto (subetapa.trim().toLowerCase()
--    espalhada em 4+ arquivos diferentes).
alter table public.orcamento_itens
  add column if not exists grupo_id uuid references public.orcamento_itens(id) on delete set null;

-- backfill: casa cada item (tipo_linha='item') com a linha-cabeçalho
-- (tipo_linha='subetapa') do mesmo orçamento+etapa cujo nome bate
-- (normalizado), reproduzindo o matching que o código já faz hoje em runtime.
update public.orcamento_itens item
set grupo_id = header.id
from public.orcamento_itens header
where item.tipo_linha = 'item'
  and header.tipo_linha = 'subetapa'
  and header.orcamento_id = item.orcamento_id
  and header.etapa_id is not distinct from item.etapa_id
  and item.subetapa is not null
  and lower(trim(header.descricao_snapshot)) = lower(trim(item.subetapa));

create index if not exists idx_orcamento_itens_grupo_id
  on public.orcamento_itens(grupo_id) where grupo_id is not null;

alter table public.orcamento_itens
  add constraint orcamento_itens_grupo_id_nao_e_header
  check (not (tipo_linha = 'subetapa' and grupo_id is not null));

-- 2) tipo_item_snapshot: fecha o contrato (bug #3 — handleAddItem não
--    gravava esse campo, só inserirDraft gravava). Backfill best-effort a
--    partir de qual FK de composição está presente; linhas ambíguas
--    (sem composição, sem tag anterior) caem em ITEM_LIVRE por segurança —
--    aceitável aqui pois são só dados de teste, sem produção real em jogo.
update public.orcamento_itens
set tipo_item_snapshot = case
  when composicao_id is not null or sinapi_composicao_id is not null then 'COMPOSICAO'
  else 'ITEM_LIVRE'
end
where tipo_linha = 'item' and tipo_item_snapshot is null;

alter table public.orcamento_itens
  drop constraint if exists orcamento_itens_tipo_item_snapshot_check;

alter table public.orcamento_itens
  add constraint orcamento_itens_tipo_item_snapshot_check
  check (
    (tipo_linha = 'subetapa' and tipo_item_snapshot is null)
    or (tipo_linha = 'item' and tipo_item_snapshot in ('COMPOSICAO', 'INSUMO', 'ITEM_LIVRE'))
  );

-- 3) codigo_snapshot: unicidade por orçamento (bug #7 — geração duplicada em
--    3 lugares sem constraint). Um duplicado de teste existente é
--    desambiguado antes do índice.
with dups as (
  select id, row_number() over (
    partition by orcamento_id, codigo_snapshot order by created_at, id
  ) as rn
  from public.orcamento_itens
  where codigo_snapshot is not null
)
update public.orcamento_itens o
set codigo_snapshot = o.codigo_snapshot || '-' || dups.rn
from dups
where dups.id = o.id and dups.rn > 1;

create unique index if not exists uq_orcamento_itens_codigo_por_orcamento
  on public.orcamento_itens(orcamento_id, codigo_snapshot)
  where codigo_snapshot is not null;

-- 4) geração atômica de código de item livre — substitui o padrão
--    `LIV-${Date.now().toString(36)}` duplicado em 3 lugares no client.
create table if not exists public.orcamento_codigo_livre_seq (
  orcamento_id uuid primary key references public.orcamentos(id) on delete cascade,
  proximo integer not null default 1
);

create or replace function public.gerar_codigo_item_livre(p_orcamento_id uuid)
returns text
language plpgsql
volatile
as $$
declare
  v_seq integer;
begin
  insert into public.orcamento_codigo_livre_seq (orcamento_id, proximo)
  values (p_orcamento_id, 2)
  on conflict (orcamento_id) do update
    set proximo = public.orcamento_codigo_livre_seq.proximo + 1
  returning proximo - 1 into v_seq;

  return 'LIV-' || lpad(v_seq::text, 3, '0');
end;
$$;
