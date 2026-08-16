-- Regra 3: garante no banco que não pode existir mais de uma linha
-- planejamento_itens (ref_tipo='subetapa') apontando para o mesmo item
-- estável de orcamento_itens — a identidade real passa a ser o id, não
-- mais o nome (subetapa_key continua existindo só como texto cosmético,
-- sincronizado a cada edição, sem função de identidade).
create unique index if not exists uq_plan_subetapa_orc_item
  on public.planejamento_itens (orcamento_id, orcamento_item_id)
  where ref_tipo = 'subetapa' and orcamento_item_id is not null;
