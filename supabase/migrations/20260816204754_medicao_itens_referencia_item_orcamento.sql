-- Regra 6: medicao_itens (boletins/histórico) passa a poder referenciar um
-- item do orçamento de forma tipada, em vez do par item_tipo/item_id livre
-- (sem FK) usado até aqui. Não altera as linhas legadas existentes
-- (item_tipo='servico'/'subetapa'), só habilita o novo caminho.
alter table public.medicao_itens
  add column if not exists orcamento_item_id uuid references public.orcamento_itens(id);

alter table public.medicao_itens
  add constraint medicao_itens_orcamento_item_consistente
  check (item_tipo <> 'orcamento_item' or (orcamento_item_id is not null and item_id = orcamento_item_id));

create index if not exists idx_medicao_itens_orcamento_item
  on public.medicao_itens (orcamento_item_id)
  where orcamento_item_id is not null;
