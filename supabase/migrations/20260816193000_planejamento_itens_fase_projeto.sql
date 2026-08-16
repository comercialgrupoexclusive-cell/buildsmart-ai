-- Cada orçamento nasce com seu próprio planejamento (regra 3 do ciclo
-- Projeto -> Obra), inclusive antes de a obra existir. planejamento_itens
-- exigia obra_id NOT NULL, o que bloqueava planejar ainda em fase de
-- projeto. Agora obra_id é opcional e projeto_id foi adicionado, espelhando
-- o mesmo padrão de contexto duplo já usado em etapas/cronogramas/orcamentos
-- e aplicado a planejamento_dependencias na migração anterior.
alter table public.planejamento_itens alter column obra_id drop not null;
alter table public.planejamento_itens
  add column projeto_id uuid references public.projetos(id) on delete cascade;

create index if not exists planejamento_itens_projeto_id_idx
  on public.planejamento_itens(projeto_id);
