-- Reorganização do ciclo Projeto -> Obra: cada orçamento já tem seu próprio
-- planejamento (planejamento_itens é único por orcamento_id), mas as
-- dependências entre itens ainda eram compartilhadas por toda a obra
-- (obra_id NOT NULL) e não existiam antes de a obra ser criada. Agora
-- dependências são escopadas por orcamento_id, como os itens.
alter table public.planejamento_dependencias add column orcamento_id uuid;

update public.planejamento_dependencias pd
set orcamento_id = pi.orcamento_id
from public.planejamento_itens pi
where pi.id = pd.item_id;

alter table public.planejamento_dependencias
  alter column orcamento_id set not null;

alter table public.planejamento_dependencias
  add constraint planejamento_dependencias_orcamento_id_fkey
  foreign key (orcamento_id) references public.orcamentos(id) on delete cascade;

-- obra_id passa a ser opcional (nulo em fase de projeto, preenchido quando a
-- obra existe) e projeto_id é adicionado para espelhar o padrão de contexto
-- duplo já usado em etapas/cronogramas/orcamentos.
alter table public.planejamento_dependencias alter column obra_id drop not null;
alter table public.planejamento_dependencias
  add column projeto_id uuid references public.projetos(id) on delete cascade;

create index if not exists planejamento_dependencias_orcamento_id_idx
  on public.planejamento_dependencias(orcamento_id);
