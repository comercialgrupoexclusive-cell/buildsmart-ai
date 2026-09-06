-- Fase 1 do rebuild de Orçamento — parte 2: template com integridade real
-- (bug #1/#9). `orcamento_templates.itens` (JSONB solto, indexado por NOME de
-- etapa, sem FK) é a causa raiz de o modal de template cair no fallback
-- errado — não existe schema que "resolva sozinho" o `custo_unitario`
-- inexistente em `composicoes_proprias`, então a correção de fato acontece
-- na Fase 2 (reescrita do modal). Aqui só prepara a nova estrutura relacional
-- e limpa os 2 templates de teste existentes (decisão do usuário: recriar
-- do zero em vez de migrar o JSONB solto).

truncate table public.orcamento_templates;

create table if not exists public.orcamento_template_itens (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.orcamento_templates(id) on delete cascade,
  -- auto-referência dentro do próprio template (não string de etapa/nome) —
  -- linha 'subetapa' agrupa linhas 'item' do mesmo template.
  grupo_id uuid references public.orcamento_template_itens(id) on delete set null,
  tipo_linha text not null default 'item' check (tipo_linha in ('item', 'subetapa')),
  etapa_nome text not null,
  composicao_id uuid references public.composicoes_proprias(id) on delete set null,
  sinapi_composicao_id uuid references public.sinapi_composicoes(id) on delete set null,
  tipo_item_snapshot text check (
    (tipo_linha = 'subetapa' and tipo_item_snapshot is null)
    or (tipo_linha = 'item' and tipo_item_snapshot in ('COMPOSICAO', 'INSUMO', 'ITEM_LIVRE'))
  ),
  descricao_snapshot text,
  codigo_snapshot text,
  unidade_snapshot text,
  quantidade numeric,
  classificacao_snapshot text check (classificacao_snapshot is null or classificacao_snapshot in ('EQUIPAMENTO', 'MAO_DE_OBRA', 'MATERIAL_SERVICOS')),
  grupo_snapshot text,
  ordem integer default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_orcamento_template_itens_template_id
  on public.orcamento_template_itens(template_id);
create index if not exists idx_orcamento_template_itens_grupo_id
  on public.orcamento_template_itens(grupo_id) where grupo_id is not null;

alter table public.orcamento_template_itens enable row level security;
create policy "orcamento_template_itens_all" on public.orcamento_template_itens
  for all using (true) with check (true);
