-- Regra do documento de reconciliação de Suprimentos: "composição não é
-- material" e "nunca excluir material manual durante sincronização" exigem
-- distinguir proveniência. origem marca se a linha foi derivada do
-- orçamento (sincronização) ou lançada manualmente pelo usuário. ativo=false
-- marca material obsoleto (saiu do conjunto esperado do orçamento, mas tem
-- histórico de compra/lista/requisição e por isso não pode ser excluído).
alter table public.materiais
  add column if not exists origem text not null default 'manual' check (origem in ('orcamento', 'manual')),
  add column if not exists ativo boolean not null default true;

-- Backfill: tudo que já tem orcamento_id preenchido veio de uma sincronização
-- anterior — nunca foi lançado manualmente sem vínculo de orçamento.
update public.materiais set origem = 'orcamento' where orcamento_id is not null and origem = 'manual';

create index if not exists idx_materiais_origem_ativo on public.materiais (origem, ativo);
