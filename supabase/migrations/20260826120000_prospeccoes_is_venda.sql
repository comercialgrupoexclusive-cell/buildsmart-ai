-- Ajuste de produto (Investidor): habilita a "prospecção-sombra de venda" —
-- por Imóvel (projeto com contexto='investimento'), uma segunda linha em
-- prospeccoes (project_id apontando pro imóvel, is_venda=true) usada só
-- como contêiner para reaproveitar 100% das tabelas/tools/UI de Pesquisa
-- de Mercado e Viabilidade já existentes (prospeccao_ficha,
-- prospeccao_comparaveis, prospeccao_analises_mercado, prospeccao_cenarios)
-- do lado da VENDA, sem duplicar nenhuma delas nem tocar em suas FKs.
--
-- Aditiva e retrocompatível: default false preserva todas as linhas
-- existentes (nenhuma delas é uma linha-sombra).
alter table public.prospeccoes add column if not exists is_venda boolean not null default false;

create index if not exists idx_prospeccoes_project_id_is_venda on public.prospeccoes(project_id, is_venda);
